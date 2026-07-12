// ShuChat desktop preload — bridges the global push-to-talk hotkey between the
// main process (uiohook) and the web app, and reports the app's PTT settings.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shuchatDesktop', {
  platform: process.platform,
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
