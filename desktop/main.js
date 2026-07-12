// ShuChat desktop shell — loads the hosted web client in a native window.
// Extras over the browser: tray, media permissions handled, and a TRUE global
// push-to-talk (uiohook-napi) that works even when the window is unfocused.
const { app, BrowserWindow, Tray, Menu, shell, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { codeToUiohook } = require('./keymap');

const DEFAULT_SERVER_URL = 'https://shuchat.shugan.dev';

// ---- config (self-hosters can point the app at their own instance) ----
const configPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try {
    return { serverUrl: DEFAULT_SERVER_URL, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) };
  } catch (e) {
    return { serverUrl: DEFAULT_SERVER_URL };
  }
}
function writeConfig(cfg) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch (e) {
    /* ignore */
  }
}

let win = null;
let tray = null;
let quitting = false;

function createWindow() {
  const cfg = readConfig();
  if (!fs.existsSync(configPath())) writeConfig(cfg); // materialize for easy editing

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#0e0e12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  const serverOrigin = new URL(cfg.serverUrl).origin;

  // Media/notification permissions: auto-grant for the ShuChat origin only.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const allowed = [
      'media',
      'notifications',
      'display-capture',
      'fullscreen',
      'clipboard-sanitized-write',
      'speaker-selection',
    ];
    const fromApp = (details.requestingUrl || '').startsWith(serverOrigin);
    callback(fromApp && allowed.includes(permission));
  });

  // External links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(serverOrigin)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Close = minimize to tray (Discord-style); real quit via tray menu.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.webContents.session.clearCache().finally(() => {
    win.loadURL(cfg.serverUrl);
  });
}

function createTray() {
  // Uses the app's own executable icon on Windows.
  const trayIconPath = process.execPath;
  try {
    tray = new Tray(trayIconPath);
  } catch (e) {
    return; // tray is best-effort
  }
  tray.setToolTip('ShuChat');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open ShuChat', click: () => { if (win) { win.show(); win.focus(); } } },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', () => {
    if (win) {
      win.show();
      win.focus();
    }
  });
}

// ---- global push-to-talk ----
// The renderer (preload) reports the web app's PTT settings; we hook the
// matching key globally and forward down/up transitions to the page.
let uio = null;
let uioStarted = false;
let pttKeycode = null;
let pttHeld = false;

function sendPtt(down) {
  if (win && !win.isDestroyed()) win.webContents.send('shuchat-ptt', down);
}

function ensureUiohook() {
  if (uio) return uio;
  try {
    // eslint-disable-next-line global-require
    const { uIOhook } = require('uiohook-napi');
    uio = uIOhook;
    uio.on('keydown', (e) => {
      if (pttKeycode === null || e.keycode !== pttKeycode || pttHeld) return;
      pttHeld = true;
      sendPtt(true);
    });
    uio.on('keyup', (e) => {
      if (pttKeycode === null || e.keycode !== pttKeycode || !pttHeld) return;
      pttHeld = false;
      sendPtt(false);
    });
  } catch (e) {
    uio = null; // native module unavailable — PTT falls back to in-window keys
  }
  return uio;
}

ipcMain.on('shuchat-ptt-config', (_evt, { enabled, code }) => {
  const keycode = enabled && code ? codeToUiohook[code] : undefined;
  if (keycode !== undefined && keycode !== null) {
    pttKeycode = keycode;
    const hook = ensureUiohook();
    if (hook && !uioStarted) {
      try {
        hook.start();
        uioStarted = true;
      } catch (e) {
        /* ignore */
      }
    }
  } else {
    pttKeycode = null;
    if (pttHeld) {
      pttHeld = false;
      sendPtt(false);
    }
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
  });

  app.on('before-quit', () => {
    quitting = true;
    if (uio && uioStarted) {
      try {
        uio.stop();
      } catch (e) {
        /* ignore */
      }
    }
  });

  app.on('window-all-closed', () => {
    // stay in tray on Windows/Linux; quit handled via tray menu
    if (process.platform === 'darwin') return;
  });
}
