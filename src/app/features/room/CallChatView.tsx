import React from 'react';
import { useSetAtom } from 'jotai';
import { useParams } from 'react-router-dom';
import { Box, Text, TooltipProvider, Tooltip, Icon, Icons, IconButton } from 'folds';
import { Page, PageHeader } from '../../components/page';
import { callChatAtom } from '../../state/callEmbed';
import { RoomView } from './RoomView';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { usePanelWidth } from '../../hooks/usePanelWidth';
import { ResizeHandle } from '../../components/resize-handle';

export function CallChatView() {
  const { eventId } = useParams();
  const setChat = useSetAtom(callChatAtom);
  const screenSize = useScreenSizeContext();

  // Drag-resizable like the other panels (handle on the LEFT edge — the call
  // view is on that side); persisted, double-click resets.
  const [width, onResizePointerDown, resetWidth] = usePanelWidth(
    'call-chat',
    456,
    280,
    900,
    'start'
  );

  const handleClose = () => setChat(false);
  const desktop = screenSize === ScreenSize.Desktop;

  return (
    <Page
      style={{
        width: desktop ? width : '100%',
        flexShrink: 0,
        flexGrow: 0,
        position: 'relative',
      }}
    >
      {desktop && (
        <ResizeHandle edge="start" onPointerDown={onResizePointerDown} onReset={resetWidth} />
      )}
      <PageHeader>
        <Box grow="Yes" alignItems="Center" gap="200">
          <Box grow="Yes">
            <Text size="H5" truncate>
              Chat
            </Text>
          </Box>
          <Box shrink="No" alignItems="Center">
            <TooltipProvider
              position="Bottom"
              align="End"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>Close</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton ref={triggerRef} variant="Surface" onClick={handleClose}>
                  <Icon src={Icons.Cross} />
                </IconButton>
              )}
            </TooltipProvider>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes" direction="Column">
        <RoomView eventId={eventId} />
      </Box>
    </Page>
  );
}
