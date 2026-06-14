import React from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Dialog,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  Header,
  config,
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
} from 'folds';
import { stopPropagation } from '../../utils/keyboard';
import { CreateChat } from '../../features/create-chat';

type AddFriendPromptProps = {
  onCancel: () => void;
};
export function AddFriendPrompt({ onCancel }: AddFriendPromptProps) {
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
          <Dialog variant="Surface">
            <Header
              style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Add Friend</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box
              style={{ padding: config.space.S400, paddingTop: 0, minWidth: '320px' }}
              direction="Column"
              gap="400"
            >
              <Text priority="400" size="T300">
                Enter a Matrix user ID to start a direct chat (e.g. @shugan:shugan.dev). They will
                get an invite — once they accept, you can message and call each other directly.
              </Text>
              <CreateChat onCreated={onCancel} />
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
