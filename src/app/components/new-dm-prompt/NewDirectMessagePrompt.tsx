import React, { ChangeEventHandler, useCallback, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  color,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { useNavigate } from 'react-router-dom';
import { ICreateRoomStateEvent, MatrixError, Preset, Visibility } from 'matrix-js-sdk';
import { stopPropagation } from '../../utils/keyboard';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useDirectUsers } from '../../hooks/useDirectUsers';
import { useAsyncSearch, UseAsyncSearchOptions } from '../../hooks/useAsyncSearch';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useAlive } from '../../hooks/useAlive';
import { addRoomIdToMDirect, getDMRoomFor, getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { createRoomEncryptionState } from '../create-room';
import { getDirectRoomPath } from '../../pages/pathUtils';
import { UserAvatar } from '../user-avatar';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { BreakWord } from '../../styles/Text.css';

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  limit: 100,
  matchOptions: {
    contain: true,
  },
};

type KnownUser = {
  userId: string;
  displayName: string;
  avatarMxc?: string;
  isDirect: boolean;
};

const getUserSearchString = (user: KnownUser) => `${user.displayName} ${user.userId}`;

type NewDirectMessagePromptProps = {
  requestClose: () => void;
};

/**
 * Quick "New DM" picker for the sidebar: lists people the client already
 * knows (current DM partners first, then everyone seen in shared rooms),
 * searchable by name or user ID. Clicking a person opens the existing DM or
 * creates an encrypted one. For user IDs not known yet, Add Friend handles
 * the raw-ID flow.
 */
export function NewDirectMessagePrompt({ requestClose }: NewDirectMessagePromptProps) {
  const mx = useMatrixClient();
  const alive = useAlive();
  const navigate = useNavigate();
  const useAuthentication = useMediaAuthentication();
  const directUsers = useDirectUsers();
  const inputRef = useRef<HTMLInputElement>(null);
  const [creatingFor, setCreatingFor] = useState<string>();

  const knownUsers: KnownUser[] = useMemo(() => {
    const myUserId = mx.getUserId();
    const directSet = new Set(directUsers);
    const users = new Map<string, KnownUser>();
    mx.getUsers().forEach((user) => {
      if (user.userId === myUserId) return;
      users.set(user.userId, {
        userId: user.userId,
        displayName: user.displayName || getMxIdLocalPart(user.userId) || user.userId,
        avatarMxc: user.avatarUrl,
        isDirect: directSet.has(user.userId),
      });
    });
    // DM partners may be missing from the user store on a fresh session
    directUsers.forEach((userId) => {
      if (userId === myUserId || users.has(userId)) return;
      users.set(userId, {
        userId,
        displayName: getMxIdLocalPart(userId) ?? userId,
        isDirect: true,
      });
    });
    return Array.from(users.values()).sort((a, b) => {
      if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [mx, directUsers]);

  const [result, search, resetSearch] = useAsyncSearch(
    knownUsers,
    getUserSearchString,
    SEARCH_OPTIONS
  );
  const visibleUsers = result ? result.items : knownUsers;

  const [openState, open] = useAsyncCallback<string, Error | MatrixError, [string]>(
    useCallback(
      async (userId) => {
        const existing = getDMRoomFor(mx, userId);
        if (existing) return existing.roomId;

        const initialState: ICreateRoomStateEvent[] = [createRoomEncryptionState()];
        const createResult = await mx.createRoom({
          is_direct: true,
          invite: [userId],
          visibility: Visibility.Private,
          preset: Preset.TrustedPrivateChat,
          initial_state: initialState,
        });
        addRoomIdToMDirect(mx, createResult.room_id, userId);
        return createResult.room_id;
      },
      [mx]
    )
  );
  const opening = openState.status === AsyncStatus.Loading;

  const handleSelect = (userId: string) => {
    if (opening) return;
    setCreatingFor(userId);
    open(userId).then((roomId) => {
      if (alive()) {
        requestClose();
        navigate(getDirectRoomPath(roomId));
      }
    });
  };

  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const term = evt.currentTarget.value.trim();
    if (term) search(term);
    else resetSearch();
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: () => inputRef.current,
            onDeactivate: requestClose,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">New Direct Message</Text>
              </Box>
              <IconButton size="300" onClick={requestClose} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box
              style={{ padding: config.space.S400, paddingTop: 0, width: toRem(380) }}
              direction="Column"
              gap="300"
            >
              <Input
                ref={inputRef}
                size="400"
                onChange={handleSearchChange}
                placeholder="Search people you know…"
                variant="Background"
                autoComplete="off"
                before={<Icon size="100" src={Icons.Search} />}
              />
              <Scroll size="300" hideTrack style={{ height: toRem(280) }}>
                <Box direction="Column" gap="100" style={{ paddingRight: config.space.S100 }}>
                  {visibleUsers.length === 0 && (
                    <Text size="T300" priority="300" align="Center">
                      No matching people. To message someone new, use Add Friend with their user
                      ID.
                    </Text>
                  )}
                  {visibleUsers.map((user) => {
                    const avatarUrl = user.avatarMxc
                      ? mxcUrlToHttp(mx, user.avatarMxc, useAuthentication, 32, 32, 'crop') ??
                        undefined
                      : undefined;
                    const busy = opening && creatingFor === user.userId;
                    return (
                      <MenuItem
                        key={user.userId}
                        type="button"
                        size="400"
                        variant="Surface"
                        radii="300"
                        onClick={() => handleSelect(user.userId)}
                        disabled={opening}
                        before={
                          <Avatar size="200" radii="Pill">
                            <UserAvatar
                              userId={user.userId}
                              src={avatarUrl}
                              alt={user.displayName}
                              renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                            />
                          </Avatar>
                        }
                        after={
                          busy ? (
                            <Spinner size="100" />
                          ) : (
                            user.isDirect && (
                              <Text size="T200" priority="300">
                                DM
                              </Text>
                            )
                          )
                        }
                      >
                        <Box grow="Yes" direction="Column">
                          <Text size="T300" truncate>
                            <b>{user.displayName}</b>
                          </Text>
                          <Text size="T200" priority="300" truncate>
                            {user.userId}
                          </Text>
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Box>
              </Scroll>
              {openState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: color.Critical.Main }} className={BreakWord}>
                  <b>{openState.error.message}</b>
                </Text>
              )}
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
