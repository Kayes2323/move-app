"use client";
import { useSyncExternalStore } from "react";

export type ThemeMode = "dark" | "light" | "system";
export type Accent = "blue" | "purple" | "green" | "orange";

export interface ThemePrefs {
  mode: ThemeMode;
  accent: Accent;
}

export const DEFAULT_PREFS: ThemePrefs = { mode: "dark", accent: "blue" };
export const ACCENTS: { id: Accent; label: string; color: string; ink: string }[] = [
  { id: "blue", label: "Blue", color: "#4F6EF7", ink: "#FFFFFF" },
  { id: "purple", label: "Purple", color: "#7C3AED", ink: "#FFFFFF" },
  { id: "green", label: "Green", color: "#22C55E", ink: "#0A0A0C" },
  { id: "orange", label: "Orange", color: "#F59E0B", ink: "#0A0A0C" },
];

const KEY = "move.theme";
const EVENT = "move:theme";

/** Runs in <head> before first paint so the page never flashes the wrong theme. Keep it dependency-free. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}");var m=p.mode==="light"||p.mode==="system"?p.mode:"dark";var a=["blue","purple","green","orange"].indexOf(p.accent)>=0?p.accent:"blue";var d=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;var r=document.documentElement;r.setAttribute("data-theme",d);r.setAttribute("data-accent",a);var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",d==="light"?"#FFFFFF":"#0A0A0C");}catch(e){}})();`;

function isMode(v: unknown): v is ThemeMode {
  return v === "dark" || v === "light" || v === "system";
}
function isAccent(v: unknown): v is Accent {
  return v === "blue" || v === "purple" || v === "green" || v === "orange";
}

let cachedRaw: string | null = null;
let cachedPrefs: ThemePrefs = DEFAULT_PREFS;

export function readPrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cachedRaw) return cachedPrefs;
    cachedRaw = raw;
    const p = raw ? JSON.parse(raw) : {};
    cachedPrefs = { mode: isMode(p.mode) ? p.mode : DEFAULT_PREFS.mode, accent: isAccent(p.accent) ? p.accent : DEFAULT_PREFS.accent };
  } catch {
    cachedPrefs = DEFAULT_PREFS;
  }
  return cachedPrefs;
}

export function resolveMode(mode: ThemeMode): "dark" | "light" {
  if (mode !== "system") return mode;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Writes the attributes the CSS reads. */
export function applyPrefs(prefs: ThemePrefs): void {
  const root = document.documentElement;
  const resolved = resolveMode(prefs.mode);
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-accent", prefs.accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "light" ? "#FFFFFF" : "#0A0A0C");
}

export function savePrefs(next: ThemePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the choice still applies until the page closes
  }
  cachedRaw = null;
  cachedPrefs = next;
  applyPrefs(next);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useThemePrefs(): ThemePrefs {
  return useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_PREFS);
}
