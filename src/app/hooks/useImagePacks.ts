import { Room } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import { useCallback, useMemo, useState } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { StateEvent } from '../../types/matrix/room';
import {
  getGlobalImagePacks,
  getRoomImagePack,
  getRoomImagePacks,
  getUserImagePack,
  ImagePack,
  ImageUsage,
} from '../plugins/custom-emoji';
import { useMatrixClient } from './useMatrixClient';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { RoomToParents } from '../../types/matrix/room';

import { useAccountDataCallback } from './useAccountDataCallback';
import { useStateEventCallback } from './useStateEventCallback';

export const useUserImagePack = (): ImagePack | undefined => {
  const mx = useMatrixClient();
  const [userPack, setUserPack] = useState(() => getUserImagePack(mx));

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.PoniesUserEmotes) {
          setUserPack(getUserImagePack(mx));
        }
      },
      [mx]
    )
  );

  return userPack;
};

export const useGlobalImagePacks = (): ImagePack[] => {
  const mx = useMatrixClient();
  const [globalPacks, setGlobalPacks] = useState(() => getGlobalImagePacks(mx));

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.PoniesEmoteRooms) {
          setGlobalPacks(getGlobalImagePacks(mx));
        }
      },
      [mx]
    )
  );

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        const eventType = mEvent.getType();
        const roomId = mEvent.getRoomId();
        const stateKey = mEvent.getStateKey();
        if (eventType === StateEvent.PoniesRoomEmotes && roomId && typeof stateKey === 'string') {
          const global = !!globalPacks.find(
            (pack) =>
              pack.address && pack.address.roomId === roomId && pack.address.stateKey === stateKey
          );
          if (global) {
            setGlobalPacks(getGlobalImagePacks(mx));
          }
        }
      },
      [mx, globalPacks]
    )
  );

  return globalPacks;
};

export const useRoomImagePack = (room: Room, stateKey: string): ImagePack | undefined => {
  const mx = useMatrixClient();
  const [roomPack, setRoomPack] = useState(() => getRoomImagePack(room, stateKey));

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          mEvent.getRoomId() === room.roomId &&
          mEvent.getType() === StateEvent.PoniesRoomEmotes &&
          mEvent.getStateKey() === stateKey
        ) {
          setRoomPack(getRoomImagePack(room, stateKey));
        }
      },
      [room, stateKey]
    )
  );

  return roomPack;
};

export const useRoomImagePacks = (room: Room): ImagePack[] => {
  const mx = useMatrixClient();
  const [roomPacks, setRoomPacks] = useState(() => getRoomImagePacks(room));

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          mEvent.getRoomId() === room.roomId &&
          mEvent.getType() === StateEvent.PoniesRoomEmotes
        ) {
          setRoomPacks(getRoomImagePacks(room));
        }
      },
      [room]
    )
  );

  return roomPacks;
};

export const useRoomsImagePacks = (rooms: Room[]) => {
  const mx = useMatrixClient();
  const [roomPacks, setRoomPacks] = useState(() => rooms.flatMap(getRoomImagePacks));

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          rooms.find((room) => room.roomId === mEvent.getRoomId()) &&
          mEvent.getType() === StateEvent.PoniesRoomEmotes
        ) {
          setRoomPacks(rooms.flatMap(getRoomImagePacks));
        }
      },
      [rooms]
    )
  );

  return roomPacks;
};


/**
 * Returns all ImagePacks found in rooms that belong to spaces the user has joined.
 * This is the Discord-style "space emoji" experience: joining a space automatically
 * makes that space's emoji packs available in the EmojiBoard without any manual linking.
 *
 * Implementation:
 * - roomToParentsAtom maps roomId → Set<parentSpaceIds> for every room with a space parent
 * - We scan all rooms in that map; if the user is a member and the room has emoji packs, include them
 * - Deduplication by pack.id prevents the same pack appearing twice
 */
function getSpaceImagePacksFromMap(mx: ReturnType<typeof useMatrixClient>, roomToParents: RoomToParents): ImagePack[] {
  const packsById = new Map<string, ImagePack>();
  roomToParents.forEach((_parents, roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== 'join') return;
    getRoomImagePacks(room).forEach((pack) => {
      if (!packsById.has(pack.id)) packsById.set(pack.id, pack);
    });
  });
  return Array.from(packsById.values());
}

export const useSpaceImagePacks = (): ImagePack[] => {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const [spacePacks, setSpacePacks] = useState(() => getSpaceImagePacksFromMap(mx, roomToParents));

  // Re-compute when any room emote pack state event fires
  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === StateEvent.PoniesRoomEmotes) {
          setSpacePacks(getSpaceImagePacksFromMap(mx, roomToParents));
        }
      },
      [mx, roomToParents]
    )
  );

  // Also re-compute when space membership changes (roomToParents changes)
  // We do this via useMemo — the atom change triggers a re-render anyway
  const derived = useMemo(
    () => getSpaceImagePacksFromMap(mx, roomToParents),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mx, roomToParents]
  );

  return derived;
};

export const useRelevantImagePacks = (usage: ImageUsage, rooms: Room[]): ImagePack[] => {
  const userPack = useUserImagePack();
  const globalPacks = useGlobalImagePacks();
  const spacePacks = useSpaceImagePacks();
  const roomsPacks = useRoomsImagePacks(rooms);

  const relevantPacks = useMemo(() => {
    const seenIds = new Set<string>();
    const result: ImagePack[] = [];
    const add = (pack: ImagePack) => {
      if (!seenIds.has(pack.id)) { seenIds.add(pack.id); result.push(pack); }
    };
    // Layer 1: Personal pack (always first)
    if (userPack) add(userPack);
    // Layer 2: Space packs (auto-discovered from spaces you're in)
    spacePacks.forEach(add);
    // Layer 3: Manually linked global packs
    globalPacks.forEach(add);
    // Layer 4: Current room packs
    roomsPacks.forEach(add);
    return result.filter((pack) => pack.getImages(usage).length > 0);
  }, [userPack, spacePacks, globalPacks, roomsPacks, usage]);

  return relevantPacks;
};
