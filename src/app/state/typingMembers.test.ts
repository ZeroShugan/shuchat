import { createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TYPING_TIMEOUT_MS, roomIdToTypingMembersAtom } from './typingMembers';

// Guards the typing-members store that every typing indicator reads from —
// including the Privacy round's display-only gate (2026-07-27), which relies
// on entries SELF-EXPIRING via the atom's timeout when events stop arriving.

describe('roomIdToTypingMembersAtom', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const put = (store: ReturnType<typeof createStore>, roomId: string, userId: string) =>
    store.set(roomIdToTypingMembersAtom, { type: 'PUT', roomId, userId, ts: Date.now() });

  it('PUT adds a member, DELETE removes it and drops empty rooms', () => {
    const store = createStore();
    put(store, '!a', '@x');
    put(store, '!a', '@y');
    expect(store.get(roomIdToTypingMembersAtom).get('!a')).toHaveLength(2);
    store.set(roomIdToTypingMembersAtom, { type: 'DELETE', roomId: '!a', userId: '@x' });
    expect(store.get(roomIdToTypingMembersAtom).get('!a')).toHaveLength(1);
    store.set(roomIdToTypingMembersAtom, { type: 'DELETE', roomId: '!a', userId: '@y' });
    expect(store.get(roomIdToTypingMembersAtom).has('!a')).toBe(false);
  });

  it('re-PUT of the same user does not duplicate', () => {
    const store = createStore();
    put(store, '!a', '@x');
    put(store, '!a', '@x');
    expect(store.get(roomIdToTypingMembersAtom).get('!a')).toHaveLength(1);
  });

  it('stale entries self-expire after TYPING_TIMEOUT_MS (the hide-toggle safety net)', () => {
    const store = createStore();
    put(store, '!a', '@x');
    // no DELETE ever arrives (e.g. the hide gate stopped listening) — the
    // built-in timeout must clear it so no indicator can get stuck
    vi.advanceTimersByTime(TYPING_TIMEOUT_MS + 50);
    expect(store.get(roomIdToTypingMembersAtom).has('!a')).toBe(false);
  });

  it('a refreshed entry survives the previous timeout tick', () => {
    const store = createStore();
    put(store, '!a', '@x');
    vi.advanceTimersByTime(TYPING_TIMEOUT_MS / 2);
    put(store, '!a', '@x'); // user still typing — fresh ts
    vi.advanceTimersByTime((TYPING_TIMEOUT_MS / 2) + 50);
    // first timer fired but the entry was refreshed, so it must still be there
    expect(store.get(roomIdToTypingMembersAtom).has('!a')).toBe(true);
  });
});
