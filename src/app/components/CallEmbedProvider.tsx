import React, { ReactNode, useCallback, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { config } from 'folds';
import {
  CallEmbedContextProvider,
  CallEmbedRefContextProvider,
  useCallHangupEvent,
  useCallJoined,
  useCallThemeSync,
  useCallMemberSoundSync,
} from '../hooks/useCallEmbed';
import { callChatAtom, callEmbedAtom } from '../state/callEmbed';
import { CallEmbed } from '../plugins/call';
import { useSelectedRoom } from '../hooks/router/useSelectedRoom';
import { usePushToTalk } from '../hooks/usePushToTalk';
import { ScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';

function CallUtils({ embed }: { embed: CallEmbed }) {
  const setCallEmbed = useSetAtom(callEmbedAtom);

  useCallMemberSoundSync(embed);
  useCallThemeSync(embed);
  useCallHangupEvent(
    embed,
    useCallback(() => {
      // Element Call signals hangup, then asynchronously removes our call.member
      // state (leaves the MatrixRTC session). Disposing the iframe immediately
      // could cut that request off, leaving us shown as still in the voice room
      // until the delayed-event/next sync cleans it up. Also force a session
      // leave from the SDK side as a safety net, then dispose after a short grace.
      try {
        embed.room.client.matrixRTC.getRoomSession(embed.room).leaveRoomSession();
      } catch (e) {
        // best-effort — Element Call still owns the primary leave
      }
      setTimeout(() => setCallEmbed(undefined), 600);
    }, [setCallEmbed, embed])
  );

  return null;
}

type CallEmbedProviderProps = {
  children?: ReactNode;
};
export function CallEmbedProvider({ children }: CallEmbedProviderProps) {
  const callEmbed = useAtomValue(callEmbedAtom);
  const callEmbedRef = useRef<HTMLDivElement>(null);
  const joined = useCallJoined(callEmbed);
  usePushToTalk(callEmbed, joined);

  const selectedRoom = useSelectedRoom();
  const chat = useAtomValue(callChatAtom);
  const screenSize = useScreenSizeContext();

  const chatOnlyView = chat && screenSize !== ScreenSize.Desktop;

  const callVisible = callEmbed && selectedRoom === callEmbed.roomId && joined && !chatOnlyView;

  return (
    <CallEmbedContextProvider value={callEmbed}>
      {callEmbed && <CallUtils embed={callEmbed} />}
      <CallEmbedRefContextProvider value={callEmbedRef}>{children}</CallEmbedRefContextProvider>
      <div
        data-call-embed-container
        style={{
          visibility: callVisible ? undefined : 'hidden',
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '1px',
          height: '1px',
        }}
        ref={callEmbedRef}
      />
    </CallEmbedContextProvider>
  );
}
