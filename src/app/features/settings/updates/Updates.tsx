import React, { useEffect, useState } from 'react';
import { Box, Text, IconButton, Icon, Icons, Scroll, Button, Spinner } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { getDesktop, DesktopUpdateState } from '../../../desktop';

const RELEASES_API = 'https://api.github.com/repos/ZeroShugan/shuchat/releases?per_page=10';
const RELEASES_URL = 'https://github.com/ZeroShugan/shuchat/releases';

type Release = {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
};

const STATUS_TEXT: Record<string, string> = {
  idle: 'Not checked yet.',
  checking: 'Checking for updates…',
  downloading: 'Update found — downloading in the background…',
  ready: 'Update downloaded — restart to install.',
  none: "You're up to date.",
  error: 'Could not check for updates (network?). Try again later.',
};

export function Updates({ requestClose }: { requestClose: () => void }) {
  const desktop = getDesktop();
  const [version, setVersion] = useState('');
  const [state, setState] = useState<DesktopUpdateState | undefined>(desktop?.getUpdateState());
  const [releases, setReleases] = useState<Release[] | undefined>();

  useEffect(() => {
    desktop
      ?.getVersion()
      .then(setVersion)
      .catch(() => {});
  }, [desktop]);
  useEffect(() => {
    if (!desktop) return undefined;
    return desktop.onUpdateState(setState);
  }, [desktop]);
  useEffect(() => {
    fetch(RELEASES_API)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setReleases(d as Release[]);
      })
      .catch(() => setReleases([]));
  }, []);

  const busy = state?.status === 'checking' || state?.status === 'downloading';

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Updates
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
                <Text size="L400">Application</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  {desktop ? (
                    <>
                      <SettingTile
                        title="Current Version"
                        description={version ? `ShuChat desktop v${version}` : 'ShuChat desktop'}
                        after={
                          <Box alignItems="Center" gap="200" shrink="No">
                            {busy && <Spinner size="200" variant="Secondary" />}
                            <Button
                              size="300"
                              radii="300"
                              variant="Secondary"
                              fill="Soft"
                              disabled={busy}
                              onClick={() => desktop.checkForUpdates()}
                            >
                              <Text size="B300">Check for Updates</Text>
                            </Button>
                          </Box>
                        }
                      />
                      <SettingTile
                        title="Status"
                        description={
                          (state && STATUS_TEXT[state.status]) ??
                          'Not checked yet.'
                        }
                        after={
                          state?.status === 'ready' ? (
                            <Button
                              size="300"
                              radii="300"
                              variant="Success"
                              onClick={() => desktop.installUpdate()}
                            >
                              <Text size="B300">
                                Restart &amp; Install{state.version ? ` v${state.version}` : ''}
                              </Text>
                            </Button>
                          ) : undefined
                        }
                      />
                    </>
                  ) : (
                    <SettingTile
                      title="Web Version"
                      description="You're on the web client — it updates automatically whenever the site is redeployed (hard-refresh with Ctrl+Shift+R to be sure). The desktop app can be downloaded from the releases page below."
                    />
                  )}
                  <SettingTile
                    title="All Versions"
                    description="Download any version (including older ones — installing an older installer over the current app rolls it back)."
                    after={
                      <Button
                        size="300"
                        radii="300"
                        variant="Secondary"
                        fill="Soft"
                        onClick={() => window.open(RELEASES_URL, '_blank', 'noreferrer')}
                      >
                        <Text size="B300">Open Releases</Text>
                      </Button>
                    }
                  />
                </SequenceCard>
              </Box>

              <Box direction="Column" gap="100">
                <Text size="L400">What&apos;s New</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="500"
                >
                  {releases === undefined && <Spinner variant="Secondary" />}
                  {releases !== undefined && releases.length === 0 && (
                    <Text size="T200" priority="300">
                      Could not load release notes.
                    </Text>
                  )}
                  {(releases ?? []).map((r) => (
                    <Box key={r.tag_name} direction="Column" gap="100">
                      <Box alignItems="Baseline" gap="200">
                        <Text size="H6">{r.name || r.tag_name}</Text>
                        <Text size="T200" priority="300">
                          {new Date(r.published_at).toLocaleDateString()}
                        </Text>
                      </Box>
                      <Text
                        size="T200"
                        priority="300"
                        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                      >
                        {r.body}
                      </Text>
                    </Box>
                  ))}
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
