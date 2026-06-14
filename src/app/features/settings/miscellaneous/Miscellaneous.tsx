import React from 'react';
import { Box, Text, IconButton, Icon, Icons, Scroll, Switch } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';

type MiscellaneousProps = {
  requestClose: () => void;
};
export function Miscellaneous({ requestClose }: MiscellaneousProps) {
  const [autoSpoilerImages, setAutoSpoilerImages] = useSetting(settingsAtom, 'autoSpoilerImages');
  const [autoSpoilerVideos, setAutoSpoilerVideos] = useSetting(settingsAtom, 'autoSpoilerVideos');

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Miscellaneous
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">Auto-Spoiler Media</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Auto-spoiler images"
                    description="Blur every image in chat until you click to reveal it — even when the sender didn't mark it as a spoiler."
                    after={<Switch value={autoSpoilerImages} onChange={setAutoSpoilerImages} />}
                  />
                  <SettingTile
                    title="Auto-spoiler videos"
                    description="Blur every video in chat until you click to reveal it — even when the sender didn't mark it as a spoiler."
                    after={<Switch value={autoSpoilerVideos} onChange={setAutoSpoilerVideos} />}
                  />
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
