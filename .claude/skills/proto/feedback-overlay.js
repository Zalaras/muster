// Prototype feedback overlay (kb:adr/process-prototype-first-track). `make proto-web` adds this
// to a prototype's built pages only; it is never part of the shipped dashboard. The developer
// clicks an element, types a note, and Send posts the batch to feedback-server.py, which appends
// it to the prototype's feedback file and wakes the session.
//
// Everything lives in one shadow root so the dashboard's styles and this overlay cannot touch
// each other. Listeners sit on `window` in the capture phase so a pick never reaches the
// dashboard's own handlers.
(() => {
  if (window.__protoFeedback) return;
  window.__protoFeedback = true;
  const base = new URL(document.currentScript.src).origin;

  const host = document.createElement("div");
  host.id = "proto-feedback";
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; font: 12px/1.4 -apple-system, BlinkMacSystemFont, sans-serif; }
      .bar, .ed, .mark { pointer-events: auto; }
      .bar { position: fixed; right: 12px; bottom: 12px; display: flex; gap: 6px; align-items: center;
             padding: 6px; border-radius: 10px; background: #16181d; color: #e8eaed;
             border: 1px solid #3a3f4b; box-shadow: 0 4px 16px rgba(0,0,0,.45); }
      button { cursor: pointer; padding: 4px 9px; border-radius: 7px; border: 1px solid #3a3f4b;
               background: #232730; color: #e8eaed; }
      button:hover { background: #2e3440; }
      button.on { background: #f5b83d; color: #16181d; border-color: #f5b83d; }
      button.go { background: #3d8bf5; border-color: #3d8bf5; color: #fff; }
      .grip { align-self: stretch; display: flex; align-items: center; padding: 0 3px 0 5px; color: #6f7684;
              cursor: grab; user-select: none; touch-action: none; letter-spacing: -2px; }
      .grip:hover { color: #e8eaed; }
      .grip.drag { cursor: grabbing; color: #f5b83d; }
      .st { padding: 0 4px; color: #aab0bd; max-width: 260px; }
      .st button { margin-left: 6px; }
      .hl { position: fixed; pointer-events: none; outline: 2px solid #f5b83d; outline-offset: 1px;
            background: rgba(245,184,61,.14); border-radius: 2px; }
      .mark { position: fixed; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
              background: #f5b83d; color: #16181d; font-weight: 700; text-align: center;
              line-height: 18px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.5); }
      .ed { position: fixed; width: 300px; padding: 8px; border-radius: 10px; background: #16181d;
            border: 1px solid #f5b83d; box-shadow: 0 6px 20px rgba(0,0,0,.5); color: #aab0bd; }
      .ed textarea { display: block; width: 100%; height: 64px; margin: 4px 0 6px; padding: 6px;
                     resize: vertical; border-radius: 6px; border: 1px solid #3a3f4b;
                     background: #0e1014; color: #e8eaed; }
      .ed .what { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ed .row { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
      .ed .hint { margin-right: auto; }
      .list { position: fixed; width: 320px; max-height: 50vh; overflow: auto; padding: 4px;
              border-radius: 10px; background: #16181d; border: 1px solid #3a3f4b;
              box-shadow: 0 6px 20px rgba(0,0,0,.5); color: #e8eaed; pointer-events: auto; }
      .list .item { display: flex; gap: 6px; align-items: flex-start; padding: 5px 4px; border-radius: 6px; }
      .list .item:hover { background: #232730; }
      .list .num { flex: none; min-width: 18px; height: 18px; border-radius: 9px; background: #f5b83d;
                   color: #16181d; font-weight: 700; text-align: center; line-height: 18px; }
      .list .txt { flex: 1; min-width: 0; cursor: pointer; }
      .list .txt .on { color: #6f7684; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .list .txt .body { white-space: pre-wrap; overflow-wrap: anywhere; }
      .list .acts { flex: none; display: flex; gap: 4px; }
      .list .acts button { padding: 1px 6px; }
      .list .acts .del:hover { background: #c24646; border-color: #c24646; }
      .ed .del { margin-right: auto; }
      .ed .del:hover { background: #c24646; border-color: #c24646; }
      [hidden] { display: none !important; }
    </style>
    <div class="hl" hidden></div>
    <div class="marks"></div>
    <div class="bar">
      <span class="grip" title="Drag to move · double-click to put it back in the corner">⋮⋮</span>
      <button class="pick" title="Pick elements to comment on. Or hold Alt and click anything, at any time.">Feedback</button>
      <button class="gen" title="A note about the page as a whole">+ Note</button>
      <button class="lst" hidden title="See, edit or remove the unsent notes"></button>
      <button class="send go" hidden></button>
      <button class="clear" hidden title="Discard the unsent notes">Clear</button>
      <span class="st" hidden></span>
    </div>
    <div class="list" hidden></div>
    <div class="ed" hidden>
      <div class="what"></div>
      <textarea placeholder="What should change?"></textarea>
      <div class="row"><button class="del" hidden>Delete</button><span class="hint">Enter saves · Esc cancels</span><button class="cancel">Cancel</button><button class="save go">Add</button></div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const hl = $(".hl"), marks = $(".marks"), ed = $(".ed"), ta = $("textarea"), st = $(".st");
  const pickBtn = $(".pick"), sendBtn = $(".send"), clearBtn = $(".clear");
  const lstBtn = $(".lst"), list = $(".list"), delBtn = $(".del"), saveBtn = $(".save");

  let picking = false;
  let editing = null; // { el, index } while the note box is open; el is null for a page-level note, index is set when an existing note is being edited
  const notes = []; // { note, el, info }

  // A modal <dialog> makes everything outside it inert, so the overlay moves inside the
  // topmost one while it is open. (A dialog that sets transform or filter becomes the
  // containing block for position:fixed and would offset the overlay; none does today.)
  function rehome() {
    let modal = null;
    try {
      modal = [...document.querySelectorAll("dialog:modal")].pop() || null;
    } catch {
      // :modal unsupported — stay on the document.
    }
    const parent = modal || document.documentElement;
    if (host.parentNode !== parent) parent.appendChild(host);
  }
  rehome();

  // The bar is dragged by its grip, so it never has to sit on the thing being worked on. It is
  // placed from the right and bottom edges, so it keeps growing leftwards as its status text
  // changes, and where it was left is remembered for this prototype's host.
  const bar = $(".bar"), grip = $(".grip");
  const POS_KEY = "protoFeedbackPos";
  const HOME = { right: 12, bottom: 12 };
  let pos = { ...HOME };
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)) pos = { right: saved.right, bottom: saved.bottom };
  } catch {
    // No storage, or a value that is not ours — start in the corner.
  }
  function placeBar() {
    const r = bar.getBoundingClientRect();
    pos.right = Math.max(0, Math.min(pos.right, innerWidth - r.width));
    pos.bottom = Math.max(0, Math.min(pos.bottom, innerHeight - r.height));
    bar.style.right = `${pos.right}px`;
    bar.style.bottom = `${pos.bottom}px`;
    placeList();
  }
  // The note list opens beside the bar: above it, or below when the bar sits near the top.
  function placeList() {
    if (list.hidden) return;
    const b = bar.getBoundingClientRect();
    const h = list.offsetHeight;
    list.style.left = `${Math.max(8, Math.min(b.right - 320, innerWidth - 328))}px`;
    list.style.top = `${b.top - h - 6 >= 8 ? b.top - h - 6 : Math.min(b.bottom + 6, innerHeight - h - 8)}px`;
  }
  function keepPos() {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      // Remembering the position is a convenience only.
    }
  }
  let drag = null; // { x, y, right, bottom } at pointerdown, while the grip is held
  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom };
    grip.setPointerCapture(e.pointerId);
    grip.classList.add("drag");
    e.preventDefault();
  });
  grip.addEventListener("pointermove", (e) => {
    if (!drag) return;
    pos.right = drag.right - (e.clientX - drag.x);
    pos.bottom = drag.bottom - (e.clientY - drag.y);
    placeBar();
  });
  for (const type of ["pointerup", "pointercancel"]) {
    grip.addEventListener(type, () => {
      if (!drag) return;
      drag = null;
      grip.classList.remove("drag");
      keepPos();
    });
  }
  grip.addEventListener("dblclick", () => {
    pos = { ...HOME };
    placeBar();
    keepPos();
  });
  window.addEventListener("resize", placeBar);
  placeBar();

  setInterval(() => {
    if (ed.hidden) rehome();
    if (!drag) placeBar();
    placeMarks();
  }, 400);

  const cut = (s, n) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const ours = (e) => e.composedPath().includes(host);
  const targetOf = (e) => {
    const t = e.composedPath()[0];
    return t instanceof Element ? t : e.target instanceof Element ? e.target : null;
  };

  function selector(el) {
    const parts = [];
    for (let e = el; e && e !== document.documentElement && parts.length < 6; e = e.parentElement) {
      if (e.id) {
        parts.unshift(`#${CSS.escape(e.id)}`);
        break;
      }
      let s = e.localName + [...e.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join("");
      const same = e.parentElement ? [...e.parentElement.children].filter((x) => x.localName === e.localName) : [];
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
      parts.unshift(s);
    }
    return parts.join(" > ");
  }

  function describe(el) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const attrs = {};
    for (const a of el.attributes) {
      if (a.name.startsWith("data-") || a.name.startsWith("aria-") || a.name === "role" || a.name === "title") attrs[a.name] = cut(a.value, 80);
    }
    return {
      selector: selector(el),
      tag: el.localName,
      text: cut(el.innerText ?? el.textContent, 160),
      attrs,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      style: {
        color: cs.color,
        background: cs.backgroundColor,
        font: `${cs.fontSize} ${cs.fontWeight} ${cut(cs.fontFamily, 40)}`,
        padding: cs.padding,
        margin: cs.margin,
      },
      html: cut(el.outerHTML, 300),
    };
  }

  function box(node, r) {
    node.style.left = `${r.x}px`;
    node.style.top = `${r.y}px`;
    node.style.width = `${r.width}px`;
    node.style.height = `${r.height}px`;
  }

  function setPicking(on) {
    picking = on;
    pickBtn.classList.toggle("on", on);
    pickBtn.textContent = on ? "Picking — Esc to stop" : "Feedback";
    document.documentElement.style.cursor = on ? "crosshair" : "";
    if (!on) hl.hidden = true;
  }

  function what(el, info) {
    if (el) return `${el.localName} — ${cut(el.innerText ?? el.textContent, 60) || selector(el)}`;
    if (info) return `${info.tag} — ${cut(info.text, 60) || info.selector}`;
    return "The page as a whole";
  }

  // index is the note being edited, or undefined for a new one.
  function openEditor(el, index) {
    if (!ed.hidden && ta.value.trim()) saveNote();
    rehome();
    const existing = index === undefined ? null : notes[index];
    if (existing) el = existing.el?.isConnected ? existing.el : null;
    editing = { el, index: existing ? index : undefined };
    $(".what").textContent = existing ? `Note ${index + 1}: ${what(el, existing.info)}` : what(el, null);
    ta.value = existing ? existing.note : "";
    delBtn.hidden = !existing;
    saveBtn.textContent = existing ? "Save" : "Add";
    ed.hidden = false;
    const r = el ? el.getBoundingClientRect() : { x: innerWidth - 320, y: innerHeight - 220, width: 0, height: 0, bottom: innerHeight - 220 };
    const h = ed.offsetHeight;
    const top = r.bottom + 8 + h < innerHeight ? r.bottom + 8 : Math.max(8, r.y - h - 8);
    ed.style.left = `${Math.max(8, Math.min(r.x, innerWidth - 308))}px`;
    ed.style.top = `${Math.max(8, Math.min(top, innerHeight - h - 8))}px`;
    if (el) {
      box(hl, r);
      hl.hidden = false;
    }
    ta.focus();
    if (existing) ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function closeEditor() {
    ta.blur(); // or the next key still targets the hidden box and never reaches the Esc-to-stop branch
    ed.hidden = true;
    editing = null;
    if (!picking) hl.hidden = true;
  }

  function saveNote() {
    const note = ta.value.trim();
    if (editing && editing.index !== undefined) {
      // Saving an edited note empty removes it.
      if (note) notes[editing.index].note = note;
      else notes.splice(editing.index, 1);
    } else if (note && editing) {
      notes.push({ note, el: editing.el, info: editing.el ? describe(editing.el) : null });
    }
    closeEditor();
    renderQueue();
  }

  function removeNote(i) {
    notes.splice(i, 1);
    if (editing && editing.index !== undefined) {
      if (editing.index === i) closeEditor();
      else if (editing.index > i) editing.index -= 1;
    }
    renderQueue();
  }

  function renderQueue() {
    sendBtn.hidden = clearBtn.hidden = lstBtn.hidden = notes.length === 0;
    sendBtn.textContent = `Send ${notes.length}`;
    lstBtn.textContent = `Notes ${notes.length}`;
    if (notes.length === 0) list.hidden = true;
    lstBtn.classList.toggle("on", !list.hidden);
    marks.replaceChildren(
      ...notes.map((n, i) => {
        const m = document.createElement("div");
        m.className = "mark";
        m.textContent = String(i + 1);
        m.title = `${n.note}\n(click to edit or delete)`;
        m.onclick = () => openEditor(n.el, i);
        return m;
      }),
    );
    renderList();
    placeMarks();
  }

  function renderList() {
    list.replaceChildren(
      ...notes.map((n, i) => {
        const item = document.createElement("div");
        item.className = "item";
        const num = document.createElement("span");
        num.className = "num";
        num.textContent = String(i + 1);
        const txt = document.createElement("div");
        txt.className = "txt";
        txt.title = "Click to edit";
        const on = document.createElement("div");
        on.className = "on";
        on.textContent = n.info ? `${n.info.tag} — ${cut(n.info.text, 50) || n.info.selector}` : "The page as a whole";
        const body = document.createElement("div");
        body.className = "body";
        body.textContent = n.note;
        txt.append(on, body);
        txt.onclick = () => openEditor(n.el, i);
        const acts = document.createElement("span");
        acts.className = "acts";
        const edit = document.createElement("button");
        edit.textContent = "Edit";
        edit.onclick = () => openEditor(n.el, i);
        const del = document.createElement("button");
        del.className = "del";
        del.textContent = "×";
        del.title = "Remove this note";
        del.setAttribute("aria-label", `Remove note ${i + 1}`);
        del.onclick = () => removeNote(i);
        acts.append(edit, del);
        item.append(num, txt, acts);
        return item;
      }),
    );
    placeList();
  }

  function placeMarks() {
    const b = bar.getBoundingClientRect();
    let loose = 0; // markers with no element on screen, lined up to the left of the bar
    [...marks.children].forEach((m, i) => {
      const el = notes[i]?.el;
      if (el?.isConnected) {
        const r = el.getBoundingClientRect();
        const earlier = notes.slice(0, i).filter((n) => n.el === el).length; // two notes on one element sit side by side
        m.style.left = `${Math.max(2, r.x - 8 + earlier * 20)}px`;
        m.style.top = `${Math.max(2, r.y - 8)}px`;
      } else {
        // A page-level note, or its element has gone: line up to the left of the bar, wherever
        // it has been dragged.
        m.style.left = `${Math.max(2, b.left - 24 - loose * 22)}px`;
        m.style.top = `${b.top + (b.height - 18) / 2}px`;
        loose += 1;
      }
    });
  }

  let poll = 0;
  function status(text, action) {
    st.hidden = !text;
    st.replaceChildren(text || "");
    if (action) {
      const b = document.createElement("button");
      b.className = "go";
      b.textContent = action.label;
      b.onclick = action.run;
      st.append(b);
    }
  }

  function watch(batch) {
    clearInterval(poll);
    status(`Sent — working on batch ${batch}…`);
    poll = setInterval(async () => {
      try {
        const s = await (await fetch(`${base}/status`)).json();
        if (s.state === "done" && s.batch >= batch) {
          clearInterval(poll);
          status(`Batch ${batch} is in.`, { label: "Reload", run: () => location.reload() });
        }
      } catch {
        clearInterval(poll);
        status("Feedback receiver is not running.");
      }
    }, 2000);
  }

  async function send() {
    if (!notes.length) return;
    const body = {
      url: location.href.replace(/([?&]token=)[^&#]+/, "$1…"),
      title: document.title,
      viewport: { w: innerWidth, h: innerHeight },
      theme: document.documentElement.dataset.theme || "",
      notes: notes.map((n, i) => ({ n: i + 1, note: n.note, ...(n.info ? { element: n.info } : {}) })),
    };
    try {
      const res = await fetch(`${base}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      const { batch } = await res.json();
      notes.length = 0;
      renderQueue();
      setPicking(false);
      watch(batch);
    } catch (err) {
      status(`Not sent (${err.message}) — is make proto-run still up?`);
    }
  }

  pickBtn.onclick = () => setPicking(!picking);
  $(".gen").onclick = () => openEditor(null);
  $(".save").onclick = saveNote;
  $(".cancel").onclick = closeEditor;
  sendBtn.onclick = send;
  clearBtn.onclick = () => {
    notes.length = 0;
    if (editing && editing.index !== undefined) closeEditor();
    renderQueue();
  };
  lstBtn.onclick = () => {
    list.hidden = !list.hidden;
    renderQueue();
  };
  delBtn.onclick = () => {
    if (editing && editing.index !== undefined) removeNote(editing.index);
  };

  // Pointer events: while picking, or with Alt held at any time, the dashboard never sees them.
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick", "contextmenu"]) {
    window.addEventListener(
      type,
      (e) => {
        if (ours(e) || !(picking || e.altKey)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (type === "click") {
          const el = targetOf(e);
          if (el) openEditor(el);
        }
      },
      true,
    );
  }
  window.addEventListener(
    "mousemove",
    (e) => {
      if (!ed.hidden) return;
      const el = !ours(e) && (picking || e.altKey) ? targetOf(e) : null;
      hl.hidden = !el;
      if (el) box(hl, el.getBoundingClientRect());
    },
    true,
  );

  // Keys typed into the note box must not reach the dashboard's shortcuts, and Esc must not
  // close a dialog the developer is commenting on.
  window.addEventListener(
    "keydown",
    (e) => {
      if (ours(e)) {
        e.stopImmediatePropagation();
        if (ed.hidden) {
          if (e.key === "Escape" && picking) setPicking(false);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeEditor();
        } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          saveNote();
        }
        return;
      }
      if (e.key === "Escape" && (picking || !ed.hidden)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!ed.hidden) closeEditor();
        else setPicking(false);
      }
    },
    true,
  );
  for (const type of ["keyup", "keypress", "beforeinput", "input", "paste", "copy", "cut"]) {
    window.addEventListener(type, (e) => ours(e) && e.stopImmediatePropagation(), true);
  }
  // Clicks on the overlay itself stop at its host, so no outside-click handler fires for them.
  for (const type of ["pointerdown", "mousedown", "click"]) host.addEventListener(type, (e) => e.stopPropagation());

  // A batch still being worked on when the page reloads keeps its status line.
  fetch(`${base}/status`)
    .then((r) => r.json())
    .then((s) => s.state === "sent" && watch(s.batch))
    .catch(() => {});
})();
