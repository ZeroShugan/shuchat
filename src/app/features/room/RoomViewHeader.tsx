import React, { MouseEventHandler, forwardRef, useState, useRef, useCallback } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Avatar,
  Text,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  IconButton,
  Icon,
  Icons,
  Tooltip,
  TooltipProvider,
  Menu,
  MenuItem,
  toRem,
  config,
  Line,
  PopOut,
  RectCords,
  Badge,
  Spinner,
} from 'folds';
import { useNavigate } from 'react-router-dom';
import { Room } from 'matrix-js-sdk';
import { useStateEvent } from '../../hooks/useStateEvent';
import { PageHeader } from '../../components/page';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { UseStateProvider } from '../../components/UseStateProvider';
import { RoomTopicViewer } from '../../components/room-topic-viewer';
import { StateEvent } from '../../../types/matrix/room';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useIsDirectRoom, useRoom } from '../../hooks/useRoom';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { getHomeSearchPath, getSpaceSearchPath, withSearchParam } from '../../pages/pathUtils';
import { getCanonicalAliasOrRoomId, isRoomAlias, mxcUrlToHttp } from '../../utils/matrix';
import { _SearchPathSearchParams } from '../../pages/paths';
import * as css from './RoomViewHeader.css';
import { useRoomUnread } from '../../state/hooks/unread';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { markAsRead } from '../../utils/notifications';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { copyToClipboard } from '../../utils/dom';
import { LeaveRoomPrompt } from '../../components/leave-room-prompt';
import { useRoomAvatar, useRoomName, useRoomTopic } from '../../hooks/useRoomMeta';
import { useCallStart, useCallEmbed } from '../../hooks/useCallEmbed';
import { useCallSession, useCallMembers } from '../../hooks/useCall';
import { useCallPreferences } from '../../state/hooks/callPreferences';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { stopPropagation } from '../../utils/keyboard';
import { getMatrixToRoom } from '../../plugins/matrix-to';
import { getViaServers } from '../../plugins/via-servers';
import { BackRouteHandler } from '../../components/BackRouteHandler';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoomPinnedEvents } from '../../hooks/useRoomPinnedEvents';
import { RoomPinMenu } from './room-pin-menu';
import { useOpenRoomSettings } from '../../state/hooks/roomSettings';
import { RoomNotificationModeSwitcher } from '../../components/RoomNotificationSwitcher';
import {
  getRoomNotificationMode,
  getRoomNotificationModeIcon,
  useRoomsNotificationPreferencesContext,
} from '../../hooks/useRoomsNotificationPreferences';
import { JumpToTime } from './jump-to-time';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useCrossSigningActive } from '../../hooks/useCrossSigning';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { useUserVerificationStatus } from '../../hooks/useUserVerificationStatus';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { RoomSettingsPage } from '../../state/roomSettings';

type RoomMenuProps = {
  room: Room;
  requestClose: () => void;
};
const RoomMenu = forwardRef<HTMLDivElement, RoomMenuProps>(({ room, requestClose }, ref) => {
  const mx = useMatrixClient();
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canInvite = permissions.action('invite', mx.getSafeUserId());
  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const notificationMode = getRoomNotificationMode(notificationPreferences, room.roomId);
  const { navigateRoom } = useRoomNavigate();

  const [invitePrompt, setInvitePrompt] = useState(false);

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

  const openSettings = useOpenRoomSettings();
  const parentSpace = useSpaceOptionally();
  const handleOpenSettings = () => {
    openSettings(room.roomId, parentSpace?.roomId);
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
      {invitePrompt && (
        <InviteUserPrompt
          room={room}
          requestClose={() => {
            setInvitePrompt(false);
            requestClose();
          }}
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
          onClick={handleOpenSettings}
          size="300"
          after={<Icon size="100" src={Icons.Setting} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Room Settings
          </Text>
        </MenuItem>
        <UseStateProvider initial={false}>
          {(promptJump, setPromptJump) => (
            <>
              <MenuItem
                onClick={() => setPromptJump(true)}
                size="300"
                after={<Icon size="100" src={Icons.RecentClock} />}
                radii="300"
                aria-pressed={promptJump}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Jump to Time
                </Text>
              </MenuItem>
              {promptJump && (
                <JumpToTime
                  onSubmit={(eventId) => {
                    setPromptJump(false);
                    navigateRoom(room.roomId, eventId);
                    requestClose();
                  }}
                  onCancel={() => setPromptJump(false)}
                />
              )}
            </>
          )}
        </UseStateProvider>
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
});

export function RoomViewHeader({ callView, onSearch, searchPanelOpen }: { callView?: boolean; onSearch?: (term: string) => void; searchPanelOpen?: boolean }) {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const screenSize = useScreenSizeContext();
  const room = useRoom();
  const space = useSpaceOptionally();
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [pinMenuAnchor, setPinMenuAnchor] = useState<RectCords>();
  const direct = useIsDirectRoom();
  const myUserId = mx.getSafeUserId();
  const dmUserId = direct
    ? room.getJoinedMembers().find((m) => m.userId !== myUserId)?.userId
    : undefined;
  const dmVerifStatus = useUserVerificationStatus(dmUserId);
  const callEmbed = useCallEmbed();
  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const myCallActive = callEmbed?.roomId === room.roomId;
  const hasActiveCall = callMembers.length > 0;
  const startCall = useCallStart(true);
  const { microphone, video, sound: callSound } = useCallPreferences();
  const callPref = { microphone, video, sound: callSound };
  const handleDMCall = () => {
    if (!direct || myCallActive) return;
    startCall(room, callPref);
  };

  const crossSigningActive = useCrossSigningActive();
  const openUserProfile = useOpenUserRoomProfile();

  const handleShieldClick = React.useCallback((evt: React.MouseEvent<HTMLButtonElement>) => {
    if (!dmUserId) return;
    openUserProfile(room.roomId, undefined, dmUserId, evt.currentTarget.getBoundingClientRect(), 'Right');
  }, [room.roomId, dmUserId, openUserProfile]);

  const pinnedEvents = useRoomPinnedEvents(room);
  const encryptionEvent = useStateEvent(room, StateEvent.RoomEncryption);
  const encryptedRoom = !!encryptionEvent;
  const avatarMxc = useRoomAvatar(room, direct);
  const name = useRoomName(room);
  const topic = useRoomTopic(room);
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const [peopleDrawer, setPeopleDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');

  const handleSearchClick = useCallback((term?: string) => {
    if (onSearch && term) {
      onSearch(term);
      return;
    }
    const searchParams: _SearchPathSearchParams = {
      rooms: room.roomId,
      ...(term ? { term } : {}),
    };
    const path = space
      ? getSpaceSearchPath(getCanonicalAliasOrRoomId(mx, space.roomId))
      : getHomeSearchPath();
    navigate(withSearchParam(path, searchParams));
  }, [onSearch, room.roomId, space, mx, navigate]);

  const [headerSearchVal, setHeaderSearchVal] = React.useState('');
  const [showHeaderFilter, setShowHeaderFilter] = React.useState(false);
  const headerSearchRef = useRef<HTMLInputElement>(null);

  const handleHeaderFilterSelect = useCallback((prefix: string) => {
    setHeaderSearchVal((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${prefix}` : prefix;
    });
    setTimeout(() => { headerSearchRef.current?.focus(); }, 0);
  }, []);


  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleOpenPinMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setPinMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const openSettings = useOpenRoomSettings();
  const parentSpace = useSpaceOptionally();
  const handleMemberToggle = () => {
    if (callView) {
      openSettings(room.roomId, parentSpace?.roomId, RoomSettingsPage.MembersPage);
      return;
    }
    setPeopleDrawer(!peopleDrawer);
  };

  return (
    <>
      <PageHeader
      className={ContainerColor({ variant: 'Surface' })}
      balance={screenSize === ScreenSize.Mobile}
    >
      <Box grow="Yes" gap="300">
        {screenSize === ScreenSize.Mobile && (
          <BackRouteHandler>
            {(onBack) => (
              <Box shrink="No" alignItems="Center">
                <IconButton fill="None" onClick={onBack}>
                  <Icon src={Icons.ArrowLeft} />
                </IconButton>
              </Box>
            )}
          </BackRouteHandler>
        )}
        <Box grow="Yes" alignItems="Center" gap="300">
          {screenSize !== ScreenSize.Mobile && (
            <Avatar size="300">
              <RoomAvatar
                roomId={room.roomId}
                src={avatarUrl}
                alt={name}
                renderFallback={() => (
                  <RoomIcon size="200" joinRule={room.getJoinRule()} roomType={room.getType()} />
                )}
              />
            </Avatar>
          )}
          <Box direction="Column">
            <Box alignItems="Center" gap="200">
              <Text size={topic ? 'H5' : 'H3'} truncate>
                {name}
              </Text>
              {direct && dmVerifStatus?.isVerified() && (
                <span title="Verified user" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  <Icon src={Icons.ShieldUser} size="200" style={{ color: '#3ba55d' }} />
                </span>
              )}
            </Box>
            {topic && (
              <UseStateProvider initial={false}>
                {(viewTopic, setViewTopic) => (
                  <>
                    <Overlay open={viewTopic} backdrop={<OverlayBackdrop />}>
                      <OverlayCenter>
                        <FocusTrap
                          focusTrapOptions={{
                            initialFocus: false,
                            clickOutsideDeactivates: true,
                            onDeactivate: () => setViewTopic(false),
                            escapeDeactivates: stopPropagation,
                          }}
                        >
                          <RoomTopicViewer
                            name={name}
                            topic={topic}
                            requestClose={() => setViewTopic(false)}
                          />
                        </FocusTrap>
                      </OverlayCenter>
                    </Overlay>
                    <Text
                      as="button"
                      type="button"
                      onClick={() => setViewTopic(true)}
                      className={css.HeaderTopic}
                      size="T200"
                      priority="300"
                      truncate
                    >
                      {topic}
                    </Text>
                  </>
                )}
              </UseStateProvider>
            )}
          </Box>
        </Box>

        <Box shrink="No" alignItems="Center" gap="100">
          {direct && dmUserId && crossSigningActive && !dmVerifStatus?.isVerified() && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>
                    {dmVerifStatus?.isVerified() ? 'Verified' : 'Verify User'}
                  </Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  ref={triggerRef}
                  onClick={handleShieldClick}
                  style={{
                    color: dmVerifStatus?.isVerified()
                      ? '#3ba55d'
                      : dmVerifStatus !== undefined
                      ? '#f0a500'
                      : undefined,
                  }}
                >
                  <Icon size="400" src={Icons.ShieldUser} />
                </IconButton>
              )}
            </TooltipProvider>
          )}
          {direct && !callEmbed?.roomId && !hasActiveCall && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={<Tooltip><Text>Start Voice Call</Text></Tooltip>}
            >
              {(triggerRef) => (
                <IconButton fill="None" ref={triggerRef} onClick={handleDMCall}>
                  <Icon size="400" src={Icons.Phone} />
                </IconButton>
              )}
            </TooltipProvider>
          )}
          {direct && (myCallActive || hasActiveCall) && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={<Tooltip><Text>{myCallActive ? 'In Call' : 'Join Call'}</Text></Tooltip>}
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  ref={triggerRef}
                  onClick={myCallActive ? undefined : handleDMCall}
                  style={{ color: '#3ba55d' }}
                >
                  <Icon size="400" src={Icons.Phone} filled />
                </IconButton>
              )}
            </TooltipProvider>
          )}
          <TooltipProvider
            position="Bottom"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>Pinned Messages</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                fill="None"
                style={{ position: 'relative' }}
                onClick={handleOpenPinMenu}
                ref={triggerRef}
                aria-pressed={!!pinMenuAnchor}
              >
                {pinnedEvents.length > 0 && (
                  <Badge
                    style={{
                      position: 'absolute',
                      left: toRem(3),
                      top: toRem(3),
                    }}
                    variant="Secondary"
                    size="400"
                    fill="Solid"
                    radii="Pill"
                  >
                    <Text as="span" size="L400">
                      {pinnedEvents.length}
                    </Text>
                  </Badge>
                )}
                <Icon size="400" src={Icons.Pin} filled={!!pinMenuAnchor} />
              </IconButton>
            )}
          </TooltipProvider>
          <PopOut
            anchor={pinMenuAnchor}
            position="Bottom"
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  returnFocusOnDeactivate: false,
                  onDeactivate: () => setPinMenuAnchor(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                  isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <RoomPinMenu room={room} requestClose={() => setPinMenuAnchor(undefined)} />
              </FocusTrap>
            }
          />

          {screenSize === ScreenSize.Desktop && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  {callView ? (
                    <Text>Members</Text>
                  ) : (
                    <Text>{peopleDrawer ? 'Hide Members' : 'Show Members'}</Text>
                  )}
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton fill="None" ref={triggerRef} onClick={handleMemberToggle}>
                  <Icon size="400" src={Icons.User} />
                </IconButton>
              )}
            </TooltipProvider>
          )}

          <TooltipProvider
            position="Bottom"
            align="End"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>More Options</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                fill="None"
                onClick={handleOpenMenu}
                ref={triggerRef}
                aria-pressed={!!menuAnchor}
              >
                <Icon size="400" src={Icons.VerticalDots} filled={!!menuAnchor} />
              </IconButton>
            )}
          </TooltipProvider>
          <PopOut
            anchor={menuAnchor}
            position="Bottom"
            align="End"
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
                <RoomMenu room={room} requestClose={() => setMenuAnchor(undefined)} />
              </FocusTrap>
            }
          />
          {/* Header search bar — hidden while search panel is open */}
          {!searchPanelOpen && (
            <div style={{ position: 'relative' }}>
              <form
                onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  const val = headerSearchVal.trim();
                  if (val) {
                    handleSearchClick(val);
                    setHeaderSearchVal('');
                    setShowHeaderFilter(false);
                  }
                }}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                <input
                  ref={headerSearchRef}
                  value={headerSearchVal}
                  onChange={(e) => setHeaderSearchVal(e.target.value)}
                  onFocus={() => setShowHeaderFilter(true)}
                  onBlur={() => setTimeout(() => setShowHeaderFilter(false), 150)}
                  type="text"
                  placeholder="Search…"
                  autoComplete="off"
                  style={{
                    background: 'rgba(128,128,128,0.15)',
                    border: showHeaderFilter ? '1px solid rgba(128,128,128,0.4)' : '1px solid transparent',
                    borderRadius: '16px',
                    padding: '4px 10px 4px 28px',
                    fontSize: '13px',
                    width: '140px',
                    color: 'inherit',
                    outline: 'none',
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2714%27%20height%3D%2714%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%23888%27%20stroke-width%3D%272%27%3E%3Ccircle%20cx%3D%2711%27%20cy%3D%2711%27%20r%3D%278%27/%3E%3Cline%20x1%3D%2721%27%20y1%3D%2721%27%20x2%3D%2716.65%27%20y2%3D%2716.65%27/%3E%3C/svg%3E")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: '8px center',
                    transition: 'border-color 0.15s',
                  }}
                />
              </form>
              {showHeaderFilter && (
                <div
                  style={{
                    position: 'fixed',
                    width: '260px',
                    background: 'var(--oq6d07a, #2a2b2f)',
                    border: '1px solid rgba(128,128,128,0.25)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                    zIndex: 200,
                    overflow: 'hidden',
                  }}
                  ref={(el) => {
                    if (!el || !headerSearchRef.current) return;
                    const rect = headerSearchRef.current.getBoundingClientRect();
                    el.style.left = `${rect.right - 260}px`;
                    el.style.top = `${rect.bottom + 4}px`;
                  }}
                >
                  <div style={{ padding: '6px 12px 2px', fontSize: '10px', fontWeight: 700, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'inherit' }}>
                    Filters — click to add
                  </div>
                  {([
                    { icon: Icons.User,       label: 'From a specific user',             hint: 'from: username',               prefix: 'from:' },
                    { icon: Icons.Attachment, label: 'Includes a specific type of data', hint: 'has: link · image · file', prefix: 'has:' },
                    { icon: Icons.Mention,    label: 'Mentions a specific user',          hint: 'mentions: username',           prefix: 'mentions:' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.prefix}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handleHeaderFilterSelect(opt.prefix); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', textAlign: 'left' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(128,128,128,0.15)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                    >
                      <Icon src={opt.icon} size="200" style={{ opacity: 0.7, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{opt.label}</div>
                        <div style={{ fontSize: '11px', opacity: 0.5 }}>{opt.hint}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Box>
      </Box>
    </PageHeader>
    </>
  );
}
