import html
W=1480; LANE=560; GAP=170; ML=20
out=[]
def esc(s): return html.escape(s,quote=True)
def node(shape,x,y,w,h,title,sub,cls,tip):
    out.append(f'<g class="n {cls}">')
    if tip: out.append(f'<title>{esc(tip)}</title>')
    if shape=='hex':
        d=12; out.append(f'<polygon points="{x+d},{y} {x+w-d},{y} {x+w},{y+h/2} {x+w-d},{y+h} {x+d},{y+h} {x},{y+h/2}"/>')
    else: out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9"/>')
    ty=y+h/2+(5 if not sub else -3)
    out.append(f'<text x="{x+w/2}" y="{ty}" class="t">{esc(title)}</text>')
    if sub: out.append(f'<text x="{x+w/2}" y="{ty+15}" class="s">{esc(sub)}</text>')
    out.append('</g>')
def arrow(x1,y1,x2,y2): out.append(f'<path class="a" d="M{x1},{y1} L{x2},{y2}"/>')
H=46; V=28
def lane(x0,nodes,title):
    y=70; cx=x0+LANE/2; out.append(f'<text x="{cx}" y="42" class="lane">{esc(title)}</text>')
    prev=None; rows=[]
    for r in nodes:
        items=r['items']; n=len(items); h=H
        if n==1: w=r.get('w',330); xs=[cx-w/2]
        else:
            tot=LANE-60; g=14; w=(tot-g*(n-1))/n; xs=[x0+30+i*(w+g) for i in range(n)]
        centers=[xx+w/2 for xx in xs]
        if prev:
            pb,pc=prev
            if len(pc)==1 and n==1: arrow(pc[0],pb,centers[0],y)
            elif len(pc)==1:
                my=pb+V/2; out.append(f'<path class="a nohead" d="M{pc[0]},{pb} L{pc[0]},{my}"/><path class="a nohead" d="M{centers[0]},{my} L{centers[-1]},{my}"/>')
                for c in centers: arrow(c,my,c,y)
            elif n==1:
                my=pb+V/2
                for c in pc: out.append(f'<path class="a nohead" d="M{c},{pb} L{c},{my}"/>')
                out.append(f'<path class="a nohead" d="M{pc[0]},{my} L{pc[-1]},{my}"/>'); arrow(centers[0],my,centers[0],y)
            else:
                for c1,c2 in zip(pc,centers): arrow(c1,pb,c2,y)
        for (t,s,c,tip),xx in zip(items,xs): node(r.get('kind','box'),xx,y,w,h,t,s,c,tip)
        rows.append(dict(y=y,h=h,xs=xs,w=w)); prev=(y+h,centers); y+=h+V
    return rows,y
cur=[
 dict(items=[('Spec & plan','human approves','cur','/spec then /plan-work: protocol delta, Testable UI, Affected Files, acceptance criteria. Same depth for every plan.')]),
 dict(items=[('Orchestrator: prose skill','main session · 593 lines · 4–14 h','cur','The main session follows a 593-line prose procedure across compactions; spawns 8–12 subagents; state via orch-state.py.')],w=380),
 dict(items=[('E2E specs','written before code','cur','e2e-specs agent (Sonnet) authors Playwright tests from the plan; new tests gate on collection.')]),
 dict(items=[('daemon-impl','Sonnet, high','cur','Implements the daemon side behind the contract; never edits tests.'),('web-impl','Sonnet, high','cur','Implements the dashboard side behind the contract; never edits tests.')]),
 dict(items=[('daemon-tests','separate agent','cur','Writes Go unit tests after impl; may not edit implementation.'),('web-tests','separate agent','cur','Writes Vitest tests after impl.'),('render-tests','separate agent','cur','Writes render specs against generated fixtures.')]),
 dict(kind='hex',items=[('Wave gates','lint · full go test · scoped e2e','mech','gates.sh per wave; serial; cold 5–12 min.')]),
 dict(items=[('E2E validate','repairs proven','cur','e2e-specs in validate mode runs live; never weakens an assertion.')]),
 dict(items=[('Comment pass','strip → Sonnet judge → apply','cur','Every added comment stripped; a judge decides which return.')]),
 dict(items=[('Correctness','Opus, every cycle','cur','review-work: statements vs plan and contract; 85k-word pack; Edit/Write available.'),('Browser','Opus, every cycle','cur','review-browser drives the real dashboard and measures DOM/layout.'),('Maintainability','Opus, every cycle','cur','Plan withheld; newcomer read of the code.')]),
 dict(items=[('Merge verdict','computed','cur','orch-state.py merge-review: worst of the parts and gates; no filter, no confidence, no dedupe.')]),
 dict(items=[('Doc reconcile','Sonnet','cur','Promotes the doc delta into specs and protocol after approval.')]),
 dict(kind='hex',items=[('Final validation','full e2e · race','mech','One full sweep per run; completion refused without a green record.')]),
 dict(items=[('Land','squash, closes #N','cur','/land squash-merges to main and pushes.')]),
]
pro=[
 dict(items=[('Spec & plan + Tier','human approves','new','Same artefacts plus a Tier header (protocol / surface / internal / docs) that picks roles, reviewers and cycle budget; big plans become epics of child plans.')]),
 dict(items=[('Runner: control flow in code','fresh claude -p per step · JSON verdicts · journal','new','A script (the fix-track loop generalised) or a Workflow: one-page brief + pack index per step; --json-schema verdicts; the state file is the journal; the main session only launches and reads.')],w=380),
 dict(items=[('E2E specs','independent oracle','keep','Unchanged: the test author never sees the implementation.'),('Builders: daemon & web','own unit + render tests','new','Same parallel builders behind the contract; each writes its own unit and render tests; effort medium; maxTurns bounded. Separate test agents only on protocol/surface tiers.')]),
 dict(kind='hex',items=[('Mechanical checks ✓ partly','affected tests + format hook done · red-on-main, schema pending','part','Seconds, zero tokens: new tests proven red on the pre-change tree; affected-package Go tests; Playwright --only-changed; PostToolUse format hook; wire fixtures validated against a generated schema.')],w=400),
 dict(items=[('E2E validate','repairs proven','keep','Unchanged.')]),
 dict(items=[('Comment pass','strip → Sonnet judge → apply','keep','Unchanged: strip every added comment, a judge decides what returns. The only approach that has worked for comments.')]),
 dict(items=[('Correctness ✓','always · read-only · ids + confidence','done','Read-only, bounded, fed an index not a pack.'),('Maintainability ✓','cycle 1 / shape change · read-only','done','Plan withheld; runs on cycle 1 and when a module, type or seam changed.'),('Browser ✓','web plans · read-only','done','Measurement lens on surface/protocol tiers with web changes.')]),
 dict(items=[('Filter & score ✓','Sonnet critic · confidence · fingerprints','done','Critic sees only the diff + findings and may only delete; every finding has confidence 0–100 and a fingerprint; below threshold → proposed-backlog, never a wave.')],w=380),
 dict(items=[('Merge verdict','computed','keep','Same computed merge, over filtered findings.')]),
 dict(items=[('Doc reconcile','Sonnet, low effort','keep','Unchanged.')]),
 dict(kind='hex',items=[('Final validation','full e2e · race (mutation warnings pending)','mech','Same sweep plus Stryker incremental (web) and scoped gremlins (logic packages) as warnings.')]),
 dict(items=[('Land','epic → main','keep','Unchanged; epics land children on the epic branch, one merge to main.')]),
]
XP=ML+LANE+GAP
rowsC,yC=lane(ML,cur,'CURRENT'); rowsP,yP=lane(XP,pro,'PROPOSED')
def loop(rows,fr,to,x_edge,lines):
    r1=rows[fr]; r0=rows[to]; y1=r1['y']+r1['h']/2; y0=r0['y']+r0['h']/2
    x1=r1['xs'][-1]+r1['w']; x0=r0['xs'][-1]+r0['w']
    out.append(f'<path class="loop dash" d="M{x1},{y1} L{x_edge},{y1} L{x_edge},{y0} L{x0+6},{y0}"/>')
    for i,l in enumerate(lines): out.append(f'<text x="{x_edge+8}" y="{(y0+y1)/2-((len(lines)-1)*7)+i*14}" class="lbl">{esc(l)}</text>')
loop(rowsC,9,3,ML+LANE+8,['fix waves 1→2→3,','gate between waves,','re-review by all three,','≤ 3 cycles then ask'])
loop(rowsP,8,2,XP+LANE+8,['✓ fix → checks →','✓ delta re-review by id;','✓ cycle 3: implementer on Opus'])
def strip(x0,y,items,cls):
    n=len(items); g=12; w=(LANE-20-g*(n-1))/n
    for i,(t,s,tip) in enumerate(items):
        c = 'done' if t.endswith('✓') else ('part' if 'partly' in t else cls)
        node('box',x0+10+i*(w+g),y,w,54,t,s,c,tip)
ys=max(yC,yP)+6
out.append(f'<text x="{W/2}" y="{ys}" class="lane small">CROSS-CUTTING — how rules are enforced · what context is loaded · what each step costs</text>')
ys+=8
strip(ML,ys+10,[('Enforcement','prose rules · 1 hook','Rules live in 14 agent files and CLAUDE.md; one SubagentStop hook that fails open; 2 of 14 agents restrict tools.'),('Knowledge','whole packs, 54–86k words','Everything a role might need is inlined; the 30k budget only warns; 65k words of pipeline prose.'),('Cost','Sonnet/Opus · 5 min cache','Sonnet high everywhere, Opus reviewers, Explore inherits Opus; subagent cache 5 min; no weekly guard; wall-clock only.')],'cur')
strip(XP,ys+10,[('Enforcement ✓','hooks + tool limits','PreToolUse denies stash/config/push and cross-ownership writes; exit-2 hooks block finishing without a valid verdict; disallowedTools + maxTurns on every agent.'),('Knowledge ✓ partly','retro sink done · pack index needs the kb module','Inline what matches touched files, index the rest, fit to budget; retro findings routed to hook / fact / episode; /doctor prompt-audit.'),('Cost ✓','effort per role · 1 h cache · usage/step','Effort per role; subagent cache 1 h; staggered spawns; usage recorded per step. No model pinning for exploration and no weekly threshold (developer rulings).')],'mech')
TOTAL_H=ys+10+54+24
svg='\n'.join(out)
css=''':root{--bg:#f7f7f5;--ink:#1d1d1b;--mute:#6b6b66;--line:#b9b9b3;--cur:#5b5b55;--curbg:#ecece9;--keep:#2f6f4f;--keepbg:#e3f1e9;--new:#2b5fa8;--newbg:#e3ecf9;--mech:#8a5a1e;--mechbg:#f7ecda;--loop:#b23b3b;--done:#1f6f3f;--donebg:#cfead9;--partbg:#e9f4ec}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#161615;--ink:#ecece8;--mute:#a6a6a0;--line:#4a4a46;--cur:#b5b5ae;--curbg:#262625;--keep:#7fcfa3;--keepbg:#173427;--new:#8fb4f0;--newbg:#182a4a;--mech:#e0b36f;--mechbg:#3b2b12;--loop:#f08c8c;--done:#8fe0b0;--donebg:#1c4a30;--partbg:#17331f}}
:root[data-theme="dark"]{--bg:#161615;--ink:#ecece8;--mute:#a6a6a0;--line:#4a4a46;--cur:#b5b5ae;--curbg:#262625;--keep:#7fcfa3;--keepbg:#173427;--new:#8fb4f0;--newbg:#182a4a;--mech:#e0b36f;--mechbg:#3b2b12;--loop:#f08c8c;--done:#8fe0b0;--donebg:#1c4a30;--partbg:#17331f}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;padding:16px}
main{max-width:1500px;margin:0 auto}
h1{font-size:20px;margin:0 0 2px} p.sub{margin:0 0 10px;color:var(--mute);font-size:13.5px}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;margin-bottom:8px;color:var(--mute)}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;border:2px solid;vertical-align:-2px;margin-right:5px}
svg{width:100%;height:auto;display:block}
.n rect,.n polygon{stroke-width:2}
.n.cur rect,.n.cur polygon{fill:var(--curbg);stroke:var(--cur)}
.n.keep rect{fill:var(--keepbg);stroke:var(--keep)}
.n.new rect{fill:var(--newbg);stroke:var(--new)}
.n.mech rect,.n.mech polygon{fill:var(--mechbg);stroke:var(--mech)}
.n.done rect,.n.done polygon{fill:var(--donebg);stroke:var(--done);stroke-width:2.5}
.n.part rect,.n.part polygon{fill:var(--partbg);stroke:var(--done);stroke-width:2.5;stroke-dasharray:7 4}
.t{font-size:13.5px;font-weight:650;text-anchor:middle;fill:var(--ink)}
.s{font-size:11px;text-anchor:middle;fill:var(--mute)}
.lane{font-size:14px;font-weight:700;letter-spacing:.08em;text-anchor:middle;fill:var(--mute)}
.lane.small{font-size:11px;letter-spacing:.02em}
path.a{fill:none;stroke:var(--line);stroke-width:1.8;marker-end:url(#ah)}
path.a.nohead{marker-end:none}
path.loop{fill:none;stroke:var(--loop);stroke-width:1.8;marker-end:url(#ahl)}
path.dash{stroke-dasharray:6 5}
.lbl{font-size:11.5px;fill:var(--loop)}'''
page=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pipeline comparison</title><style>{css}</style></head><body><main>
<h1>Pipeline today vs proposed</h1>
<p class="sub">Hover a box for the detail. Left: as it ran before 2026-11-07. Right: the proposal; pale green = unchanged, solid green = landed in the Tier 1 commit of 2026-11-07, dashed green = partly. Tier 2 (runner, tiers, builders' own tests) will be applied in place and observed, not run in parallel.</p>
<div class="legend"><span><i style="border-color:var(--cur);background:var(--curbg)"></i>current</span><span><i style="border-color:var(--keep);background:var(--keepbg)"></i>kept</span><span><i style="border-color:var(--new);background:var(--newbg)"></i>changed / new</span><span><i style="border-color:var(--mech);background:var(--mechbg)"></i>mechanical, no model (hexagon = gate)</span><span><i style="border-color:var(--loop);border-style:dashed"></i>bounded loop</span><span><i style="border-color:var(--done);background:var(--donebg);border-width:3px"></i>done (commit of 2026-11-07)</span><span><i style="border-color:var(--done);background:var(--partbg);border-style:dashed;border-width:3px"></i>partly done</span></div>
<svg viewBox="0 0 {W} {TOTAL_H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Current pipeline beside the proposed pipeline">
<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--line)"/></marker>
<marker id="ahl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--loop)"/></marker></defs>
<line x1="{XP-GAP/2+60}" y1="30" x2="{XP-GAP/2+60}" y2="{TOTAL_H-10}" stroke="var(--line)" stroke-dasharray="3 6"/>
{svg}
</svg></main></body></html>'''
open('plans/_audit/agentic-practice-proposal-2026-11-06.html','w').write(page); print('written')
