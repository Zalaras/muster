/* Functional mockup engine for rail groups. Every behaviour is switched by window.V (the
 * variant), so the three option pages and mix.html share one implementation. Not product
 * code — a sketch to click through. */
(function () {
  const V = Object.assign({
    ungroupedLabel: "Ungrouped", // null → loose cards carry no header; groups sit above them
    summary: "dots",            // dots | text | bar
    select: "mode",             // mode | modifier | hover
    menus: "kebab",             // kebab | context
    pinScope: "section",        // section | global
    attention: "within",        // within | bubble | flatten
    filter: "segmented",        // segmented | dropdown | eyes
    create: "inline",           // inline | dialog
    createButton: "icon",       // icon | text | menu | none  (how the rail head offers New group)
    sortLabel: "outside",       // outside | inside | none
    summaryHover: "popover",    // popover | title
    stacked: false,
    mainheadGroup: false,       // false | "chip" (after the title) | "meta" (breadcrumb before repo / branch)
    initialGroups: 2,           // 2 | 1 | 0 — how many groups the sample rail starts with
    loneUngrouped: "hidden",    // hidden | shown — the Ungrouped header when no other group exists
    newSession: "masthead",     // masthead | rail-split — where New session lives
  }, window.V || {});
  if (V.mainheadGroup === true) V.mainheadGroup = "chip";
  if (V.createButton === true) V.createButton = "text";
  if (V.createButton === false) V.createButton = "none";
  const GLYPH = { needs_input: "?", failed: "✕", planning: "◇", working: "▶", started: "·", idle: "○", ended: "—" };
  window.V = V;

  const STATE = {
    needs_input: { cls: "s-need", label: "needs input", rank: 0 },
    failed: { cls: "s-failed", label: "failed", rank: 1 },
    started: { cls: "s-start", label: "started", rank: 3 },
    planning: { cls: "s-plan", label: "planning", rank: 4 },
    working: { cls: "s-work", label: "working", rank: 5 },
    idle: { cls: "s-idle", label: "idle", rank: 6 },
  };
  const ORDER = ["needs_input", "failed", "planning", "working", "started", "idle"];

  const S = window.S = {
    groups: [
      { id: "g1", name: "PR reviews", collapsed: false, hidden: false },
      { id: "g2", name: "Validation", collapsed: false, hidden: false },
    ],
    order: ["g1", "g2", "_"],
    ungroupedCollapsed: false,
    ungroupedHidden: false,
    sessions: [
      s("s1", "Review PR #212 — effort in launch", "working", { repo: "muster", branch: "pr-212", ctx: 41, ctxl: "82k · 1 compaction", act: "Reading the launch dialog's model select and the effort field it gains…", group: "g1", secs: 252 }),
      s("s2", "Review PR #209 — unread dot", "needs_input", { repo: "muster", branch: "pr-209", ctx: 22, ctxl: "44k", act: "Should the dot also show on the Tiles strip, or only the rail?", note: "permission: Edit web/src/style.css", group: "g1", secs: 611 }),
      s("s3", "Review PR #215 — settings dialog", "idle", { unread: true, repo: "muster", branch: "pr-215", ctx: 63, ctxl: "126k · 2 compactions", act: "Review posted: two blocking comments on the prefs merge, one nit.", group: "g1", secs: 1560 }),
      s("s4", "Validate e2e on main", "working", { repo: "muster", branch: "main", ctx: 18, ctxl: "36k", act: "Running make e2e; 41 of 58 specs green so far.", group: "g2", secs: 95 }),
      s("s5", "Canary 2.1.37", "planning", { repo: "muster", branch: "canary/2.1.37", ctx: 30, ctxl: "60k", act: "Plan: re-measure the three facts the bump could move, then run make canary.", group: "g2", secs: 420 }),
      s("s6", "Soak rail-order", "failed", { repo: "muster", branch: "soak", ctx: 9, ctxl: "18k", act: "rail-order.spec.ts:118 timed out waiting for the pinned-last rule.", note: "exit 1 — tests failed", group: "g2", secs: 1830 }),
      s("s7", "groups spec interview", "working", { repo: "muster", branch: "main", ctx: 55, ctxl: "110k · 1 compaction", act: "Writing the three rail-group mockups before the interview questions.", group: null, pinned: true, secs: 1980 }),
      s("s8", "compost schema", "idle", { repo: "gardening", branch: "main", ctx: 12, ctxl: "24k", act: "Schema note written; nothing further queued.", group: null, secs: 5400 }),
      s("s9", "invoice script", "started", { repo: "mdr", branch: "feat/invoice-pdf", ctx: 0, ctxl: "unknown", act: "", note: "first launch — no signal yet", group: null, secs: 12 }),
      s("s10", "hook debugging (yesterday)", "idle", { alive: false, repo: "muster", branch: "fix/hook-err", ctx: 70, ctxl: "140k · 3 compactions", act: "Session ended.", group: null, secs: 70000 }),
    ],
    sort: "manual",
    filter: "all",
    selecting: false,
    selection: new Set(),
    current: "s7",
    anchor: null,
  };
  S.sessions.forEach((x, i) => (x.pos = i + 1));
  if (V.initialGroups < 2) { S.groups = S.groups.filter((g) => g.id !== "g2"); S.order = S.order.filter((o) => o !== "g2"); S.sessions.forEach((x) => { if (x.group === "g2") x.group = null; }); }
  if (V.initialGroups < 1) { S.groups = []; S.order = ["_"]; S.sessions.forEach((x) => (x.group = null)); }
  function s(id, title, state, o) {
    return Object.assign({ id, title, state, unread: false, alive: true, pinned: false, note: "" }, o);
  }

  // ── helpers ────────────────────────────────────────────────────────────
  const $ = (sel, el = document) => el.querySelector(sel);
  const h = (tag, attrs = {}, ...kids) => {
    const el = tag === "svg" ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === false || v == null) continue;
      else if (k === "checked" || k === "draggable" || k === "hidden") el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  };
  const fmt = (secs) => secs < 60 ? `${secs}s` : secs < 3600 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : secs < 86400 ? `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m` : `${Math.floor(secs / 86400)}d`;
  const group = (id) => S.groups.find((g) => g.id === id);
  const inGroup = (gid) => S.sessions.filter((x) => (x.group || "_") === gid);
  const name = (gid) => gid === "_" ? (V.ungroupedLabel || "no group") : group(gid)?.name;
  const rank = (x) => !x.alive ? 9 : x.state === "idle" && x.unread ? 2 : STATE[x.state].rank;
  const byAttention = (a, b) => rank(a) - rank(b) || (a.state === "needs_input" || a.state === "idle" ? b.secs - a.secs : a.secs - b.secs);
  const byManual = (a, b) => (b.pinned - a.pinned) || a.pos - b.pos;
  const normalize = () => [...S.sessions].sort(byManual).forEach((x, i) => (x.pos = i + 1));
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  let toastT;
  window.toast = (msg) => {
    $(".toast")?.remove();
    document.body.append(h("div", { class: "toast" }, msg));
    clearTimeout(toastT);
    toastT = setTimeout(() => $(".toast")?.remove(), 2200);
  };

  // ── menus & dialogs ───────────────────────────────────────────────────
  function closeMenu() { $(".menu")?.remove(); document.querySelectorAll('[aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false")); }
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".menu")) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenu(); $(".scrim")?.remove(); } });
  window.showMenu = function showMenu(x, y, items) {
    closeMenu();
    const m = h("div", { class: "menu" });
    for (const it of items) {
      if (!it) continue;
      if (it.sep) { m.append(h("div", { class: "sep" })); continue; }
      if (it.hdr) { m.append(h("div", { class: "hdr" }, it.hdr)); continue; }
      if (it.node) { m.append(it.node); continue; }
      const row = h("div", { class: "mi" + (it.danger ? " danger" : "") + (it.disabled ? " disabled" : "") },
        it.tick !== undefined ? h("span", { class: "tick" }, it.tick ? "✓" : "") : null,
        it.label,
        it.sub ? h("span", { class: "sub" }, "▸") : it.k ? h("span", { class: "k" }, it.k) : null);
      row.addEventListener("click", (e) => {
        if (it.disabled) return;
        if (it.sub) { const r = row.getBoundingClientRect(); showMenu(r.right - 4, r.top - 5, it.sub); return; }
        closeMenu(); it.action?.(e);
      });
      m.append(row);
    }
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + "px";
    m.style.top = Math.min(y, innerHeight - r.height - 8) + "px";
    return m;
  };
  window.showDialog = function showDialog({ title, body, buttons }) {
    $(".scrim")?.remove();
    const foot = h("div", { class: "f" });
    const scrim = h("div", { class: "scrim", onpointerdown: (e) => { if (e.target === scrim) scrim.remove(); } });
    const dlg = h("div", { class: "dlg" }, h("h2", {}, title), h("div", { class: "b" }, body), foot);
    for (const b of buttons) {
      const btn = h("button", { class: "btn " + (b.cls || "") }, b.label);
      btn.addEventListener("click", () => { if (b.action?.(dlg) !== false) scrim.remove(); });
      foot.append(btn);
      if (b.update) b.update(btn, dlg);
    }
    scrim.append(dlg);
    document.body.append(scrim);
    dlg.querySelector("input[type=text]")?.focus();
    return dlg;
  };

  // ── actions on the model ───────────────────────────────────────────────
  const A = window.A = {
    ids: (idOrIds) => Array.isArray(idOrIds) ? idOrIds : [idOrIds],
    moveTo(ids, gid) {
      ids = A.ids(ids);
      const target = gid === "_" ? null : gid;
      let maxPos = Math.max(0, ...S.sessions.map((x) => x.pos));
      for (const id of ids) {
        const x = S.sessions.find((y) => y.id === id);
        if ((x.group || null) !== target) { x.group = target; x.pos = ++maxPos; }
      }
      normalize();
      toast(`Moved ${plural(ids.length, "session")} to ${name(gid || "_")}`);
      A.clearSelection(); render();
    },
    newGroup(nm, ids = []) {
      const g = { id: "g" + Date.now(), name: nm || "New group", collapsed: false, hidden: false, fresh: !nm };
      S.groups.push(g);
      const at = S.order.indexOf("_");
      S.order.splice(at < 0 ? S.order.length : at, 0, g.id);
      if (ids.length) A.moveTo(ids, g.id); else render();
      return g;
    },
    rename(gid) {
      const g = group(gid); if (!g) return;
      g.editing = true; render();
    },
    deleteGroup(gid) {
      const g = group(gid); const members = inGroup(gid);
      const others = S.groups.filter((x) => x.id !== gid);
      let choice = "ungroup";
      const sel = h("select", { onchange: (e) => (choice = "to:" + e.target.value) }, ...others.map((o) => h("option", { value: o.id }, o.name)));
      const body = h("div", {},
        h("p", {}, "The group goes away. Choose what happens to its ", h("b", {}, plural(members.length, "session")), "."),
        h("div", { class: "opts" },
          h("label", {}, h("input", { type: "radio", name: "dg", checked: true, onchange: () => (choice = "ungroup") }), h("span", {}, `Move them to ${V.ungroupedLabel || "the rail"}`, h("small", {}, "They keep their order and stay in the rail, ungrouped."))),
          others.length ? h("label", {}, h("input", { type: "radio", name: "dg", onchange: () => (choice = "to:" + sel.value) }), h("span", {}, "Move them to another group ", sel)) : null,
          h("label", {}, h("input", { type: "radio", name: "dg", onchange: () => (choice = "remove") }), h("span", {}, "Stop and remove them", h("small", {}, "Live sessions are stopped first. Removed sessions cannot be resumed.")))));
      if (!members.length) body.replaceChildren(h("p", {}, "The group is empty; nothing else changes."));
      showDialog({ title: `Delete group “${g.name}”?`, body, buttons: [
        { label: "Cancel" },
        { label: "Delete group", cls: "danger", action: () => {
          if (choice === "remove") S.sessions = S.sessions.filter((x) => x.group !== gid);
          else if (choice.startsWith("to:")) members.forEach((x) => (x.group = choice.slice(3)));
          else members.forEach((x) => (x.group = null));
          S.groups = others; S.order = S.order.filter((o) => o !== gid);
          if (S.filter === gid) S.filter = "all";
          toast(`Deleted ${g.name}`); render();
        } },
      ] });
    },
    ungroup(gid) {
      const g = group(gid); inGroup(gid).forEach((x) => (x.group = null));
      S.groups = S.groups.filter((x) => x.id !== gid); S.order = S.order.filter((o) => o !== gid);
      if (S.filter === gid) S.filter = "all";
      toast(`Ungrouped ${g.name}`); render();
    },
    stop(ids, what) {
      ids = A.ids(ids).filter((id) => S.sessions.find((x) => x.id === id).alive);
      if (!ids.length) return toast("Nothing to stop — none are alive");
      showDialog({ title: `Stop ${plural(ids.length, "session")}${what ? ` in “${what}”` : ""}?`,
        body: h("div", {}, h("p", {}, "Each is stopped the way Stop does: it stays in the rail as ended and can be resumed.", what ? " The group stays." : "")),
        buttons: [{ label: "Cancel" }, { label: `Stop ${ids.length}`, cls: "danger", action: () => { ids.forEach((id) => { const x = S.sessions.find((y) => y.id === id); x.alive = false; x.state = "idle"; x.unread = false; }); A.clearSelection(); render(); } }] });
    },
    remove(ids) {
      ids = A.ids(ids); const live = ids.filter((id) => S.sessions.find((x) => x.id === id).alive).length;
      showDialog({ title: `Remove ${plural(ids.length, "session")}?`,
        body: h("div", {}, h("p", {}, live ? `${live} of them are alive and will be stopped first. ` : "", "A removed session cannot be resumed.")),
        buttons: [{ label: "Cancel" }, { label: `Remove ${ids.length}`, cls: "danger", action: () => { S.sessions = S.sessions.filter((x) => !ids.includes(x.id)); if (!S.sessions.find((x) => x.id === S.current)) S.current = S.sessions[0]?.id; A.clearSelection(); render(); } }] });
    },
    togglePin(id) { const x = S.sessions.find((y) => y.id === id); x.pinned = !x.pinned; if (x.pinned) x.pos = 0; normalize(); render(); },
    clearSelection() { S.selection.clear(); S.selecting = false; S.anchor = null; },
    select(ids, on = true) { for (const id of A.ids(ids)) on ? S.selection.add(id) : S.selection.delete(id); if (S.selection.size) S.selecting = true; render(); },
    pickGroup(x, y, ids, { allowNew = true } = {}) {
      ids = A.ids(ids);
      const cur = ids.length === 1 ? (S.sessions.find((z) => z.id === ids[0]).group || "_") : null;
      const items = [{ hdr: "Move to" },
        ...S.groups.map((g) => ({ label: g.name, tick: cur === g.id, action: () => A.moveTo(ids, g.id) })),
        allowNew ? { label: "New group…", action: () => A.promptNewGroup(ids) } : null,
        { sep: true },
        { label: V.ungroupedLabel || "No group", tick: cur === "_", action: () => A.moveTo(ids, "_") }];
      showMenu(x, y, items);
    },
    promptNewGroup(ids = []) {
      if (V.create === "inline" && !ids.length) { A.newGroup("", []); return; }
      const inp = h("input", { type: "text", placeholder: "Group name", value: "" });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { $(".dlg .f .key").click(); } });
      showDialog({ title: ids.length ? `New group from ${plural(ids.length, "session")}` : "New group", body: h("div", {}, inp),
        buttons: [{ label: "Cancel" }, { label: "Create", cls: "key", action: () => { if (!inp.value.trim()) { inp.focus(); return false; } A.newGroup(inp.value.trim(), ids); } }] });
    },
    movePicker(ids) { // dialog form of the group picker (variant C)
      ids = A.ids(ids);
      const list = h("div", { class: "list" },
        ...S.groups.map((g) => h("div", { class: "li", onclick: () => { $(".scrim").remove(); A.moveTo(ids, g.id); } }, g.name, h("span", { class: "m" }, plural(inGroup(g.id).length, "session")))),
        h("div", { class: "li", onclick: () => { $(".scrim").remove(); A.moveTo(ids, "_"); } }, V.ungroupedLabel || "No group", h("span", { class: "m" }, plural(inGroup("_").length, "session"))),
        h("div", { class: "li new", onclick: () => { $(".scrim").remove(); A.promptNewGroup(ids); } }, "＋ New group…"));
      showDialog({ title: `Move ${plural(ids.length, "session")} to…`, body: h("div", {}, list), buttons: [{ label: "Cancel" }] });
    },
  };

  // ── menus for a group / a card / a selection ───────────────────────────
  function groupMenu(gid, x, y) {
    const g = group(gid); const members = inGroup(gid); const ids = members.map((m) => m.id);
    const isU = gid === "_";
    const collapsed = isU ? S.ungroupedCollapsed : g.collapsed;
    showMenu(x, y, [
      !isU && { label: "Rename", action: () => A.rename(gid) },
      { label: collapsed ? "Expand" : "Collapse", action: () => toggleCollapse(gid) },
      { sep: true },
      { label: `Select all (${members.length})`, disabled: !members.length, action: () => A.select(ids) },
      { label: "New group…", action: () => A.promptNewGroup() },
      { sep: true },
      { label: `Stop all…`, disabled: !members.some((m) => m.alive), action: () => A.stop(ids, name(gid)) },
      !isU && { label: "Ungroup", action: () => A.ungroup(gid) },
      !isU && { label: "Delete group…", danger: true, action: () => A.deleteGroup(gid) },
    ]);
  }
  function cardMenu(x, y, id) {
    const sel = S.selection.has(id) && S.selection.size > 1 ? [...S.selection] : [id];
    const one = sel.length === 1 ? S.sessions.find((z) => z.id === id) : null;
    showMenu(x, y, [
      !one && { hdr: `${sel.length} sessions selected` },
      one && { label: one.pinned ? "Unpin" : "Pin", action: () => A.togglePin(id) },
      { label: "Move to", sub: [
        ...S.groups.map((g) => ({ label: g.name, tick: one ? one.group === g.id : undefined, action: () => A.moveTo(sel, g.id) })),
        { label: "New group…", action: () => A.promptNewGroup(sel) },
        { sep: true },
        { label: V.ungroupedLabel || "No group", tick: one ? !one.group : undefined, action: () => A.moveTo(sel, "_") }] },
      (one ? one.group : sel.some((s) => S.sessions.find((z) => z.id === s).group)) && { label: "Remove from group", action: () => A.moveTo(sel, "_") },
      { sep: true },
      one && !one.alive && { label: "Resume", action: () => { one.alive = true; one.state = "idle"; render(); } },
      { label: "Stop…", disabled: !sel.some((s) => S.sessions.find((z) => z.id === s).alive), action: () => A.stop(sel) },
      { label: "Remove…", danger: true, action: () => A.remove(sel) },
    ]);
  }
  function toggleCollapse(gid) { if (gid === "_") S.ungroupedCollapsed = !S.ungroupedCollapsed; else { const g = group(gid); g.collapsed = !g.collapsed; } render(); }

  // ── summary ────────────────────────────────────────────────────────────
  function tally(members) {
    const counts = {};
    for (const m of members) { const k = !m.alive ? "ended" : m.state; counts[k] = (counts[k] || 0) + 1; }
    return counts;
  }
  const KEYS = [...ORDER, "ended"];
  const lab = (k) => k === "ended" ? "ended" : STATE[k].label;
  const cls = (k) => k === "ended" ? "s-ended" : STATE[k].cls;
  function summaryEl(members, style = V.summary) {
    const counts = tally(members);
    const present = KEYS.filter((k) => counts[k]);
    const words = present.map((k) => `${counts[k]} ${lab(k)}`).join(" · ") || "empty";
    const wrap = h("span", { class: "gsum sum-" + style, "data-words": words }, h("span", { class: "cnt" }, String(members.length)));
    if (V.summaryHover === "title") wrap.title = words;
    if (style === "dots") {
      for (const k of present) wrap.append(h("span", { class: "st" }, h("i", { class: "dot " + cls(k) }), String(counts[k])));
    } else if (style === "nums") {
      for (const k of present) wrap.append(h("span", { class: "st num " + cls(k) }, String(counts[k])));
    } else if (style === "glyphs") {
      for (const k of present) wrap.append(h("span", { class: "st " + cls(k) }, h("i", { class: "gl" }, GLYPH[k]), String(counts[k])));
    } else if (style === "chips") {
      for (const k of present) wrap.append(h("span", { class: "chip " + cls(k) }, String(counts[k])));
    } else if (style === "ticks") {
      const t = h("span", { class: "ticks" });
      for (const m of sortMembers(members)) t.append(h("i", { class: cls(!m.alive ? "ended" : m.state) }));
      wrap.replaceChildren(t, h("span", { class: "cnt" }, String(members.length)));
    } else if (style === "text") {
      wrap.append(h("span", { class: "txt" }, "· " + words));
    } else if (style === "bar") {
      const bar = h("span", { class: "bar" });
      for (const k of present) bar.append(h("i", { class: cls(k), style: `width:${(counts[k] / Math.max(1, members.length)) * 100}%` }));
      wrap.append(bar);
      for (const k of ["needs_input", "failed"]) if (counts[k]) wrap.append(h("span", { class: "st" }, h("i", { class: "dot " + cls(k) }), String(counts[k])));
    }
    return wrap;
  }
  window.summaryEl = summaryEl;
  // Hover popover: the states spelled out, each with the sessions in it.
  function attachPopover(anchor, members, gname) {
    if (V.summaryHover !== "popover") return;
    let pop, t;
    const show = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        pop?.remove();
        const counts = tally(members);
        pop = h("div", { class: "pop" }, h("div", { class: "ph" }, gname, h("span", {}, plural(members.length, "session"))));
        for (const k of KEYS) if (counts[k]) {
          pop.append(h("div", { class: "pr " + cls(k) }, h("i", { class: "dot " + cls(k) }), h("b", {}, lab(k)), h("span", {}, String(counts[k]))));
          for (const m of members) if ((!m.alive ? "ended" : m.state) === k) pop.append(h("div", { class: "pt" }, m.title, m.state === "needs_input" && m.alive ? h("small", {}, " — " + fmt(m.secs)) : null));
        }
        if (!members.length) pop.append(h("div", { class: "pt" }, "empty"));
        document.body.append(pop);
        const r = anchor.getBoundingClientRect(); const pr = pop.getBoundingClientRect();
        pop.style.left = Math.min(r.left, innerWidth - pr.width - 8) + "px";
        pop.style.top = (r.bottom + pr.height + 8 < innerHeight ? r.bottom + 4 : r.top - pr.height - 4) + "px";
      }, 350);
    };
    const hide = () => { clearTimeout(t); pop?.remove(); pop = null; };
    anchor.addEventListener("mouseenter", show); anchor.addEventListener("mouseleave", hide); anchor.addEventListener("pointerdown", hide);
  }

  // ── render ─────────────────────────────────────────────────────────────
  const dnd = { ids: null, gid: null };
  function visibleBlocks() {
    let blocks = S.order.slice();
    if (V.ungroupedLabel == null) blocks = [...blocks.filter((b) => b !== "_"), "_"];
    if (S.sort === "attention" && V.attention === "bubble") {
      const key = (b) => Math.min(99, ...inGroup(b).map(rank));
      const gs = blocks.filter((b) => b !== "_").sort((a, b) => key(a) - key(b));
      blocks = V.ungroupedLabel == null ? [...gs, "_"] : [...blocks].sort((a, b) => key(a) - key(b));
    }
    return blocks.filter((b) => {
      if (V.filter === "eyes") return b === "_" ? !S.ungroupedHidden : !group(b).hidden;
      if (S.filter === "all") return true;
      if (S.filter === "groups") return b !== "_";
      if (S.filter === "ungrouped") return b === "_";
      return b === S.filter;
    });
  }
  function sortMembers(ms) { return [...ms].sort((a, b) => (a.alive !== b.alive ? (a.alive ? -1 : 1) : S.sort === "attention" ? byAttention(a, b) : byManual(a, b))); }

  function card(x, { chip = false } = {}) {
    const st = x.alive ? STATE[x.state] : { cls: "ended", label: "ended" };
    const draggable = S.sort === "manual";
    const el = h("div", { class: `card ${st.cls}${x.unread && x.alive ? " unread" : ""}${x.pinned ? " pinned" : ""}${x.id === S.current ? " current" : ""}${S.selection.has(x.id) ? " selected" : ""}${!x.alive ? " ended" : ""}`, draggable, "data-id": x.id, title: x.title });
    const chk = (V.select === "hover" || (V.select === "mode" && S.selecting)) ? h("input", { type: "checkbox", class: "chk" + (V.select === "mode" ? " left" : ""), checked: S.selection.has(x.id), onclick: (e) => { e.stopPropagation(); A.select(x.id, e.target.checked); } }) : null;
    const inner = h("div", { class: "card-in" },
      h("div", { class: "r1" }, h("span", { class: "name" }, x.title), chip && x.group ? h("span", { class: "gchip" }, name(x.group)) : null),
      h("div", { class: "r0" }, h("span", { class: "badge" }, st.label), h("span", { class: "timer" }, fmt(x.secs)),
        h("button", { class: "pin", "aria-pressed": String(x.pinned), title: x.pinned ? "Unpin" : "Pin", onclick: (e) => { e.stopPropagation(); A.togglePin(x.id); } })),
      h("div", { class: "r2" }, x.repo + " /"), h("div", { class: "r2b" }, x.branch),
      h("div", { class: "r3" }, h("span", { class: "ctx" }, h("i", { style: `width:${x.ctx}%` })), x.ctxl),
      x.note ? h("div", { class: "note" }, x.note) : null,
      x.act ? h("div", { class: "act" }, x.act) : null);
    el.append(h("div", { class: "stripe" }));
    if (chk && V.select === "mode") el.append(h("div", { style: "display:flex;align-items:flex-start;padding:8px 0 0 8px" }, chk));
    el.append(inner);
    if (chk && V.select === "hover") el.append(chk);

    el.addEventListener("click", (e) => {
      if (e.target.closest("button,input")) return;
      if (V.select === "mode" && S.selecting) { A.select(x.id, !S.selection.has(x.id)); return; }
      if (V.select === "modifier" && (e.metaKey || e.ctrlKey)) { S.anchor = x.id; A.select(x.id, !S.selection.has(x.id)); return; }
      if (V.select === "modifier" && e.shiftKey && S.anchor) {
        const ids = [...document.querySelectorAll(".card")].map((c) => c.dataset.id);
        const [a, b] = [ids.indexOf(S.anchor), ids.indexOf(x.id)].sort((p, q) => p - q);
        A.select(ids.slice(a, b + 1)); return;
      }
      if (V.select === "modifier") { S.anchor = x.id; S.selection.clear(); S.selecting = false; }
      S.current = x.id; render();
    });
    el.addEventListener("contextmenu", (e) => { if (V.menus !== "context") return; e.preventDefault(); cardMenu(e.clientX, e.clientY, x.id); });
    el.addEventListener("dragstart", (e) => {
      dnd.ids = S.selection.has(x.id) ? [...S.selection] : [x.id]; dnd.gid = null;
      e.dataTransfer.setData("application/x-muster-session", dnd.ids.join(","));
      e.dataTransfer.effectAllowed = "move"; requestAnimationFrame(() => el.classList.add("dragging"));
    });
    el.addEventListener("dragend", () => { dnd.ids = null; document.querySelectorAll(".dragging,.drop-target").forEach((d) => d.classList.remove("dragging", "drop-target")); });
    el.addEventListener("dragover", (e) => { if (!dnd.ids || dnd.ids.includes(x.id)) return; e.preventDefault(); e.stopPropagation(); mark(el); });
    el.addEventListener("drop", (e) => {
      if (!dnd.ids) return; e.preventDefault(); e.stopPropagation();
      const moved = dnd.ids.map((id) => S.sessions.find((y) => y.id === id));
      moved.forEach((m, i) => { m.group = x.group; m.pinned = x.pinned; m.pos = x.pos - 0.5 + i * 0.01; });
      normalize(); A.clearSelection(); render();
      if (moved.some((m) => m.group !== x.group)) toast(`Moved to ${name(x.group || "_")}`);
    });
    return el;
  }
  function mark(el) { document.querySelectorAll(".drop-target").forEach((d) => d.classList.remove("drop-target")); el.classList.add("drop-target"); }

  function header(gid, members) {
    const g = gid === "_" ? null : group(gid);
    const collapsed = gid === "_" ? S.ungroupedCollapsed : g.collapsed;
    const allSel = members.length && members.every((m) => S.selection.has(m.id));
    const el = h("div", { class: `ghead${collapsed ? " collapsed" : ""}${gid === "_" ? " ungrouped" : ""}`, draggable: S.sort === "manual" && (gid !== "_" || V.ungroupedLabel != null), "data-gid": gid });
    el.append(h("button", { class: "disc", title: collapsed ? "Expand" : "Collapse", onclick: (e) => { e.stopPropagation(); toggleCollapse(gid); } }));
    if ((V.select === "mode" && S.selecting) || (V.select === "hover" && S.selection.size)) {
      el.append(h("input", { type: "checkbox", class: "gchk", checked: !!allSel, onclick: (e) => { e.stopPropagation(); A.select(members.map((m) => m.id), e.target.checked); } }));
    }
    const nm = h("span", { class: "gname" }, name(gid));
    if (g && (g.editing || g.fresh)) {
      const inp = h("input", { type: "text", value: g.fresh ? "" : g.name, placeholder: "Group name" });
      const commit = () => { const v = inp.value.trim(); if (v) g.name = v; else if (g.fresh) { S.groups = S.groups.filter((x) => x !== g); S.order = S.order.filter((o) => o !== g.id); } g.editing = g.fresh = false; render(); };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { g.editing = false; if (g.fresh) { S.groups = S.groups.filter((x) => x !== g); S.order = S.order.filter((o) => o !== g.id); } render(); } });
      inp.addEventListener("blur", commit);
      nm.replaceChildren(inp); setTimeout(() => { inp.focus(); inp.select(); }, 0);
    } else if (g) nm.addEventListener("dblclick", (e) => { e.stopPropagation(); A.rename(gid); });
    el.append(nm, summaryEl(members));
    attachPopover(el, members, name(gid));
    if (V.filter === "eyes") el.append(h("button", { class: "eye", title: "Hide this section", onclick: (e) => { e.stopPropagation(); if (gid === "_") S.ungroupedHidden = true; else g.hidden = true; render(); } }, "hide"));
    if (V.menus === "kebab") el.append(h("button", { class: "kebab", "aria-expanded": "false", title: "Group actions", onclick: (e) => { e.stopPropagation(); e.currentTarget.setAttribute("aria-expanded", "true"); const r = e.currentTarget.getBoundingClientRect(); groupMenu(gid, r.right - 190, r.bottom + 4); } }, "⋯"));
    el.addEventListener("click", (e) => { if (e.target.closest("button,input")) return; toggleCollapse(gid); });
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); groupMenu(gid, e.clientX, e.clientY); });
    el.addEventListener("dragstart", (e) => { if (e.target !== el) return; dnd.gid = gid; dnd.ids = null; e.dataTransfer.setData("application/x-muster-group", gid); requestAnimationFrame(() => el.classList.add("dragging")); });
    el.addEventListener("dragend", () => { dnd.gid = null; document.querySelectorAll(".dragging,.drop-target").forEach((d) => d.classList.remove("dragging", "drop-target")); });
    el.addEventListener("dragover", (e) => { if ((dnd.gid && dnd.gid !== gid) || dnd.ids) { e.preventDefault(); mark(el); } });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dnd.gid) { S.order = S.order.filter((o) => o !== dnd.gid); S.order.splice(S.order.indexOf(gid), 0, dnd.gid); render(); }
      else if (dnd.ids) A.moveTo(dnd.ids, gid);
    });
    return el;
  }

  function render() {
    const rail = $("#rail"); const cards = $("#cards");
    cards.replaceChildren();
    cards.className = "cards" + (S.selecting && V.select === "mode" ? " selecting" : "") + (V.stacked ? " stacked" : "");
    const flat = S.sort === "attention" && V.attention === "flatten";
    const shown = new Set();
    if (flat) {
      cards.classList.add("flat");
      const vis = new Set(visibleBlocks());
      for (const x of sortMembers(S.sessions.filter((x) => vis.has(x.group || "_")))) { cards.append(card(x, { chip: true })); shown.add(x.id); }
    } else {
      if (V.pinScope === "global") {
        const pinned = sortMembers(S.sessions.filter((x) => x.pinned));
        if (pinned.length) {
          const body = h("div", { class: "gbody" });
          pinned.forEach((x, i) => { const c = card(x, { chip: true }); if (i === pinned.length - 1) c.classList.add("pinned-last"); body.append(c); shown.add(x.id); });
          cards.append(body);
        }
      }
      for (const gid of visibleBlocks()) {
        const members = sortMembers(inGroup(gid).filter((x) => V.pinScope !== "global" || !x.pinned));
        const g = gid === "_" ? null : group(gid);
        const collapsed = gid === "_" ? S.ungroupedCollapsed : g.collapsed;
        const lone = gid === "_" && S.groups.length === 0 && V.loneUngrouped === "hidden";
        if ((gid !== "_" || V.ungroupedLabel != null) && !lone) cards.append(header(gid, members));
        const body = h("div", { class: "gbody" + (collapsed ? " collapsed" : "") + (gid === "_" ? " ungrouped" : ""), "data-gid": gid });
        if (!members.length) body.append(h("div", { class: "empty" }, gid === "_" ? "no ungrouped sessions" : "empty — drop sessions here"));
        const lastPinned = members.filter((m) => m.pinned).pop();
        members.forEach((m) => { const c = card(m); if (m === lastPinned && S.sort === "manual") c.classList.add("pinned-last"); body.append(c); shown.add(m.id); });
        body.addEventListener("dragover", (e) => { if (dnd.ids) { e.preventDefault(); mark(body); } });
        body.addEventListener("drop", (e) => { if (dnd.ids) { e.preventDefault(); A.moveTo(dnd.ids, gid); } });
        cards.append(body);
      }
    }
    renderHead();
    $("#count").textContent = shown.size === S.sessions.length ? plural(S.sessions.length, "session") : `${shown.size} of ${S.sessions.length}`;
    renderFilter();
    // selection bar
    const bar = $("#selbar");
    bar.hidden = !(S.selection.size || (V.select === "mode" && S.selecting));
    if (!bar.hidden) {
      const ids = [...S.selection]; const n = ids.length;
      const grouped = ids.some((id) => S.sessions.find((x) => x.id === id).group);
      const live = ids.some((id) => S.sessions.find((x) => x.id === id).alive);
      bar.replaceChildren(
        h("span", { class: "cnt" }, n ? `${n} selected` : "Select sessions"),
        h("button", { class: "btn", disabled: !n, onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); V.select === "hover" ? A.movePicker(ids) : A.pickGroup(r.left, r.top - 4 - 36 * (S.groups.length + 3), ids); } }, "Move to ▾"),
        h("button", { class: "btn", disabled: !n || !grouped, onclick: () => A.moveTo(ids, "_") }, "Ungroup"),
        h("button", { class: "btn", disabled: !n || !live, onclick: () => A.stop(ids) }, "Stop…"),
        h("button", { class: "btn", disabled: !n, onclick: () => A.remove(ids) }, "Remove…"),
        h("span", { class: "spacer" }),
        h("button", { class: "btn", onclick: () => A.select([...shown]) }, "All"),
        h("button", { class: "btn", onclick: () => { A.clearSelection(); render(); } }, "Done"));
    }
    // focus pane
    const cur = S.sessions.find((x) => x.id === S.current);
    if (cur) {
      $("#mh-name").textContent = cur.title;
      $("#mh-meta").textContent = `${cur.repo} / ${cur.branch}`;
      const ig = $("#mh-group");
      if (ig) { ig.hidden = V.mainheadGroup !== "chip"; ig.textContent = (cur.group ? name(cur.group) : "no group") + " ▾"; ig.onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); A.pickGroup(r.left, r.bottom + 4, cur.id); }; }
      const crumb = $("#mh-crumb");
      if (crumb) { crumb.hidden = !(V.mainheadGroup === "meta" && cur.group); crumb.textContent = cur.group ? name(cur.group) : ""; crumb.onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); A.pickGroup(r.left, r.bottom + 4, cur.id); }; }
      $("#mh-stop").disabled = !cur.alive;
    }
    window.onRender?.();
  }
  window.render = render;

  function headMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.right - 190, r.bottom + 4, [
      { label: "New group…", k: "⌥⌘G", action: () => A.promptNewGroup() },
      { sep: true },
      { label: "Collapse all groups", action: () => { S.groups.forEach((g) => (g.collapsed = true)); S.ungroupedCollapsed = true; render(); } },
      { label: "Expand all groups", action: () => { S.groups.forEach((g) => (g.collapsed = false)); S.ungroupedCollapsed = false; render(); } },
    ]);
  }
  function renderHeadInto(head, o = V) {
    head.replaceChildren();
    // Row 1 is today's head, untouched: sort, count, density. Row 2 is the groups row.
    if (o.sortLabel === "outside") head.append(h("span", { class: "lbl" }, "sort"));
    const sort = h("select", { class: "sel", id: "sort", "aria-label": "Sort", onchange: (e) => { S.sort = e.target.value; render(); } },
      h("option", { value: "manual" }, o.sortLabel === "inside" ? "sort: manual" : "Manual"),
      h("option", { value: "attention" }, o.sortLabel === "inside" ? "sort: attention" : "Attention"));
    sort.value = S.sort; head.append(sort);
    const filt = h("span", { id: "filter" });
    if (o.filter !== "segmented") head.append(filt);
    head.append(h("span", { class: "n", id: "count" }));
    head.append(h("div", { class: "seg dens", title: "Card density (unchanged)" },
      h("button", { class: "seg-btn" }, h("svg", { viewBox: "0 0 14 12", html: '<rect y="1" width="14" height="2"/><rect y="5" width="14" height="2"/><rect y="9" width="14" height="2"/>' })),
      h("button", { class: "seg-btn", "aria-pressed": "true" }, h("svg", { viewBox: "0 0 14 12", html: '<rect y="1" width="14" height="4"/><rect y="7" width="14" height="4"/>' })),
      h("button", { class: "seg-btn" }, h("svg", { viewBox: "0 0 14 12", html: '<rect y="1" width="14" height="10"/>' }))));
    const row2 = h("div", { class: "row2" });
    if (o.filter === "segmented") row2.append(filt);
    row2.append(h("span", { class: "spacer" }));
    if (o.select === "mode") row2.append(h("button", { class: "btn icon", id: "selbtn", "aria-pressed": String(S.selecting), title: "Select sessions", onclick: () => { S.selecting = !S.selecting; if (!S.selecting) S.selection.clear(); render(); } }, "Select"));
    if (o.createButton === "text") row2.append(h("button", { class: "btn icon", id: "newgrp", title: "New group", onclick: () => A.promptNewGroup() }, "+ group"));
    if (o.createButton === "icon") row2.append(h("button", { class: "btn icon sq", id: "newgrp", "aria-label": "New group", title: "New group (⌥⌘G)", onclick: () => A.promptNewGroup() }, h("svg", { viewBox: "0 0 14 14", html: '<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" fill="none"/>' })));
    if (o.createButton === "split") row2.append(h("button", { class: "btn icon split", id: "newgrp", "aria-label": "New…", title: "New session or group", onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 190, r.bottom + 4, [{ label: "New session…", k: "⌥⌘N", action: () => toast("(opens the launch dialog)") }, { label: "New group", k: "⌥⌘G", action: () => A.promptNewGroup() }]); } }, h("svg", { viewBox: "0 0 14 14", html: '<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" fill="none"/>' }), h("span", { class: "car" }, "▾")));
    if (o.createButton === "menu") row2.append(h("button", { class: "btn icon sq", "aria-label": "Rail actions", title: "Rail actions", onclick: headMenu }, "⋯"));
    if (row2.children.length > 1 && !(S.groups.length === 0 && V.loneUngrouped === "hidden" && o.filter === "segmented" && row2.children.length === 2 && false)) head.append(row2);
  }
  window.renderHeadInto = renderHeadInto;
  function renderHead() { renderHeadInto($("#railhead")); }

  function renderFilter() {
    const host = $("#filter"); host.replaceChildren();
    if (S.groups.length === 0 && V.loneUngrouped === "hidden") return; // nothing to filter yet
    if (V.filter === "segmented") {
      const seg = h("div", { class: "seg" });
      for (const [v, l] of [["all", "All"], ["groups", "Groups"], ["ungrouped", V.ungroupedLabel || "Loose"]])
        seg.append(h("button", { class: "seg-btn", "aria-pressed": String(S.filter === v), onclick: () => { S.filter = v; render(); } }, l));
      host.append(seg);
    } else if (V.filter === "dropdown") {
      const sel = h("select", { class: "sel", onchange: (e) => { S.filter = e.target.value; render(); } },
        h("option", { value: "all" }, "show: all"), h("option", { value: "groups" }, "show: groups"), h("option", { value: "ungrouped" }, `show: ${(V.ungroupedLabel || "loose").toLowerCase()}`),
        ...S.groups.map((g) => h("option", { value: g.id }, "show: " + g.name)));
      sel.value = S.filter; host.append(sel);
    } else {
      const hiddenN = S.groups.filter((g) => g.hidden).length + (S.ungroupedHidden ? 1 : 0);
      host.append(h("button", { class: "btn icon", title: "Show / hide sections", "aria-pressed": String(hiddenN > 0), onclick: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const row = (label, get, set) => ({ node: h("label", { class: "mi" }, h("input", { type: "checkbox", checked: get(), onchange: (ev) => { set(!ev.target.checked); render(); const m = $(".menu"); } }), label) });
        showMenu(r.left, r.bottom + 4, [{ hdr: "Show in rail" }, ...S.groups.map((g) => row(g.name, () => !g.hidden, (v) => (g.hidden = v))), row(V.ungroupedLabel || "Loose", () => !S.ungroupedHidden, (v) => (S.ungroupedHidden = v)),
          { sep: true }, { label: "Only groups", action: () => { S.groups.forEach((g) => (g.hidden = false)); S.ungroupedHidden = true; render(); } }, { label: "Show everything", action: () => { S.groups.forEach((g) => (g.hidden = false)); S.ungroupedHidden = false; render(); } }]);
      } }, hiddenN ? `⌸ ${hiddenN} hidden` : "⌸"));
    }
  }

  // ── boot ───────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener("keydown", (e) => { if (e.altKey && e.metaKey && e.code === "KeyG") { e.preventDefault(); A.promptNewGroup(); } });
    $("#mh-stop").addEventListener("click", () => A.stop(S.current));
    $("#mh-remove").addEventListener("click", () => A.remove(S.current));
    $("#cards").addEventListener("contextmenu", (e) => { if (e.target === e.currentTarget && V.menus === "context") { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: "New group…", action: () => A.promptNewGroup() }]); } });
    document.querySelectorAll("[data-theme-pick]").forEach((b) => b.addEventListener("click", () => {
      document.documentElement.dataset.theme = b.dataset.themePick;
      document.querySelectorAll("[data-theme-pick]").forEach((x) => x.classList.toggle("on", x === b));
    }));
    render();
  });
})();
