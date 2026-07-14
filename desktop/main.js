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
    // No popup dialog: the bottom-left update pill and Settings → Updates
    // ("Restart & Install") already surface this. It also installs on quit
    // (autoInstallOnAppQuit). A dialog here was redundant and intrusive.
    sendUpdateState('ready', info?.version);
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
    autoUpdater.quitAndInstall(true, true);
    return;
  }
  updateInteractive = true;
  autoUpdater.checkForUpdates().catch(() => {});
}

const DEFAULT_SERVER_URL = 'https://shuchat.shugan.dev';

// ---- config (self-hosters can point the app at their own instance) ----
const configPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  // closeAction: remembered choice for the X button — 'tray' | 'quit' | undefined.
  // When undefined the app asks each time (Minimize to Tray / Restart / Close).
  const defaults = { serverUrl: DEFAULT_SERVER_URL, closeAction: undefined };
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

// ---- screen-share source picker ----
let sharePickerResolve = null; // pending picker's resolve()
let cachedShareSources = []; // real DesktopCapturerSource objects from the last list
ipcMain.handle('sharepicker:get-sources', async () => {
  const { desktopCapturer } = require('electron');
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  cachedShareSources = sources; // keep the real objects; window ids can change between calls
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    isScreen: s.id.startsWith('screen:'),
    thumbnail: s.thumbnail.toDataURL(),
    appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
});
ipcMain.on('sharepicker:choose', (_e, { id, audio }) => {
  if (sharePickerResolve) {
    const r = sharePickerResolve;
    sharePickerResolve = null;
    // Resolve with the CACHED source object (matching id) — never re-query, or
    // the ids won't line up and the share silently fails.
    const source = id ? cachedShareSources.find((s) => s.id === id) : null;
    r({ source: source || null, audio: !!audio });
  }
});

function pickScreenShareSource(parent) {
  return new Promise((resolve) => {
    const picker = new BrowserWindow({
      parent,
      modal: true,
      width: 780,
      height: 580,
      resizable: true,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      backgroundColor: '#1e1f22',
      title: 'Choose what to share',
      webPreferences: {
        preload: path.join(__dirname, 'picker-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    picker.setMenu(null);
    picker.loadFile(path.join(__dirname, 'screenshare-picker.html'));

    // The IPC 'sharepicker:choose' handler already resolves the chosen id to the
    // CACHED DesktopCapturerSource object (re-querying gives different window
    // ids and silently breaks the share) — so just close and pass it through.
    sharePickerResolve = (choice) => {
      if (!picker.isDestroyed()) picker.close();
      resolve(choice && choice.source ? choice : null);
    };

    picker.on('closed', () => {
      if (sharePickerResolve) {
        sharePickerResolve = null;
        resolve(null);
      }
    });
  });
}

// Carry out a close-window choice. `e` is the close event when called from the
// close handler (so we can preventDefault for tray/cancel).
function applyCloseAction(action, e) {
  if (action === 'tray') {
    if (e) e.preventDefault();
    if (!tray) createTray();
    if (tray) {
      win.hide();
    } else {
      // tray couldn't be created — fall back to quitting rather than a ghost window
      quitting = true;
      app.quit();
    }
  } else if (action === 'restart') {
    quitting = true;
    app.relaunch();
    app.exit(0);
  } else {
    // 'quit'
    quitting = true;
    app.quit();
  }
}

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

  // Screen sharing: Electron doesn't serve getDisplayMedia() without a handler.
  // Show our own picker window so the user chooses a screen OR a specific
  // window, and whether to include audio (Electron's native picker gives no
  // audio choice, hence the custom one).
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    pickScreenShareSource(win)
      .then((choice) => {
        if (!choice || !choice.source) {
          callback({}); // cancelled → deny gracefully
          return;
        }
        callback({ video: choice.source, audio: choice.audio ? 'loopback' : undefined });
      })
      .catch(() => callback({}));
  });

  // External links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(serverOrigin)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Close button → ask what to do (unless a remembered choice exists).
  win.on('close', (e) => {
    if (quitting) return;
    const remembered = readConfig().closeAction; // 'tray' | 'quit' | undefined
    if (remembered) {
      applyCloseAction(remembered, e);
      return;
    }
    e.preventDefault();
    dialog
      .showMessageBox(win, {
        type: 'question',
        title: 'Close ShuChat',
        message: 'What would you like to do?',
        buttons: ['Minimize to Tray', 'Restart', 'Close', 'Cancel'],
        defaultId: 0,
        cancelId: 3,
        checkboxLabel: 'Remember my choice',
        checkboxChecked: false,
        noLink: true,
      })
      .then(({ response, checkboxChecked }) => {
        const action = response === 0 ? 'tray' : response === 1 ? 'restart' : response === 2 ? 'quit' : 'cancel';
        if (action === 'cancel') return;
        // Only 'tray' and 'quit' are persistable (restart isn't a close-mode).
        if (checkboxChecked && (action === 'tray' || action === 'quit')) {
          writeConfig({ ...readConfig(), closeAction: action });
        }
        applyCloseAction(action);
      });
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

  // Getting fresh web code WITHOUT risking the E2EE crypto store:
  //  - clearCache() drops only the HTTP disk cache (safe).
  //  - We UNREGISTER the service worker (removes SW control so the page fetches
  //    the current bundle from the network) and reload once. Unregistering a SW
  //    does NOT delete IndexedDB/Cache storage, so the Matrix crypto keys are
  //    untouched. NEVER call clearStorageData — that corrupted the keys before.
  let bundleRefreshed = false;
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('shuchat-update-state', lastUpdateState);
    if (bundleRefreshed) return;
    win.webContents
      .executeJavaScript(
        `(async () => {
           if (!navigator.serviceWorker) return false;
           const regs = await navigator.serviceWorker.getRegistrations();
           if (!regs.length) return false;
           await Promise.all(regs.map((r) => r.unregister()));
           return true;
         })().catch(() => false)`
      )
      .then((hadServiceWorker) => {
        if (hadServiceWorker) {
          bundleRefreshed = true;
          win.webContents.reloadIgnoringCache();
        }
      })
      .catch(() => {});
  });

  const ses = win.webContents.session;
  ses.clearCache().finally(() => {
    win.loadURL(cfg.serverUrl);
  });
}

function createTray() {
  if (tray) return; // idempotent — may be created on demand from the close dialog
  // Uses the app's own executable icon on Windows.
  const trayIconPath = process.execPath;
  try {
    tray = new Tray(trayIconPath);
  } catch (e) {
    tray = null;
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
    autoUpdater.quitAndInstall(true, true);
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
    // Pre-create the tray only if the user has chosen to keep the app in tray.
    if (readConfig().closeAction === 'tray') createTray();
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
