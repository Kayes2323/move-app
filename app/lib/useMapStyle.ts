"use client";
import { useSyncExternalStore } from "react";
import type { MapStyle } from "./mapTiles";

const KEY = "move.mapStyle";
const EVENT = "move:mapStyle";

/** Satellite is the default (it is what people expect from a phone map); the choice is remembered on this phone. */
export function readMapStyle(): MapStyle {
  try {
    return localStorage.getItem(KEY) === "street" ? "street" : "satellite";
  } catch {
    return "satellite";
  }
}
export function setMapStyle(style: MapStyle) {
  try {
    localStorage.setItem(KEY, style);
  } catch {
    // storage unavailable: the choice lasts until the page closes only
  }
  window.dispatchEvent(new Event(EVENT));
}
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
export const useMapStyle = (): MapStyle => useSyncExternalStore(subscribe, readMapStyle, () => "satellite" as MapStyle);
