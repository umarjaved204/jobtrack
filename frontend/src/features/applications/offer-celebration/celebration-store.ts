import { useSyncExternalStore } from 'react';

/*
 * "Offer received": the mutations that can turn an application into an offer (board move,
 * status picker, edit form) call `celebrateOffer`; the overlay in the app shell shows it.
 * A module store, not context, so the data layer can raise it without knowing the UI.
 */

export type Celebration = { id: number; company: string };

/** How long it stays before leaving by itself. */
export const CELEBRATION_MS = 2600;

let current: Celebration | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export function celebrateOffer(company: string) {
  current = { id: nextId++, company };
  emit();
}

/** Ends that celebration only: a newer one that replaced it keeps going. */
export function dismissCelebration(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

export function useCelebration(): Celebration | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}

export function resetCelebrationForTests() {
  current = null;
  emit();
}
