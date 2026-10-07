/* eslint-disable @typescript-eslint/no-explicit-any -- test double: it models a loosely typed document store */
// Path-addressed in-memory stand-in for firebase/firestore, used only by the E2E build (E2E=1).
// It models what matters for these tests: nothing works while offline, transactions are atomic, and failures
// (including "committed but the response was lost") can be injected through localStorage flags.
type Json = Record<string, any>;
const load = (): Json => { try { return JSON.parse(localStorage.getItem("__mock_db") || "{}"); } catch { return {}; } };
const save = (d: Json) => localStorage.setItem("__mock_db", JSON.stringify(d));
const flags = () => (localStorage.getItem("__mock_fail") || "").split(",");
const gate = (op: string) => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw Object.assign(new Error("Failed to get document because the client is offline."), { code: "unavailable" });
  if (flags().includes(op)) throw Object.assign(new Error("mock " + op + " failure"), { code: "unavailable" });
};
type Ref = { path: string; id: string };
export const getFirestore = () => ({});
export const serverTimestamp = () => ({ __op: "ts" });
export const increment = (n: number) => ({ __op: "inc", n });
export const arrayUnion = (v: unknown) => ({ __op: "union", v });
export const doc = (_d: unknown, ...parts: string[]): Ref => ({ path: parts.join("/"), id: parts[parts.length - 1] });
export const collection = (_d: unknown, ...parts: string[]) => ({ path: parts.join("/") });
export const orderBy = (field: string, dir = "asc") => ({ t: "order", field, dir });
export const limit = (n: number) => ({ t: "limit", n });
export const query = (c: { path: string }, ...cs: any[]) => ({ path: c.path, cs });
const apply = (cur: Json, data: Json) => {
  const out = { ...cur };
  for (const [k, v] of Object.entries(data)) {
    const op = (v as any)?.__op;
    if (op === "inc") out[k] = (out[k] || 0) + (v as any).n;
    else if (op === "union") { const a = out[k] || []; if (!a.some((x: unknown) => JSON.stringify(x) === JSON.stringify((v as any).v))) a.push((v as any).v); out[k] = a; }
    else if (op === "ts") out[k] = Date.now();
    else out[k] = v;
  }
  return out;
};
const snap = (path: string, d: Json | undefined) => ({ id: path.split("/").pop(), exists: () => !!d, data: () => d });
export const getDoc = async (r: Ref) => { gate("getDoc"); return snap(r.path, load()[r.path]); };
export const setDoc = async (r: Ref, data: Json, o?: { merge?: boolean }) => { gate("setDoc"); const db = load(); db[r.path] = apply(o?.merge ? db[r.path] || {} : {}, data); save(db); };
export const updateDoc = async (r: Ref, data: Json) => { gate("updateDoc"); const db = load(); if (!db[r.path]) throw new Error("not-found"); db[r.path] = apply(db[r.path], data); save(db); };
export const writeBatch = (_d: unknown) => {
  const ops: { r: Ref; data: Json }[] = [];
  return { set: (r: Ref, data: Json) => { ops.push({ r, data }); }, commit: async () => { gate("batch"); const db = load(); for (const o of ops) db[o.r.path] = apply({}, o.data); save(db); } };
};
export const runTransaction = async <T,>(_d: unknown, fn: (tx: any) => Promise<T>): Promise<T> => {
  gate("transaction");
  const db = load();
  const writes: { r: Ref; data: Json; update: boolean }[] = [];
  const tx = {
    get: async (r: Ref) => snap(r.path, db[r.path]),
    set: (r: Ref, data: Json) => { writes.push({ r, data, update: false }); },
    update: (r: Ref, data: Json) => { writes.push({ r, data, update: true }); },
  };
  const result = await fn(tx);
  const fresh = load(); // commit against the current state, atomically
  for (const w of writes) {
    if (w.update && !fresh[w.r.path]) throw new Error("not-found");
    fresh[w.r.path] = apply(w.update ? fresh[w.r.path] : {}, w.data);
  }
  save(fresh);
  if (flags().includes("lose_ack")) throw Object.assign(new Error("response lost after commit"), { code: "unavailable" }); // committed, but the client never hears
  return result;
};
export const getDocs = async (q: { path: string; cs: any[] }) => {
  gate("getDocs");
  let docs = Object.entries(load()).filter(([p]) => p.startsWith(q.path + "/") && !p.slice(q.path.length + 1).includes("/")).map(([p, v]) => ({ id: p.split("/").pop(), data: () => v as Json }));
  const o = q.cs.find((c) => c.t === "order");
  if (o) docs.sort((a, b) => (o.dir === "desc" ? -1 : 1) * ((a.data()[o.field] || 0) - (b.data()[o.field] || 0)));
  const l = q.cs.find((c) => c.t === "limit");
  if (l) docs = docs.slice(0, l.n);
  return { docs };
};
