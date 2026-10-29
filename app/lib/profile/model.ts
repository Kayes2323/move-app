/**
 * The MOVE athlete profile: what a person can say about themselves, and what other people may see of it.
 * Pure rules only (no Firebase, no DOM), so every decision here is unit-tested.
 *
 * Where things live:
 *   users/{uid}            private, owner-only: name, photo (Google), photoCustom, username, bio, heightCm, weight, privacy
 *   publicProfiles/{uid}   what other people can read: name, photo, username, bio, totals. NEVER height, weight or BMI.
 *   usernames/{handle}     one document per taken username, so two people cannot hold the same one
 */
export interface Privacy {
  /** Show my name and photo in Territory boards and the leaderboard. Off: I appear as an anonymous "Move athlete". */
  showInTerritory: boolean;
  showUsername: boolean;
  showBio: boolean;
}

/** Name and photo are what the leaderboard and Kings already showed before profiles existed, so that stays the default. Nothing new is exposed by default. */
export const DEFAULT_PRIVACY: Privacy = { showInTerritory: true, showUsername: true, showBio: true };

export interface Profile {
  uid: string;
  name: string;
  /** The Google photo, refreshed at sign-in. */
  photo: string;
  /** A picture the person uploaded. Takes precedence over the Google photo. */
  photoCustom: string;
  username: string;
  bio: string;
  heightCm: number | null;
  weightKg: number | null;
  privacy: Privacy;
}

export const NAME_MAX = 40;
export const BIO_MAX = 160;
export const HEIGHT_RANGE = [100, 250] as const;
export const WEIGHT_RANGE = [30, 200] as const;

const RESERVED = new Set(["admin", "administrator", "move", "moveapp", "support", "help", "root", "system", "official", "null", "undefined", "me", "you", "runner", "king"]);

export const normalizeUsername = (raw: string): string => raw.trim().replace(/^@+/, "").toLowerCase();

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

/** 3-20 characters: lowercase letters, digits and underscores, starting with a letter. */
export function checkUsername(raw: string): Check<string> {
  const v = normalizeUsername(raw);
  if (v.length < 3) return { ok: false, error: "Usernames are at least 3 characters." };
  if (v.length > 20) return { ok: false, error: "Usernames are at most 20 characters." };
  if (!/^[a-z]/.test(v)) return { ok: false, error: "A username must start with a letter." };
  if (!/^[a-z0-9_]+$/.test(v)) return { ok: false, error: "Use only letters, numbers and underscores." };
  if (RESERVED.has(v)) return { ok: false, error: "That username is reserved." };
  return { ok: true, value: v };
}

export function checkName(raw: string): Check<string> {
  const v = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!v) return { ok: false, error: "Add a name other people will see." };
  if (v.length > NAME_MAX) return { ok: false, error: `Names are at most ${NAME_MAX} characters.` };
  return { ok: true, value: v };
}

export function checkBio(raw: string): Check<string> {
  const v = raw.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
  if (v.length > BIO_MAX) return { ok: false, error: `Keep your bio under ${BIO_MAX} characters.` };
  return { ok: true, value: v };
}

/** Empty means "not given" (null): fitness details are never required. */
function checkNumber(raw: string, [lo, hi]: readonly [number, number], label: string, unit: string): Check<number | null> {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < lo || n > hi) return { ok: false, error: `${label} should be between ${lo} and ${hi} ${unit}, or left empty.` };
  return { ok: true, value: Math.round(n * 10) / 10 };
}
export const checkHeight = (raw: string) => checkNumber(raw, HEIGHT_RANGE, "Height", "cm");
export const checkWeight = (raw: string) => checkNumber(raw, WEIGHT_RANGE, "Weight", "kg");

export function bmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm < HEIGHT_RANGE[0] || weightKg < WEIGHT_RANGE[0]) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** WHO adult bands. A reference, not a diagnosis: muscle, age and build all move it. */
export function bmiBand(value: number | null): string {
  if (value === null) return "";
  if (value < 18.5) return "Below the usual range";
  if (value < 25) return "In the usual range";
  if (value < 30) return "Above the usual range";
  return "Well above the usual range";
}

const https = (v: unknown): string => (typeof v === "string" && /^https:\/\//.test(v) && v.length <= 600 ? v : "");

/** The picture to show: an uploaded one wins, then the Google one; empty means "draw the initials fallback". */
export const effectivePhoto = (p: { photo?: unknown; photoCustom?: unknown }): string => https(p.photoCustom) || https(p.photo);

export const initialsOf = (name: string | null | undefined): string => {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "M";
};

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

/** Reads any `users/{uid}` document, including accounts created before profiles existed: missing fields get their defaults. */
export function parseProfile(uid: string, raw: Record<string, unknown> | null | undefined): Profile {
  const u = raw ?? {};
  const pr = (u.privacy && typeof u.privacy === "object" ? u.privacy : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  return {
    uid,
    name: typeof u.name === "string" && u.name.trim() ? u.name.trim().slice(0, NAME_MAX) : "Runner",
    photo: https(u.photo),
    photoCustom: https(u.photoCustom),
    username: typeof u.username === "string" && checkUsername(u.username).ok ? u.username : "",
    bio: typeof u.bio === "string" ? u.bio.slice(0, BIO_MAX) : "",
    heightCm: num(u.heightCm),
    weightKg: num(u.weight),
    privacy: { showInTerritory: bool(pr.showInTerritory, DEFAULT_PRIVACY.showInTerritory), showUsername: bool(pr.showUsername, DEFAULT_PRIVACY.showUsername), showBio: bool(pr.showBio, DEFAULT_PRIVACY.showBio) },
  };
}

/** The fields other people may read. Built from an allow-list: height, weight, BMI, email and GPS cannot get in by accident. */
export interface PublicFields {
  name: string;
  photo: string;
  username?: string;
  bio?: string;
}

export const ANONYMOUS_NAME = "Move athlete";

export function publicFields(p: Profile): PublicFields {
  if (!p.privacy.showInTerritory) return { name: ANONYMOUS_NAME, photo: "" };
  const out: PublicFields = { name: p.name, photo: effectivePhoto(p) };
  if (p.username && p.privacy.showUsername) out.username = p.username;
  if (p.bio && p.privacy.showBio) out.bio = p.bio;
  return out;
}

/** First name only, for compact public spots (a King's card, a leaderboard row). */
export const firstName = (name: string | null | undefined): string => (name === ANONYMOUS_NAME ? ANONYMOUS_NAME : ((name ?? "").trim().split(/\s+/)[0] ?? "").slice(0, 24) || "Runner");
