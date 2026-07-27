import { atom } from 'jotai';

const STORAGE_KEY = 'settings';
export type DateFormat = 'D MMM YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY/MM/DD' | '';
export type MessageSpacing = '0' | '100' | '200' | '300' | '400' | '500';
export type AutoSpoilerMode = 'off' | 'received' | 'own' | 'both';
export enum MessageLayout {
  Modern = 0,
  Compact = 1,
  Bubble = 2,
}

export interface Settings {
  themeId?: string;
  useSystemTheme: boolean;
  lightThemeId?: string;
  darkThemeId?: string;
  monochromeMode?: boolean;
  isMarkdown: boolean;
  editorToolbar: boolean;
  twitterEmoji: boolean;
  pageZoom: number;
  hideActivity: boolean;

  isPeopleDrawer: boolean;
  memberSortFilterIndex: number;
  enterForNewline: boolean;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  mediaAutoLoad: boolean;
  urlPreview: boolean;
  encUrlPreview: boolean;
  showHiddenEvents: boolean;
  legacyUsernameColor: boolean;

  showNotifications: boolean;
  isNotificationSounds: boolean;
  notificationVolume: number;  // app UI sounds 0.0–1.0
  mediaVolume: number;          // chat audio/video default 0.0–1.0 (0.5 = 50%)
  voiceVolume: number;          // call voice 0.0–1.0
  shareKeysWith: 'all' | 'verified' | 'cross-verified';  // device isolation mode

  hour24Clock: boolean;
  dateFormatString: string;

  developerTools: boolean;

  autoSpoilerImages: AutoSpoilerMode;
  autoSpoilerGifs: AutoSpoilerMode;
  autoSpoilerVideos: AutoSpoilerMode;

  // Voice & Video (calls) — also read by public/element-call/media-shim.js
  vvMicDeviceId: string; // '' = system default
  vvSpeakerDeviceId: string; // '' = system default
  vvSpeakerLabel: string; // display label for Firefox's selectAudioOutput picker choice
  vvMicGain: number; // input volume 0.0–2.0 (1 = 100%)
  vvNoiseSuppression: boolean;
  vvRnnoise: boolean;
  vvEchoCancellation: boolean;
  vvAutoGainControl: boolean;
  vvAutoSensitivity: boolean;
  vvSensitivity: number; // manual gate threshold in dB, -100 = off
  vvPushToTalk: boolean;
  vvPttKey: string; // KeyboardEvent.code, '' = unset
  vvMicChannels: 'mono' | 'stereo'; // mono = downmix + heard in both ears (default)
  vvCamDeviceId: string; // camera used for in-call video, '' = system default
  vvStreamResolution: '720p' | '1080p' | '1440p' | 'source'; // screenshare max resolution
  vvStreamFps: number; // screenshare target framerate (15/30/60)
  vvStreamMaxKbps: number; // screenshare max video bitrate in kbps
  vvStreamPresets: {
    name: string;
    resolution: '720p' | '1080p' | '1440p' | 'source';
    fps: number;
    kbps: number;
  }[];
}

const defaultSettings: Settings = {
  themeId: undefined,
  useSystemTheme: true,
  lightThemeId: undefined,
  darkThemeId: undefined,
  monochromeMode: false,
  isMarkdown: true,
  editorToolbar: false,
  twitterEmoji: false,
  pageZoom: 100,
  hideActivity: false,

  isPeopleDrawer: true,
  memberSortFilterIndex: 0,
  enterForNewline: false,
  messageLayout: 0,
  messageSpacing: '400',
  hideMembershipEvents: false,
  hideNickAvatarEvents: true,
  mediaAutoLoad: true,
  urlPreview: true,
  encUrlPreview: false,
  showHiddenEvents: false,
  legacyUsernameColor: false,

  showNotifications: true,
  isNotificationSounds: true,
  notificationVolume: 0.5,
  mediaVolume: 0.5,
  voiceVolume: 0.5,
  shareKeysWith: 'all',

  hour24Clock: false,
  dateFormatString: 'D MMM YYYY',

  developerTools: false,

  autoSpoilerImages: 'off',
  autoSpoilerGifs: 'off',
  autoSpoilerVideos: 'off',

  vvMicDeviceId: '',
  vvSpeakerDeviceId: '',
  vvSpeakerLabel: '',
  vvMicGain: 1,
  vvNoiseSuppression: true,
  vvRnnoise: false,
  vvEchoCancellation: true,
  vvAutoGainControl: true,
  vvAutoSensitivity: true,
  vvSensitivity: -100,
  vvPushToTalk: false,
  vvPttKey: '',
  vvMicChannels: 'mono',
  vvCamDeviceId: '',
  vvStreamResolution: '1080p',
  vvStreamFps: 30,
  vvStreamMaxKbps: 5000,
  vvStreamPresets: [],
};

export const getSettings = (): Settings => {
  const settings = localStorage.getItem(STORAGE_KEY);
  if (settings === null) return defaultSettings;
  const merged: Settings = {
    ...defaultSettings,
    ...(JSON.parse(settings) as Settings),
  };
  // migrate legacy boolean auto-spoiler settings → mode enum
  (['autoSpoilerImages', 'autoSpoilerGifs', 'autoSpoilerVideos'] as const).forEach((k) => {
    const v = merged[k] as unknown;
    if (typeof v === 'boolean') merged[k] = v ? 'received' : 'off';
  });
  return merged;
};

export const setSettings = (settings: Settings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const baseSettings = atom<Settings>(getSettings());
export const settingsAtom = atom<Settings, [Settings], undefined>(
  (get) => get(baseSettings),
  (get, set, update) => {
    set(baseSettings, update);
    setSettings(update);
  }
);

export const autoSpoilerActive = (mode: AutoSpoilerMode, isOwn: boolean): boolean => {
  if (mode === 'both') return true;
  if (mode === 'own') return isOwn;
  if (mode === 'received') return !isOwn;
  return false;
};
