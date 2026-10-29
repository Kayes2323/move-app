// In-memory stand-in for firebase/storage, used only by the E2E build (E2E=1). Failures are injected through the same
// localStorage flag as the Firestore mock: add "storage_upload" to __mock_fail, or "storage_denied" for storage/unauthorized.
const flags = () => (localStorage.getItem("__mock_fail") || "").split(",");
export const getStorage = () => ({});
export const ref = (_s: unknown, path: string) => ({ fullPath: path });
export const uploadBytes = async (r: { fullPath: string }, blob: Blob) => {
  if (flags().includes("storage_denied")) throw Object.assign(new Error("denied"), { code: "storage/unauthorized" });
  if (flags().includes("storage_upload") || navigator.onLine === false) throw Object.assign(new Error("network"), { code: "storage/network-request-failed" });
  const buf = await blob.arrayBuffer();
  let s = "";
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  localStorage.setItem("__mock_blob:" + r.fullPath, "data:image/jpeg;base64," + btoa(s));
  return {};
};
export const getDownloadURL = async (r: { fullPath: string }) => "https://storage.mock/" + r.fullPath + "?alt=media&token=t";
export const deleteObject = async (r: { fullPath: string }) => { localStorage.removeItem("__mock_blob:" + r.fullPath); };
