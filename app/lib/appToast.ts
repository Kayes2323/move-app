/** A short "Saved" style notice, drawn by <AppToastHost /> in the root layout. Fire and forget; nothing blocks. */
export interface ToastRequest {
  message: string;
  tone: "ok" | "info";
}
let host: ((t: ToastRequest) => void) | null = null;
export const registerToastHost = (fn: ((t: ToastRequest) => void) | null) => {
  host = fn;
};
export const showToast = (message: string, tone: ToastRequest["tone"] = "ok") => host?.({ message, tone });
