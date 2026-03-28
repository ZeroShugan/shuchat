import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MatrixEvent, RoomEvent } from 'matrix-js-sdk';
import { Avatar, Box, Button, Icon, Icons, Text } from 'folds';
import { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { UserAvatar } from '../../components/user-avatar';
import { useUserVerificationStatus } from '../../hooks/useUserVerificationStatus';

const RING_TIMEOUT_MS = 45000;

type CallingScreenProps = {
  room: Room;
  onHangup: () => void;
};

export function CallingScreen({ room, onHangup }: CallingScreenProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [declined, setDeclined] = useState(false);
  const otherUserId = otherMember?.userId;
  const verifStatus = useUserVerificationStatus(otherUserId);

  // Get the other person in the DM
  const myUserId = mx.getSafeUserId();
  const otherMember = room.getMembers().find((m) => m.userId !== myUserId);
  const otherName = otherMember
    ? (getMemberDisplayName(room, otherMember.userId) ?? getMxIdLocalPart(otherMember.userId) ?? otherMember.userId)
    : 'Unknown';
  const avatarMxc = otherMember ? getMemberAvatarMxc(room, otherMember.userId) : undefined;
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 128, 128) ?? undefined
    : undefined;

  // Auto-cancel after 45 seconds
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onHangup();
    }, RING_TIMEOUT_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onHangup]);

  // Listen for decline signal from receiver
  useEffect(() => {
    const myUserId = mx.getSafeUserId();
    const handleEvent = (event: MatrixEvent) => {
      if (event.getType() !== 'dev.shugan.call.decline') return;
      if (event.getSender() === myUserId) return;
      const content = event.getContent();
      if (content.caller_id !== myUserId) return;
      if (event.getRoomId() !== room.roomId) return;
      setDeclined(true);
      setTimeout(() => onHangup(), 1500);
    };
    mx.on(RoomEvent.Timeline, handleEvent);
    return () => { mx.off(RoomEvent.Timeline, handleEvent); };
  }, [mx, room.roomId, onHangup]);

  return (
    <Box
      direction="Column"
      alignItems="Center"
      justifyContent="Center"
      gap="400"
      style={{
        height: '100%',
        background: 'linear-gradient(180deg, rgba(59,165,93,0.12) 0%, transparent 100%)',
      }}
    >
      <Box direction="Column" alignItems="Center" gap="300">
        <Avatar size="600" radii="Pill">
          <UserAvatar
            userId={otherMember?.userId ?? ''}
            src={avatarUrl}
            alt={otherName}
            renderFallback={() => <Icon size="400" src={Icons.User} filled />}
          />
        </Avatar>
        <Box direction="Column" alignItems="Center" gap="100">
          <Box alignItems="Center" gap="200">
            <Text size="H4">{otherName}</Text>
            {verifStatus?.isVerified() && (
              <span title="Verified user" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <Icon src={Icons.ShieldUser} size="200" style={{ color: '#3ba55d' }} />
              </span>
            )}
          </Box>
          <Box alignItems="Center" gap="200">
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: '#3ba55d', display: 'inline-block',
              animation: 'pulse 1.4s ease-in-out infinite',
            }} />
            <Text size="T300" style={{ opacity: 0.7 }}>
            {declined ? 'Call declined' : 'Calling...'}
          </Text>
          </Box>
        </Box>
      </Box>
      <Button
        variant="Critical"
        fill="Solid"
        radii="Pill"
        onClick={onHangup}
        before={<Icon src={Icons.PhoneDown} size="200" />}
      >
        <Text size="B400">Cancel</Text>
      </Button>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </Box>
  );
}
