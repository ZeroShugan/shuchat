import React, { MouseEventHandler, useState } from 'react';
import { Box, config, Icon, Icons, Menu, PopOut, RectCords, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useNavigate } from 'react-router-dom';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '../../../components/sidebar';
import { stopPropagation } from '../../../utils/keyboard';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { ContainerColor } from '../../../styles/ContainerColor.css';
import {
  encodeSearchParamValueArray,
  getCreatePath,
  getSpacePath,
  withSearchParam,
} from '../../pathUtils';
import { useCreateSelected } from '../../../hooks/router/useCreateSelected';
import { JoinAddressPrompt } from '../../../components/join-address-prompt';
import { CreateFolderPrompt } from '../../../components/add-to-folder-prompt/CreateFolderPrompt';
import { AddFriendPrompt } from '../../../components/add-friend-prompt';
import { NewDirectMessagePrompt } from '../../../components/new-dm-prompt';
import { _RoomSearchParams } from '../../paths';

export function CreateTab() {
  const createSelected = useCreateSelected();

  const navigate = useNavigate();
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [joinAddress, setJoinAddress] = useState(false);
  const [createFolder, setCreateFolder] = useState(false);
  const [addFriend, setAddFriend] = useState(false);
  const [newDm, setNewDm] = useState(false);

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(menuCords ? undefined : evt.currentTarget.getBoundingClientRect());
  };

  const handleCreateSpace = () => {
    navigate(getCreatePath());
    setMenuCords(undefined);
  };

  const handleCreateFolder = () => {
    setCreateFolder(true);
    setMenuCords(undefined);
  };

  const handleJoinWithAddress = () => {
    setJoinAddress(true);
    setMenuCords(undefined);
  };

  const handleAddFriend = () => {
    setAddFriend(true);
    setMenuCords(undefined);
  };

  const handleNewDm = () => {
    setNewDm(true);
    setMenuCords(undefined);
  };

  return (
    <SidebarItem active={createSelected}>
      <SidebarItemTooltip tooltip="Add Space or Room">
        {(triggerRef) => (
          <PopOut
            anchor={menuCords}
            position="Right"
            align="Center"
            content={
              <FocusTrap
                focusTrapOptions={{
                  returnFocusOnDeactivate: false,
                  initialFocus: false,
                  onDeactivate: () => setMenuCords(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) =>
                    evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
                  isKeyBackward: (evt: KeyboardEvent) =>
                    evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Menu>
                  <Box direction="Column">
                    <SequenceCard
                      style={{ padding: config.space.S300 }}
                      variant="Surface"
                      direction="Column"
                      gap="100"
                      radii="0"
                      as="button"
                      type="button"
                      onClick={handleCreateSpace}
                    >
                      <SettingTile before={<Icon size="400" src={Icons.Space} />}>
                        <Text size="H6">Create Space</Text>
                        <Text size="T300" priority="300">
                          Build a space for your community.
                        </Text>
                      </SettingTile>
                    </SequenceCard>
                    <SequenceCard
                      style={{ padding: config.space.S300 }}
                      variant="Surface"
                      direction="Column"
                      gap="100"
                      radii="0"
                      as="button"
                      type="button"
                      onClick={handleJoinWithAddress}
                    >
                      <SettingTile before={<Icon size="400" src={Icons.Link} />}>
                        <Text size="H6">Join with Address</Text>
                        <Text size="T300" priority="300">
                          Join a space or room by address.
                        </Text>
                      </SettingTile>
                    </SequenceCard>
                    <SequenceCard
                      style={{ padding: config.space.S300 }}
                      variant="Surface"
                      direction="Column"
                      gap="100"
                      radii="0"
                      as="button"
                      type="button"
                      onClick={handleCreateFolder}
                    >
                      <SettingTile before={<Icon size="400" src={Icons.Category} />}>
                        <Text size="H6">Create Folder</Text>
                        <Text size="T300" priority="300">
                          Group spaces and rooms into a folder.
                        </Text>
                      </SettingTile>
                    </SequenceCard>
                    <SequenceCard
                      style={{ padding: config.space.S300 }}
                      variant="Surface"
                      direction="Column"
                      gap="100"
                      radii="0"
                      as="button"
                      type="button"
                      onClick={handleNewDm}
                    >
                      <SettingTile before={<Icon size="400" src={Icons.Mention} />}>
                        <Text size="H6">New Direct Message</Text>
                        <Text size="T300" priority="300">
                          Pick someone you know and start chatting.
                        </Text>
                      </SettingTile>
                    </SequenceCard>
                    <SequenceCard
                      style={{ padding: config.space.S300 }}
                      variant="Surface"
                      direction="Column"
                      gap="100"
                      radii="0"
                      as="button"
                      type="button"
                      onClick={handleAddFriend}
                    >
                      <SettingTile before={<Icon size="400" src={Icons.User} />}>
                        <Text size="H6">Add Friend</Text>
                        <Text size="T300" priority="300">
                          Start a direct chat with someone by their user ID.
                        </Text>
                      </SettingTile>
                    </SequenceCard>
                  </Box>
                </Menu>
              </FocusTrap>
            }
          >
            <SidebarAvatar
              className={menuCords ? ContainerColor({ variant: 'Surface' }) : undefined}
              as="button"
              ref={triggerRef}
              outlined
              onClick={handleMenu}
            >
              <Icon src={Icons.Plus} />
            </SidebarAvatar>
            {joinAddress && (
              <JoinAddressPrompt
                onCancel={() => setJoinAddress(false)}
                onOpen={(roomIdOrAlias, viaServers) => {
                  setJoinAddress(false);
                  const path = getSpacePath(roomIdOrAlias);
                  navigate(
                    viaServers
                      ? withSearchParam<_RoomSearchParams>(path, {
                          viaServers: encodeSearchParamValueArray(viaServers),
                        })
                      : path
                  );
                }}
              />
            )}
            {createFolder && (
              <CreateFolderPrompt
                onDone={() => setCreateFolder(false)}
                onCancel={() => setCreateFolder(false)}
              />
            )}
            {addFriend && <AddFriendPrompt onCancel={() => setAddFriend(false)} />}
            {newDm && <NewDirectMessagePrompt requestClose={() => setNewDm(false)} />}
          </PopOut>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
