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
      [hidden] { display: none !important; }
    </style>
    <div class="hl" hidden></div>
    <div class="marks"></div>
    <div class="bar">
      <button class="pick" title="Pick elements to comment on. Or hold Alt and click anything, at any time.">Feedback</button>
      <button class="gen" title="A note about the page as a whole">+ Note</button>
      <button class="send go" hidden></button>
      <button class="clear" hidden title="Discard the unsent notes">Clear</button>
      <span class="st" hidden></span>
    </div>
    <div class="ed" hidden>
      <div class="what"></div>
      <textarea placeholder="What should change?"></textarea>
      <div class="row"><span class="hint">Enter saves · Esc cancels</span><button class="cancel">Cancel</button><button class="save go">Add</button></div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const hl = $(".hl"), marks = $(".marks"), ed = $(".ed"), ta = $("textarea"), st = $(".st");
  const pickBtn = $(".pick"), sendBtn = $(".send"), clearBtn = $(".clear");

  let picking = false;
  let editing = null; // { el } while the note box is open; el is null for a page-level note
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
  setInterval(() => {
    if (ed.hidden) rehome();
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

  function openEditor(el) {
    if (!ed.hidden && ta.value.trim()) saveNote();
    rehome();
    editing = { el };
    $(".what").textContent = el ? `${el.localName} — ${cut(el.innerText ?? el.textContent, 60) || selector(el)}` : "The page as a whole";
    ta.value = "";
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
  }

  function closeEditor() {
    ta.blur(); // or the next key still targets the hidden box and never reaches the Esc-to-stop branch
    ed.hidden = true;
    editing = null;
    if (!picking) hl.hidden = true;
  }

  function saveNote() {
    const note = ta.value.trim();
    if (note && editing) notes.push({ note, el: editing.el, info: editing.el ? describe(editing.el) : null });
    closeEditor();
    renderQueue();
  }

  function renderQueue() {
    sendBtn.hidden = clearBtn.hidden = notes.length === 0;
    sendBtn.textContent = `Send ${notes.length}`;
    marks.replaceChildren(
      ...notes.map((n, i) => {
        const m = document.createElement("div");
        m.className = "mark";
        m.textContent = String(i + 1);
        m.title = `${n.note}\n(click to remove)`;
        m.onclick = () => {
          notes.splice(i, 1);
          renderQueue();
        };
        return m;
      }),
    );
    placeMarks();
  }

  function placeMarks() {
    [...marks.children].forEach((m, i) => {
      const el = notes[i]?.el;
      if (el?.isConnected) {
        const r = el.getBoundingClientRect();
        const earlier = notes.slice(0, i).filter((n) => n.el === el).length; // two notes on one element sit side by side
        m.style.left = `${Math.max(2, r.x - 8 + earlier * 20)}px`;
        m.style.top = `${Math.max(2, r.y - 8)}px`;
      } else {
        // A page-level note, or its element has gone: stack beside the bar.
        m.style.left = `${innerWidth - 34}px`;
        m.style.top = `${innerHeight - 76 - i * 22}px`;
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
    renderQueue();
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
