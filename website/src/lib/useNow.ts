"use client";

import { useSyncExternalStore } from "react";

/**
 * The shared clock.
 *
 * One interval for the whole page, exposed through `useSyncExternalStore`. That
 * shape matters for two reasons:
 *
 *  1. **Hydration.** The server snapshot is `0`, so the first client render
 *     matches the server exactly; the real time arrives immediately afterwards
 *     as an external-store update rather than as a state write during an effect
 *     (which is what the React Compiler lint rules forbid, and what causes a
 *     cascading render).
 *  2. **Cost.** Ten countdowns on screen share one timer and one Date.now()
 *     call per second, instead of ten intervals.
 *
 * Callers should treat `0` as "clock not started yet" and render a placeholder.
 */

const TICK_MS = 1000;

let snapshot = 0;
let timer: number | null = null;
const subscribers = new Set<() => void>();

function tick() {
  snapshot = Date.now();
  for (const notify of subscribers) notify();
}

function subscribe(onStoreChange: () => void): () => void {
  // Start the clock on the first subscriber and stop it when the last one
  // leaves, so an idle page holds no timer open.
  if (timer === null) {
    snapshot = Date.now();
    timer = window.setInterval(tick, TICK_MS);
  }
  subscribers.add(onStoreChange);

  return () => {
    subscribers.delete(onStoreChange);
    if (subscribers.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => snapshot;
/** Server + first hydration render: no clock yet, so nothing can mismatch. */
const getServerSnapshot = () => 0;

/** Epoch milliseconds, refreshed once a second. `0` until the clock starts. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Seconds remaining until `targetIso`, or `null` while the clock warms up or
 * the target has already passed.
 */
export function useCountdown(targetIso: string | null): number | null {
  const now = useNow();
  if (now === 0 || !targetIso) return null;
  const remaining = Math.floor((new Date(targetIso).getTime() - now) / 1000);
  return remaining > 0 ? remaining : null;
}

/** Milliseconds remaining until an epoch-ms deadline. */
export function useDeadline(deadline: number | null): number | null {
  const now = useNow();
  if (now === 0 || deadline === null) return null;
  return Math.max(0, deadline - now);
}

/**
 * Seconds elapsed since `fromIso`. Unlike `useCountdown` this keeps counting
 * past zero, which is what a running parking session needs.
 */
export function useElapsed(fromIso: string | null): number | null {
  const now = useNow();
  if (now === 0 || !fromIso) return null;
  return Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
}
