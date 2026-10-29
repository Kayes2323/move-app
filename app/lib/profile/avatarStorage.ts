/**
 * Firebase Storage for profile pictures. Kept apart from firebase.ts so the Storage SDK is only downloaded on the screen that uploads.
 * Needs Storage enabled in the Firebase console and storage.rules published (see docs/PHASE1-PROFILES.md).
 */
export class UploadError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

const path = (uid: string) => `avatars/${uid}/avatar.jpg`;

export async function uploadAvatar(uid: string, blob: Blob): Promise<string> {
  try {
    const [{ getApp }, st] = await Promise.all([import("firebase/app"), import("firebase/storage")]);
    await import("../../firebase"); // makes sure the app is initialised
    const storage = st.getStorage(getApp());
    const ref = st.ref(storage, path(uid));
    await st.uploadBytes(ref, blob, { contentType: "image/jpeg", cacheControl: "public, max-age=3600" });
    const url = await st.getDownloadURL(ref);
    // the file name never changes, so a new picture needs a new address or browsers keep showing the old one
    return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  } catch (err) {
    const code = (err as { code?: string }).code ?? "unknown";
    throw new UploadError(
      code === "storage/unauthorized" ? "Picture uploads aren't switched on for this app yet." : code === "storage/retry-limit-exceeded" || code === "unavailable" || code === "storage/network-request-failed" ? "Couldn't upload. Check your connection and try again." : "Couldn't upload that picture. Try again.",
      code,
    );
  }
}

export async function removeAvatarFile(uid: string): Promise<void> {
  try {
    const [{ getApp }, st] = await Promise.all([import("firebase/app"), import("firebase/storage")]);
    await st.deleteObject(st.ref(st.getStorage(getApp()), path(uid)));
  } catch {
    // already gone, or Storage isn't reachable: the profile no longer points at it either way
  }
}
