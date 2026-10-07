"use client";
import { useEffect } from "react";
import { applyPrefs, readPrefs, useThemePrefs } from "../lib/theme";

/** Keeps the page in step with the saved choice, including "Match phone" when the phone switches theme. */
export function ThemeSync() {
  const prefs = useThemePrefs();
  useEffect(() => {
    applyPrefs(readPrefs());
    if (prefs.mode !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const on = () => applyPrefs(readPrefs());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [prefs]);
  return null;
}
