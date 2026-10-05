// The one `<option>` list builder: replaces a select's options with `{ value, label }` rows.
// Callers that rebuild on a render tick must do so only when the option set genuinely changes
// (kb:lesson/select-rebuilt-every-tick-passed-selectoption).

export interface OptionRow {
  value: string;
  label: string;
}

export function fillOptions(select: HTMLSelectElement, rows: readonly OptionRow[]): void {
  select.replaceChildren(
    ...rows.map((row) => {
      const option = document.createElement("option");
      option.value = row.value;
      option.textContent = row.label;
      return option;
    }),
  );
}
