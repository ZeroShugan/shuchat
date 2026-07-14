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
      // Element Call's "Leave" only lets our call.member state EXPIRE (~30s),
      // so we keep showing as present. "End" blanks it immediately. Element Call
      // manages that state from inside its iframe (a separate session), so the
      // SDK leaveRoomSession() is a no-op for us. Instead, blank our own
      // call.member state event(s) directly — the same thing "End" does — so
      // leaving removes us from the voice room at once.
      const mx = embed.room.client;
      const room = embed.room;
      const blankMyMemberships = () => {
        try {
          const myId = mx.getUserId();
          const CALL_MEMBER = 'org.matrix.msc3401.call.member';
          const events = room.currentState.getStateEvents(CALL_MEMBER);
          events.forEach((ev) => {
            if (ev.getSender() !== myId) return; // only ever blank OUR own membership
            if (Object.keys(ev.getContent()).length === 0) return; // already empty
            mx.sendStateEvent(room.roomId, CALL_MEMBER as any, {}, ev.getStateKey() ?? '').catch(
              () => {}
            );
          });
        } catch (e) {
          // best-effort
        }
      };
      // Blank now, and again shortly after: Element Call's membership manager can
      // have an in-flight keep-alive that lands AFTER our first blank and revives
      // the membership (then it lingers until the ~30s expiry). The delayed
      // second pass catches that race.
      blankMyMemberships();
      setTimeout(blankMyMemberships, 1500);
      setTimeout(blankMyMemberships, 4000);
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
