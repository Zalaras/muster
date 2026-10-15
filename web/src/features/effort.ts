import { dismissEffortWarning } from "../api/sessions";

export interface EffortDeps {
  actions: { showError(message: string | null): void };
}

export interface EffortHandle {
  dismiss(id: number): void;
}

export function initEffort(deps: EffortDeps): EffortHandle {
  return {
    dismiss(id) {
      void dismissEffortWarning(id).then((result) => {
        deps.actions.showError(result.ok ? null : result.error.message);
      });
    },
  };
}
