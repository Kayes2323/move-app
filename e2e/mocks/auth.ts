// In-memory stand-in for firebase/auth, used only by the E2E build (E2E=1).
const read = () => { try { return JSON.parse(localStorage.getItem("__mock_user") || "null"); } catch { return null; } };
export const getAuth = () => ({ get currentUser() { return read(); } });
export const onAuthStateChanged = (_a: unknown, cb: (u: unknown) => void) => { const t = setTimeout(() => cb(read()), 40); return () => clearTimeout(t); };
export class GoogleAuthProvider {}
// Tests choose who Google "returns" through localStorage.__mock_google; by default it is Rafi with no photo.
export const signInWithPopup = async () => { const g = (() => { try { return JSON.parse(localStorage.getItem("__mock_google") || "null"); } catch { return null; } })(); const u = { uid: "u1", displayName: "Rafi Ahmed", email: "r@x.com", photoURL: "", ...(g || {}) }; localStorage.setItem("__mock_user", JSON.stringify(u)); return { user: u }; };
export const signOut = async () => { localStorage.removeItem("__mock_user"); };
