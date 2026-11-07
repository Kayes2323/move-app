"use client";
import { useCallback, useEffect, useState } from "react";
import { parseCart, type CartLine } from "./cart";

/** The cart lives on this phone only (nothing is ordered until the order request is sent). */
const KEY = "move.cart";
const EVENT = "move-cart";

export function readCart(): CartLine[] {
  try {
    return parseCart(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function writeCart(cart: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cart));
  } catch {
    // storage unavailable: the cart lasts as long as the page
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useCart(): [CartLine[], (c: CartLine[]) => void, boolean] {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => {
      setCart(readCart());
      setReady(true);
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const set = useCallback((c: CartLine[]) => writeCart(c), []);
  return [cart, set, ready];
}

export const taka = (n: number) => `৳${n.toLocaleString("en-IN")}`;
