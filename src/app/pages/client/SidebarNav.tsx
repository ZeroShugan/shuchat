import React, { useRef } from 'react';
import { usePanelWidth } from '../../hooks/usePanelWidth';
import { ResizeHandle } from '../../components/resize-handle';
import { SidebarTwoColumns } from './sidebarGrid.css';
import { Scroll } from 'folds';

import {
  Sidebar,
  SidebarContent,
  SidebarStackSeparator,
  SidebarStack,
} from '../../components/sidebar';
import {
  DirectTab,
  HomeTab,
  SpaceTabs,
  InboxTab,
  ExploreTab,
  SettingsTab,
  UnverifiedTab,
  SearchTab,
} from './sidebar';
import { CreateTab } from './sidebar/CreateTab';

export function SidebarNav() {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persisted, drag-resizable width for the space/server icon strip.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [sidebarWidth, onSidebarResize, resetSidebarWidth] = usePanelWidth('sidebar', 66, 56, 140, 'end');

  return (
    <Sidebar style={{ width: sidebarWidth, position: 'relative' }}>
      <ResizeHandle edge="end" onPointerDown={onSidebarResize} onReset={resetSidebarWidth} />
      <SidebarContent
        scrollable={
          <Scroll ref={scrollRef} variant="Background" size="0">
            <div className={sidebarWidth >= 118 ? SidebarTwoColumns : undefined}>
              <SidebarStack>
                <HomeTab />
                <DirectTab />
              </SidebarStack>
              <SpaceTabs scrollRef={scrollRef} />
              <SidebarStackSeparator />
              <SidebarStack>
                <ExploreTab />
                <CreateTab />
              </SidebarStack>
            </div>
          </Scroll>
        }
        sticky={
          <>
            <SidebarStackSeparator />
            <SidebarStack>
              <SearchTab />
              <UnverifiedTab />
              <InboxTab />
              <SettingsTab />
            </SidebarStack>
          </>
        }
      />
    </Sidebar>
  );
}
