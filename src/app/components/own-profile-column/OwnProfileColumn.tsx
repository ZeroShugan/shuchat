import React, { ReactNode } from 'react';
import { Box, Icon, Icons, IconButton, Text } from 'folds';
import { useAtom } from 'jotai';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { ownProfilePanelAtom } from '../../state/ownProfilePanel';
import { UserProfilePanel } from '../../features/room/UserProfilePanel';
import { PageNav, PageNavHeader } from '../page';
import { VoiceStatusBar } from '../voice-status-bar/VoiceStatusBar';
import { UserPanel } from '../user-panel/UserPanel';

/**
 * Wraps an entire second-column page (Direct / Space / Home).
 *
 * Children (the full PageNav) are ALWAYS kept in the DOM — hidden via
 * display:none while the profile is open so the virtualised room list
 * never has to reinitialise. display:contents when visible keeps the
 * PageNav as a direct flex child of its parent so layout is unchanged.
 *
 * When the user opens their profile a replacement PageNav is rendered
 * alongside (not instead of) the hidden children.
 */
export function OwnProfileColumn({ children }: { children: ReactNode }) {
  const [showProfile, setShowProfile] = useAtom(ownProfilePanelAtom);
  const mx = useMatrixClient();
  const myUserId = mx.getSafeUserId();

  return (
    <>
      {/* Normal column — always mounted, transparent to layout when visible,
          hidden (but alive) while profile is open. */}
      <div style={{ display: showProfile ? 'none' : 'contents' }}>
        {children}
      </div>

      {/* Profile column — only rendered while profile is open */}
      {showProfile && (
        <PageNav>
          <PageNavHeader>
            <Box alignItems="Center" grow="Yes" gap="200">
              <Box grow="Yes">
                <Text size="H4" truncate>Profile</Text>
              </Box>
              <IconButton
                size="300"
                fill="None"
                onClick={() => setShowProfile(false)}
                aria-label="Close profile"
              >
                <Icon src={Icons.Cross} size="200" />
              </IconButton>
            </Box>
          </PageNavHeader>
          <Box grow="Yes" direction="Column" style={{ overflowY: 'auto', minHeight: 0 }}>
            <UserProfilePanel userId={myUserId} inColumn />
          </Box>
          <VoiceStatusBar />
          <UserPanel />
        </PageNav>
      )}
    </>
  );
}
