import React, { MouseEventHandler, forwardRef, useState, useEffect, useRef } from 'react';
import { Room } from 'matrix-js-sdk';
import {
  Avatar,
  Box,
  Icon,
  IconButton,
  Icons,
  Text,
  Menu,
  MenuItem,
  config,
  PopOut,
  toRem,
  Line,
  RectCords,
  Badge,
  Spinner,
} from 'folds';
import { useFocusWithin, useHover } from 'react-aria';
import FocusTrap from 'focus-trap-react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { NavItem, NavItemContent, NavItemOptions, NavLink } from '../../components/nav';
import { UnreadBadge, UnreadBadgeCenter } from '../../components/unread-badge';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from '../../utils/room';
import { nameInitials } from '../../utils/common';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomUnread } from '../../state/hooks/unread';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { copyToClipboard } from '../../utils/dom';
import { markAsRead } from '../../utils/notifications';
import { UseStateProvider } from '../../components/UseStateProvider';
import { LeaveRoomPrompt } from '../../components/leave-room-prompt';
import { useRoomTypingMember } from '../../hooks/useRoomTypingMembers';
import { TypingIndicator } from '../../components/typing-indicator';
import { stopPropagation } from '../../utils/keyboard';
import { getMatrixToRoom } from '../../plugins/matrix-to';
import { getCanonicalAliasOrRoomId, isRoomAlias } from '../../utils/matrix';
import { getViaServers } from '../../plugins/via-servers';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { getMemberDisplayName, getMemberAvatarMxc } from '../../utils/room';
import { mxcUrlToHttp } from '../../utils/matrix';
import { UserAvatar } from '../../components/user-avatar';
import { getMxIdLocalPart } from '../../utils/matrix';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useOpenRoomSettings } from '../../state/hooks/roomSettings';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { useUserPresence } from '../../hooks/useUserPresence';
import { AvatarPresence, PresenceBadge } from '../../components/presence';
import {
  getRoomNotificationModeIcon,
  RoomNotificationMode,
} from '../../hooks/useRoomsNotificationPreferences';
import { RoomNotificationModeSwitcher } from '../../components/RoomNotificationSwitcher';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { AddToFolderPrompt } from '../../components/add-to-folder-prompt/AddToFolderPrompt';
import {
  ISidebarFolder,
  InCinnySpacesContent,
} from '../../hooks/useSidebarItems';
import { getAccountData } from '../../utils/room';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { useRoomName } from '../../hooks/useRoomMeta';
import { useCallMembers, useCallSession } from '../../hooks/useCall';
import { useCallEmbed, useCallStart } from '../../hooks/useCallEmbed';
import { useCallSpeakers } from '../../hooks/useCallSpeakers';
import { callChatAtom, callEmbedAtom } from '../../state/callEmbed';
import { useCallPreferencesAtom } from '../../state/hooks/callPreferences';
import { useAutoDiscoveryInfo } from '../../hooks/useAutoDiscoveryInfo';
import { livekitSupport } from '../../hooks/useLivekitSupport';
import { useUserVerificationStatus } from '../../hooks/useUserVerificationStatus';

type RoomNavItemMenuProps = {
  room: Room;
  requestClose: () => void;
  notificationMode?: RoomNotificationMode;
  dmUserId?: string;
};
const RoomNavItemMenu = forwardRef<HTMLDivElement, RoomNavItemMenuProps>(
  ({ room, requestClose, notificationMode, dmUserId }, ref) => {
    const mx = useMatrixClient();
    const openUserProfile = useOpenUserRoomProfile();
    const dmVerifStatus = useUserVerificationStatus(dmUserId);

    const handleVerifyUser = (evt: React.MouseEvent) => {
      if (!dmUserId) return;
      requestClose();
      openUserProfile(
        room.roomId,
        undefined,
        dmUserId,
        (evt.currentTarget as HTMLElement).getBoundingClientRect(),
        'Right'
      );
    };
    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const unread = useRoomUnread(room.roomId, roomToUnreadAtom);

  // Check if this room is pinned to sidebar (for visual indicator)
  const isPinnedToSidebar = (() => {
    const content = getAccountData(mx, AccountDataEvent.CinnySpaces)
      ?.getContent<InCinnySpacesContent>();
    const sidebar = content?.sidebar ?? content?.shortcut ?? [];
    return sidebar.some(
      (item) =>
        item === room.roomId ||
        (typeof item === 'object' && (item as ISidebarFolder).content.includes(room.roomId))
    );
  })();
    const powerLevels = usePowerLevels(room);
    const creators = useRoomCreators(room);

    const permissions = useRoomPermissions(creators, powerLevels);
    const canInvite = permissions.action('invite', mx.getSafeUserId());
    const openRoomSettings = useOpenRoomSettings();
    const space = useSpaceOptionally();

    const [invitePrompt, setInvitePrompt] = useState(false);
    const [moveToFolderPrompt, setMoveToFolderPrompt] = useState(false);

    // Check if this room is currently in a sidebar folder
    const isInSidebarFolder = (() => {
      const content = getAccountData(mx, AccountDataEvent.CinnySpaces)
        ?.getContent<InCinnySpacesContent>();
      const sidebar = content?.sidebar ?? content?.shortcut ?? [];
      return sidebar.some(
        (item) =>
          typeof item === 'object' &&
          (item as ISidebarFolder).content.includes(room.roomId)
      );
    })();

    const isInSidebar = (() => {
      const content = getAccountData(mx, AccountDataEvent.CinnySpaces)
        ?.getContent<InCinnySpacesContent>();
      const sidebar = content?.sidebar ?? content?.shortcut ?? [];
      return sidebar.some(
        (item) => item === room.roomId || (typeof item === 'object' && (item as ISidebarFolder).content.includes(room.roomId))
      );
    })();

    const handleMarkAsRead = () => {
      markAsRead(mx, room.roomId, hideActivity);
      requestClose();
    };

    const handleInvite = () => {
      setInvitePrompt(true);
    };

    const handleCopyLink = () => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
      const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
      copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
      requestClose();
    };

    const handleRoomSettings = () => {
      openRoomSettings(room.roomId, space?.roomId);
      requestClose();
    };

    return (
      <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
        {invitePrompt && room && (
          <InviteUserPrompt
            room={room}
            requestClose={() => {
              setInvitePrompt(false);
              requestClose();
            }}
          />
        )}
        {moveToFolderPrompt && (
          <AddToFolderPrompt
            roomId={room.roomId}
            onDone={() => { setMoveToFolderPrompt(false); requestClose(); }}
            onCancel={() => setMoveToFolderPrompt(false)}
          />
        )}
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem
            onClick={handleMarkAsRead}
            size="300"
            after={<Icon size="100" src={Icons.CheckTwice} />}
            radii="300"
            disabled={!unread}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Mark as Read
            </Text>
          </MenuItem>
          <RoomNotificationModeSwitcher roomId={room.roomId} value={notificationMode}>
            {(handleOpen, opened, changing) => (
              <MenuItem
                size="300"
                after={
                  changing ? (
                    <Spinner size="100" variant="Secondary" />
                  ) : (
                    <Icon size="100" src={getRoomNotificationModeIcon(notificationMode)} />
                  )
                }
                radii="300"
                aria-pressed={opened}
                onClick={handleOpen}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Notifications
                </Text>
              </MenuItem>
            )}
          </RoomNotificationModeSwitcher>
        </Box>
        <Line variant="Surface" size="300" />
        {dmUserId && (
          <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
            <MenuItem
              onClick={handleVerifyUser}
              variant={dmVerifStatus?.isVerified() ? 'Success' : 'Surface'}
              fill="None"
              size="300"
              after={<Icon size="100" src={Icons.ShieldUser} />}
              radii="300"
            >
              <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                {dmVerifStatus?.isVerified() ? 'Verified' : 'Verify User'}
              </Text>
            </MenuItem>
          </Box>
        )}
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem
            onClick={handleInvite}
            variant="Primary"
            fill="None"
            size="300"
            after={<Icon size="100" src={Icons.UserPlus} />}
            radii="300"
            aria-pressed={invitePrompt}
            disabled={!canInvite}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Invite
            </Text>
          </MenuItem>
          <MenuItem
            onClick={handleCopyLink}
            size="300"
            after={<Icon size="100" src={Icons.Link} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Copy Link
            </Text>
          </MenuItem>
          <MenuItem
            onClick={handleRoomSettings}
            size="300"
            after={<Icon size="100" src={Icons.Setting} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Room Settings
            </Text>
          </MenuItem>
          <MenuItem
            onClick={() => { setMoveToFolderPrompt(true); }}
            size="300"
            after={<Icon size="100" src={Icons.Category} />}
            radii="300"
            aria-pressed={moveToFolderPrompt}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              {isInSidebar ? 'Move to Folder' : 'Add to Sidebar'}
            </Text>
          </MenuItem>
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <UseStateProvider initial={false}>
            {(promptLeave, setPromptLeave) => (
              <>
                <MenuItem
                  onClick={() => setPromptLeave(true)}
                  variant="Critical"
                  fill="None"
                  size="300"
                  after={<Icon size="100" src={Icons.ArrowGoLeft} />}
                  radii="300"
                  aria-pressed={promptLeave}
                >
                  <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                    Leave Room
                  </Text>
                </MenuItem>
                {promptLeave && (
                  <LeaveRoomPrompt
                    roomId={room.roomId}
                    onDone={requestClose}
                    onCancel={() => setPromptLeave(false)}
                  />
                )}
              </>
            )}
          </UseStateProvider>
        </Box>
      </Menu>
    );
  }
);

function CallChatToggle() {
  const [chat, setChat] = useAtom(callChatAtom);

  return (
    <IconButton
      onClick={() => setChat(!chat)}
      aria-pressed={chat}
      aria-label="Toggle Chat"
      variant="Background"
      fill="None"
      size="300"
      radii="300"
    >
      <Icon size="50" src={Icons.Message} filled={chat} />
    </IconButton>
  );
}

type RoomNavItemProps = {
  room: Room;
  selected: boolean;
  linkPath: string;
  notificationMode?: RoomNotificationMode;
  showAvatar?: boolean;
  direct?: boolean;
};

function VoiceMemberItem({ room, memberId, mx, useAuthentication, isSpeaking, onClickMember }: {
  room: Room; memberId: string; mx: any; useAuthentication: boolean; isSpeaking: boolean;
  onClickMember: (userId: string, rect: DOMRect) => void;
}) {
  const [visualSpeaking, setVisualSpeaking] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isSpeaking) {
      // Instant on
      if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null; }
      setVisualSpeaking(true);
    } else if (visualSpeaking) {
      // Delayed off — hold highlight for 250ms
      fadeTimerRef.current = setTimeout(() => {
        setVisualSpeaking(false);
        fadeTimerRef.current = null;
      }, 250);
    }
    return () => { if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current); };
  }, [isSpeaking]);

  const memberName = getMemberDisplayName(room, memberId) ?? getMxIdLocalPart(memberId) ?? memberId;
  const voiceVerifStatus = useUserVerificationStatus(memberId);
  const avatarMxc = getMemberAvatarMxc(room, memberId);
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 100, 100) ?? undefined
    : undefined;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onClickMember(memberId, e.currentTarget.getBoundingClientRect())}
      onKeyDown={(e) => { if (e.key === 'Enter') onClickMember(memberId, e.currentTarget.getBoundingClientRect()); }}
      style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '2px 0', cursor: 'pointer', borderRadius: '4px' }}
    >
      <Box shrink="No" style={{
        borderRadius: '50%',
        boxShadow: visualSpeaking ? '0 0 0 2px #3ba55d' : '0 0 0 2px transparent',
        transition: visualSpeaking ? 'box-shadow 0s' : 'box-shadow 0.2s ease-out',
      }}>
        <Avatar size="200">
          <UserAvatar
            userId={memberId}
            src={avatarUrl}
            alt={memberName}
            renderFallback={() => <Icon size="50" src={Icons.User} filled />}
          />
        </Avatar>
      </Box>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, minWidth: 0, gap: '4px' }}>
        <Text size="T400" truncate style={{
          color: visualSpeaking ? '#3ba55d' : undefined,
          fontWeight: visualSpeaking ? 600 : undefined,
          transition: visualSpeaking ? 'color 0s' : 'color 0.2s ease-out',
        }}>
          {memberName}
        </Text>
        {voiceVerifStatus?.isVerified() && (
          <span title="Verified user" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            <Icon src={Icons.ShieldUser} size="50" style={{ color: '#3ba55d' }} />
          </span>
        )}
      </span>
    </div>
  );
}

function VoiceMembersListInner({ room, callMembers, mx, useAuthentication, speakers, onClickMember, optimisticUserId }: {
  room: Room; callMembers: any[]; mx: any; useAuthentication: boolean; speakers: Set<string>;
  onClickMember: (userId: string, rect: DOMRect) => void; optimisticUserId?: string;
}) {
  return (
    <Box direction="Column" style={{ paddingLeft: '1.75rem', paddingBottom: '0.35rem' }}>
      {callMembers.slice(0, 8).map((member: any) => {
        const memberId = member.sender;
        if (!memberId) return null;
        return (
          <VoiceMemberItem
            key={member.membershipID}
            room={room}
            memberId={memberId}
            mx={mx}
            useAuthentication={useAuthentication}
            isSpeaking={speakers.has(memberId)}
            onClickMember={onClickMember}
          />
        );
      })}
      {optimisticUserId && !callMembers.some((m: any) => m.sender === optimisticUserId) && (
        <VoiceMemberItem
          key="optimistic"
          room={room}
          memberId={optimisticUserId}
          mx={mx}
          useAuthentication={useAuthentication}
          isSpeaking={false}
          onClickMember={onClickMember}
        />
      )}
      {callMembers.length > 8 && (
        <Text size="T200" style={{ paddingTop: '0.2rem', opacity: 0.45, paddingLeft: '1.5rem', fontSize: '0.72rem' }}>
          +{callMembers.length - 8} more
        </Text>
      )}
    </Box>
  );
}

function VoiceMembersWithSpeakers({ room, callMembers, callEmbed, mx, useAuthentication, onClickMember, optimisticUserId }: {
  room: Room; callMembers: any[]; callEmbed: any; mx: any; useAuthentication: boolean;
  onClickMember: (userId: string, rect: DOMRect) => void; optimisticUserId?: string;
}) {
  const speakers = useCallSpeakers(callEmbed);
  return <VoiceMembersListInner room={room} callMembers={callMembers} mx={mx} useAuthentication={useAuthentication} speakers={speakers} onClickMember={onClickMember} optimisticUserId={optimisticUserId} />;
}

function VoiceMembersList({ room, callMembers, callEmbed, mx, useAuthentication, optimisticUserId }: {
  room: Room; callMembers: any[]; callEmbed: any | null; mx: any; useAuthentication: boolean;
  optimisticUserId?: string;
}) {
  const openUserRoomProfile = useOpenUserRoomProfile();
  const space = useSpaceOptionally();
  const onClickMember = (userId: string, rect: DOMRect) => {
    openUserRoomProfile(room.roomId, space?.roomId, userId, rect, 'Right');
  };
  if (callEmbed && callEmbed.roomId === room.roomId) {
    return <VoiceMembersWithSpeakers room={room} callMembers={callMembers} callEmbed={callEmbed} mx={mx} useAuthentication={useAuthentication} onClickMember={onClickMember} optimisticUserId={optimisticUserId} />;
  }
  return <VoiceMembersListInner room={room} callMembers={callMembers} mx={mx} useAuthentication={useAuthentication} speakers={new Set()} onClickMember={onClickMember} optimisticUserId={optimisticUserId} />;
}

export function RoomNavItem({
  room,
  selected,
  showAvatar,
  direct,
  notificationMode,
  linkPath,
}: RoomNavItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [hover, setHover] = useState(false);
  const { hoverProps } = useHover({ onHoverChange: setHover });
  const { focusWithinProps } = useFocusWithin({ onFocusWithinChange: setHover });
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const typingMember = useRoomTypingMember(room.roomId).filter(
    (receipt) => receipt.userId !== mx.getUserId()
  );

  const roomName = useRoomName(room);
  const myUserId2 = mx.getSafeUserId();
  const dmNavUserId = direct
    ? room.getJoinedMembers().find((m) => m.userId !== myUserId2)?.userId
    : undefined;
  const navVerifStatus = useUserVerificationStatus(dmNavUserId);
  const dmPresence = useUserPresence(dmNavUserId ?? '');

  const handleContextMenu: MouseEventHandler<HTMLElement> = (evt) => {
    evt.preventDefault();
    setMenuAnchor({
      x: evt.clientX,
      y: evt.clientY,
      width: 0,
      height: 0,
    });
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const optionsVisible = hover || !!menuAnchor;
  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const startCall = useCallStart(direct);
  const callEmbed = useCallEmbed();
  const setCallEmbed = useSetAtom(callEmbedAtom);
  const callPref = useAtomValue(useCallPreferencesAtom());
  const autoDiscoveryInfo = useAutoDiscoveryInfo();

  // Ref for auto-switching voice rooms (pending target room after hangup)
  const pendingSwitchRef = useRef<{ room: Room; pref: typeof callPref } | null>(null);

  // When callEmbed becomes undefined after hangup, start the pending switch
  useEffect(() => {
    if (!callEmbed && pendingSwitchRef.current) {
      const { room: targetRoom, pref } = pendingSwitchRef.current;
      pendingSwitchRef.current = null;
      // Small delay for cleanup to settle
      setTimeout(() => startCall(targetRoom, pref), 200);
    }
  }, [callEmbed, startCall]);

  // Refs for the deferred-join logic (waiting for call.member sync before deciding intent)
  const [connectingCall, setConnectingCall] = useState(false);
  const [optimisticJoin, setOptimisticJoin] = useState(false);
  const pendingStartCallRef = useRef<{ pref: typeof callPref } | null>(null);

  // Clear optimistic join only when the user actually appears in callMembers
  useEffect(() => {
    if (optimisticJoin && callMembers.some((m: any) => m.sender === mx.getUserId())) {
      setOptimisticJoin(false);
    }
  }, [callMembers, optimisticJoin, mx]);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When call members arrive while we are waiting, start immediately with join_existing intent
  useEffect(() => {
    if (pendingStartCallRef.current && callMembers.length > 0) {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      startCall(room, pendingStartCallRef.current.pref);
      pendingStartCallRef.current = null;
    }
  }, [callMembers, startCall, room]);

  // Cleanup pending timer on unmount
  useEffect(
    () => () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    },
    []
  );

  const handleStartCall: MouseEventHandler<HTMLAnchorElement> = (evt) => {
    // Do not join if no livekit support or call is not started by others
    if (!livekitSupport(autoDiscoveryInfo) && callMembers.length === 0) {
      return;
    }

    // If already in a different voice room, hangup first then auto-join new one
    if (callEmbed) {
      if (callEmbed.roomId === room.roomId) return; // already in this room
      setOptimisticJoin(true);
      pendingSwitchRef.current = { room, pref: callPref };
      callEmbed.hangup();
      return;
    }
    // Start call in second click
    if (selected) {
      evt.preventDefault();
      setOptimisticJoin(true);
      if (callMembers.length > 0) {
        // Someone is already in the call — join immediately
        startCall(room, callPref);
      } else {
        // No visible members yet. Wait up to 4 s for any call.member events to sync
        // (e.g. someone else just started a call and their event is in-flight).
        // This prevents two users from creating separate LiveKit sessions simultaneously.
        pendingStartCallRef.current = { pref: callPref };
        if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
        setOptimisticJoin(true);
        setConnectingCall(true);
        pendingTimerRef.current = setTimeout(() => {
          pendingTimerRef.current = null;
          if (pendingStartCallRef.current) {
            startCall(room, pendingStartCallRef.current.pref);
            pendingStartCallRef.current = null;
          }
          setConnectingCall(false);
        }, 2000); // 2 s is enough for a local Synapse to sync a call.member event
      }
    }
  };

  return (
    <>
    <NavItem
      variant="Background"
      radii="400"
      highlight={unread !== undefined}
      aria-selected={selected}
      data-hover={!!menuAnchor}
      onContextMenu={handleContextMenu}
      {...hoverProps}
      {...focusWithinProps}
    >
      <NavLink to={linkPath} onClick={room.isCallRoom() ? handleStartCall : undefined}>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <AvatarPresence badge={direct && dmPresence ? <PresenceBadge presence={dmPresence.presence} size="200" /> : null}>
            <Avatar size="200" radii="400">
              {showAvatar ? (
                <RoomAvatar
                  roomId={room.roomId}
                  src={
                    direct
                      ? getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
                      : getRoomAvatarUrl(mx, room, 96, useAuthentication)
                  }
                  alt={roomName}
                  renderFallback={() => (
                    <Text as="span" size="H6">
                      {nameInitials(roomName)}
                    </Text>
                  )}
                />
              ) : (
                <RoomIcon
                  style={{
                    opacity: unread ? config.opacity.P500 : config.opacity.P300,
                  }}
                  filled={selected}
                  size="100"
                  joinRule={room.getJoinRule()}
                  roomType={room.getType()}
                />
              )}
            </Avatar>
            </AvatarPresence>
            <Box as="span" grow="Yes" direction="Column" style={{ minWidth: 0 }}>
              <Text priority={unread ? '500' : '300'} as="span" size="Inherit" truncate>
                {roomName}
              </Text>
              {direct && dmPresence?.status && (
                <Text as="span" size="T200" truncate style={{ opacity: 0.5, fontSize: '11px' }}>
                  {dmPresence.status}
                </Text>
              )}
            </Box>
            {!optionsVisible && !unread && !selected && typingMember.length > 0 && (
              <Badge size="300" variant="Secondary" fill="Soft" radii="Pill" outlined>
                <TypingIndicator size="300" disableAnimation />
              </Badge>
            )}
            {!optionsVisible && unread && (
              <UnreadBadgeCenter>
                <UnreadBadge highlight={unread.highlight > 0} count={unread.total} />
              </UnreadBadgeCenter>
            )}
            {!optionsVisible && notificationMode !== RoomNotificationMode.Unset && (
              <Icon
                size="50"
                src={getRoomNotificationModeIcon(notificationMode)}
                aria-label={notificationMode}
              />
            )}
            {!optionsVisible && direct && navVerifStatus?.isVerified() && (
              <span title="Verified user" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                <Icon src={Icons.ShieldUser} size="50" style={{ color: '#3ba55d' }} />
              </span>
            )}
            {room.isCallRoom() && connectingCall && callMembers.length === 0 && (
              <Box as="span" alignItems="Center" gap="100" shrink="No">
                <Spinner size="100" variant="Secondary" />
              </Box>
            )}
            {room.isCallRoom() && callMembers.length > 0 && (
              <Box as="span" alignItems="Center" gap="100" shrink="No">
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: '#3ba55d', display: 'inline-block', flexShrink: 0,
                }} />
                <Text as="span" size="L400" style={{ color: '#3ba55d', fontWeight: 600 }}>
                  {callMembers.length}
                </Text>
              </Box>
            )}
          </Box>
        </NavItemContent>
      </NavLink>
      {optionsVisible && (
        <NavItemOptions>
          {selected && (callEmbed?.roomId === room.roomId || room.isCallRoom()) && (
            <CallChatToggle />
          )}
          <PopOut
            id={`menu-${room.roomId}`}
            aria-expanded={!!menuAnchor}
            anchor={menuAnchor}
            offset={menuAnchor?.width === 0 ? 0 : undefined}
            alignOffset={menuAnchor?.width === 0 ? 0 : -5}
            position="Bottom"
            align={menuAnchor?.width === 0 ? 'Start' : 'End'}
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  returnFocusOnDeactivate: false,
                  onDeactivate: () => setMenuAnchor(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                  isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <RoomNavItemMenu
                  room={room}
                  requestClose={() => setMenuAnchor(undefined)}
                  notificationMode={notificationMode}
                  dmUserId={dmNavUserId}
                />
              </FocusTrap>
            }
          >
            <IconButton
              onClick={handleOpenMenu}
              aria-pressed={!!menuAnchor}
              aria-controls={`menu-${room.roomId}`}
              aria-label="More Options"
              variant="Background"
              fill="None"
              size="300"
              radii="300"
            >
              <Icon size="50" src={Icons.VerticalDots} />
            </IconButton>
          </PopOut>
        </NavItemOptions>
      )}
    </NavItem>
    {room.isCallRoom() && (callMembers.length > 0 || optimisticJoin) && (
      <VoiceMembersList
        room={room}
        callMembers={callMembers}
        callEmbed={callEmbed}
        mx={mx}
        useAuthentication={useAuthentication}
        optimisticUserId={optimisticJoin && !callMembers.some(m => m.sender === mx.getUserId()) ? mx.getUserId() ?? undefined : undefined}
      />
    )}
    </>
  );
}
