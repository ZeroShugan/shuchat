// ShuChat desktop preload — bridges global push-to-talk and the auto-updater
// between the main process and the web app.
const { contextBridge, ipcRenderer } = require('electron');

// ---- update state bridge ----
let updateState = { status: 'idle', version: null };
const updateListeners = new Set();
ipcRenderer.on('shuchat-update-state', (_evt, state) => {
  updateState = state;
  updateListeners.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {
      /* listener error — ignore */
    }
  });
});

contextBridge.exposeInMainWorld('shuchatDesktop', {
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('shuchat-get-version'),
  getUpdateState: () => updateState,
  onUpdateState: (cb) => {
    updateListeners.add(cb);
    try {
      cb(updateState);
    } catch (e) {
      /* ignore */
    }
    return () => updateListeners.delete(cb);
  },
  checkForUpdates: () => ipcRenderer.send('shuchat-check-updates'),
  installUpdate: () => ipcRenderer.send('shuchat-install-update'),
  // Stream pop-out window controls (used by popout.html; no-ops elsewhere).
  popoutSetAlwaysOnTop: (flag) => ipcRenderer.send('popout:set-always-on-top', !!flag),
  popoutFocusMain: () => ipcRenderer.send('popout:focus-main'),
  popoutFit: (vw, vh) => ipcRenderer.send('popout:fit', vw, vh),
});

// Multi-select screenshare: main queued extra sources — tell the web app how
// many follow-up shares to start (each answered from the queue, no picker).
ipcRenderer.on('shuchat-extra-shares', (_evt, count) => {
  window.dispatchEvent(new CustomEvent('shuchat-extra-shares', { detail: { count } }));
});

// Forward global PTT transitions to the page as DOM events (the web app's
// usePushToTalk hook listens for these when window.shuchatDesktop exists).
ipcRenderer.on('shuchat-ptt', (_evt, down) => {
  window.dispatchEvent(new Event(down ? 'shuchat-ptt-down' : 'shuchat-ptt-up'));
});

// Report the web app's PTT settings (stored in its localStorage) to main so it
// can (un)register the global hotkey. Polled — settings change rarely.
let last = '';
function reportPttConfig() {
  try {
    const s = JSON.parse(window.localStorage.getItem('settings') || '{}');
    const cfg = { enabled: !!s.vvPushToTalk, code: s.vvPttKey || '' };
    const key = `${cfg.enabled}:${cfg.code}`;
    if (key !== last) {
      last = key;
      ipcRenderer.send('shuchat-ptt-config', cfg);
    }
  } catch (e) {
    /* ignore */
  }
}
window.addEventListener('DOMContentLoaded', () => {
  reportPttConfig();
  setInterval(reportPttConfig, 2000);
});
