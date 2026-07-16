import { useCallback, useEffect, useState } from 'react';
import { MatrixClient, MatrixEvent, Room, RoomEvent } from 'matrix-js-sdk';

/**
 * "Marked" messages — a per-room bookmark list the owner uses as a todo
 * marker. Stored in ROOM ACCOUNT DATA, which the homeserver syncs to every
 * logged-in device/client of the SAME user (browser + desktop app see the same
 * marks; other people never see them).
 */
export const MARKED_EVENTS_TYPE = 'dev.shugan.marked_events';

const readMarked = (room: Room): Set<string> => {
  try {
    const content = room.getAccountData(MARKED_EVENTS_TYPE)?.getContent();
    const ids = content?.event_ids;
    return new Set(Array.isArray(ids) ? ids.filter((i) => typeof i === 'string') : []);
  } catch {
    return new Set();
  }
};

export const useMarkedMessages = (room: Room): Set<string> => {
  const [marked, setMarked] = useState<Set<string>>(() => readMarked(room));

  useEffect(() => {
    setMarked(readMarked(room));
    const onAccountData = (event: MatrixEvent) => {
      if (event.getType() === MARKED_EVENTS_TYPE) setMarked(readMarked(room));
    };
    room.on(RoomEvent.AccountData, onAccountData);
    return () => {
      room.off(RoomEvent.AccountData, onAccountData);
    };
  }, [room]);

  return marked;
};

export const useToggleMarkedMessage = (mx: MatrixClient, room: Room) =>
  useCallback(
    async (eventId: string) => {
      const current = readMarked(room);
      if (current.has(eventId)) current.delete(eventId);
      else current.add(eventId);
      // Cap the list so account data stays small (oldest marks drop first).
      const ids = Array.from(current).slice(-500);
      await mx.setRoomAccountData(room.roomId, MARKED_EVENTS_TYPE, { event_ids: ids });
    },
    [mx, room]
  );
