import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, Box, Button, Icon, Icons, Text } from 'folds';
import { MatrixEvent, RoomEvent } from 'matrix-js-sdk';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import InviteSound from '../../../public/sound/invite.ogg';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '../utils/matrix';
import { getDirectRoomPath } from '../pages/pathUtils';
import { useNavigate } from 'react-router-dom';
import { useMediaAuthentication } from '../hooks/useMediaAuthentication';
import { UserAvatar } from './user-avatar';
import { useCallEmbed, useCallStart } from '../hooks/useCallEmbed';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { useCallPreferences } from '../state/hooks/callPreferences';

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
  const startCall = useCallStart(true); // true = DM call
  const { microphone, video, sound } = useCallPreferences();
  const [notificationVolume] = useSetting(settingsAtom, 'notificationVolume');
  const callEmbed = useCallEmbed();

  const stopRing = useCallback(() => {
    const el = audioRef.current;
    if (el) { el.pause(); el.currentTime = 0; }
  }, []);

  // Decline: send a signal event so caller knows, then dismiss
  const decline = useCallback(() => {
    if (!incoming) return;
    stopRing();
    // Send decline signal to the room
    mx.sendEvent(incoming.roomId, 'dev.shugan.call.decline' as any, {
      caller_id: incoming.callerId,
    }).catch(() => {});
    setIncoming(null);
  }, [incoming, mx, stopRing]);

  const dismiss = useCallback(() => {
    stopRing();
    setIncoming(null);
  }, [stopRing]);

  // Answer: navigate to the DM room AND immediately join the call
  const answer = useCallback(() => {
    if (!incoming) return;
    stopRing();
    const room = mx.getRoom(incoming.roomId);
    setIncoming(null);
    navigate(getDirectRoomPath(incoming.roomId));
    if (room) {
      // Small delay to let navigation settle before starting the embed
      setTimeout(() => {
        startCall(room, { microphone, video, sound });
      }, 150);
    }
  }, [incoming, navigate, stopRing, mx, startCall, microphone, video, sound]);

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
      if (audioRef.current) { audioRef.current.volume = notificationVolume ?? 0.5; audioRef.current.play().catch(() => {}); }
    };

    mx.on(RoomEvent.Timeline, handleEvent);
    return () => {
      mx.off(RoomEvent.Timeline, handleEvent);
      stopRing();
    };
  }, [mx, useAuthentication, stopRing]);

  // Fallback: detect incoming calls via MatrixRTC session start in DM rooms
  // This fires even without m.call.notify — it watches for call.member state events
  useEffect(() => {
    const myUserId = mx.getSafeUserId();

    const handleSessionStarted = (_roomId: string) => {
      // Only trigger for DM rooms where someone else started the call
      const room = mx.getRoom(_roomId);
      if (!room) return;
      // Check if it's a DM (has exactly 2 joined members including us)
      const members = room.getMembers().filter(
        (m) => m.membership === 'join'
      );
      const isDM = members.length <= 2 && members.some((m) => m.userId === myUserId);
      if (!isDM) return;
      // Check if WE are the caller (we already have an active embed for this room)
      // We only ring if someone ELSE started the call
      const rtcSession = mx.matrixRTC.getRoomSession(room);
      const callMembers = MatrixRTCSession.sessionMembershipsForRoom(
        room,
        rtcSession.sessionDescription
      );
      const someoneElseCalling = callMembers.some(
        (cm) => cm.sender !== myUserId
      );
      if (!someoneElseCalling) return;
      // Don't ring if WE are already in this call — session membership updates
      // after joining re-fire this handler, which used to restart the ring
      // while the user was mid-call.
      if (callMembers.some((cm) => cm.sender === myUserId)) return;
      // Don't ring if we already have an incoming notification or are already in this call
      if (incoming?.roomId === _roomId) return;

      const caller = callMembers.find((cm) => cm.sender !== myUserId);
      const callerId = caller?.sender ?? '';
      const callerMember = room.getMember(callerId);
      const callerName =
        callerMember?.rawDisplayName ?? getMxIdLocalPart(callerId) ?? callerId;
      const callerAvatarMxc = callerMember?.getMxcAvatarUrl() ?? undefined;
      const callerAvatar = callerAvatarMxc
        ? mxcUrlToHttp(mx, callerAvatarMxc, useAuthentication, 96, 96) ?? undefined
        : undefined;

      setIncoming({ roomId: _roomId, callerId, callerName, callerAvatar });
      if (audioRef.current) { audioRef.current.volume = notificationVolume ?? 0.5; audioRef.current.play().catch(() => {}); }
    };

    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, handleSessionStarted);
    return () => {
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, handleSessionStarted);
    };
  }, [mx, useAuthentication, incoming]);

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (!incoming) return;
    const timeout = setTimeout(dismiss, 30000);
    return () => clearTimeout(timeout);
  }, [incoming, dismiss]);

  // Belt-and-braces: whenever a call embed is active, the ring must be silent —
  // covers joining via ANY path (room join button, nav click) rather than the
  // popup's Answer button.
  useEffect(() => {
    if (callEmbed) {
      stopRing();
      if (incoming && callEmbed.roomId === incoming.roomId) setIncoming(null);
    }
  }, [callEmbed, incoming, stopRing]);

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
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            direction="Column"
            alignItems="Center"
            gap="500"
            style={{
              background: 'var(--mx-surface-bg, #1e1f22)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '1rem',
              boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
              padding: '2.5rem 3rem',
              minWidth: '18rem',
            }}
          >
            <Avatar size="600" radii="Pill">
              <UserAvatar
                userId={incoming.callerId}
                src={incoming.callerAvatar}
                alt={incoming.callerName}
                renderFallback={() => <Icon size="400" src={Icons.User} filled />}
              />
            </Avatar>
            <Box direction="Column" alignItems="Center" gap="100">
              <Text size="H4">{incoming.callerName}</Text>
              <Box alignItems="Center" gap="200">
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: '#3ba55d', display: 'inline-block',
                  animation: 'pulse 1.4s ease-in-out infinite',
                }} />
                <Text size="T300" style={{ opacity: 0.7 }}>Incoming voice call</Text>
              </Box>
            </Box>
            <Box gap="400">
              <Button
                variant="Critical"
                fill="Solid"
                size="500"
                radii="Pill"
                onClick={decline}
                before={<Icon src={Icons.PhoneDown} size="200" filled />}
              >
                <Text size="B400">Decline</Text>
              </Button>
              <Button
                variant="Success"
                fill="Solid"
                size="500"
                radii="Pill"
                onClick={answer}
                before={<Icon src={Icons.Phone} size="200" filled />}
              >
                <Text size="B400">Answer</Text>
              </Button>
            </Box>
          </Box>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.4; transform: scale(0.85); }
            }
          `}</style>
        </Box>
      )}
    </>
  );
}
