import { useCallback, useMemo } from 'react';
import { Room } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { useStateEvent } from './useStateEvent';
import { StateEvent } from '../../types/matrix/room';

// Custom space categories (ShuChat-only feature). Stored as a state event on
// the space so every ShuChat user sees the same layout; other clients simply
// show the flat room list. Rooms NOT listed in any category fall into the
// automatic CHAT ROOMS / VOICE ROOMS buckets.
export const SPACE_CATEGORIES_STATE = 'dev.shugan.categories';

// Synthetic ids for the two automatic buckets (never stored in the event).
export const AUTO_CHAT_CATEGORY = 'shu-auto-chat';
export const AUTO_VOICE_CATEGORY = 'shu-auto-voice';

export type SpaceCategory = {
  id: string;
  name: string;
  rooms: string[];
};

export type SpaceCategoriesContent = {
  categories?: SpaceCategory[];
};

export const useSpaceCategories = (space: Room): SpaceCategory[] => {
  const event = useStateEvent(space, SPACE_CATEGORIES_STATE as StateEvent);

  return useMemo(() => {
    const content = event?.getContent<SpaceCategoriesContent>();
    const categories = Array.isArray(content?.categories) ? content?.categories ?? [] : [];
    return categories.filter(
      (c) =>
        c &&
        typeof c.id === 'string' &&
        typeof c.name === 'string' &&
        Array.isArray(c.rooms) &&
        c.rooms.every((r) => typeof r === 'string')
    );
  }, [event]);
};

export type SpaceCategoryActions = {
  /** Create a new category (generic unique name) containing the given room. */
  createWithRoom: (roomId: string) => Promise<void>;
  rename: (catId: string, name: string) => Promise<void>;
  /** Delete a category — its rooms fall back to the automatic buckets. */
  remove: (catId: string) => Promise<void>;
  /**
   * Move a room into a category (after `afterRoomId` if given, else at the
   * end). `catId` undefined removes the room from all categories, sending it
   * back to its automatic CHAT/VOICE bucket.
   */
  moveRoom: (roomId: string, catId: string | undefined, afterRoomId?: string) => Promise<void>;
};

export const useSpaceCategoryActions = (
  space: Room,
  categories: SpaceCategory[]
): SpaceCategoryActions => {
  const mx = useMatrixClient();

  const send = useCallback(
    async (next: SpaceCategory[]) => {
      await mx.sendStateEvent(
        space.roomId,
        SPACE_CATEGORIES_STATE as any,
        { categories: next },
        ''
      );
    },
    [mx, space.roomId]
  );

  const createWithRoom = useCallback(
    async (roomId: string) => {
      const base = 'New Category';
      let name = base;
      let n = 2;
      // eslint-disable-next-line no-loop-func
      while (categories.some((c) => c.name === name)) {
        name = `${base} ${n}`;
        n += 1;
      }
      const stripped = categories.map((c) => ({
        ...c,
        rooms: c.rooms.filter((r) => r !== roomId),
      }));
      await send([
        ...stripped,
        { id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name, rooms: [roomId] },
      ]);
    },
    [categories, send]
  );

  const rename = useCallback(
    async (catId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await send(categories.map((c) => (c.id === catId ? { ...c, name: trimmed } : c)));
    },
    [categories, send]
  );

  const remove = useCallback(
    async (catId: string) => {
      await send(categories.filter((c) => c.id !== catId));
    },
    [categories, send]
  );

  const moveRoom = useCallback(
    async (roomId: string, catId: string | undefined, afterRoomId?: string) => {
      const next = categories.map((c) => ({
        ...c,
        rooms: c.rooms.filter((r) => r !== roomId),
      }));
      if (catId) {
        const target = next.find((c) => c.id === catId);
        if (!target) return;
        const afterIndex = afterRoomId ? target.rooms.indexOf(afterRoomId) : -1;
        if (afterIndex >= 0) target.rooms.splice(afterIndex + 1, 0, roomId);
        else target.rooms.push(roomId);
      }
      await send(next);
    },
    [categories, send]
  );

  return useMemo(
    () => ({ createWithRoom, rename, remove, moveRoom }),
    [createWithRoom, rename, remove, moveRoom]
  );
};
