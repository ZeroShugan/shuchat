import React, { useCallback, useRef, useState } from 'react';
import { Box, Line } from 'folds';
import { useParams } from 'react-router-dom';
import { isKeyHotkey } from 'is-hotkey';
import { useAtomValue } from 'jotai';
import { RoomView } from './RoomView';
import { MembersDrawer } from './MembersDrawer';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { PowerLevelsContextProvider, usePowerLevels } from '../../hooks/usePowerLevels';
import { useRoom } from '../../hooks/useRoom';
import { useKeyDown } from '../../hooks/useKeyDown';
import { markAsRead } from '../../utils/notifications';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { CallView, CallPrescreen } from '../call/CallView';
import { CallingScreen } from '../call/CallingScreen';
import { CallControls } from '../call/CallControls';
import { useCallEmbed, useCallJoined, useCallEmbedPlacementSync } from '../../hooks/useCallEmbed';
import { useCallSession, useCallMembers } from '../../hooks/useCall';
import { RoomViewHeader } from './RoomViewHeader';
import { RoomSearchPanel } from './RoomSearchPanel';
import { UserProfilePanel } from './UserProfilePanel';
import { callChatAtom } from '../../state/callEmbed';
import { CallChatView } from './CallChatView';

export function Room() {
  const { eventId } = useParams();
  const room = useRoom();
  const mx = useMatrixClient();

  const [isDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const screenSize = useScreenSizeContext();
  const powerLevels = usePowerLevels(room);
  const members = useRoomMembers(mx, room.roomId);
  const chat = useAtomValue(callChatAtom);

  useKeyDown(
    window,
    useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          markAsRead(mx, room.roomId, hideActivity);
        }
      },
      [mx, room.roomId, hideActivity]
    )
  );

  const callView = room.isCallRoom();

  // Detect 2-person DM rooms to show profile panel
  const myUserId = mx.getSafeUserId();
  const isDM = !callView && room.getJoinedMemberCount() <= 2 && room.getJoinedMemberCount() > 0;
  const dmOtherUserId = isDM
    ? room.getJoinedMembers().find((m) => m.userId !== myUserId)?.userId
    : undefined;

  // Track active call session in this room (works for both call rooms and DM rooms)
  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const hasActiveCall = callMembers.length > 0;

  // Track whether the current user has joined the call in this room
  const callEmbed = useCallEmbed();
  const callJoined = useCallJoined(callEmbed);
  const myCallActive = callEmbed?.roomId === room.roomId;

  // DM call area: show when current user is in call, OR when others are (prescreen for receiver)
  const showDMCallArea = !callView && (myCallActive || hasActiveCall);

  // Ref for syncing the floating call embed position when user is in the call
  const dmCallContainerRef = useRef<HTMLDivElement>(null);
  useCallEmbedPlacementSync(dmCallContainerRef);

  // in-room search panel
  const [searchPanelTerm, setSearchPanelTerm] = useState<string | null>(null);
  const handleRoomSearch = useCallback((term: string) => {
    setSearchPanelTerm(term);
  }, []);
  const handleSearchPanelClose = useCallback(() => {
    setSearchPanelTerm(null);
  }, []);

  return (
    <PowerLevelsContextProvider value={powerLevels}>
      <Box grow="Yes">
        {/* Voice/call rooms: full CallView */}
        {callView && (screenSize === ScreenSize.Desktop || !chat) && (
          <Box grow="Yes" direction="Column">
            <RoomViewHeader callView onSearch={handleRoomSearch} searchPanelOpen={searchPanelTerm !== null} />
            <Box grow="Yes">
              <CallView />
            </Box>
          </Box>
        )}

        {/* Chat rooms (including DMs) */}
        {!callView && (
          <Box grow="Yes" direction="Column" style={{ minWidth: 0 }}>
            <RoomViewHeader onSearch={handleRoomSearch} searchPanelOpen={searchPanelTerm !== null} />

            {/* DM call area: top half when a call is active */}
            {showDMCallArea && (
              <Box
                direction="Column"
                style={{
                  height: '45%',
                  flexShrink: 0,
                  borderBottom: '2px solid rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                }}
              >
                {myCallActive && callMembers.length <= 1 ? (
                  // Caller waiting for the other person to answer
                  <CallingScreen
                    room={room}
                    onHangup={() => callEmbed?.hangup()}
                  />
                ) : myCallActive && callMembers.length > 1 ? (
                  // Both parties connected — show the embed
                  <>
                    <Box grow="Yes" ref={dmCallContainerRef} />
                    {callEmbed && callJoined && <CallControls callEmbed={callEmbed} />}
                  </>
                ) : (
                  // Receiver: someone else started a call — show prescreen to join
                  <CallPrescreen />
                )}
              </Box>
            )}

            {/* Chat always visible below the call area */}
            <Box grow="Yes" style={{ overflow: 'hidden' }}>
              <RoomView eventId={eventId} />
            </Box>
          </Box>
        )}

        {callView && chat && (
          <>
            {screenSize === ScreenSize.Desktop && (
              <Line variant="Background" direction="Vertical" size="300" />
            )}
            <CallChatView />
          </>
        )}
        {!callView && searchPanelTerm !== null && (
          <>
            <Line variant="Background" direction="Vertical" size="300" />
            <RoomSearchPanel
              key={room.roomId}
              roomId={room.roomId}
              initialTerm={searchPanelTerm}
              onClose={handleSearchPanelClose}
            />
          </>
        )}
        {!callView && screenSize === ScreenSize.Desktop && searchPanelTerm === null && (
          dmOtherUserId ? (
            <>
              <Line variant="Background" direction="Vertical" size="300" />
              <UserProfilePanel key={dmOtherUserId} userId={dmOtherUserId} roomId={room.roomId} />
            </>
          ) : isDrawer ? (
            <>
              <Line variant="Background" direction="Vertical" size="300" />
              <MembersDrawer key={room.roomId} room={room} members={members} />
            </>
          ) : null
        )}
      </Box>
    </PowerLevelsContextProvider>
  );
}
