import React, { useMemo } from 'react';
import { Box, Text } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';

// NOTE: "Mutual friends" was intentionally removed. Matrix cannot expose another
// user's DM/friend list to you (it's private account-data on their side), so the
// only computable heuristic — "people I DM who happen to share a room with this
// user" — produced false positives (e.g. someone flagged as a mutual friend just
// because they're both in a big public room). Better to show nothing than to
// imply relationships that don't exist. Mutual *rooms* is the accurate analog.
//
// "Member since" is a best-effort approximation: Matrix also does not expose
// account-creation dates of other users, so we show the earliest join we can see
// in rooms you share — clearly labelled "first seen with you".
export function MutualInfo({ userId }: { userId: string }) {
  const mx = useMatrixClient();

  const memberSince = useMemo(() => {
    let earliest: number | undefined;
    mx.getRooms().forEach((room) => {
      const member = room.getMember(userId);
      if (!member || member.membership !== 'join') return;
      const ts = member.events.member?.getTs();
      if (ts && (!earliest || ts < earliest)) earliest = ts;
    });
    return earliest;
  }, [mx, userId]);

  if (!memberSince) return null;

  return (
    <Box direction="Column" gap="100">
      <Text size="T200" priority="300">
        Member since{' '}
        {new Date(memberSince).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}{' '}
        (first seen with you)
      </Text>
    </Box>
  );
}
