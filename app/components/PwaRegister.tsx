"use client";
import { useEffect } from "react";
import { isNativeApp } from "../lib/tracking/location";

/** Registers the service worker that makes Move installable as an app and lets its shell open offline. Production, web only. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || isNativeApp() || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => console.warn("Service worker not registered", err));
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
