// ShuChat desktop shell — loads the hosted web client in a native window.
// Extras over the browser: tray, media permissions handled, and a TRUE global
// push-to-talk (uiohook-napi) that works even when the window is unfocused.
const { app, BrowserWindow, Tray, Menu, shell, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { codeToUiohook } = require('./keymap');

// ---- auto-update (GitHub Releases feed) ----
let autoUpdater = null;
try {
  // eslint-disable-next-line global-require
  ({ autoUpdater } = require('electron-updater'));
} catch (e) {
  autoUpdater = null; // running from source without deps — updates disabled
}
let updateInteractive = false; // whether the current check was user-initiated
let updateDownloaded = false;
let lastUpdateState = { status: 'idle', version: null };

// Broadcast updater status to the web app (Settings → Updates + bottom-left pill).
function sendUpdateState(status, version) {
  lastUpdateState = { status, version: version ?? null, current: app.getVersion() };
  if (win && !win.isDestroyed()) win.webContents.send('shuchat-update-state', lastUpdateState);
}

function setupAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // updates apply on quit even if "Later"

  autoUpdater.on('checking-for-update', () => sendUpdateState('checking'));
  autoUpdater.on('update-available', (info) => sendUpdateState('downloading', info?.version));
  autoUpdater.on('download-progress', () => {
    if (lastUpdateState.status !== 'downloading') sendUpdateState('downloading', lastUpdateState.version);
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateState('none');
    if (updateInteractive && win) {
      updateInteractive = false;
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'ShuChat',
        message: `You're up to date (v${app.getVersion()}).`,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    updateInteractive = false;
    sendUpdateState('ready', info?.version);
    if (!win) return;
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: 'ShuChat update',
        message: `ShuChat v${info.version} has been downloaded.`,
        detail: 'Restart now to apply the update, or it will install when you quit.',
        buttons: ['Restart & Update', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((r) => {
        if (r.response === 0) {
          quitting = true;
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (err) => {
    sendUpdateState('error');
    if (updateInteractive && win) {
      updateInteractive = false;
      dialog.showMessageBox(win, {
        type: 'warning',
        title: 'ShuChat update',
        message: 'Could not check for updates.',
        detail: String(err && err.message ? err.message : err),
      });
    }
  });

  // silent check shortly after start, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

function checkForUpdatesInteractive() {
  if (!autoUpdater || !app.isPackaged) {
    if (win) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'ShuChat',
        message: 'Updates are only available in the installed app.',
      });
    }
    return;
  }
  if (updateDownloaded) {
    quitting = true;
    autoUpdater.quitAndInstall();
    return;
  }
  updateInteractive = true;
  autoUpdater.checkForUpdates().catch(() => {});
}

const DEFAULT_SERVER_URL = 'https://shuchat.shugan.dev';

// ---- config (self-hosters can point the app at their own instance) ----
const configPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  // minimizeToTray:false → the X button quits (what most users expect).
  // Set it true in config.json to keep ShuChat running in the tray on close.
  const defaults = { serverUrl: DEFAULT_SERVER_URL, minimizeToTray: false };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) };
  } catch (e) {
    return defaults;
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

  // Close = quit by default. Only minimize to tray if the user opted in AND a
  // tray icon actually exists (otherwise the window would vanish with no way
  // back — the earlier "app won't close" bug).
  win.on('close', (e) => {
    if (!quitting && cfg.minimizeToTray && tray) {
      e.preventDefault();
      win.hide();
    } else {
      quitting = true;
    }
  });

  // Right-click context menu (Electron has none by default): cut/copy/paste in
  // inputs, copy for selected text, spellcheck suggestions, image copy/save.
  win.webContents.on('context-menu', (_e, params) => {
    const items = [];
    for (const s of params.dictionarySuggestions || []) {
      items.push({
        label: s,
        click: () => win.webContents.replaceMisspelling(s),
      });
    }
    if (params.misspelledWord) {
      items.push(
        {
          label: 'Add to dictionary',
          click: () =>
            win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        { type: 'separator' }
      );
    }
    if (params.isEditable) {
      items.push(
        { role: 'undo', enabled: params.editFlags.canUndo },
        { role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { role: 'selectAll' }
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      items.push({ role: 'copy' });
    }
    if (params.mediaType === 'image') {
      if (items.length) items.push({ type: 'separator' });
      items.push({ role: 'copyImage', label: 'Copy image' });
    }
    if (params.linkURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push({
        label: 'Copy link address',
        click: () => require('electron').clipboard.writeText(params.linkURL),
      });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  // Keep the app version visible in the window title (page titles still show).
  win.on('page-title-updated', (e, title) => {
    e.preventDefault();
    win.setTitle(`${title} — v${app.getVersion()}`);
  });

  // Re-send updater state after (re)loads so the web UI never misses it.
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('shuchat-update-state', lastUpdateState);
  });

  // The web app registers a service worker (VitePWA) that caches the JS bundle.
  // In a thin shell that always wants the freshly deployed site, that stale
  // cache made the app lag behind the browser (e.g. old encryption-shield
  // colours lingering). Clear the SW + cache storage + HTTP cache each launch.
  const ses = win.webContents.session;
  Promise.allSettled([
    ses.clearCache(),
    ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }),
  ]).finally(() => {
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
      { label: 'Check for Updates…', click: () => checkForUpdatesInteractive() },
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

// ---- updater IPC for the in-app UI ----
ipcMain.handle('shuchat-get-version', () => app.getVersion());
ipcMain.on('shuchat-check-updates', () => {
  if (autoUpdater && app.isPackaged) autoUpdater.checkForUpdates().catch(() => {});
  else sendUpdateState('none');
});
ipcMain.on('shuchat-install-update', () => {
  if (autoUpdater && updateDownloaded) {
    quitting = true;
    autoUpdater.quitAndInstall();
  }
});

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
    if (readConfig().minimizeToTray) createTray();
    setupAutoUpdater();
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
    // Quit when the window is gone (close = quit by default). With tray mode
    // the window is hidden, not destroyed, so this doesn't fire.
    if (process.platform !== 'darwin') app.quit();
  });
}
