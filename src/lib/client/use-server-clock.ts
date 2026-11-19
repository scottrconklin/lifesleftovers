"use client";

import { useSyncExternalStore } from "react";

/**
 * The server clock is the only clock (CLAUDE.md): fetch /api/time once, keep the offset, and
 * tick once a second. Countdowns read this, never the phone's own clock.
 */
let offsetMs = 0;
let offsetPromise: Promise<void> | undefined;
let nowMs = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function syncOffset(): void {
  offsetPromise ??= (async () => {
    try {
      const started = Date.now();
      const response = await fetch("/api/time", { cache: "no-store" });
      const { epochMs } = (await response.json()) as { epochMs: number };
      offsetMs = epochMs + (Date.now() - started) / 2 - Date.now();
      publish();
    } catch {
      offsetPromise = undefined; // retry on the next subscribe; the local clock stands in
    }
  })();
}

function publish() {
  nowMs = Date.now() + offsetMs;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  syncOffset();
  timer ??= setInterval(publish, 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function snapshot(): number {
  if (nowMs === 0) nowMs = Date.now() + offsetMs;
  return nowMs;
}

/** Server-corrected "now", re-rendering every second; null during server render and hydration. */
export function useServerNow(): Date | null {
  const ms = useSyncExternalStore(subscribe, snapshot, () => -1);
  return ms === -1 ? null : new Date(ms);
}
