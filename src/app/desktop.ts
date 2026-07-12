/** Bridge to the ShuChat desktop shell (Electron preload), when present. */

export type DesktopUpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'none' | 'error';

export type DesktopUpdateState = {
  status: DesktopUpdateStatus;
  version?: string | null; // version being downloaded / ready to install
  current?: string; // running app version
};

export type ShuchatDesktop = {
  platform: string;
  getVersion: () => Promise<string>;
  getUpdateState: () => DesktopUpdateState;
  onUpdateState: (cb: (s: DesktopUpdateState) => void) => () => void;
  checkForUpdates: () => void;
  installUpdate: () => void;
};

export const getDesktop = (): ShuchatDesktop | undefined => {
  const w = window as Window & { shuchatDesktop?: Partial<ShuchatDesktop> };
  const d = w.shuchatDesktop;
  // Older shells (< v0.9.3) exposed only platform/version — treat as no update API.
  if (!d || typeof d.onUpdateState !== 'function') return undefined;
  return d as ShuchatDesktop;
};
