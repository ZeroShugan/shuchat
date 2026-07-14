import { createContext, RefObject, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { MatrixClient, Room, KnownMembership } from 'matrix-js-sdk';
import { useSetAtom } from 'jotai';
import {
  CallEmbed,
  ElementCallThemeKind,
  ElementWidgetActions,
  useClientWidgetApiEvent,
} from '../plugins/call';
import { useMatrixClient } from './useMatrixClient';
import { ThemeKind, useTheme } from './useTheme';
import { callEmbedAtom } from '../state/callEmbed';
import { useResizeObserver } from './useResizeObserver';
import { CallControlState } from '../plugins/call/CallControlState';
import { useCallMembersChange, useCallSession } from './useCall';
import { CallPreferences } from '../state/callPreferences';

const CallEmbedContext = createContext<CallEmbed | undefined>(undefined);

export const CallEmbedContextProvider = CallEmbedContext.Provider;

export const useCallEmbed = (): CallEmbed | undefined => {
  const callEmbed = useContext(CallEmbedContext);

  return callEmbed;
};

const CallEmbedRefContext = createContext<RefObject<HTMLDivElement> | undefined>(undefined);
export const CallEmbedRefContextProvider = CallEmbedRefContext.Provider;
export const useCallEmbedRef = (): RefObject<HTMLDivElement> => {
  const ref = useContext(CallEmbedRefContext);
  if (!ref) {
    throw new Error('CallEmbedRef is not provided!');
  }
  return ref;
};

export const createCallEmbed = (
  mx: MatrixClient,
  room: Room,
  dm: boolean,
  themeKind: ElementCallThemeKind,
  container: HTMLElement,
  pref?: CallPreferences
): CallEmbed => {
  const rtcSession = mx.matrixRTC.getRoomSession(room);
  const ongoing =
    MatrixRTCSession.sessionMembershipsForRoom(room, rtcSession.sessionDescription).length > 0;

  const intent = CallEmbed.getIntent(dm, ongoing);
  const widget = CallEmbed.getWidget(mx, room, intent, themeKind);
  const controlState = pref && new CallControlState(pref.microphone, pref.video, pref.sound);

  const embed = new CallEmbed(mx, room, widget, container, controlState);

  return embed;
};

export const useCallStart = (dm = false) => {
  const mx = useMatrixClient();
  const theme = useTheme();
  const setCallEmbed = useSetAtom(callEmbedAtom);
  const callEmbedRef = useCallEmbedRef();

  const startCall = useCallback(
    (room: Room, pref?: CallPreferences) => {
      const container = callEmbedRef.current;
      if (!container) {
        throw new Error('Failed to start call, No embed container element found!');
      }
      // Privacy rule: joining a call NEVER starts with the camera on, even if a
      // previous call left the persisted preference at video:true. The camera is
      // an explicit in-call action (the video toggle), which flips the pref and
      // lets the media-shim allow acquisition.
      const joinPref = pref ? { ...pref, video: false } : pref;
      const callEmbed = createCallEmbed(mx, room, dm, theme.kind, container, joinPref);

      setCallEmbed(callEmbed);

      // For DM calls, send m.call.notify (MSC4075) so the other party rings.
      if (dm) {
        const myUserId = mx.getSafeUserId();
        const otherMembers = room
          .getMembers()
          .filter(
            (m) =>
              m.userId !== myUserId &&
              m.membership === KnownMembership.Join
          )
          .map((m) => m.userId);

        if (otherMembers.length > 0) {
          mx.sendEvent(room.roomId, 'm.call.notify' as any, {
            call_id: '',
            application: 'm.call',
            'm.mentions': { user_ids: otherMembers, room: false },
            notify_type: 'ring',
          }).catch((e: unknown) => {
            console.warn('Failed to send call notify:', e);
          });
        }
      }
    },
    [mx, dm, theme, setCallEmbed, callEmbedRef]
  );

  return startCall;
};

export const useCallJoined = (embed?: CallEmbed): boolean => {
  const [joined, setJoined] = useState(embed?.joined ?? false);

  useClientWidgetApiEvent(
    embed?.call,
    ElementWidgetActions.JoinCall,
    useCallback(() => {
      setJoined(true);
    }, [])
  );

  useEffect(() => {
    if (!embed) {
      setJoined(false);
    }
  }, [embed]);

  return joined;
};

export const useCallHangupEvent = (embed: CallEmbed, callback: () => void) => {
  useClientWidgetApiEvent(embed.call, ElementWidgetActions.HangupCall, callback);
};

export const useCallMemberSoundSync = (embed: CallEmbed) => {
  const callSession = useCallSession(embed.room);
  useCallMembersChange(
    callSession,
    useCallback(() => embed.control.applySound(), [embed])
  );
};

export const useCallThemeSync = (embed: CallEmbed) => {
  const theme = useTheme();

  useEffect(() => {
    const name: ElementCallThemeKind = theme.kind === ThemeKind.Dark ? 'dark' : 'light';

    embed.setTheme(name).catch(() => {
      // Element Call may not respond to theme changes - ignore timeout
    });
  }, [theme.kind, embed]);
};

export const useCallEmbedPlacementSync = (containerViewRef: RefObject<HTMLDivElement>): void => {
  const callEmbedRef = useCallEmbedRef();

  const syncCallEmbedPlacement = useCallback(() => {
    const embedEl = callEmbedRef.current;
    const container = containerViewRef.current;
    if (!embedEl || !container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    embedEl.style.top = `${rect.top}px`;
    embedEl.style.left = `${rect.left}px`;
    embedEl.style.width = `${rect.width}px`;
    embedEl.style.height = `${rect.height}px`;
  }, [callEmbedRef, containerViewRef]);

  // Sync immediately on every render (catches container appearing/changing)
  useLayoutEffect(() => {
    syncCallEmbedPlacement();
  });

  // Sync on container resize
  useResizeObserver(
    syncCallEmbedPlacement,
    useCallback(() => containerViewRef.current, [containerViewRef])
  );

  // Sync on window resize (for sidebar toggles etc)
  useEffect(() => {
    window.addEventListener('resize', syncCallEmbedPlacement);
    return () => window.removeEventListener('resize', syncCallEmbedPlacement);
  }, [syncCallEmbedPlacement]);
};
