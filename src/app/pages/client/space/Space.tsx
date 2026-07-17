import React, {
  MouseEventHandler,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtom, useAtomValue } from 'jotai';
import {
  Avatar,
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { JoinRule, Room } from 'matrix-js-sdk';
import { RoomJoinRulesEventContent } from 'matrix-js-sdk/lib/types';
import FocusTrap from 'focus-trap-react';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { mDirectAtom } from '../../../state/mDirectList';
import {
  NavCategory,
  NavCategoryHeader,
  NavItem,
  NavItemContent,
  NavLink,
} from '../../../components/nav';
import { getSpaceLobbyPath, getSpaceRoomPath, getSpaceSearchPath, getHomePath, getHomeRoomPath } from '../../pathUtils';
import { getCanonicalAliasOrRoomId, isRoomAlias, rateLimitedActions } from '../../../utils/matrix';
import { useSelectedRoom } from '../../../hooks/router/useSelectedRoom';
import {
  useSpaceLobbySelected,
  useSpaceSearchSelected,
} from '../../../hooks/router/useSelectedSpace';
import { useSpace } from '../../../hooks/useSpace';
import { VirtualTile } from '../../../components/virtualizer';
import { RoomNavCategoryButton, RoomNavItem } from '../../../features/room-nav';
import { makeNavCategoryId } from '../../../state/closedNavCategories';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import { useCategoryHandler } from '../../../hooks/useCategoryHandler';
import { useNavToActivePathMapper } from '../../../hooks/useNavToActivePathMapper';
import { useRoomName } from '../../../hooks/useRoomMeta';
import { HierarchyItem, useSpaceJoinedHierarchy } from '../../../hooks/useSpaceHierarchy';
import {
  AUTO_CHAT_CATEGORY,
  AUTO_VOICE_CATEGORY,
  SPACE_CATEGORIES_STATE,
  SpaceCategory,
  useSpaceCategories,
  useSpaceCategoryActions,
} from '../../../hooks/useSpaceCategories';
import {
  CategoryDragData,
  CategoryDropData,
  CategoryNameDialog,
  DraggableRoomRow,
  NewCategoryDropZone,
  SpaceCategoryHeader,
  useCategoryDropMonitor,
} from '../../../components/space-categories/SpaceCategoriesUI';
import { ASCIILexicalTable, orderKeys } from '../../../utils/ASCIILexicalTable';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { PageNav, PageNavContent, PageNavHeader } from '../../../components/page';
import { UserPanel } from '../../../components/user-panel/UserPanel';
import { VoiceStatusBar } from '../../../components/voice-status-bar/VoiceStatusBar';
import { OwnProfileColumn } from '../../../components/own-profile-column/OwnProfileColumn';
import { usePowerLevels } from '../../../hooks/usePowerLevels';
import { useRecursiveChildScopeFactory, useSpaceChildren } from '../../../state/hooks/roomList';
import { roomToParentsAtom } from '../../../state/room/roomToParents';
import { markAsRead } from '../../../utils/notifications';
import { useRoomsUnread } from '../../../state/hooks/unread';
import { UseStateProvider } from '../../../components/UseStateProvider';
import { LeaveSpacePrompt } from '../../../components/leave-space-prompt';
import { copyToClipboard } from '../../../utils/dom';
import { useClosedNavCategoriesAtom } from '../../../state/hooks/closedNavCategories';
import { useStateEvent } from '../../../hooks/useStateEvent';
import { Membership, StateEvent } from '../../../../types/matrix/room';
import { stopPropagation } from '../../../utils/keyboard';
import { getMatrixToRoom } from '../../../plugins/matrix-to';
import { getViaServers } from '../../../plugins/via-servers';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '../../../hooks/useRoomsNotificationPreferences';
import { useOpenSpaceSettings } from '../../../state/hooks/spaceSettings';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { useRoomCreators } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { ContainerColor } from '../../../styles/ContainerColor.css';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { BreakWord } from '../../../styles/Text.css';
import { InviteUserPrompt } from '../../../components/invite-user-prompt';
import { useCallEmbed } from '../../../hooks/useCallEmbed';
import { AddToFolderPrompt } from '../../../components/add-to-folder-prompt/AddToFolderPrompt';
import { useOpenCreateRoomModal } from '../../../state/hooks/createRoomModal';
import { CreateRoomType } from '../../../components/create-room/types';

// One row of the space's left-nav list: a sub-space header, a category
// header (custom or automatic CHAT/VOICE bucket), or a room.
type SpaceListEntry =
  | { kind: 'space'; item: HierarchyItem }
  | { kind: 'category'; catId: string; name: string; custom?: SpaceCategory; auto?: 'chat' | 'voice' }
  | { kind: 'room'; item: HierarchyItem; catId: string };

type SpaceMenuProps = {
  room: Room;
  requestClose: () => void;
};
const SpaceMenu = forwardRef<HTMLDivElement, SpaceMenuProps>(({ room, requestClose }, ref) => {
  const mx = useMatrixClient();
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const [developerTools] = useSetting(settingsAtom, 'developerTools');
  const roomToParents = useAtomValue(roomToParentsAtom);
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canInvite = permissions.action('invite', mx.getSafeUserId());
  const openSpaceSettings = useOpenSpaceSettings();
  const { navigateRoom } = useRoomNavigate();

  const [invitePrompt, setInvitePrompt] = useState(false);

  const allChild = useSpaceChildren(
    allRoomsAtom,
    room.roomId,
    useRecursiveChildScopeFactory(mx, roomToParents)
  );
  const unread = useRoomsUnread(allChild, roomToUnreadAtom);

  const handleMarkAsRead = () => {
    allChild.forEach((childRoomId) => markAsRead(mx, childRoomId, hideActivity));
    requestClose();
  };

  const handleCopyLink = () => {
    const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
    const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
    copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
    requestClose();
  };

  const handleInvite = () => {
    setInvitePrompt(true);
  };

  const handleRoomSettings = () => {
    openSpaceSettings(room.roomId);
    requestClose();
  };

  const handleOpenTimeline = () => {
    navigateRoom(room.roomId);
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {invitePrompt && room && (
          <InviteUserPrompt
            room={room}
            requestClose={() => {
              setInvitePrompt(false);
              requestClose();
            }}
          />
        )}
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
          onClick={handleRoomSettings}
          size="300"
          after={<Icon size="100" src={Icons.Setting} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Space Settings
          </Text>
        </MenuItem>
        {developerTools && (
          <MenuItem
            onClick={handleOpenTimeline}
            size="300"
            after={<Icon size="100" src={Icons.Terminal} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Event Timeline
            </Text>
          </MenuItem>
        )}
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
                  Leave Space
                </Text>
              </MenuItem>
              {promptLeave && (
                <LeaveSpacePrompt
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

function SpaceHeader() {
  const space = useSpace();
  const spaceName = useRoomName(space);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const joinRules = useStateEvent(
    space,
    StateEvent.RoomJoinRules
  )?.getContent<RoomJoinRulesEventContent>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };

  return (
    <>
      <PageNavHeader>
        <Box alignItems="Center" grow="Yes" gap="300">
          <Box grow="Yes" alignItems="Center" gap="100">
            <Text size="H4" truncate>
              {spaceName}
            </Text>
            {joinRules?.join_rule !== JoinRule.Public && <Icon src={Icons.Lock} size="50" />}
          </Box>
          <Box shrink="No">
            <IconButton aria-pressed={!!menuAnchor} variant="Background" onClick={handleOpenMenu}>
              <Icon src={Icons.VerticalDots} size="200" />
            </IconButton>
          </Box>
        </Box>
      </PageNavHeader>
      {menuAnchor && (
        <PopOut
          anchor={menuAnchor}
          position="Bottom"
          align="End"
          offset={6}
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
              <SpaceMenu room={space} requestClose={() => setMenuAnchor(undefined)} />
            </FocusTrap>
          }
        />
      )}
    </>
  );
}

type SpaceTombstoneProps = { roomId: string; replacementRoomId: string };
export function SpaceTombstone({ roomId, replacementRoomId }: SpaceTombstoneProps) {
  const mx = useMatrixClient();
  const { navigateSpace } = useRoomNavigate();

  const [joinState, handleJoin] = useAsyncCallback(
    useCallback(() => {
      const currentRoom = mx.getRoom(roomId);
      const via = currentRoom ? getViaServers(currentRoom) : [];
      return mx.joinRoom(replacementRoomId, {
        viaServers: via,
      });
    }, [mx, roomId, replacementRoomId])
  );
  const replacementRoom = mx.getRoom(replacementRoomId);

  const handleOpen = () => {
    if (replacementRoom) navigateSpace(replacementRoom.roomId);
    if (joinState.status === AsyncStatus.Success) navigateSpace(joinState.data.roomId);
  };

  return (
    <Box
      style={{
        padding: config.space.S200,
        borderRadius: config.radii.R400,
        borderWidth: config.borderWidth.B300,
      }}
      className={ContainerColor({ variant: 'Surface' })}
      direction="Column"
      gap="300"
    >
      <Box direction="Column" grow="Yes" gap="100">
        <Text size="L400">Space Upgraded</Text>
        <Text size="T200">This space has been replaced and is no longer active.</Text>
        {joinState.status === AsyncStatus.Error && (
          <Text className={BreakWord} style={{ color: color.Critical.Main }} size="T200">
            {(joinState.error as any)?.message ?? 'Failed to join replacement space!'}
          </Text>
        )}
      </Box>
      <Box direction="Column" shrink="No">
        {replacementRoom?.getMyMembership() === Membership.Join ||
        joinState.status === AsyncStatus.Success ? (
          <Button onClick={handleOpen} size="300" variant="Success" fill="Solid" radii="300">
            <Text size="B300">Open New Space</Text>
          </Button>
        ) : (
          <Button
            onClick={handleJoin}
            size="300"
            variant="Primary"
            fill="Solid"
            radii="300"
            before={
              joinState.status === AsyncStatus.Loading && (
                <Spinner size="100" variant="Primary" fill="Solid" />
              )
            }
            disabled={joinState.status === AsyncStatus.Loading}
          >
            <Text size="B300">Join New Space</Text>
          </Button>
        )}
      </Box>
    </Box>
  );
}

type NotASpaceViewProps = { room: Room };
function NotASpaceView({ room }: NotASpaceViewProps) {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const [addToFolder, setAddToFolder] = useState(false);

  const handleGoToRoom = () => {
    const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
    navigate(getHomeRoomPath(roomIdOrAlias));
  };

  return (
    <OwnProfileColumn>
    <PageNav>
      <PageNavHeader>
        <Box alignItems="Center" grow="Yes" gap="300">
          <Box grow="Yes">
            <Text size="H4" truncate>{room.name}</Text>
          </Box>
        </Box>
      </PageNavHeader>
      <PageNavContent>
        <Box
          direction="Column"
          gap="400"
          style={{ padding: config.space.S400 }}
        >
          <Box direction="Column" gap="200">
            <Text size="H5">This is a chat room, not a space</Text>
            <Text size="T300" priority="300">
              You joined via "Add Space", but <b>{room.name}</b> is a regular chat room.
              You can pin it to your sidebar or just open it directly.
            </Text>
          </Box>
          <Box direction="Column" gap="200">
            <Button
              variant="Primary"
              fill="Solid"
              size="300"
              radii="300"
              onClick={handleGoToRoom}
              before={<Icon size="100" src={Icons.ArrowGoRight} />}
            >
              <Text size="B300">Open Room</Text>
            </Button>
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              onClick={() => setAddToFolder(true)}
              before={<Icon size="100" src={Icons.Category} />}
            >
              <Text size="B300">Add to Sidebar</Text>
            </Button>
            <UseStateProvider initial={false}>
              {(promptLeave, setPromptLeave) => (
                <>
                  <Button
                    variant="Critical"
                    fill="None"
                    size="300"
                    radii="300"
                    onClick={() => setPromptLeave(true)}
                    before={<Icon size="100" src={Icons.ArrowGoLeft} />}
                  >
                    <Text size="B300">Leave Room</Text>
                  </Button>
                  {promptLeave && (
                    <LeaveSpacePrompt
                      roomId={room.roomId}
                      onDone={() => navigate(getHomePath())}
                      onCancel={() => setPromptLeave(false)}
                    />
                  )}
                </>
              )}
            </UseStateProvider>
          </Box>
        </Box>
        {addToFolder && (
          <AddToFolderPrompt
            roomId={room.roomId}
            onDone={() => { setAddToFolder(false); handleGoToRoom(); }}
            onCancel={() => setAddToFolder(false)}
          />
        )}
      </PageNavContent>
      <VoiceStatusBar />
      <UserPanel />
    </PageNav>
    </OwnProfileColumn>
  );
}

export function Space() {
  const mx = useMatrixClient();
  const space = useSpace();
  useNavToActivePathMapper(space.roomId);

  // If this is a regular room (not a space), show a warning/option view
  if (!space.isSpaceRoom()) {
    return <NotASpaceView room={space} />;
  }

  const spaceIdOrAlias = getCanonicalAliasOrRoomId(mx, space.roomId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mDirects = useAtomValue(mDirectAtom);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const allRooms = useAtomValue(allRoomsAtom);
  const allJoinedRooms = useMemo(() => new Set(allRooms), [allRooms]);
  const notificationPreferences = useRoomsNotificationPreferencesContext();

  const tombstoneEvent = useStateEvent(space, StateEvent.RoomTombstone);
  const selectedRoomId = useSelectedRoom();
  const lobbySelected = useSpaceLobbySelected(spaceIdOrAlias);
  const searchSelected = useSpaceSearchSelected(spaceIdOrAlias);
  const callEmbed = useCallEmbed();

  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());

  // ---- Space categories (custom + automatic CHAT/VOICE buckets) ----
  const spacePowerLevels = usePowerLevels(space);
  const spaceCreators = useRoomCreators(space);
  const spacePermissions = useRoomPermissions(spaceCreators, spacePowerLevels);
  const canManageCategories = spacePermissions.stateEvent(
    SPACE_CATEGORIES_STATE,
    mx.getSafeUserId()
  );
  const canReorderChildren = spacePermissions.stateEvent(
    StateEvent.SpaceChild,
    mx.getSafeUserId()
  );
  const categories = useSpaceCategories(space);
  const catActions = useSpaceCategoryActions(space, categories);
  const lex = useMemo(() => new ASCIILexicalTable(' '.charCodeAt(0), '~'.charCodeAt(0), 6), []);
  const [draggingRoom, setDraggingRoom] = useState<CategoryDragData | undefined>();

  const getRoom = useCallback(
    (rId: string): Room | undefined => {
      if (allJoinedRooms.has(rId)) {
        return mx.getRoom(rId) ?? undefined;
      }
      return undefined;
    },
    [mx, allJoinedRooms]
  );

  const hierarchy = useSpaceJoinedHierarchy(
    space.roomId,
    getRoom,
    useCallback(
      (parentId, roomId) => {
        // Root-space children are grouped into categories below — collapsing
        // is handled per category there, never at the hierarchy level.
        if (parentId === space.roomId) return false;
        if (!closedCategories.has(makeNavCategoryId(space.roomId, parentId))) {
          return false;
        }
        const showRoomAnyway =
          roomToUnread.has(roomId) || roomId === selectedRoomId || callEmbed?.roomId === roomId;
        return !showRoomAnyway;
      },
      [space.roomId, closedCategories, roomToUnread, selectedRoomId, callEmbed]
    ),
    useCallback(
      (sId) => closedCategories.has(makeNavCategoryId(space.roomId, sId)),
      [closedCategories, space.roomId]
    )
  );

  // Build the flat render list: custom categories first (state-event order),
  // then the automatic CHAT ROOMS / VOICE ROOMS buckets, then sub-space
  // sections unchanged.
  const { entries, catOf, rootRooms } = useMemo(() => {
    const rootItems: HierarchyItem[] = [];
    const rest: HierarchyItem[] = [];
    hierarchy.forEach((item) => {
      if ('space' in item && item.roomId === space.roomId) return; // drop the old "Rooms" header
      if (!('space' in item) && item.parentId === space.roomId) rootItems.push(item);
      else rest.push(item);
    });

    // first category listing a room wins (guards against corrupt duplicates)
    const catMap = new Map<string, string>();
    categories.forEach((c) =>
      c.rooms.forEach((rId) => {
        if (!catMap.has(rId)) catMap.set(rId, c.id);
      })
    );

    const out: SpaceListEntry[] = [];
    const pushCategory = (
      catId: string,
      name: string,
      rooms: HierarchyItem[],
      custom?: SpaceCategory,
      auto?: 'chat' | 'voice'
    ) => {
      out.push({ kind: 'category', catId, name, custom, auto });
      const closed = closedCategories.has(makeNavCategoryId(space.roomId, catId));
      rooms.forEach((item) => {
        if (closed) {
          const showAnyway =
            roomToUnread.has(item.roomId) ||
            item.roomId === selectedRoomId ||
            callEmbed?.roomId === item.roomId;
          if (!showAnyway) return;
        }
        out.push({ kind: 'room', item, catId });
      });
    };

    categories.forEach((cat) => {
      const catRooms = cat.rooms
        .filter((rId) => catMap.get(rId) === cat.id)
        .map((rId) => rootItems.find((i) => i.roomId === rId))
        .filter((i): i is HierarchyItem => !!i);
      pushCategory(cat.id, cat.name, catRooms, cat);
    });

    const leftovers = rootItems.filter((i) => !catMap.has(i.roomId));
    const chatRooms = leftovers.filter((i) => !getRoom(i.roomId)?.isCallRoom());
    const voiceRooms = leftovers.filter((i) => !!getRoom(i.roomId)?.isCallRoom());
    // Admins always see both buckets (their "+" menu is the create-room entry
    // point); others only see non-empty ones. While dragging, empty buckets
    // appear so a room can be dragged back out of a custom category.
    const showEmpty = canManageCategories || !!draggingRoom;
    if (chatRooms.length > 0 || showEmpty) {
      pushCategory(AUTO_CHAT_CATEGORY, 'CHAT ROOMS', chatRooms, undefined, 'chat');
    }
    if (voiceRooms.length > 0 || showEmpty) {
      pushCategory(AUTO_VOICE_CATEGORY, 'VOICE ROOMS', voiceRooms, undefined, 'voice');
    }

    rest.forEach((item) => {
      if ('space' in item) out.push({ kind: 'space', item });
      else out.push({ kind: 'room', item, catId: `sub|${item.parentId}` });
    });

    return { entries: out, catOf: catMap, rootRooms: rootItems };
  }, [
    hierarchy,
    categories,
    closedCategories,
    space.roomId,
    roomToUnread,
    selectedRoomId,
    callEmbed,
    getRoom,
    draggingRoom,
    canManageCategories,
  ]);

  const canDropOnCategory = useCallback(
    (drag: CategoryDragData, drop: CategoryDropData): boolean => {
      if (drop.shuTarget === 'new-cat') return canManageCategories;
      const targetCat = drop.catId;
      const isAuto = targetCat === AUTO_CHAT_CATEGORY || targetCat === AUTO_VOICE_CATEGORY;
      if (!isAuto) return canManageCategories;
      const room = getRoom(drag.roomId);
      const isVoice = !!room?.isCallRoom();
      // room type must match its automatic bucket
      if (targetCat === AUTO_CHAT_CATEGORY && isVoice) return false;
      if (targetCat === AUTO_VOICE_CATEGORY && !isVoice) return false;
      if (catOf.has(drag.roomId)) return canManageCategories;
      return canReorderChildren;
    },
    [canManageCategories, canReorderChildren, catOf, getRoom]
  );

  // Reorder a direct child of the space by rewriting m.space.child `order`
  // keys (native Matrix ordering — other clients see the same order).
  const reorderRootChild = useCallback(
    async (roomId: string, afterRoomId: string | undefined) => {
      const moving = rootRooms.find((i) => i.roomId === roomId);
      if (!moving) return;
      const items = rootRooms.filter((i) => i.roomId !== roomId);
      const afterIndex = afterRoomId ? items.findIndex((i) => i.roomId === afterRoomId) : -1;
      items.splice(afterIndex + 1, 0, {
        ...moving,
        content: { ...moving.content, order: undefined },
      });
      const currentOrders = items.map((i) =>
        typeof i.content.order === 'string' && lex.has(i.content.order)
          ? i.content.order
          : undefined
      );
      const newOrders = orderKeys(lex, currentOrders);
      if (!newOrders) return;
      const reorders = newOrders
        .map((orderKey, index) => ({ item: items[index], orderKey }))
        .filter((r, index) => r.item && r.orderKey !== currentOrders[index]);
      await rateLimitedActions(reorders, async (r) => {
        await mx.sendStateEvent(
          space.roomId,
          StateEvent.SpaceChild as any,
          { ...r.item.content, order: r.orderKey },
          r.item.roomId
        );
      });
    },
    [rootRooms, lex, mx, space.roomId]
  );

  const handleCategoryDrop = useCallback(
    async (drag: CategoryDragData, drop: CategoryDropData) => {
      try {
        if (!canDropOnCategory(drag, drop)) return;
        if (drop.shuTarget === 'new-cat') {
          await catActions.createWithRoom(drag.roomId);
          return;
        }
        const targetCat = drop.catId;
        const isAuto = targetCat === AUTO_CHAT_CATEGORY || targetCat === AUTO_VOICE_CATEGORY;
        if (!isAuto) {
          await catActions.moveRoom(
            drag.roomId,
            targetCat,
            drop.shuTarget === 'after' ? drop.afterRoomId : undefined
          );
          return;
        }
        // back to an automatic bucket: leave the custom category (if any)…
        if (catOf.has(drag.roomId)) await catActions.moveRoom(drag.roomId, undefined);
        // …then place it within the bucket via m.space.child order
        if (!canReorderChildren) return;
        let afterRoomId = drop.shuTarget === 'after' ? drop.afterRoomId : undefined;
        if (drop.shuTarget === 'cat') {
          const wantVoice = targetCat === AUTO_VOICE_CATEGORY;
          const bucket = rootRooms.filter(
            (i) =>
              i.roomId !== drag.roomId &&
              !catOf.has(i.roomId) &&
              !!getRoom(i.roomId)?.isCallRoom() === wantVoice
          );
          afterRoomId = bucket[bucket.length - 1]?.roomId;
          if (!afterRoomId) return; // empty bucket — membership change was enough
        }
        await reorderRootChild(drag.roomId, afterRoomId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('shuchat: category drop failed', e);
      }
    },
    [canDropOnCategory, catActions, catOf, canReorderChildren, rootRooms, getRoom, reorderRootChild]
  );

  useCategoryDropMonitor(scrollRef, setDraggingRoom, handleCategoryDrop);

  // ---- "+" menu: create rooms / categories ----
  const openCreateRoomModal = useOpenCreateRoomModal();
  // When a room is created from a CUSTOM category's "+" menu, remember it so
  // the next new child of this space is auto-assigned to that category.
  const pendingAssignRef = useRef<{ catId: string; existing: Set<string>; ts: number } | null>(
    null
  );
  const handleCreateRoomIn = useCallback(
    (catId: string | undefined, kind: 'chat' | 'voice') => {
      if (catId) {
        pendingAssignRef.current = {
          catId,
          existing: new Set(rootRooms.map((i) => i.roomId)),
          ts: Date.now(),
        };
      } else {
        pendingAssignRef.current = null;
      }
      openCreateRoomModal(
        space.roomId,
        kind === 'voice' ? CreateRoomType.VoiceRoom : CreateRoomType.TextRoom
      );
    },
    [openCreateRoomModal, space.roomId, rootRooms]
  );
  useEffect(() => {
    const pending = pendingAssignRef.current;
    if (!pending) return;
    if (Date.now() - pending.ts > 5 * 60_000) {
      pendingAssignRef.current = null;
      return;
    }
    const added = rootRooms.find((i) => !pending.existing.has(i.roomId));
    if (added) {
      pendingAssignRef.current = null;
      catActions.moveRoom(added.roomId, pending.catId).catch(() => {});
    }
  }, [rootRooms, catActions]);

  // Name dialog for create/rename (window.prompt doesn't exist in Electron).
  const [nameDialog, setNameDialog] = useState<{
    title: string;
    initial: string;
    submitLabel: string;
    onSubmit: (name: string) => void;
  }>();

  const handleCreateCategory = useCallback(() => {
    setNameDialog({
      title: 'New Category',
      initial: '',
      submitLabel: 'Create',
      onSubmit: (name) => {
        setNameDialog(undefined);
        catActions.create(name).catch(() => {});
      },
    });
  }, [catActions]);

  const handleRenameCategory = useCallback(
    (cat: SpaceCategory) => {
      setNameDialog({
        title: 'Rename Category',
        initial: cat.name,
        submitLabel: 'Rename',
        onSubmit: (name) => {
          setNameDialog(undefined);
          catActions.rename(cat.id, name).catch(() => {});
        },
      });
    },
    [catActions]
  );
  const handleDeleteCategory = useCallback(
    (cat: SpaceCategory) => {
      // eslint-disable-next-line no-alert
      if (
        window.confirm(
          `Delete category "${cat.name}"? Its rooms go back to the automatic CHAT/VOICE sections.`
        )
      ) {
        catActions.remove(cat.id);
      }
    },
    [catActions]
  );

  // Rooms offered in a category header's "+" menu.
  const getAddCandidates = useCallback(
    (entry: Extract<SpaceListEntry, { kind: 'category' }>) => {
      let items: HierarchyItem[];
      if (entry.custom) {
        items = rootRooms.filter((i) => catOf.get(i.roomId) !== entry.catId);
      } else {
        const wantVoice = entry.catId === AUTO_VOICE_CATEGORY;
        items = rootRooms.filter(
          (i) => catOf.has(i.roomId) && !!getRoom(i.roomId)?.isCallRoom() === wantVoice
        );
      }
      return items.map((i) => ({
        roomId: i.roomId,
        name: mx.getRoom(i.roomId)?.name ?? i.roomId,
      }));
    },
    [rootRooms, catOf, getRoom, mx]
  );

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 0,
    overscan: 10,
  });

  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  const getToLink = (roomId: string) =>
    getSpaceRoomPath(spaceIdOrAlias, getCanonicalAliasOrRoomId(mx, roomId));

  return (
    <OwnProfileColumn>
    <PageNav>
      <SpaceHeader />
      <PageNavContent scrollRef={scrollRef}>
        <Box direction="Column" gap="300">
          {tombstoneEvent && (
            <SpaceTombstone
              roomId={space.roomId}
              replacementRoomId={tombstoneEvent.getContent().replacement_room}
            />
          )}
          <NavCategory>
            <NavItem variant="Background" radii="400" aria-selected={lobbySelected}>
              <NavLink to={getSpaceLobbyPath(getCanonicalAliasOrRoomId(mx, space.roomId))}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.Flag} size="100" filled={lobbySelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        Lobby
                      </Text>
                    </Box>
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
            <NavItem variant="Background" radii="400" aria-selected={searchSelected}>
              <NavLink to={getSpaceSearchPath(getCanonicalAliasOrRoomId(mx, space.roomId))}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.Search} size="100" filled={searchSelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        Message Search
                      </Text>
                    </Box>
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
          </NavCategory>
          <NavCategory
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const entry = entries[vItem.index];
              if (!entry) return null;

              if (entry.kind === 'space') {
                const { roomId } = entry.item;
                const room = mx.getRoom(roomId);
                const categoryId = makeNavCategoryId(space.roomId, roomId);

                return (
                  <VirtualTile
                    virtualItem={vItem}
                    key={vItem.index}
                    ref={virtualizer.measureElement}
                  >
                    <div style={{ paddingTop: vItem.index === 0 ? undefined : config.space.S400 }}>
                      <NavCategoryHeader>
                        <RoomNavCategoryButton
                          data-category-id={categoryId}
                          onClick={handleCategoryClick}
                          closed={closedCategories.has(categoryId)}
                        >
                          {room?.name}
                        </RoomNavCategoryButton>
                      </NavCategoryHeader>
                    </div>
                  </VirtualTile>
                );
              }

              if (entry.kind === 'category') {
                const navId = makeNavCategoryId(space.roomId, entry.catId);
                return (
                  <VirtualTile
                    virtualItem={vItem}
                    key={vItem.index}
                    ref={virtualizer.measureElement}
                  >
                    <div style={{ paddingTop: vItem.index === 0 ? undefined : config.space.S400 }}>
                      <SpaceCategoryHeader
                        navCategoryId={navId}
                        name={entry.name}
                        closed={closedCategories.has(navId)}
                        onToggle={handleCategoryClick}
                        canManage={canManageCategories}
                        custom={!!entry.custom}
                        autoKind={entry.auto}
                        addCandidates={getAddCandidates(entry)}
                        onAdd={(rId) =>
                          entry.custom
                            ? catActions.moveRoom(rId, entry.catId)
                            : catActions.moveRoom(rId, undefined)
                        }
                        onCreateRoom={(kind) =>
                          handleCreateRoomIn(entry.custom ? entry.catId : undefined, kind)
                        }
                        onCreateCategory={handleCreateCategory}
                        onRename={
                          entry.custom ? () => handleRenameCategory(entry.custom!) : undefined
                        }
                        onDelete={
                          entry.custom ? () => handleDeleteCategory(entry.custom!) : undefined
                        }
                        dndCatId={entry.catId}
                        canDrop={canDropOnCategory}
                      />
                    </div>
                  </VirtualTile>
                );
              }

              const { item, catId } = entry;
              const { roomId } = item;
              const room = mx.getRoom(roomId);
              if (!room) return null;
              const isRootRoom = !('space' in item) && item.parentId === space.roomId;

              const navItem = (
                <RoomNavItem
                  room={room}
                  selected={selectedRoomId === roomId}
                  showAvatar={mDirects.has(roomId)}
                  direct={mDirects.has(roomId)}
                  linkPath={getToLink(roomId)}
                  notificationMode={getRoomNotificationMode(notificationPreferences, room.roomId)}
                />
              );

              return (
                <VirtualTile virtualItem={vItem} key={vItem.index} ref={virtualizer.measureElement}>
                  {isRootRoom && (canManageCategories || canReorderChildren) ? (
                    <DraggableRoomRow
                      roomId={roomId}
                      catId={catId}
                      canDrag
                      draggingActive={!!draggingRoom}
                      canDrop={canDropOnCategory}
                      onDragging={setDraggingRoom}
                    >
                      {navItem}
                    </DraggableRoomRow>
                  ) : (
                    navItem
                  )}
                </VirtualTile>
              );
            })}
          </NavCategory>
          {draggingRoom && canManageCategories && (
            <NewCategoryDropZone canDrop={canDropOnCategory} />
          )}
          {nameDialog && (
            <CategoryNameDialog
              title={nameDialog.title}
              initial={nameDialog.initial}
              submitLabel={nameDialog.submitLabel}
              onSubmit={nameDialog.onSubmit}
              onCancel={() => setNameDialog(undefined)}
            />
          )}
        </Box>
      </PageNavContent>
      <VoiceStatusBar />
      <UserPanel />
    </PageNav>
    </OwnProfileColumn>
  );
}
