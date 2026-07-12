import React, { useMemo } from 'react';
import { Box, Text } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useDirectRooms } from '../../pages/client/direct/useDirectRooms';
import { getMxIdLocalPart } from '../../utils/matrix';

/**
 * Discord-style profile extras: "Member since" (earliest join we can see in
 * shared rooms — clients can't read another server's account-creation date)
 * and mutual friends (your DM partners who share a room with this user).
 */
export function MutualInfo({ userId }: { userId: string }) {
  const mx = useMatrixClient();
  const directs = useDirectRooms();

  const { memberSince, count, names } = useMemo(() => {
    const myId = mx.getUserId();
    let earliest: number | undefined;
    const partners = new Set<string>();
    directs.forEach((rId) => {
      mx.getRoom(rId)
        ?.getMembers()
        .forEach((m) => {
          if (m.userId !== myId) partners.add(m.userId);
        });
    });
    partners.delete(userId);

    const friendIds = new Set<string>();
    mx.getRooms().forEach((room) => {
      const member = room.getMember(userId);
      if (!member || member.membership !== 'join') return;
      const ts = member.events.member?.getTs();
      if (ts && (!earliest || ts < earliest)) earliest = ts;
      room.getMembers().forEach((m) => {
        if (m.membership === 'join' && partners.has(m.userId)) friendIds.add(m.userId);
      });
    });

    const displayNames = Array.from(friendIds)
      .slice(0, 5)
      .map((id) => {
        let dn: string | undefined;
        mx.getRooms().some((r) => {
          const mem = r.getMember(id);
          if (mem?.rawDisplayName) {
            dn = mem.rawDisplayName;
            return true;
          }
          return false;
        });
        return dn ?? getMxIdLocalPart(id) ?? id;
      });

    return { memberSince: earliest, count: friendIds.size, names: displayNames };
  }, [mx, directs, userId]);

  return (
    <Box direction="Column" gap="100">
      {memberSince && (
        <Text size="T200" priority="300">
          Member since{' '}
          {new Date(memberSince).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}{' '}
          (first seen with you)
        </Text>
      )}
      {count > 0 && (
        <Text size="T200" priority="300" title={names.join(', ')}>
          {count} mutual friend{count === 1 ? '' : 's'} — {names.join(', ')}
          {count > names.length ? '…' : ''}
        </Text>
      )}
    </Box>
  );
}
