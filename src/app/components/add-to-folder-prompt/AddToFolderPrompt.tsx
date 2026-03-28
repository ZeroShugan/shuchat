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
  sidebarItemWithout,
  useSidebarItems,
} from '../../hooks/useSidebarItems';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { randomStr } from '../../utils/common';
import { stopPropagation } from '../../utils/keyboard';

type AddToFolderPromptProps = {
  roomId: string;
  onDone: () => void;
  onCancel: () => void;
};

export function AddToFolderPrompt({ roomId, onDone, onCancel }: AddToFolderPromptProps) {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const orphanSpaces = useOrphanSpaces(mx, allRoomsAtom, roomToParents);
  const [sidebarItems] = useSidebarItems(orphanSpaces);
  const [newFolderName, setNewFolderName] = useState('');
  const [view, setView] = useState<'pick' | 'new'>('pick');

  const existingFolders = sidebarItems.filter(
    (item): item is ISidebarFolder => typeof item === 'object'
  );

  const save = (newItems: typeof sidebarItems) => {
    const newContent = makeCinnySpacesContent(mx, newItems);
    mx.setAccountData(AccountDataEvent.CinnySpaces, newContent);
    onDone();
  };

  const addDirectly = () => {
    const newItems = sidebarItemWithout(sidebarItems, roomId);
    newItems.push(roomId);
    save(newItems);
  };

  const addToFolder = (folder: ISidebarFolder) => {
    const newItems = sidebarItemWithout(sidebarItems, roomId);
    const folderIdx = newItems.findIndex(
      (i): i is ISidebarFolder => typeof i === 'object' && i.id === folder.id
    );
    if (folderIdx >= 0) {
      const f = newItems[folderIdx] as ISidebarFolder;
      newItems[folderIdx] = { ...f, content: [...f.content, roomId] };
    } else {
      newItems.push({ ...folder, content: [...folder.content, roomId] });
    }
    save(newItems);
  };

  const createNewFolder = () => {
    const name = newFolderName.trim() || 'New Folder';
    const newItems = sidebarItemWithout(sidebarItems, roomId);
    const newFolder: ISidebarFolder = { id: randomStr(), name, content: [roomId] };
    newItems.push(newFolder);
    save(newItems);
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
                <Text size="H4">
                  {view === 'pick' ? 'Add to Sidebar' : 'New Folder'}
                </Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>

            <Box style={{ padding: config.space.S300 }} direction="Column" gap="300">
              {view === 'pick' ? (
                <>
                  <Text priority="400" size="T300">
                    Pin this room to the sidebar, or place it in a folder.
                  </Text>
                  <Box direction="Column" gap="200">
                    <Button
                      variant="Primary"
                      fill="Solid"
                      size="300"
                      radii="300"
                      onClick={addDirectly}
                      before={<Icon size="100" src={Icons.Plus} />}
                    >
                      <Text size="B300">Add to Sidebar</Text>
                    </Button>
                    {existingFolders.map((folder) => (
                      <Button
                        key={folder.id}
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        radii="300"
                        onClick={() => addToFolder(folder)}
                        before={<Icon size="100" src={Icons.Category} />}
                      >
                        <Text size="B300" truncate>{folder.name ?? 'Unnamed Folder'}</Text>
                      </Button>
                    ))}
                    <Button
                      variant="Secondary"
                      fill="None"
                      size="300"
                      radii="300"
                      onClick={() => setView('new')}
                      before={<Icon size="100" src={Icons.Plus} />}
                    >
                      <Text size="B300">Create New Folder</Text>
                    </Button>
                  </Box>
                </>
              ) : (
                <>
                  <Text priority="400" size="T300">
                    Choose a name for the new folder.
                  </Text>
                  <Input
                    variant="Background"
                    size="400"
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewFolderName(e.target.value)
                    }
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter') createNewFolder();
                    }}
                    autoFocus
                  />
                  <Box direction="Row" gap="200">
                    <Button
                      variant="Secondary"
                      fill="None"
                      size="300"
                      radii="300"
                      onClick={() => setView('pick')}
                      style={{ flex: 1 }}
                    >
                      <Text size="B300">Back</Text>
                    </Button>
                    <Button
                      variant="Primary"
                      fill="Solid"
                      size="300"
                      radii="300"
                      onClick={createNewFolder}
                      style={{ flex: 1 }}
                    >
                      <Text size="B300">Create</Text>
                    </Button>
                  </Box>
                </>
              )}
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
