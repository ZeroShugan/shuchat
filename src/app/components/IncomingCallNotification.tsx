import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, Box, Button, Icon, Icons, Text } from 'folds';
import { MatrixEvent, RoomEvent } from 'matrix-js-sdk';
import InviteSound from '../../../public/sound/invite.ogg';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '../utils/matrix';
import { getDirectRoomPath } from '../pages/pathUtils';
import { useNavigate } from 'react-router-dom';
import { useMediaAuthentication } from '../hooks/useMediaAuthentication';
import { UserAvatar } from './user-avatar';

type IncomingCall = {
  roomId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
};

export function IncomingCallNotification() {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const useAuthentication = useMediaAuthentication();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const stopRing = useCallback(() => {
    const el = audioRef.current;
    if (el) { el.pause(); el.currentTime = 0; }
  }, []);

  const dismiss = useCallback(() => {
    stopRing();
    setIncoming(null);
  }, [stopRing]);

  // Answer: navigate to the DM room.
  // Room.tsx will detect the active call via Matrix RTC state events and show
  // CallPrescreen with a "Join" button — this ensures the receiver joins the
  // *existing* session (JoinExistingDM intent) rather than starting a new call.
  const answer = useCallback(() => {
    if (!incoming) return;
    stopRing();
    setIncoming(null);
    navigate(getDirectRoomPath(incoming.roomId));
  }, [incoming, navigate, stopRing]);

  useEffect(() => {
    const myUserId = mx.getSafeUserId();

    const handleEvent = (event: MatrixEvent) => {
      if (event.getType() !== 'm.call.notify') return;
      if (event.getSender() === myUserId) return; // ignore own events

      const content = event.getContent();
      if (content.notify_type !== 'ring') return;

      const mentions: string[] = content['m.mentions']?.user_ids ?? [];
      if (!mentions.includes(myUserId)) return;

      const roomId = event.getRoomId();
      if (!roomId) return;

      const callerId = event.getSender() ?? '';
      const matrixRoom = mx.getRoom(roomId);
      const callerMember = matrixRoom?.getMember(callerId);
      const callerName =
        callerMember?.rawDisplayName ?? getMxIdLocalPart(callerId) ?? callerId;
      const callerAvatarMxc = callerMember?.getMxcAvatarUrl() ?? undefined;
      const callerAvatar = callerAvatarMxc
        ? mxcUrlToHttp(mx, callerAvatarMxc, useAuthentication, 96, 96) ?? undefined
        : undefined;

      setIncoming({ roomId, callerId, callerName, callerAvatar });
      audioRef.current?.play().catch(() => {});
    };

    mx.on(RoomEvent.Timeline, handleEvent);
    return () => {
      mx.off(RoomEvent.Timeline, handleEvent);
      stopRing();
    };
  }, [mx, useAuthentication, stopRing]);

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (!incoming) return;
    const timeout = setTimeout(dismiss, 30000);
    return () => clearTimeout(timeout);
  }, [incoming, dismiss]);

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} loop style={{ display: 'none' }}>
        <source src={InviteSound} type="audio/ogg" />
      </audio>

      {incoming && (
        <Box
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 9999,
            width: '22rem',
            background: 'var(--mx-surface-bg, #1e1f22)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '0.75rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
            padding: '1rem',
          }}
          direction="Column"
          gap="400"
        >
          <Box gap="400" alignItems="Center">
            <Avatar size="400" radii="400">
              <UserAvatar
                userId={incoming.callerId}
                src={incoming.callerAvatar}
                alt={incoming.callerName}
                renderFallback={() => <Icon size="200" src={Icons.User} filled />}
              />
            </Avatar>
            <Box direction="Column" grow="Yes">
              <Text size="B400" truncate>{incoming.callerName}</Text>
              <Text size="T300" style={{ opacity: 0.6 }}>Incoming call...</Text>
            </Box>
            <Icon size="300" src={Icons.Phone} filled />
          </Box>
          <Box gap="300">
            <Button
              grow="Yes"
              variant="Critical"
              fill="Soft"
              size="400"
              radii="400"
              onClick={dismiss}
            >
              <Text size="B300">Decline</Text>
            </Button>
            <Button
              grow="Yes"
              variant="Success"
              fill="Solid"
              size="400"
              radii="400"
              onClick={answer}
              before={<Icon size="100" src={Icons.Phone} filled />}
            >
              <Text size="B300">Answer</Text>
            </Button>
          </Box>
        </Box>
      )}
    </>
  );
}
