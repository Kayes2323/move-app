/**
 * Move's own confirm / alert dialogs, in place of the browser's ("movefitapp.vercel.app says ..."), which look foreign, can't be styled
 * and block the page. Imperative like the native ones (`await confirmDialog(...)`), drawn by <AppDialogHost /> in the root layout.
 * If the host isn't mounted (a test, a very early error) it falls back to the browser's own dialog, so a question is never skipped.
 */
export interface DialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" makes the confirm button red and puts focus on Cancel: for things that can't be undone. */
  tone?: "normal" | "danger";
}
export interface DialogRequest extends DialogOptions {
  kind: "confirm" | "alert";
  resolve: (ok: boolean) => void;
}

let host: ((r: DialogRequest) => void) | null = null;
export const registerDialogHost = (fn: ((r: DialogRequest) => void) | null) => {
  host = fn;
};

export function confirmDialog(o: DialogOptions): Promise<boolean> {
  if (!host) return Promise.resolve(typeof window !== "undefined" && window.confirm([o.title, o.message].filter(Boolean).join("\n\n")));
  return new Promise((resolve) => host!({ ...o, kind: "confirm", resolve }));
}
export function alertDialog(o: DialogOptions): Promise<void> {
  if (!host) {
    if (typeof window !== "undefined") window.alert([o.title, o.message].filter(Boolean).join("\n\n"));
    return Promise.resolve();
  }
  return new Promise((resolve) => host!({ ...o, kind: "alert", resolve: () => resolve() }));
}
