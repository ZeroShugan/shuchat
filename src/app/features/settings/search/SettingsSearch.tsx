import React, { useMemo } from 'react';
import { Box, Text, Switch, Scroll, Icon, Icons, IconButton } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { RangeSlider } from '../../../components/range-slider';
import { NativeSelect } from '../../../components/native-select';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom, Settings as SettingsType, AutoSpoilerMode } from '../../../state/settings';
import { SettingsPages } from '../Settings';

type Kind = 'bool' | 'mode' | 'volume';
type Entry = {
  id: string;
  label: string;
  keywords: string;
  page: SettingsPages;
  pageName: string;
  kind: Kind;
  settingKey: keyof SettingsType;
  def?: number;
};

function BoolControl({ settingKey }: { settingKey: keyof SettingsType }) {
  const [v, setV] = useSetting(settingsAtom, settingKey as never);
  return <Switch value={(v as boolean) ?? false} onChange={setV as never} />;
}

function ModeControl({ settingKey }: { settingKey: keyof SettingsType }) {
  const [v, setV] = useSetting(settingsAtom, settingKey as never);
  return (
    <select
      className={NativeSelect}
      style={{ width: 'auto' }}
      value={v as AutoSpoilerMode}
      onChange={(e) => (setV as (m: AutoSpoilerMode) => void)(e.target.value as AutoSpoilerMode)}
    >
      <option value="off">Off</option>
      <option value="received">Received</option>
      <option value="own">Own</option>
      <option value="both">Both</option>
    </select>
  );
}

function VolumeControl({ settingKey, def }: { settingKey: keyof SettingsType; def: number }) {
  const [v, setV] = useSetting(settingsAtom, settingKey as never);
  const val = (v as number) ?? def;
  return (
    <Box alignItems="Center" gap="200" shrink="No">
      <Text size="T200" priority="300">
        {Math.round(val * 100)}%
      </Text>
      <RangeSlider
        min={0}
        max={1}
        step={0.05}
        value={val}
        onChange={setV as (n: number) => void}
      />
    </Box>
  );
}

function Control({ entry }: { entry: Entry }) {
  if (entry.kind === 'bool') return <BoolControl settingKey={entry.settingKey} />;
  if (entry.kind === 'mode') return <ModeControl settingKey={entry.settingKey} />;
  return <VolumeControl settingKey={entry.settingKey} def={entry.def ?? 0.5} />;
}

type SettingsSearchProps = {
  query: string;
  setQuery: (q: string) => void;
  onOpenPage: (p: SettingsPages) => void;
};
export function SettingsSearch({ query, setQuery, onOpenPage }: SettingsSearchProps) {
  const index = useMemo<Entry[]>(
    () => [
      // ── General ──
      { id: 'invisible', label: 'Hide Typing & Read Receipts', keywords: 'invisible mode privacy typing read receipt activity hide', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'hideActivity' },
      { id: 'hidetypingdots', label: 'Hide Typing Indicators', keywords: 'typing dots animation indicator hide privacy', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'hideTypingIndicator' },
      { id: 'markdown', label: 'Markdown Formatting', keywords: 'format text bold italic markdown', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'isMarkdown' },
      { id: 'toolbar', label: 'Editor Toolbar', keywords: 'formatting toolbar compose', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'editorToolbar' },
      { id: 'twemoji', label: 'Twitter Emoji', keywords: 'twemoji emoji style', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'twitterEmoji' },
      { id: 'clock24', label: '24 Hour Clock', keywords: 'time format 24 hour am pm clock', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'hour24Clock' },
      { id: 'mediaautoload', label: 'Media Auto Load', keywords: 'images video auto load download', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'mediaAutoLoad' },
      { id: 'urlpreview', label: 'Url Preview', keywords: 'link preview embed', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'urlPreview' },
      { id: 'encurlpreview', label: 'Url Preview in Encrypted Rooms', keywords: 'link preview embed encrypted', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'encUrlPreview' },
      { id: 'hidemembership', label: 'Hide Membership Events', keywords: 'join leave membership events timeline', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'hideMembershipEvents' },
      { id: 'hidenickavatar', label: 'Hide Nick/Avatar Events', keywords: 'nick avatar change events timeline', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'hideNickAvatarEvents' },
      { id: 'hiddenevents', label: 'Show Hidden Events', keywords: 'hidden events developer raw', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'showHiddenEvents' },
      { id: 'legacycolor', label: 'Legacy Username Colors', keywords: 'username color legacy', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'legacyUsernameColor' },
      { id: 'peopledrawer', label: 'Member List Drawer', keywords: 'people members drawer sidebar', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'isPeopleDrawer' },
      { id: 'enternewline', label: 'Enter for Newline', keywords: 'enter newline send message keyboard', page: SettingsPages.GeneralPage, pageName: 'General', kind: 'bool', settingKey: 'enterForNewline' },
      // ── Notifications ──
      { id: 'desktopnotif', label: 'Desktop Notifications', keywords: 'desktop notifications popup', page: SettingsPages.NotificationPage, pageName: 'Notifications', kind: 'bool', settingKey: 'showNotifications' },
      { id: 'notifsound', label: 'Notification Sounds', keywords: 'notification sound audio', page: SettingsPages.NotificationPage, pageName: 'Notifications', kind: 'bool', settingKey: 'isNotificationSounds' },
      { id: 'appvol', label: 'App Sounds Volume', keywords: 'notification volume app sound ring', page: SettingsPages.NotificationPage, pageName: 'Notifications', kind: 'volume', settingKey: 'notificationVolume', def: 0.5 },
      { id: 'voicevol', label: 'Voice Volume', keywords: 'voice call volume people speaking', page: SettingsPages.NotificationPage, pageName: 'Notifications', kind: 'volume', settingKey: 'voiceVolume', def: 0.5 },
      { id: 'mediavol', label: 'Media Volume', keywords: 'media audio video volume', page: SettingsPages.NotificationPage, pageName: 'Notifications', kind: 'volume', settingKey: 'mediaVolume', def: 0.5 },
      // ── Miscellaneous ──
      { id: 'spoilimg', label: 'Auto-Spoiler Images', keywords: 'spoiler blur images media', page: SettingsPages.MiscellaneousPage, pageName: 'Miscellaneous', kind: 'mode', settingKey: 'autoSpoilerImages' },
      { id: 'spoilgif', label: 'Auto-Spoiler GIFs', keywords: 'spoiler blur gif media', page: SettingsPages.MiscellaneousPage, pageName: 'Miscellaneous', kind: 'mode', settingKey: 'autoSpoilerGifs' },
      { id: 'spoilvid', label: 'Auto-Spoiler Videos', keywords: 'spoiler blur video media', page: SettingsPages.MiscellaneousPage, pageName: 'Miscellaneous', kind: 'mode', settingKey: 'autoSpoilerVideos' },
      // ── Developer ──
      { id: 'vvns', label: 'Noise Suppression', keywords: 'voice call noise suppression background', page: SettingsPages.VoiceVideoPage, pageName: 'Voice & Video', kind: 'bool', settingKey: 'vvNoiseSuppression' },
      { id: 'vvec', label: 'Echo Cancellation', keywords: 'voice call echo cancellation feedback', page: SettingsPages.VoiceVideoPage, pageName: 'Voice & Video', kind: 'bool', settingKey: 'vvEchoCancellation' },
      { id: 'vvagc', label: 'Automatic Gain Control', keywords: 'voice call mic gain input level automatic', page: SettingsPages.VoiceVideoPage, pageName: 'Voice & Video', kind: 'bool', settingKey: 'vvAutoGainControl' },
      { id: 'vvptt', label: 'Push to Talk', keywords: 'voice call push talk ptt keybind mute microphone', page: SettingsPages.VoiceVideoPage, pageName: 'Voice & Video', kind: 'bool', settingKey: 'vvPushToTalk' },
      { id: 'vvsens', label: 'Automatic Sensitivity', keywords: 'voice call sensitivity gate microphone speaker device select input output test mic', page: SettingsPages.VoiceVideoPage, pageName: 'Voice & Video', kind: 'bool', settingKey: 'vvAutoSensitivity' },
      { id: 'devtools', label: 'Developer Tools', keywords: 'developer tools debug', page: SettingsPages.DeveloperToolsPage, pageName: 'Developer Tools', kind: 'bool', settingKey: 'developerTools' },
    ],
    []
  );

  const q = query.trim().toLowerCase();
  const matches = q
    ? index.filter((e) => `${e.label} ${e.keywords} ${e.pageName}`.toLowerCase().includes(q))
    : [];

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200" alignItems="Center">
          <Icon size="200" src={Icons.Search} />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings…"
            style={{
              flexGrow: 1,
              background: 'transparent',
              color: 'inherit',
              border: 'none',
              outline: 'none',
              fontSize: '1rem',
            }}
          />
          <Box shrink="No">
            <IconButton onClick={() => setQuery('')} variant="Surface" size="300">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="400">
              {q && matches.length === 0 && (
                <Text size="T300" priority="300">
                  No settings match “{query}”.
                </Text>
              )}
              {matches.length > 0 && (
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  {matches.map((e) => (
                    <SettingTile
                      key={e.id}
                      title={e.label}
                      description={
                        <Text
                          as="span"
                          size="T200"
                          priority="300"
                          style={{ cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => onOpenPage(e.page)}
                        >
                          in {e.pageName} →
                        </Text>
                      }
                      after={<Control entry={e} />}
                    />
                  ))}
                </SequenceCard>
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
