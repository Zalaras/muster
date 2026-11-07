#!/usr/bin/env python3
"""Exploration probe: for each case, check out the pre-plan tree in a worktree and ask two models
whether the codebase already has the helper. Records answer, correctness, tokens, cost, turns, time."""
import json,os,subprocess,sys,time,re,concurrent.futures as cf
S=os.path.dirname(os.path.abspath(__file__))
REPO='/Users/damian/Documents/code/Projects/muster'
cases=json.load(open(os.path.join(S,'..','probe_cases.json')))
MODELS=sys.argv[1].split(',') if len(sys.argv)>1 else ['haiku','opus']
CONC=int(sys.argv[2]) if len(sys.argv)>2 else 4
TOOLS='Read,Grep,Glob,Bash(rg:*),Bash(grep:*),Bash(git grep:*),Bash(ls:*),Bash(find:*),Bash(cat:*),Bash(head:*),Bash(sed -n:*),Bash(wc:*)'
env={k:v for k,v in os.environ.items() if not (k.startswith('CLAUDE') or k=='MUSTER_SESSION')}
def wt(c):
    p=os.path.join(S,'wt',c['id'])
    if not os.path.isdir(p):
        sha=subprocess.run(['git','rev-parse',c['landed']+'^'],cwd=REPO,capture_output=True,text=True).stdout.strip()
        subprocess.run(['git','worktree','add','--detach',p,sha],cwd=REPO,check=True,capture_output=True)
    return p
PROMPT="""You are exploring this repository before implementing a change, to find code that must be reused or generalised rather than written again.

Task context: {need}.

Question: does the codebase under `{scope}` already contain a function, type, helper or module that does this (or most of it)? Search for it. Do not modify any file. Keep your search focused; stop as soon as you are confident.

Finish with exactly one line, the last line of your reply, in this form:
ANSWER: <relative/path.ext>:<SymbolName>
or, if nothing suitable exists:
ANSWER: none"""
def run(c,model):
    d=wt(c); prompt=PROMPT.format(need=c['need'],scope=c['scope'])
    cmd=['claude','-p',prompt,'--model',model,'--output-format','json','--max-turns','30',
         '--allowedTools',TOOLS,'--no-session-persistence','--strict-mcp-config','--mcp-config',os.path.join(S,'empty-mcp.json')]
    t0=time.time()
    try:
        r=subprocess.run(cmd,cwd=d,env=env,capture_output=True,text=True,timeout=600,stdin=subprocess.DEVNULL)
        out=r.stdout; err=r.stderr[-400:]
    except subprocess.TimeoutExpired as e:
        return dict(id=c['id'],model=model,error='timeout',secs=600)
    secs=time.time()-t0
    try: j=json.loads(out)
    except Exception: return dict(id=c['id'],model=model,error='nojson',secs=secs,stdout=out[-300:],stderr=err)
    text=j.get('result','') or ''
    m=re.findall(r'ANSWER:\s*(.+)',text); ans=m[-1].strip().strip('`') if m else ''
    u=j.get('usage',{}) or {}
    found_path=c['expect_path'] in ans
    found_sym=c['expect_symbol'].lower() in ans.lower()
    return dict(id=c['id'],model=model,answer=ans,path_ok=found_path,sym_ok=found_sym,correct=found_path and found_sym,
                turns=j.get('num_turns'),cost=j.get('total_cost_usd'),secs=round(secs,1),
                input=u.get('input_tokens'),cache_read=u.get('cache_read_input_tokens'),cache_create=u.get('cache_creation_input_tokens'),output=u.get('output_tokens'),
                subtype=j.get('subtype'),stderr=err if r.returncode else '')
jobs=[(c,m) for m in MODELS for c in cases]
results=[]
with cf.ThreadPoolExecutor(CONC) as ex:
    for res in ex.map(lambda cm: run(*cm), jobs):
        results.append(res); print(json.dumps(res),flush=True)
json.dump(results,open(os.path.join(S,os.environ.get('PROBE_OUT','results.json')),'w'),indent=1)
print('DONE',len(results))
