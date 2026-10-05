// The rail's sections (design-system §5, docs/design/mockups/groups): per group and for Ungrouped,
// a sticky header — caret, select-mode checkbox, name, summary, ⋯ — over a body of cards rendered
// exactly as before (`reconcileCards`). DOM only: `sessions/sections.ts` decides what the sections
// are and every string a header shows, `features/groups.ts` decides what a click does.
//
// Reconciled by section key (a group id, or `ungrouped`) the way `reconcileCards` reconciles cards:
// an existing header is updated in place, so the caret, the ⋯ button, the checkbox and a name field
// being typed into keep their node and their focus across the 1s tick
// (kb:lesson/select-rebuilt-every-tick-passed-selectoption); only a section new to the rail builds
// DOM, and only one that left it removes it. A read-only readout (the summary) is rewritten only
// when what it shows changes. The name field exists only while the caller says one is editing, and
// is created once for that edit.
//
// The instance holds what it built (one `createRailSections()` per rail) — never state keyed
// across calls by anything the caller owns.
import {
  caretLabel,
  emptySectionLine,
  headerCheckboxLabel,
  popoverModel,
  sectionShown,
  summarize,
  summaryTitle,
  type RailFilter,
  type Section,
} from "../sessions/sections";
import { captureFocusedControl } from "./focuskeep";
import type { GroupPopover } from "./grouppopover";
import { reconcileKeyedOrder, type KeyedReorderEntry } from "./keyedreorder";
import { reconcileCards, type CardListOptions } from "./sessions";

/** The name field's owner: a rename of one group (`key` is its section key), or the pending new
 * group (`key` is `PENDING_KEY`). */
export interface NameEditor {
  key: string;
  initial: string;
  /** A request is in flight for this name: the field stays, read-only, until the daemon answers. */
  readOnly: boolean;
}

export const PENDING_KEY = "new";

export interface RailSectionHandlers {
  onToggleCollapsed: (section: Section) => void;
  onOpenMenu: (section: Section, opener: HTMLButtonElement) => void;
  onStartRename: (section: Section) => void;
  onToggleSection: (section: Section, checked: boolean) => void;
  onNameEnter: (key: string, value: string) => void;
  onNameEscape: (key: string) => void;
  onNameBlur: (key: string, value: string) => void;
}

export interface RailSectionsModel {
  sections: readonly Section[];
  filter: RailFilter;
  editing: NameEditor | null;
  selecting: boolean;
  selectedIds: ReadonlySet<number>;
  /** No session exists at all: the rail says so under whatever sections there are. */
  empty: boolean;
  now: Date;
  /** The card options every section's cards share. `selection` and `adopt` are filled in here. */
  cards: CardListOptions;
  /** What choosing a card's checkbox does; handed to the cards only while selecting. */
  onToggleCard: (id: number) => void;
}

export interface RailSections {
  render(model: RailSectionsModel): void;
}

interface NameField {
  input: HTMLInputElement;
  /** Opened this pass and not yet focused: focusing needs the field mounted, and the pending
   * section is only mounted once the whole pass has positioned it. */
  fresh: boolean;
  dispose: () => void;
}

/** Where a name field lives: a header's `.gname`, and the field currently in it (if any). */
interface NameHost {
  nameEl: HTMLElement;
  field: NameField | null;
}

interface HeaderRefs extends NameHost {
  head: HTMLElement;
  caret: HTMLButtonElement;
  check: HTMLInputElement;
  summary: HTMLElement;
  kebab: HTMLButtonElement;
  detachPopover: () => void;
}

interface SectionRefs {
  root: HTMLElement;
  body: HTMLElement;
  header: HeaderRefs | null;
  /** The newest data for this section: handlers and the popover read it, never a captured copy. */
  section: Section;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/** The summary readout: the member count, then one dot-and-number item per state present. The
 * dot is an empty `<i>` painted by its `data-state`, so an item's text is the bare number. */
function writeSummary(summaryEl: HTMLElement, cards: Section["cards"]): void {
  const summary = summarize(cards);
  const signature = `${summary.count}|${summary.states.map((s) => `${s.state}:${s.n}`).join(",")}`;
  if (summaryEl.dataset["signature"] === signature) return;
  summaryEl.dataset["signature"] = signature;
  const count = element("span", "cnt");
  count.textContent = String(summary.count);
  const items = summary.states.map(({ state, n }) => {
    const item = element("span", "st");
    item.dataset["state"] = state;
    item.title = summaryTitle(state, n);
    item.append(element("i", "dot"), String(n));
    return item;
  });
  summaryEl.replaceChildren(count, ...items);
}

function buildHeader(
  key: string,
  id: number | null,
  getSection: () => Section,
  handlers: RailSectionHandlers,
  popover: GroupPopover,
): HeaderRefs {
  const head = element("div", "ghead");
  head.dataset["groupId"] = key;
  head.dataset["sectionId"] = String(id ?? 0);
  const caret = element("button", "disc");
  caret.type = "button";
  const check = element("input", "gchk");
  check.type = "checkbox";
  const nameEl = element("span", "gname");
  const summary = element("span", "gsum");
  const kebab = element("button", "kebab");
  kebab.type = "button";
  kebab.textContent = "⋯";
  kebab.setAttribute("aria-label", "Group actions");
  kebab.setAttribute("aria-haspopup", "menu");
  kebab.setAttribute("aria-expanded", "false");
  head.append(caret, check, nameEl, summary, kebab);

  caret.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onToggleCollapsed(getSection());
  });
  check.addEventListener("click", (event) => event.stopPropagation());
  check.addEventListener("change", () => handlers.onToggleSection(getSection(), check.checked));
  kebab.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onOpenMenu(getSection(), kebab);
  });
  // A click on the header's own space folds it. The name of a renameable group is left out: a
  // double-click there renames, and its first click must not fold the section it is about to edit.
  head.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("button, input")) return;
    if (getSection().id !== null && target.closest(".gname")) return;
    handlers.onToggleCollapsed(getSection());
  });
  nameEl.addEventListener("dblclick", () => {
    const section = getSection();
    if (section.id !== null) handlers.onStartRename(section);
  });
  const detachPopover = popover.attach(head, caret, () => popoverModel(getSection()));
  return { head, caret, check, nameEl, field: null, summary, kebab, detachPopover };
}

/** Which of a section's members are selected: all, some or none, for its header checkbox. */
function selectedShare(
  section: Section,
  selectedIds: ReadonlySet<number>,
): "all" | "some" | "none" {
  const n = section.cards.filter((c) => selectedIds.has(c.id)).length;
  if (n === 0) return "none";
  return n === section.cards.length ? "all" : "some";
}

function updateHeader(header: HeaderRefs, section: Section, model: RailSectionsModel): void {
  const { head, caret, check, kebab } = header;
  const connected = model.cards.connected;
  head.classList.toggle("collapsed", section.collapsed);
  head.classList.toggle("ungrouped", section.id === null);
  head.hidden = !sectionShown(section, model.filter);
  // A header being renamed is not a drag handle: dragging inside the field would drag the section.
  head.draggable = connected && header.field === null;

  caret.setAttribute("aria-label", caretLabel(section.name, section.collapsed));
  caret.setAttribute("aria-expanded", String(!section.collapsed));
  caret.disabled = !connected;
  kebab.disabled = !connected;

  const share = selectedShare(section, model.selectedIds);
  check.hidden = !model.selecting;
  check.checked = share === "all";
  check.indeterminate = share === "some";
  check.disabled = !connected || section.cards.length === 0;
  check.setAttribute("aria-label", headerCheckboxLabel(section.name));

  if (header.field === null && header.nameEl.textContent !== section.name) {
    header.nameEl.textContent = section.name;
    // A long name ends in an ellipsis; the hover reads it whole.
    header.nameEl.title = section.name;
  }
  writeSummary(header.summary, section.cards);
}

function openNameField(host: NameHost, editing: NameEditor, handlers: RailSectionHandlers): void {
  const input = element("input");
  input.type = "text";
  input.maxLength = 40;
  input.value = editing.initial;
  input.setAttribute("aria-label", "Group name");
  const { key } = editing;
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      handlers.onNameEnter(key, input.value);
    } else if (event.key === "Escape") {
      // The window's own Escape (leaving select mode) must not also run.
      event.preventDefault();
      event.stopPropagation();
      handlers.onNameEscape(key);
    }
  };
  const onBlur = (): void => handlers.onNameBlur(key, input.value);
  input.addEventListener("keydown", onKeydown);
  input.addEventListener("blur", onBlur);
  host.field = {
    input,
    fresh: true,
    dispose: () => {
      input.removeEventListener("keydown", onKeydown);
      input.removeEventListener("blur", onBlur);
    },
  };
  host.nameEl.replaceChildren(input);
}

/** Focuses (and selects) a name field opened this pass, once it is in the document. */
function focusFresh(host: NameHost | undefined): void {
  const field = host?.field;
  if (!field?.fresh) return;
  field.fresh = false;
  field.input.focus();
  field.input.select();
}

/** Closes the field and puts `text` back. The listeners go first: removing a focused input must
 * not report a blur as if the developer had left it. */
function closeNameField(host: NameHost, text: string): void {
  host.field?.dispose();
  host.field = null;
  host.nameEl.textContent = text;
}

/** Opens, keeps or closes `host`'s name field to match `editing` (the editor for this key, or
 * null). The field is built once per edit and never rebuilt by a later pass. */
function reconcileNameField(
  host: NameHost,
  editing: NameEditor | null,
  restoreText: string,
  handlers: RailSectionHandlers,
): void {
  if (!editing) {
    if (host.field) closeNameField(host, restoreText);
    return;
  }
  if (!host.field) openNameField(host, editing, handlers);
  if (host.field) host.field.input.readOnly = editing.readOnly;
}

export function createRailSections(
  container: HTMLElement,
  template: HTMLTemplateElement,
  handlers: RailSectionHandlers,
  popover: GroupPopover,
): RailSections {
  const built = new Map<string, SectionRefs>();
  let pendingEl: { root: HTMLElement; host: NameHost } | null = null;
  let emptyEl: HTMLElement | null = null;

  function build(section: Section): SectionRefs {
    const root = element("div", "gsec");
    const body = element("div", "gbody");
    body.dataset["groupId"] = section.key;
    root.append(body);
    const refs: SectionRefs = { root, body, header: null, section };
    built.set(section.key, refs);
    return refs;
  }

  /** Mounts the header while the section is headed, removes it when the rail goes flat. */
  function reconcileHeader(refs: SectionRefs, section: Section): HeaderRefs | null {
    if (!section.headed) {
      const old = refs.header;
      if (old) {
        old.field?.dispose();
        old.detachPopover();
        old.head.remove();
        refs.header = null;
      }
      return null;
    }
    if (!refs.header) {
      refs.header = buildHeader(section.key, section.id, () => refs.section, handlers, popover);
      refs.root.insertBefore(refs.header.head, refs.body);
    }
    return refs.header;
  }

  function reconcileBody(
    refs: SectionRefs,
    model: RailSectionsModel,
    adopt: ReadonlyMap<number, HTMLElement>,
  ): void {
    const { body, section } = refs;
    body.hidden = section.headed && (section.collapsed || !sectionShown(section, model.filter));
    const selection = model.selecting
      ? { selectedIds: model.selectedIds, onToggle: model.onToggleCard }
      : undefined;
    // The line says where a drop goes: absent while cards fill the body and while the rail is
    // flat (no header, nothing to name). Removed before the cards are positioned so it never sits
    // between them, and kept — not rebuilt — across ticks while the body stays empty.
    const showLine = section.cards.length === 0 && section.headed;
    let line = body.querySelector<HTMLElement>(":scope > .empty");
    if (!showLine) {
      line?.remove();
      line = null;
    }
    reconcileCards(body, section.cards, model.now, template, { ...model.cards, selection, adopt });
    if (showLine) {
      line ??= body.appendChild(element("div", "empty"));
      const text = emptySectionLine(section);
      if (line.textContent !== text) line.textContent = text;
    }
  }

  /** The pending new-group section: a header with the name field and nothing under it, above the
   * first section. It exists only on the client until Enter makes the daemon create the group. */
  function reconcilePending(editing: NameEditor | null): HTMLElement | null {
    if (!editing) {
      if (pendingEl) {
        pendingEl.host.field?.dispose();
        pendingEl.root.remove();
        pendingEl = null;
      }
      return null;
    }
    if (!pendingEl) {
      const root = element("div", "gsec pending");
      const head = element("div", "ghead pending");
      head.dataset["groupId"] = PENDING_KEY;
      const nameEl = element("span", "gname");
      head.append(nameEl);
      root.append(head);
      pendingEl = { root, host: { nameEl, field: null } };
    }
    reconcileNameField(pendingEl.host, editing, "", handlers);
    return pendingEl.root;
  }

  function reconcileEmptyLine(empty: boolean): HTMLElement | null {
    if (!empty) {
      emptyEl?.remove();
      emptyEl = null;
      return null;
    }
    if (!emptyEl) {
      emptyEl = element("div", "rail-empty");
      emptyEl.textContent = "No sessions yet";
    }
    return emptyEl;
  }

  /** Every card now in the rail, by session id, indexed before any section is reconciled so a card
   * that moved between sections is adopted rather than rebuilt. */
  function indexCards(): Map<number, HTMLElement> {
    const byId = new Map<number, HTMLElement>();
    for (const card of container.querySelectorAll<HTMLElement>("article.card")) {
      const id = Number(card.dataset["sessionId"]);
      if (Number.isFinite(id)) byId.set(id, card);
    }
    return byId;
  }

  function dropGone(wanted: ReadonlySet<string>): void {
    for (const [key, refs] of built) {
      if (wanted.has(key)) continue;
      refs.header?.field?.dispose();
      refs.header?.detachPopover();
      refs.root.remove();
      built.delete(key);
    }
  }

  /** One section's header (with its name field) and body, built on first sight. */
  function reconcileSection(
    section: Section,
    model: RailSectionsModel,
    adopt: ReadonlyMap<number, HTMLElement>,
  ): HTMLElement {
    const refs = built.get(section.key) ?? build(section);
    refs.section = section;
    const header = reconcileHeader(refs, section);
    if (header) {
      const editing = model.editing?.key === section.key ? model.editing : null;
      reconcileNameField(header, editing, section.name, handlers);
      updateHeader(header, section, model);
    }
    reconcileBody(refs, model, adopt);
    return refs.root;
  }

  function render(model: RailSectionsModel): void {
    // A moved or re-sorted card can be blurred by the move itself (render/focuskeep.ts); the rail's
    // focus is captured once, here, so a card that changes section still gets it back.
    const focused = model.cards.pendingFocus ?? captureFocusedControl(container);
    const shared = { ...model, cards: { ...model.cards, pendingFocus: focused } };
    const adopt = indexCards();
    container.classList.toggle("selecting", model.selecting);

    const entries: KeyedReorderEntry[] = [];
    const pending = reconcilePending(model.editing?.key === PENDING_KEY ? model.editing : null);
    if (pending) entries.push({ id: PENDING_KEY, root: pending });
    for (const section of model.sections) {
      entries.push({ id: section.key, root: reconcileSection(section, shared, adopt) });
    }
    dropGone(new Set(model.sections.map((s) => s.key)));

    const emptyLine = reconcileEmptyLine(model.empty);
    if (emptyLine) entries.push({ id: "empty", root: emptyLine });
    for (const node of Array.from(container.childNodes)) {
      if (!(node instanceof HTMLElement)) node.remove();
    }
    reconcileKeyedOrder(container, entries, focused);
    focusFreshFields();
  }

  function focusFreshFields(): void {
    focusFresh(pendingEl?.host);
    for (const refs of built.values()) focusFresh(refs.header ?? undefined);
  }

  return { render };
}
