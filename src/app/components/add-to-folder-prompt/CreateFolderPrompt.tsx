import React, { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  config,
} from 'folds';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useOrphanSpaces } from '../../state/hooks/roomList';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import {
  ISidebarFolder,
  makeCinnySpacesContent,
  useSidebarItems,
} from '../../hooks/useSidebarItems';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { randomStr } from '../../utils/common';
import { stopPropagation } from '../../utils/keyboard';

type CreateFolderPromptProps = {
  onDone: () => void;
  onCancel: () => void;
};

export function CreateFolderPrompt({ onDone, onCancel }: CreateFolderPromptProps) {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const orphanSpaces = useOrphanSpaces(mx, allRoomsAtom, roomToParents);
  const [sidebarItems] = useSidebarItems(orphanSpaces);
  const [folderName, setFolderName] = useState('');

  const handleCreate = () => {
    const name = folderName.trim() || 'New Folder';
    const newFolder: ISidebarFolder = { id: randomStr(), name, content: [] };
    const newItems = [...sidebarItems, newFolder];
    const newContent = makeCinnySpacesContent(mx, newItems);
    mx.setAccountData(AccountDataEvent.CinnySpaces, newContent);
    onDone();
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" style={{ maxWidth: '320px', width: '100%' }}>
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Create Folder</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S300 }} direction="Column" gap="300">
              <Text priority="400" size="T300">
                Create an empty folder to organize your spaces and rooms.
                You can drag items into it afterward.
              </Text>
              <Input
                variant="Background"
                size="400"
                placeholder="Folder name"
                value={folderName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFolderName(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                autoFocus
              />
              <Box direction="Row" gap="200">
                <Button
                  variant="Secondary"
                  fill="None"
                  size="300"
                  radii="300"
                  onClick={onCancel}
                  style={{ flex: 1 }}
                >
                  <Text size="B300">Cancel</Text>
                </Button>
                <Button
                  variant="Primary"
                  fill="Solid"
                  size="300"
                  radii="300"
                  onClick={handleCreate}
                  style={{ flex: 1 }}
                >
                  <Text size="B300">Create</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
