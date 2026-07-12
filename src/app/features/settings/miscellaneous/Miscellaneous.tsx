import React from 'react';
import { NativeSelect } from '../../../components/native-select';
import { Box, Text, IconButton, Icon, Icons, Scroll } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom, AutoSpoilerMode } from '../../../state/settings';

function ModeSelect({
  value,
  onChange,
}: {
  value: AutoSpoilerMode;
  onChange: (v: AutoSpoilerMode) => void;
}) {
  return (
    <select
      className={NativeSelect}
      style={{ width: 'auto' }}
      value={value}
      onChange={(e) => onChange(e.target.value as AutoSpoilerMode)}
    >
      <option value="off">Off</option>
      <option value="received">Received</option>
      <option value="own">Own</option>
      <option value="both">Both</option>
    </select>
  );
}

type MiscellaneousProps = {
  requestClose: () => void;
};
export function Miscellaneous({ requestClose }: MiscellaneousProps) {
  const [autoSpoilerImages, setAutoSpoilerImages] = useSetting(settingsAtom, 'autoSpoilerImages');
  const [autoSpoilerGifs, setAutoSpoilerGifs] = useSetting(settingsAtom, 'autoSpoilerGifs');
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
                    title="Images"
                    description="Blur images until clicked. Received = others only, Own = your sends, Both = all."
                    after={<ModeSelect value={autoSpoilerImages} onChange={setAutoSpoilerImages} />}
                  />
                  <SettingTile
                    title="GIFs"
                    description="Blur animated GIFs until clicked."
                    after={<ModeSelect value={autoSpoilerGifs} onChange={setAutoSpoilerGifs} />}
                  />
                  <SettingTile
                    title="Videos"
                    description="Blur videos until clicked."
                    after={<ModeSelect value={autoSpoilerVideos} onChange={setAutoSpoilerVideos} />}
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
