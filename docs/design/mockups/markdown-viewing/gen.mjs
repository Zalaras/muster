import { writeFileSync } from "node:fs";

// Instrument theme tokens, transcribed verbatim from web/src/style.css.
const css = `
:root{--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",sans-serif;--disp:system-ui,-apple-system,"Segoe UI",sans-serif;
--fs-root:15px;--fs-2xs:.68rem;--fs-xs:.75rem;--fs-sm:.82rem;--fs-md:.89rem;--fs-base:1rem;--fs-lg:1.07rem;--fs-xl:1.14rem;
--bg:#12141c;--bg-raised:#171a24;--bg-hover:#1c2029;--well:#0d0f16;--line:#282d3b;--line-control:#343a4a;--edge:#6a7286;
--fg:#e8e6e1;--fg-muted:#b2b6c3;--fg-dim:#a6abbc;--amber:#f2a33c;--rose:#e77f7f;--violet:#9e91f1;--teal:#56c5d0;--idle:#989db1;--shell-pip:#6c9ee5;
--amber-line:#5c4526;--violet-line:#3e3663;--teal-line:#215058;--amber-fg:#12141c;--term:#0d0f16;--term-fg:#e8e6e1;--scrim:rgba(8,9,13,.72);}
html{font-size:15px}body{margin:0;background:#0a0b10;color:var(--fg);font-family:var(--sans);font-size:var(--fs-base)}
a{color:var(--fg-muted)}a:hover{color:var(--fg)}
.app{width:1440px;height:900px;display:flex;flex-direction:column;background:var(--bg);overflow:hidden;position:relative}
.masthead{display:flex;align-items:center;gap:20px;padding:10px 16px;background:var(--bg-raised);border-bottom:1px solid var(--line);flex:none}
.brand{font-family:var(--disp);font-size:var(--fs-xl);font-weight:800;letter-spacing:-.02em}
.view-switcher{display:flex;flex:none}
.seg-btn{font-family:var(--mono);font-size:var(--fs-xs);padding:4px 13px;background:transparent;border:1px solid var(--line-control);border-right-width:0;color:var(--fg-dim)}
.seg-btn:last-child{border-right-width:1px}.seg-btn.on{color:var(--fg);background:var(--bg-hover)}
.mright{display:flex;align-items:center;gap:16px;margin-left:auto;font-family:var(--mono);font-size:var(--fs-sm);color:var(--fg-muted)}
.mright .st{color:var(--fg)}
.btn{font-family:var(--mono);font-size:var(--fs-xs);padding:5px 11px;background:transparent;border:1px solid var(--line-control);color:var(--fg-muted);white-space:nowrap}
.btn.on{color:var(--fg);background:var(--bg-hover)}.btn.sm{font-size:var(--fs-2xs);padding:3px 8px}
.split{display:flex;flex:1;min-height:0}
.rail{width:300px;flex:none;border-right:1px solid var(--line);background:var(--bg-raised);display:flex;flex-direction:column}
.railhead{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--line)}
.railhead .n{margin-left:auto;font-family:var(--mono);font-size:var(--fs-xs);color:var(--fg-dim)}
.railhead .sel{font-family:var(--mono);font-size:var(--fs-xs);color:var(--fg-dim);border:1px solid var(--edge);border-radius:3px;padding:2px 4px}
.card{display:flex;border-bottom:1px solid var(--line);position:relative}
.card.current{background:var(--bg-hover);outline:1px solid var(--edge);outline-offset:-1px}
.card .stripe{width:3px;flex:none;background:var(--fg-dim)}
.card.s-plan .stripe{background:var(--violet)}.card.s-work .stripe{background:var(--teal)}.card.s-blocked .stripe{background:var(--amber)}.card.s-idle .stripe{background:var(--idle)}
.card-in{padding:9px 11px 10px;flex:1;min-width:0}
.r1{display:flex;align-items:baseline;gap:8px}
.card .name{font-family:var(--disp);font-weight:700;font-size:var(--fs-base);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{font-family:var(--mono);font-size:var(--fs-2xs);letter-spacing:.11em;text-transform:uppercase;padding:2px 5px;border:1px solid var(--line-control);color:var(--fg-muted);flex:none}
.card.s-plan .badge{color:var(--violet);border-color:var(--violet-line)}.card.s-work .badge{color:var(--teal);border-color:var(--teal-line)}.card.s-blocked .badge{color:var(--amber);border-color:var(--amber-line)}
.card .timer{margin-left:auto;font-family:var(--mono);font-size:var(--fs-sm);color:var(--fg-dim)}
.card.s-blocked .timer{color:var(--amber)}
.r2{font-family:var(--mono);font-size:var(--fs-xs);color:var(--fg-dim);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r3{display:flex;align-items:center;gap:7px;margin-top:7px;font-family:var(--mono);font-size:var(--fs-xs);color:var(--fg-muted)}
.ctx{height:3px;background:var(--line);width:90px;position:relative}.ctx i{position:absolute;left:0;top:0;bottom:0;background:var(--fg-muted)}
.main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;position:relative}
.mainhead{display:flex;align-items:center;gap:12px;padding:9px 14px;border-bottom:1px solid var(--line);background:var(--bg-raised);flex:none}
.mainhead .nm{font-family:var(--disp);font-weight:700;font-size:var(--fs-lg);letter-spacing:-.015em}
.mainhead .meta{font-family:var(--mono);font-size:var(--fs-xs);color:var(--fg-dim)}
.acts{margin-left:auto;display:flex;align-items:center;gap:6px}
.surfseg{display:inline-flex;border:1px solid var(--line-control);flex:none}
.surfseg span{font-family:var(--mono);font-size:10.5px;padding:4px 11px;border-right:1px solid var(--line-control);color:var(--fg-dim);display:flex;align-items:center;gap:6px}
.surfseg span:last-child{border-right:0}.surfseg span.on{background:var(--bg-hover);color:var(--fg)}
.pip{width:5px;height:5px;border-radius:50%;background:var(--shell-pip)}
.tfoot .surfseg span{padding:2px 8px;font-size:9.5px}
.term{flex:1;background:var(--term);color:var(--term-fg);font-family:var(--mono);font-size:12.5px;line-height:1.65;padding:8px 12px;white-space:pre;overflow:hidden;min-height:0}
.term .d{color:var(--fg-dim)}.term .v{color:var(--violet)}.term .t{color:var(--teal)}
.tools{display:flex;align-items:center;gap:14px;padding:7px 18px;border-bottom:1px solid var(--line);background:var(--bg-raised);font-family:var(--mono);font-size:var(--fs-xs);letter-spacing:.1em;text-transform:uppercase;color:var(--fg-dim)}
.tools .btn{margin-left:auto;text-transform:none;letter-spacing:normal}
.grid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);padding:1px}
.tile{background:var(--bg);display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid transparent}
.thead{display:flex;align-items:center;gap:9px;padding:7px 11px;background:var(--bg-raised);border-bottom:1px solid var(--line)}
.sdot{width:7px;height:7px;border-radius:50%;background:var(--idle);flex:none}
.tile.s-plan .sdot{background:var(--violet)}.tile.s-work .sdot{background:var(--teal)}.tile.s-blocked .sdot{background:var(--amber)}
.thead .tn{font-family:var(--disp);font-weight:700;font-size:var(--fs-md);letter-spacing:-.01em;white-space:nowrap}
.thead .wh{font-family:var(--mono);font-size:var(--fs-xs);color:var(--fg-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.thead .tm{margin-left:auto;font-family:var(--mono);font-size:var(--fs-sm);color:var(--fg-dim);flex:none}
.tile.s-blocked .tm{color:var(--amber)}
.tbody{flex:1;min-height:0;display:flex;background:var(--term)}
.tfoot{display:flex;gap:10px;align-items:center;padding:4px 11px;background:var(--bg-raised);border-top:1px solid var(--line);font-family:var(--mono);font-size:var(--fs-2xs);color:var(--fg-dim)}
.tfoot .live{color:var(--teal)}.tfoot .acts .btn{font-size:var(--fs-2xs);padding:2px 8px}
/* ── right-hand file nav (docs-site "section nav" pattern) ── */
.rnav{width:236px;flex:none;border-left:1px solid var(--line);background:var(--bg-raised);display:flex;flex-direction:column;font-family:var(--mono);font-size:var(--fs-xs);min-height:0;overflow:hidden}
.rnav .hd{padding:9px 12px 5px;font-size:var(--fs-2xs);letter-spacing:.12em;text-transform:uppercase;color:var(--fg-dim);display:flex;align-items:center;gap:8px}
.rnav .hd .n{margin-left:auto;letter-spacing:0;text-transform:none}
.rnav .filter{margin:4px 10px 6px;border:1px solid var(--edge);border-radius:3px;padding:3px 7px;color:var(--fg-dim);font-style:italic;font-size:var(--fs-2xs)}
.rnav .f{padding:3px 12px;color:var(--fg-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;gap:6px;align-items:center}
.rnav .f.on{background:var(--bg-hover);color:var(--fg)}
.rnav .f .car{color:var(--fg-dim);width:9px;flex:none}
.rnav .f .cnt{margin-left:auto;color:var(--fg-dim);font-size:var(--fs-2xs)}
.rnav .f .dot{width:5px;height:5px;border-radius:50%;background:var(--fg-muted);margin-left:auto;flex:none}
.rnav .d1{padding-left:24px}.rnav .d2{padding-left:36px}.rnav .d3{padding-left:48px}
.rnav .sep{border-top:1px solid var(--line);margin:6px 0}
.rnav .ol{padding:3px 12px;color:var(--fg-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--sans);font-size:var(--fs-sm)}
.rnav .ol.h1{color:var(--fg)}.rnav .ol.h2{padding-left:24px}.rnav .ol.on{color:var(--fg);border-left:2px solid var(--fg-muted);margin-left:-2px}
.rnav.compact{width:190px}.rnav.compact .hd .n{display:none}.rnav.compact .f{padding-top:2px;padding-bottom:2px;font-size:10px}
.arr{font-family:var(--mono);font-size:14px;line-height:1;color:var(--fg-dim);padding:0 6px;border:1px solid var(--line-control);flex:none}
.docbar .ib{border:1px solid var(--line-control);padding:3px 7px;color:var(--fg-muted);font-size:var(--fs-2xs);white-space:nowrap}
.docbar .ib.on{background:var(--bg-hover);color:var(--fg)}
/* ── the reader (shared by every option) ── */
.reader{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--well)}
.docbar{display:flex;align-items:center;gap:10px;padding:6px 12px;border-bottom:1px solid var(--line);background:var(--bg-raised);flex:none;font-family:var(--mono);font-size:var(--fs-xs);color:var(--fg-dim)}
.pick{display:flex;align-items:center;gap:8px;border:1px solid var(--edge);border-radius:3px;padding:3px 8px;color:var(--fg);font-family:var(--mono);font-size:var(--fs-xs)}
.pick span{white-space:nowrap}.pick .badge{padding:1px 4px}.pick .car{color:var(--fg-dim)}
.docbar .path{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.docbar .chg{margin-left:auto;display:flex;align-items:center;gap:6px;white-space:nowrap}
.docbar .chg i{width:5px;height:5px;border-radius:50%;background:var(--fg-muted);display:inline-block}
.md{flex:1;overflow:hidden;padding:22px 32px;font-family:var(--sans);font-size:var(--fs-base);line-height:1.55;color:var(--fg);min-height:0}
.md h1{font-family:var(--disp);font-size:1.5rem;font-weight:800;letter-spacing:-.02em;margin:0 0 10px}
.md h2{font-family:var(--disp);font-size:1.14rem;font-weight:700;letter-spacing:-.015em;margin:20px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--line)}
.md p{margin:0 0 10px;color:var(--fg-muted)}.md strong{color:var(--fg)}
.md code{font-family:var(--mono);font-size:.85em;background:var(--bg-hover);padding:1px 5px;border:1px solid var(--line)}
.md ul{margin:0 0 10px;padding-left:22px;color:var(--fg-muted)}.md li{margin:3px 0}
.md .cb{display:inline-block;width:11px;height:11px;border:1px solid var(--edge);vertical-align:-1px;margin-right:6px;margin-left:-20px}
.md .cb.x{background:var(--fg-dim);box-shadow:inset 0 0 0 2px var(--well)}
.md table{border-collapse:collapse;font-size:var(--fs-sm);margin:6px 0 10px}.md th,.md td{border:1px solid var(--line);padding:4px 9px;text-align:left}.md th{color:var(--fg);font-family:var(--mono);font-size:var(--fs-xs);letter-spacing:.06em;text-transform:uppercase;background:var(--bg-raised)}.md td{color:var(--fg-muted)}
.md.compact{padding:10px 14px;font-size:var(--fs-sm);line-height:1.45}.md.compact h1{font-size:1.07rem;margin-bottom:6px}.md.compact h2{font-size:.89rem;margin:10px 0 4px}.md.compact p{margin-bottom:6px}
.filelist{width:220px;flex:none;border-right:1px solid var(--line);background:var(--bg-raised);display:flex;flex-direction:column;font-family:var(--mono);font-size:var(--fs-xs)}
.filelist .hd{padding:8px 12px 5px;font-size:var(--fs-2xs);letter-spacing:.12em;text-transform:uppercase;color:var(--fg-dim)}
.filelist .f{padding:5px 12px;color:var(--fg-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;gap:8px;align-items:center}
.filelist .f.on{background:var(--bg-hover);color:var(--fg)}.filelist .f .badge{padding:0 4px;font-size:9px}
.filelist .f .dot{width:5px;height:5px;border-radius:50%;background:var(--fg-muted);margin-left:auto;flex:none}
.filelist .sep{border-top:1px solid var(--line);margin:6px 0}
`;

const masthead = (view) => `
<div class="masthead">
  <div class="brand">Muster</div>
  <div class="view-switcher" style="display:flex"><span class="seg-btn ${view==="focus"?"on":""}">Focus</span><span class="seg-btn ${view==="tiles"?"on":""}">Tiles</span></div>
  <div class="mright" style="display:flex;gap:16px;align-items:center">
    <span>5h 42%</span><span>7d 18%</span><span>opus 31%</span><span class="btn sm">↻</span>
    <span class="btn">Issue</span><span class="btn">Settings</span><span>2.1.270</span><span class="st">connected</span>
  </div>
</div>`;

const sessions = [
  { cls:"s-plan",   name:"markdown-viewing", badge:"Planning", timer:"04:12", where:"~/code/Projects/muster · plan/markdown-viewing", ctx:34, cur:true },
  { cls:"s-work",   name:"api-key-usage",    badge:"Working",  timer:"00:48", where:"~/code/Projects/muster-spike · spike/api-key",  ctx:61 },
  { cls:"s-blocked",name:"gardening notes",  badge:"Needs input", timer:"12:05", where:"~/Documents/gardening",                   ctx:12 },
  { cls:"s-idle",   name:"mdr-server",       badge:"Idle",     timer:"1h 03m", where:"~/Documents/code/PycharmProjects/MDRostering", ctx:78 },
];

const card = (s) => `
<div class="card ${s.cls} ${s.cur?"current":""}">
  <div class="stripe"></div>
  <div class="card-in">
    <div class="r1" style="display:flex;gap:8px;align-items:baseline"><span class="name">${s.name}</span><span class="badge">${s.badge}</span><span class="timer">${s.timer}</span></div>
    <div class="r2">${s.where}</div>
    <div class="r3" style="display:flex;gap:7px;align-items:center"><span class="ctx"><i style="width:${s.ctx}%"></i></span><span>${s.ctx}%</span><span>${Math.round(s.ctx*2.0)}k tok</span></div>
  </div>
</div>`;

const rail = `
<div class="rail">
  <div class="railhead" style="display:flex;gap:10px;align-items:center"><span class="btn">New session</span><span class="n">4</span><span class="sel">Manual ▾</span></div>
  <div class="cards">${sessions.map(card).join("")}</div>
</div>`;

const termText = `<span class="v">plan mode</span><span class="d"> · opus · ~/code/Projects/muster</span>

<span class="d">&gt;</span> look at the todo item and spike for markdown viewing @TODO.md

<span class="t">⏺</span> Read(TODO.md)
  <span class="d">⎿  Read 282 lines</span>

<span class="t">⏺</span> Read(docs/history/design/markdown-viewing.md)
  <span class="d">⎿  Read 214 lines</span>

<span class="t">⏺</span> Write(~/.claude/plans/bring-over-retro-land.md)
  <span class="d">⎿  Wrote 96 lines</span>

<span class="t">⏺</span> I've drafted the plan. Two decisions are still open — renderer side and
  where the viewer lives — see the plan file for the trade-offs.

<span class="d">──────────────────────────────────────────────────────────────────</span>
<span class="d">&gt;</span> <span class="d">█</span>
<span class="d">  ⏸ plan mode on (shift+tab to cycle)</span>`;

const term = (extra="") => `<div class="term" ${extra}>${termText}</div>`;

const docbar = (opts={}) => `
<div class="docbar" style="display:flex;gap:10px;align-items:center">
  <span class="pick" style="display:flex;gap:8px;align-items:center"><span class="badge">plan</span><span>bring-over-retro-land.md</span><span class="car">▾</span></span>
  <span class="path">~/.claude/plans/bring-over-retro-land.md</span>
  <span class="chg" style="display:flex;gap:6px;align-items:center"><i></i>changed 12 s ago</span>
  ${opts.close ? `<span class="btn sm">Close</span>` : ""}
</div>`;

const docbar2 = (opts={}) => `
<div class="docbar" style="display:flex;gap:10px;align-items:center">
  <span class="badge">plan</span>
  <span style="color:var(--fg);white-space:nowrap">bring-over-retro-land.md</span>
  ${opts.compact ? "" : `<span class="path">~/.claude/plans/bring-over-retro-land.md</span>`}
  <span class="chg" style="display:flex;gap:6px;align-items:center"><i></i>changed 12 s ago</span>
  <span class="ib">pop out ↗</span>
  ${opts.navOpen===false ? `<span class="arr" title="show files">‹</span>` : ""}
</div>`;

const tree = (opts={}) => `
<div class="rnav ${opts.compact?"compact":""}">
  <div class="hd">plan<span class="arr" style="margin-left:auto">›</span></div>
  <div class="f on"><span class="badge" style="padding:0 4px;font-size:9px">plan</span>bring-over-retro-land.md<span class="dot"></span></div>
  <div class="sep"></div>
  <div class="hd">~/code/Projects/muster<span class="n">71 .md</span></div>
  <div class="filter">filter files…</div>
  <div class="f">CLAUDE.md</div>
  <div class="f">CONTRIBUTING.md</div>
  <div class="f">README.md</div>
  <div class="f">SECURITY.md</div>
  <div class="f">SPEC.md</div>
  <div class="f">TODO.md</div>
  <div class="f"><span class="car">▾</span>docs/</div>
  <div class="f d1"><span class="car">▸</span>adr/<span class="cnt">41</span></div>
  <div class="f d1"><span class="car">▸</span>facts/<span class="cnt">18</span></div>
  <div class="f d1"><span class="car">▸</span>features/<span class="cnt">12</span></div>
  <div class="f d1"><span class="car">▾</span>history/</div>
  <div class="f d2"><span class="car">▾</span>design/</div>
  <div class="f d3">markdown-viewing.md</div>
  <div class="f d3">api-key-usage.md</div>
  <div class="f d1">conventions.md</div>
  <div class="f d1">protocol.md</div>
  <div class="f"><span class="car">▾</span>plans/</div>
  <div class="f d1"><span class="car">▾</span>markdown-viewing/</div>
  <div class="f d2">spec.md</div>
  <div class="f"><span class="car">▸</span>web/<span class="cnt">3</span></div>
  ${opts.outline ? `<div class="sep"></div>
  <div class="hd">on this page</div>
  <div class="ol h1">Plan: Markdown viewing</div>
  <div class="ol h2 on">Requirements</div>
  <div class="ol h2">Renderer</div>` : ""}
</div>`;

const readerNav = (opts={}) => `
<div style="display:flex;flex:1;min-height:0;min-width:0">
  <div class="reader">${docbar2(opts)}${mdBody(opts.compact)}</div>
  ${opts.navOpen===false ? "" : tree(opts)}
</div>`;

const mdBody = (compact=false) => `
<div class="md ${compact?"compact":""}">
  <h1>Plan: Markdown viewing</h1>
  <p>Render a session's plan and any markdown under its directory in the dashboard. The plan path comes from the transcript (<code>planFilePath</code>); a <strong>PostToolUse Write</strong> on that path is the change signal.</p>
  <h2>Requirements</h2>
  <ul>
    <li><span class="cb x"></span>Locate the plan from <code>transcript_path</code></li>
    <li><span class="cb x"></span>List <code>*.md</code> under the session directory</li>
    <li><span class="cb"></span>Confine served paths to the directory or the plan path</li>
    <li><span class="cb"></span>Refresh the view when the file is written</li>
  </ul>
  ${compact ? "" : `<h2>Renderer</h2>
  <table><tr><th>side</th><th>cost</th><th>task lists</th></tr>
  <tr><td>browser · marked + DOMPurify</td><td>+23.6 kB gzip</td><td>kept</td></tr>
  <tr><td>daemon · goldmark + bluemonday</td><td>+153 kB binary</td><td>stripped</td></tr></table>
  <p>Recommendation: browser. The daemon stays Claude-format-only and hands raw markdown, as the issue preview already does.</p>`}
</div>`;

const reader = (opts={}) => `<div class="reader">${docbar(opts)}${mdBody(opts.compact)}</div>`;

const mainhead = (segs, actsExtra="") => `
<div class="mainhead" style="display:flex;gap:12px;align-items:center">
  <span class="nm">markdown-viewing</span>
  <span class="meta">~/code/Projects/muster · plan/markdown-viewing · opus · plan mode</span>
  <span class="surfseg" style="display:inline-flex">${segs}</span>
  <div class="acts" style="display:flex;gap:6px;align-items:center;margin-left:auto">${actsExtra}<span class="btn">End</span><span class="btn">Resume</span><span class="btn">Remove</span></div>
</div>`;

const seg2 = (on="claude") => `<span class="${on==="claude"?"on":""}">claude</span><span class="${on==="shell"?"on":""}"><span class="pip"></span>shell</span>`;
const seg3 = (on="docs") => `<span class="${on==="claude"?"on":""}">claude</span><span class="${on==="shell"?"on":""}"><span class="pip"></span>shell</span><span class="${on==="docs"?"on":""}">docs</span>`;

const filelist = `
<div class="filelist">
  <div class="hd">markdown-viewing</div>
  <div class="f on"><span class="badge">plan</span>bring-over-retro-land.md<span class="dot"></span></div>
  <div class="sep"></div>
  <div class="hd">~/code/Projects/muster</div>
  <div class="f">TODO.md</div>
  <div class="f">SPEC.md</div>
  <div class="f">plans/markdown-viewing/spec.md</div>
  <div class="f">docs/history/design/markdown-viewing.md</div>
  <div class="f">docs/conventions.md</div>
  <div class="f">README.md</div>
  <div class="f" style="color:var(--fg-dim);font-style:italic">… 61 more</div>
</div>`;

const drawer = `
<div class="drawer" style="position:absolute;top:0;right:0;bottom:0;width:820px;display:flex;background:var(--bg-raised);border-left:1px solid var(--edge);box-shadow:-18px 0 40px rgba(8,9,13,.55)">
  ${filelist}
  ${reader({close:true})}
</div>`;

const page = (title, body) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>${css}</style></helmet>
${body}
</x-dc>
</body>
</html>`;

// ── Focus artboards ────────────────────────────────────────────────────────────
const focusA = page("A", `<div class="app">${masthead("focus")}<div class="split" style="display:flex;flex:1;min-height:0">${rail}<div class="main">${mainhead(seg3("docs"))}${reader()}</div></div></div>`);

const focusB = page("B", `<div class="app">${masthead("focus")}<div class="split" style="display:flex;flex:1;min-height:0">${rail}<div class="main">${mainhead(seg2("claude"), `<span class="btn on">Docs</span>`)}${term()}${drawer}</div></div></div>`);

const focusC = page("C", `<div class="app">${masthead("focus")}<div class="split" style="display:flex;flex:1;min-height:0">${rail}<div class="main">${mainhead(seg2("claude"), `<span class="btn on">Docs</span>`)}
<div style="display:flex;flex:1;min-height:0">
  ${term('style="flex:0 0 560px"')}
  <div style="width:1px;background:var(--edge);flex:none"></div>
  ${reader()}
</div></div></div></div>`);

const popout = (x,y) => `
<div style="position:absolute;left:${x}px;top:${y}px;width:760px;height:540px;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--edge);box-shadow:0 24px 60px rgba(0,0,0,.6)">
  <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:#0a0b10;border-bottom:1px solid var(--line);font-family:var(--sans);font-size:12px;color:var(--fg-dim)">
    <span style="display:flex;gap:6px"><i style="width:11px;height:11px;border-radius:50%;background:#3a3f49;display:block"></i><i style="width:11px;height:11px;border-radius:50%;background:#3a3f49;display:block"></i><i style="width:11px;height:11px;border-radius:50%;background:#3a3f49;display:block"></i></span>
    <span style="margin:0 auto;font-family:var(--mono)">Muster · markdown-viewing · plan — 127.0.0.1:7433/doc?session=3</span>
  </div>
  ${reader()}
</div>`;

const focusD = page("D", `<div class="app">${masthead("focus")}<div class="split" style="display:flex;flex:1;min-height:0">${rail}<div class="main">${mainhead(seg2("claude"), `<span class="btn">Docs ↗</span>`)}${term()}</div></div>${popout(560,300)}</div>`);

// ── Tiles artboards ────────────────────────────────────────────────────────────
const tools = `<div class="tools" style="display:flex;gap:14px;align-items:center"><span>tiles</span><span class="view-switcher" style="display:flex"><span class="seg-btn on">2×2</span><span class="seg-btn">3×2</span></span><span class="btn">New session</span></div>`;

const tile = (s, body, foot) => `
<div class="tile ${s.cls}">
  <div class="thead" style="display:flex;gap:9px;align-items:center"><span class="sdot"></span><span class="tn">${s.name}</span><span class="wh">${s.where}</span><span class="tm">${s.timer}</span></div>
  <div class="tbody">${body}</div>
  <div class="tfoot" style="display:flex;gap:10px;align-items:center"><span>118×34</span><span class="live">live</span><div class="acts" style="display:flex;gap:6px;align-items:center;margin-left:auto">${foot}<span class="btn">End</span><span class="btn">Remove</span></div></div>
</div>`;

const tileTerm = `<div class="term" style="font-size:11px;line-height:1.55">${termText}</div>`;
const tileFootSeg2 = `<span class="surfseg" style="display:inline-flex">${seg2("claude")}</span>`;
const tileFootSeg3 = (on) => `<span class="surfseg" style="display:inline-flex">${seg3(on)}</span>`;

const gridWith = (firstBody, firstFoot, otherFoot) => `
<div class="grid">
  ${tile(sessions[0], firstBody, firstFoot)}
  ${tile(sessions[1], tileTerm, otherFoot)}
  ${tile(sessions[2], tileTerm, otherFoot)}
  ${tile(sessions[3], tileTerm, otherFoot)}
</div>`;

const tilesA = page("A tiles", `<div class="app">${masthead("tiles")}${tools}${gridWith(reader({compact:true}), tileFootSeg3("docs"), tileFootSeg3("claude"))}</div>`);

const tilesB = page("B tiles", `<div class="app">${masthead("tiles")}${tools}<div style="position:relative;display:flex;flex:1;min-height:0;flex-direction:column">${gridWith(tileTerm, tileFootSeg2 + `<span class="btn on">Docs</span>`, tileFootSeg2 + `<span class="btn">Docs</span>`)}${drawer}</div></div>`);

const tilesC = page("C tiles", `<div class="app">${masthead("tiles")}${tools}
<div style="display:flex;flex:1;min-height:0">
  <div style="flex:1;display:flex;flex-direction:column;min-width:0">${gridWith(tileTerm, tileFootSeg2 + `<span class="btn on">Docs</span>`, tileFootSeg2 + `<span class="btn">Docs</span>`)}</div>
  <div style="width:1px;background:var(--edge);flex:none"></div>
  <div style="width:560px;flex:none;display:flex;flex-direction:column;min-height:0">
    <div class="docbar" style="display:flex;gap:10px;align-items:center;padding:7px 12px"><span class="sdot" style="background:var(--violet)"></span><span style="font-family:var(--disp);font-weight:700;font-size:var(--fs-md);color:var(--fg)">markdown-viewing</span><span>reading pane</span><span class="btn sm" style="margin-left:auto">Close</span></div>
    ${reader()}
  </div>
</div></div>`);

const tilesD = page("D tiles", `<div class="app">${masthead("tiles")}${tools}${gridWith(tileTerm, tileFootSeg2 + `<span class="btn">Docs ↗</span>`, tileFootSeg2 + `<span class="btn">Docs ↗</span>`)}${popout(640,330)}</div>`);

// ── A with a right-hand nav ───────────────────────────────────────────────────
const navFocus1 = page("A nav", `<div class="app">${masthead("focus")}<div class="split" style="display:flex;flex:1;min-height:0">${rail}<div class="main">${mainhead(seg3("docs"))}${readerNav({})}</div></div></div>`);
const navFocus3 = page("A nav hidden", `<div class="app">${masthead("focus")}<div class="split" style="display:flex;flex:1;min-height:0">${rail}<div class="main">${mainhead(seg3("docs"))}${readerNav({navOpen:false})}</div></div></div>`);
const navTiles = page("A nav tiles", `<div class="app">${masthead("tiles")}${tools}${gridWith(readerNav({compact:true}), tileFootSeg3("docs"), tileFootSeg3("claude"))}</div>`);

// ── Reader anatomy ─────────────────────────────────────────────────────────────
const callout = (n, x, y) => `<div style="position:absolute;left:${x}px;top:${y}px;width:18px;height:18px;border-radius:50%;background:var(--amber);color:var(--amber-fg);font-family:var(--mono);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${n}</div>`;

const anatomy = page("Reader", `
<div style="width:1180px;height:720px;background:#0a0b10;position:relative;display:flex;gap:28px;padding:28px;box-sizing:border-box">
  <div style="width:760px;height:664px;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);position:relative">
    <div class="docbar" style="display:flex;gap:10px;align-items:center">
      <span class="pick" style="display:flex;gap:8px;align-items:center"><span class="badge">plan</span><span>bring-over-retro-land.md</span><span class="car">▾</span></span>
      <span class="path">~/.claude/plans/bring-over-retro-land.md</span>
      <span class="chg" style="display:flex;gap:6px;align-items:center"><i></i>changed 12 s ago</span>
      <span style="border:1px dashed var(--edge);padding:3px 10px;color:var(--fg-dim);font-style:italic;white-space:nowrap">reserved · approval</span>
    </div>
    ${mdBody(false)}
    ${callout(1, 60, -9)}${callout(2, 330, -9)}${callout(3, 560, -9)}${callout(4, 690, -9)}${callout(5, -9, 110)}
  </div>
  <div style="flex:1;font-family:var(--sans);font-size:14px;line-height:1.5;color:var(--fg-muted);display:flex;flex-direction:column;gap:14px">
    <div style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--fg-dim)">Reader anatomy — same in every option</div>
    <div><b style="color:var(--amber)">1</b> &nbsp;<strong style="color:var(--fg)">Picker.</strong> The plan first, labelled, then every <code style="font-family:var(--mono);font-size:12px">.md</code> under the session directory. "No plan yet" when the session has entered plan mode but written nothing.</div>
    <div><b style="color:var(--amber)">2</b> &nbsp;<strong style="color:var(--fg)">Path.</strong> Where the file really is. The plan lives outside the repo, in <code style="font-family:var(--mono);font-size:12px">~/.claude/plans</code>, so it is shown rather than assumed.</div>
    <div><b style="color:var(--amber)">3</b> &nbsp;<strong style="color:var(--fg)">Freshness.</strong> When Claude last wrote the file, driven by the Write hook. Stale is labelled, not hidden.</div>
    <div><b style="color:var(--amber)">4</b> &nbsp;<strong style="color:var(--fg)">Reserved space.</strong> Where approve / reject will sit later. Nothing shipped here in this feature.</div>
    <div><b style="color:var(--amber)">5</b> &nbsp;<strong style="color:var(--fg)">Body.</strong> Sanitized render on the <code style="font-family:var(--mono);font-size:12px">--well</code> ground: headings in the display face, body in sans, code in mono, GFM tables and task lists kept.</div>
  </div>
</div>`);

const out = {
  "Main.dc.html": focusA,
  "OptionB-Focus.dc.html": focusB,
  "OptionC-Focus.dc.html": focusC,
  "OptionD-Focus.dc.html": focusD,
  "OptionA-Tiles.dc.html": tilesA,
  "OptionB-Tiles.dc.html": tilesB,
  "OptionC-Tiles.dc.html": tilesC,
  "OptionD-Tiles.dc.html": tilesD,
  "Reader.dc.html": anatomy,
  "NavA-Files.dc.html": navFocus1,
  "NavA-Hidden.dc.html": navFocus3,
  "NavA-Tiles.dc.html": navTiles,
};
for (const [f, s] of Object.entries(out)) writeFileSync(f, s);

const X = [0, 1560, 3120, 4680];
const canvas = {
  artboards: [
    { file: "Main.dc.html",           title: "A · Surface segment — Focus", x: X[0], y: 0,    w: 1440, h: 900 },
    { file: "OptionB-Focus.dc.html",  title: "B · Drawer — Focus",          x: X[1], y: 0,    w: 1440, h: 900 },
    { file: "OptionC-Focus.dc.html",  title: "C · Split — Focus",           x: X[2], y: 0,    w: 1440, h: 900 },
    { file: "OptionD-Focus.dc.html",  title: "D · Pop-out window — Focus",  x: X[3], y: 0,    w: 1440, h: 900 },
    { file: "OptionA-Tiles.dc.html",  title: "A · Surface segment — Tiles", x: X[0], y: 1060, w: 1440, h: 900 },
    { file: "OptionB-Tiles.dc.html",  title: "B · Drawer — Tiles",          x: X[1], y: 1060, w: 1440, h: 900 },
    { file: "OptionC-Tiles.dc.html",  title: "C · Split — Tiles",           x: X[2], y: 1060, w: 1440, h: 900 },
    { file: "OptionD-Tiles.dc.html",  title: "D · Pop-out window — Tiles",  x: X[3], y: 1060, w: 1440, h: 900 },
    { file: "Reader.dc.html",         title: "Reader anatomy (shared)",      x: X[0], y: 2120, w: 1180, h: 720 },
    { file: "NavA-Files.dc.html",        title: "A2 · right nav: files — Focus",           x: X[0], y: 3000, w: 1440, h: 900 },
    { file: "NavA-Hidden.dc.html",       title: "A2 · right nav hidden — Focus",           x: X[2], y: 3000, w: 1440, h: 900 },
    { file: "NavA-Tiles.dc.html",        title: "A2 · right nav — Tiles",                  x: X[3], y: 3000, w: 1440, h: 900 },
  ],
  annotations: [
    { id: "note-a", x: X[0], y: -300, w: 1440, text: "A · SURFACE SEGMENT\nA third choice in the claude | shell switch. The document replaces the terminal in that session's pane, in Focus and in every tile.\n\nFor: one click away, keyboard-addressable like the other surfaces, visible per tile in Grid view.\nAgainst: you cannot read the plan and watch the terminal at once; the picker has to fit in the pane chrome; a tile is small for prose." },
    { id: "note-b", x: X[1], y: -300, w: 1440, text: "B · DRAWER\nA Docs button opens a panel over the right of the current view: file list on its left edge, the rendered file beside it. The segment control is untouched.\n\nFor: full reading width; the file list is a real list, not a dropdown; same component in both views.\nAgainst: covers most of the terminal (or two tiles) while open; only one session's file at a time; not part of the tile layout." },
    { id: "note-c", x: X[2], y: -300, w: 1440, text: "C · SPLIT\nFocus: the reader sits beside the terminal, both live. Tiles: a reading column beside the grid, showing the file of whichever tile you opened Docs on.\n\nFor: read the plan while the session keeps running in front of you — the plan-mode case exactly.\nAgainst: the terminal gets narrower (Claude Code reflows at ~80 cols); two panes to size; in Tiles the grid shrinks to make room." },
    { id: "note-d", x: X[3], y: -300, w: 1440, text: "D · POP-OUT WINDOW  (added — not in the spike)\nDocs ↗ opens the reader as its own browser window on a plain /doc route. The dashboard itself gains only the button.\n\nFor: a second monitor, several files open at once, the dashboard layout untouched, the reader is a small standalone page.\nAgainst: it is outside the dashboard — no tile, no keyboard address; window management is the browser's; a popup blocker can eat it." },
  ],
  launch: { view: "canvas" },
};
writeFileSync("canvas.json", JSON.stringify(canvas, null, 2));
console.log("wrote", Object.keys(out).length, "artboards");
