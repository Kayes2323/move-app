"use client";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { loadTerritoryData, type TerritoryData } from "./data";
import { TerritoryDataError } from "./hierarchy";
import { clearActive, focusArea, focusParent, initialSelection, restore, selectFocused, serialize, STORAGE_KEY, type TerritorySelection } from "./selection";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: TerritoryData };

/** Loads the territory data and owns the selection state. Saved to this device only (see docs/TERRITORY.md). */
export function useTerritory() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useReducer((_: TerritorySelection | null, next: TerritorySelection | null) => next, null);

  useEffect(() => {
    let cancelled = false;
    loadTerritoryData()
      .then((data) => {
        if (cancelled) return;
        let raw: string | null = null;
        try {
          raw = localStorage.getItem(STORAGE_KEY);
        } catch {
          // storage blocked: nothing is remembered
        }
        setSelection(restore(raw, data.index));
        setLoad({ status: "ready", data });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setLoad({ status: "error", message: err instanceof TerritoryDataError ? err.message : "Couldn't load the map data." });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const index = load.status === "ready" ? load.data.index : null;

  const update = useCallback(
    (fn: (s: TerritorySelection) => TerritorySelection) => {
      if (!index) return;
      const next = fn(selection ?? initialSelection(index));
      if (next === selection) return;
      setSelection(next);
      if (next.activeId !== selection?.activeId) {
        try {
          if (next.activeId) localStorage.setItem(STORAGE_KEY, serialize(next));
          else localStorage.removeItem(STORAGE_KEY);
        } catch {
          // storage blocked: the choice still holds until the page closes
        }
      }
    },
    [index, selection]
  );

  const actions = useMemo(
    () =>
      index
        ? {
            focus: (id: string) => update((s) => focusArea(s, index, id)),
            up: () => update((s) => focusParent(s, index)),
            select: () => update((s) => selectFocused(s, index)),
            clear: () => update((s) => clearActive(s)),
          }
        : null,
    [index, update]
  );

  return { load, selection, actions, retry: () => {
      setLoad({ status: "loading" });
      setAttempt((n) => n + 1);
    },
  };
}
