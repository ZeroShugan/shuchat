import { useAtomValue } from 'jotai';
import React, { ReactNode, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoomEvent, RoomEventHandlerMap, ClientEvent, SetPresence, UserEvent } from 'matrix-js-sdk';
import { AllDevicesIsolationMode, OnlySignedDevicesIsolationMode } from 'matrix-js-sdk/lib/crypto-api';
import { roomToUnreadAtom, unreadEqual, unreadInfoToUnread } from '../../state/room/roomToUnread';
import LogoSVG from '../../../../public/res/svg/cinny.svg';
import LogoUnreadSVG from '../../../../public/res/svg/cinny-unread.svg';
import LogoHighlightSVG from '../../../../public/res/svg/cinny-highlight.svg';
import NotificationSound from '../../../../public/sound/notification.ogg';
import InviteSound from '../../../../public/sound/invite.ogg';
import { notificationPermission, setFavicon } from '../../utils/dom';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { allInvitesAtom } from '../../state/room-list/inviteList';
import { usePreviousValue } from '../../hooks/usePreviousValue';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { getInboxInvitesPath, getInboxNotificationsPath } from '../pathUtils';
import {
  getMemberDisplayName,
  getNotificationType,
  getUnreadInfo,
  isNotificationEvent,
} from '../../utils/room';
import { NotificationType, UnreadInfo } from '../../../types/matrix/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { useInboxNotificationsSelected } from '../../hooks/router/useInbox';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';

function SystemEmojiFeature() {
  const [twitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');

  if (twitterEmoji) {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji');
  } else {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji_DISABLED');
  }

  return null;
}

function PageZoomFeature() {
  const [pageZoom] = useSetting(settingsAtom, 'pageZoom');

  if (pageZoom === 100) {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.setProperty('font-size', `calc(1em * ${pageZoom / 100})`);
  }

  return null;
}

function FaviconUpdater() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);

  useEffect(() => {
    let notification = false;
    let highlight = false;
    roomToUnread.forEach((unread) => {
      if (unread.total > 0) {
        notification = true;
      }
      if (unread.highlight > 0) {
        highlight = true;
      }
    });

    if (notification) {
      setFavicon(highlight ? LogoHighlightSVG : LogoUnreadSVG);
    } else {
      setFavicon(LogoSVG);
    }
  }, [roomToUnread]);

  return null;
}

function InviteNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const invites = useAtomValue(allInvitesAtom);
  const perviousInviteLen = usePreviousValue(invites.length, 0);
  const mx = useMatrixClient();

  const navigate = useNavigate();
  const [showNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [notificationVolume] = useSetting(settingsAtom, 'notificationVolume');

  const notify = useCallback(
    (count: number) => {
      const noti = new window.Notification('Invitation', {
        icon: LogoSVG,
        badge: LogoSVG,
        body: `You have ${count} new invitation request.`,
        silent: true,
      });

      noti.onclick = () => {
        if (!window.closed) navigate(getInboxInvitesPath());
        noti.close();
      };
    },
    [navigate]
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;
    audioElement.volume = notificationVolume;
    audioElement.play();
  }, [notificationVolume]);

  useEffect(() => {
    if (invites.length > perviousInviteLen && mx.getSyncState() === 'SYNCING') {
      if (showNotifications && notificationPermission('granted')) {
        notify(invites.length - perviousInviteLen);
      }

      if (notificationSound) {
        playSound();
      }
    }
  }, [mx, invites, perviousInviteLen, showNotifications, notificationSound, notify, playSound]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={InviteSound} type="audio/ogg" />
    </audio>
  );
}

function MessageNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const notifRef = useRef<Notification>();
  const unreadCacheRef = useRef<Map<string, UnreadInfo>>(new Map());
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [showNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [notificationVolume] = useSetting(settingsAtom, 'notificationVolume');

  const navigate = useNavigate();
  const notificationSelected = useInboxNotificationsSelected();
  const selectedRoomId = useSelectedRoom();

  const notify = useCallback(
    ({
      roomName,
      roomAvatar,
      username,
    }: {
      roomName: string;
      roomAvatar?: string;
      username: string;
      roomId: string;
      eventId: string;
    }) => {
      const noti = new window.Notification(roomName, {
        icon: roomAvatar,
        badge: roomAvatar,
        body: `New inbox notification from ${username}`,
        silent: true,
      });

      noti.onclick = () => {
        if (!window.closed) navigate(getInboxNotificationsPath());
        noti.close();
        notifRef.current = undefined;
      };

      notifRef.current?.close();
      notifRef.current = noti;
    },
    [navigate]
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;
    audioElement.volume = notificationVolume;
    audioElement.play();
  }, [notificationVolume]);

  useEffect(() => {
    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      room,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (mx.getSyncState() !== 'SYNCING') return;
      if (document.hasFocus() && (selectedRoomId === room?.roomId || notificationSelected)) return;
      if (
        !room ||
        !data.liveEvent ||
        room.isSpaceRoom() ||
        !isNotificationEvent(mEvent) ||
        getNotificationType(mx, room.roomId) === NotificationType.Mute
      ) {
        return;
      }

      const sender = mEvent.getSender();
      const eventId = mEvent.getId();
      if (!sender || !eventId || mEvent.getSender() === mx.getUserId()) return;
      const unreadInfo = getUnreadInfo(room);
      const cachedUnreadInfo = unreadCacheRef.current.get(room.roomId);
      unreadCacheRef.current.set(room.roomId, unreadInfo);

      if (unreadInfo.total === 0) return;
      if (
        cachedUnreadInfo &&
        unreadEqual(unreadInfoToUnread(cachedUnreadInfo), unreadInfoToUnread(unreadInfo))
      ) {
        return;
      }

      if (showNotifications && notificationPermission('granted')) {
        const avatarMxc =
          room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
        notify({
          roomName: room.name ?? 'Unknown',
          roomAvatar: avatarMxc
            ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined
            : undefined,
          username: getMemberDisplayName(room, sender) ?? getMxIdLocalPart(sender) ?? sender,
          roomId: room.roomId,
          eventId,
        });
      }

      if (notificationSound) {
        playSound();
      }
    };
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [
    mx,
    notificationSound,
    notificationSelected,
    showNotifications,
    playSound,
    notify,
    selectedRoomId,
    useAuthentication,
  ]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={NotificationSound} type="audio/ogg" />
    </audio>
  );
}



/**
 * Applies the user's stored device-isolation-mode preference every time the
 * Matrix crypto module is available. The SDK does not persist this setting,
 * so we re-apply it from settingsAtom on mount and after each reconnect.
 */
function CryptoIsolationEnforcer() {
  const mx = useMatrixClient();
  const [shareKeysWith] = useSetting(settingsAtom, 'shareKeysWith');

  useEffect(() => {
    const crypto = mx.getCrypto();
    if (!crypto) return;
    if (shareKeysWith === 'cross-verified') {
      crypto.setDeviceIsolationMode(new OnlySignedDevicesIsolationMode());
    } else if (shareKeysWith === 'verified') {
      crypto.setDeviceIsolationMode(new AllDevicesIsolationMode(true));
    } else {
      crypto.setDeviceIsolationMode(new AllDevicesIsolationMode(false));
    }
  }, [mx, shareKeysWith]);

  return null;
}

const PRESENCE_STORAGE_KEY = 'shuchat-manual-presence';
// Rate-limit re-sends so we don't hammer Synapse (cooldown 15 s)
let _presenceEnforceCooldown = 0;

/**
 * Keeps the user's manually chosen presence (offline/unavailable) sticky.
 *
 * The Matrix SDK silently resets setSyncPresence to Online when it reconnects
 * or detects user activity. This component counters that by:
 *   - Re-applying the saved presence immediately on mount and on every reconnect
 *   - Watching own UserEvent.Presence — if the server pushes an unwanted 'online',
 *     revert it immediately
 */
function ManualPresenceEnforcer() {
  const mx = useMatrixClient();

  useEffect(() => {
    const saved = localStorage.getItem(PRESENCE_STORAGE_KEY) as
      | 'online' | 'unavailable' | 'offline' | null;

    // Only enforce for non-online choices — online is the default anyway
    if (!saved || saved === 'online') return;

    const syncPresenceMap: Record<string, SetPresence> = {
      online: SetPresence.Online,
      unavailable: SetPresence.Unavailable,
      offline: SetPresence.Offline,
    };

    const applyManualPresence = () => {
      // Re-apply setSyncPresence so the next /sync carries the right set_presence
      mx.setSyncPresence(syncPresenceMap[saved]);

      // Rate-limited explicit PUT so Synapse records it on the server too
      const now = Date.now();
      if (now - _presenceEnforceCooldown < 15_000) return;
      _presenceEnforceCooldown = now;
      mx.setPresence({ presence: saved as any }).catch(() => {});
    };

    // Apply on mount (handles page load / hot reconnect)
    applyManualPresence();

    // Re-apply every time the SDK reconnects (PREPARED = initial sync done,
    // CATCHUP = reconnected after drop).  Both states reset the SDK internals.
    const handleSync = (state: string) => {
      if (state === 'PREPARED' || state === 'CATCHUP') {
        applyManualPresence();
      }
    };
    mx.on(ClientEvent.Sync, handleSync as any);

    // Watch own presence events pushed by the server — revert if they conflict
    const ownUser = mx.getUser(mx.getUserId() ?? '');
    const handlePresence = () => {
      if (!ownUser) return;
      // If server pushed 'online' but user wants offline/unavailable → revert
      if (ownUser.presence === 'online' && saved !== 'online') {
        // Optimistically patch the SDK user object so UI doesn't flicker
        (ownUser as any).presence = saved;
        ownUser.emit(UserEvent.Presence, null as any, ownUser);
        applyManualPresence();
      }
    };
    ownUser?.on(UserEvent.Presence, handlePresence);

    return () => {
      mx.removeListener(ClientEvent.Sync, handleSync as any);
      ownUser?.removeListener(UserEvent.Presence, handlePresence);
    };
  }, [mx]);

  return null;
}

type ClientNonUIFeaturesProps = {
  children: ReactNode;
};

export function ClientNonUIFeatures({ children }: ClientNonUIFeaturesProps) {
  return (
    <>
      <ManualPresenceEnforcer />
      <CryptoIsolationEnforcer />
      <SystemEmojiFeature />
      <PageZoomFeature />
      <FaviconUpdater />
      <InviteNotifications />
      <MessageNotifications />
      {children}
    </>
  );
}
