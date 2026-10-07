"use client";
import { useEffect } from "react";
import { getRuntime } from "../lib/tracking/runtime";

/** Mounted once in the root layout so pending activities sync on any screen, not only the run screen. */
export function SyncBootstrap() {
  useEffect(() => {
    getRuntime().initSync();
  }, []);
  return null;
}
