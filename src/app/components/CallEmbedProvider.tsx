import React, { ReactNode, useCallback, useEffect, useRef } from 'react';
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
import { CallGridOverlay } from './call-grid/CallGridOverlay';
import { useSelectedRoom } from '../hooks/router/useSelectedRoom';
import { usePushToTalk } from '../hooks/usePushToTalk';
import { ScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';

function CallUtils({ embed }: { embed: CallEmbed }) {
  const setCallEmbed = useSetAtom(callEmbedAtom);

  // Desktop multi-select share picker: after granting the FIRST source to the
  // primary getDisplayMedia request, the Electron shell queues the remaining
  // selected sources and fires this event — start one extra share per queued
  // source (each __shuShareAnother → getDisplayMedia is answered instantly
  // from the queue, no picker shown).
  useEffect(() => {
    const startExtras = async (evt: Event) => {
      const count = (evt as CustomEvent<{ count?: number }>).detail?.count ?? 0;
      const win = embed.iframe.contentWindow as
        | (Window & { __shuShareAnother?: () => Promise<boolean> })
        | null;
      if (!win?.__shuShareAnother) return;
      for (let i = 0; i < count; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await win.__shuShareAnother().catch(() => {});
      }
    };
    window.addEventListener('shuchat-extra-shares', startExtras);
    return () => window.removeEventListener('shuchat-extra-shares', startExtras);
  }, [embed]);

  // Grid tile "Stop this stream" on the PRIMARY (EC-managed) share: the shim
  // can't stop it itself — click EC's button without touching extra streams.
  useEffect(() => {
    const win = embed.iframe.contentWindow;
    if (!win) return undefined;
    const stopPrimary = () => embed.control.stopPrimaryScreenshareOnly();
    win.addEventListener('shu-stop-primary-share', stopPrimary);
    return () => {
      try {
        win.removeEventListener('shu-stop-primary-share', stopPrimary);
      } catch {
        /* iframe gone */
      }
    };
  }, [embed]);

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
      >
        {/* ShuChat's own stream grid, painted over the EC iframe (which stays
            underneath as the audio/RTC engine). React only manages this child;
            the imperatively-appended iframe sibling is left alone. */}
        {callEmbed && <CallGridOverlay callEmbed={callEmbed} />}
      </div>
    </CallEmbedContextProvider>
  );
}
