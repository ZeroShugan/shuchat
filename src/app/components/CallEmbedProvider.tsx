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
import { CallEmbed, blankOwnCallMemberships } from '../plugins/call';
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
      // Element Call emitted HangupCall (its own leave/end, or an echo of the
      // hangup we sent). Blank our own call.member state immediately + with
      // retries so our name leaves the room at once instead of expiring (~30s),
      // then tear the embed down. Retries beat any in-flight EC keep-alive.
      blankOwnCallMemberships(embed);
      setTimeout(() => blankOwnCallMemberships(embed), 1500);
      setTimeout(() => blankOwnCallMemberships(embed), 4000);
      setCallEmbed(undefined);
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
