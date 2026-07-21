// ShuChat desktop shell — loads the hosted web client in a native window.
// Extras over the browser: tray, media permissions handled, and a TRUE global
// push-to-talk (uiohook-napi) that works even when the window is unfocused.
const { app, BrowserWindow, Tray, Menu, shell, ipcMain, session, dialog, clipboard, nativeImage } = require('electron');
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
  try {
    logMain(`updater: ${status}${version ? ` v${version}` : ''} (current v${app.getVersion()})`);
  } catch (e) {
    /* app may not be ready */
  }
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
  // autoStart: launch ShuChat when the user logs into Windows. Defaults to ON
  // (owner request) — applied on first run, then whatever the user last chose.
  const defaults = { serverUrl: DEFAULT_SERVER_URL, closeAction: undefined, autoStart: true };
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

// ---- persistent logging -----------------------------------------------------
// All diagnostics live in <userData>/logs/*.log so the owner can paste the
// latest files after testing a feature:
//   main.log        app lifecycle, updater, windows, crashes
//   renderer.log    EVERY console line from the web app AND the call iframe
//                   (includes the [shuchat-call] / [shim] diagnostics)
//   screenshare.log the screen-share grant pipeline
// Files rotate at 2 MB to <name>.log.old (one previous generation kept).
const LOG_MAX_BYTES = 2 * 1024 * 1024;
function logsDir() {
  const d = path.join(app.getPath('userData'), 'logs');
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch (e) {
    /* ignore */
  }
  return d;
}
function appendLog(name, msg) {
  try {
    const file = path.join(logsDir(), `${name}.log`);
    try {
      if (fs.statSync(file).size > LOG_MAX_BYTES) fs.renameSync(file, `${file}.old`);
    } catch (e) {
      /* no file yet */
    }
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {
    /* ignore */
  }
}
const logMain = (msg) => appendLog('main', msg);
const logShare = (msg) => appendLog('screenshare', msg);

process.on('uncaughtException', (e) => {
  logMain(`UNCAUGHT EXCEPTION: ${e && e.stack ? e.stack : e}`);
});
process.on('unhandledRejection', (e) => {
  logMain(`UNHANDLED REJECTION: ${e && e.stack ? e.stack : e}`);
});

// ---- screen-share source picker ----
let sharePickerResolve = null; // pending picker's resolve()
let cachedShareSources = []; // real DesktopCapturerSource objects for the pending request

function mapShareSources(sources) {
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    isScreen: s.id.startsWith('screen:'),
    thumbnail: s.thumbnail.toDataURL(),
    appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
}

// The picker renderer asks for the source list. Return the sources the request
// handler already fetched (they are "blessed" for the pending getDisplayMedia
// request); only fall back to a fresh query if none are cached.
ipcMain.handle('sharepicker:get-sources', async () => {
  if (cachedShareSources && cachedShareSources.length) {
    logShare(`picker requested sources; returning ${cachedShareSources.length} cached`);
    return mapShareSources(cachedShareSources);
  }
  const { desktopCapturer } = require('electron');
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  cachedShareSources = sources;
  logShare(`picker requested sources; fetched ${sources.length} (fallback)`);
  return mapShareSources(sources);
});
ipcMain.on('sharepicker:choose', (_e, selection) => {
  if (sharePickerResolve) {
    const r = sharePickerResolve;
    sharePickerResolve = null;
    // selection = array of { id, audio }. Resolve each against the CACHED
    // source objects (never re-query — ids won't line up and the share fails).
    const sel = Array.isArray(selection) ? selection : [];
    const items = sel
      .map((e) => {
        const source = cachedShareSources.find((s) => s.id === e.id);
        return source ? { source, audio: !!e.audio } : null;
      })
      .filter(Boolean);
    logShare(`picker chose ${sel.length} source(s), matched=${items.length}`);
    r({ items });
  }
});

// Extra sources selected in a multi-select share: each queued entry answers
// one follow-up getDisplayMedia request (fired by the web app via
// __shuShareAnother) WITHOUT showing the picker again.
let extraShareQueue = [];

// ---- stream pop-out window controls (see #shuchat-popout in the open handler) ----
ipcMain.on('popout:set-always-on-top', (e, flag) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && w !== win) w.setAlwaysOnTop(!!flag);
});
ipcMain.on('popout:focus-main', () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});
// Size the pop-out to the stream's aspect (renderer resizeTo only worked
// horizontally); also lock the ratio for manual resizes, footer excluded.
ipcMain.on('popout:fit', (e, vw, vh) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w === win || w.isDestroyed() || !vw || !vh) return;
  const FOOTER = 45;
  try {
    const { screen } = require('electron');
    const area = screen.getDisplayMatching(w.getBounds()).workAreaSize;
    const maxW = Math.floor(area.width * 0.9);
    const maxH = Math.floor(area.height * 0.9) - FOOTER;
    let cw = Math.min(Math.max(480, w.getContentSize()[0]), maxW);
    let ch = Math.round((cw * vh) / vw);
    if (ch > maxH) {
      ch = maxH;
      cw = Math.round((ch * vw) / vh);
    }
    w.setContentSize(cw, ch + FOOTER);
    w.setAspectRatio(vw / vh, { width: 0, height: FOOTER });
    logMain(`popout fit ${vw}x${vh} -> content ${cw}x${ch + FOOTER}`);
    // A maximized/fullscreen window can NEVER match the locked ratio — on
    // Windows the aspect enforcement then fights the maximize in a resize
    // loop, starving the renderer (stream froze after a few seconds). Unlock
    // while maximized/fullscreen, re-lock on restore.
    if (!w.__shuAspectHooked) {
      w.__shuAspectHooked = true;
      const unlock = () => {
        try { w.setAspectRatio(0); } catch (e2) { /* ignore */ }
        logMain('popout aspect unlocked (maximize/fullscreen)');
      };
      const relock = () => {
        try {
          if (w.__shuAspect) w.setAspectRatio(w.__shuAspect, { width: 0, height: FOOTER });
        } catch (e2) { /* ignore */ }
      };
      w.on('maximize', unlock);
      w.on('enter-full-screen', unlock);
      w.on('unmaximize', relock);
      w.on('leave-full-screen', relock);
    }
    w.__shuAspect = vw / vh;
    if (w.isMaximized() || w.isFullScreen()) w.setAspectRatio(0);
  } catch (err) {
    logMain(`popout fit failed: ${err && err.message ? err.message : err}`);
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
      resolve(choice && choice.items && choice.items.length ? choice : null);
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

// Recovery prompt when the renderer crashes/hangs — Reload (fresh page, keeps
// the app running) / Restart (relaunch the whole app) / Wait. Debounced so a
// crash-loop doesn't spam dialogs.
let recoveryOpen = false;
function offerRecovery(message) {
  if (recoveryOpen || quitting || !win || win.isDestroyed()) return;
  recoveryOpen = true;
  dialog
    .showMessageBox(win, {
      type: 'warning',
      buttons: ['Reload', 'Restart app', 'Wait'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'ShuChat problem',
      message,
      detail: 'Reload refreshes the page. Restart relaunches the whole app.',
    })
    .then(({ response }) => {
      recoveryOpen = false;
      if (response === 0) {
        logMain('recovery: reload');
        if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache();
      } else if (response === 1) {
        logMain('recovery: restart');
        quitting = true;
        app.relaunch();
        app.exit(0);
      }
    })
    .catch(() => {
      recoveryOpen = false;
    });
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
      // Chromium throttles timers in backgrounded windows; LiveKit's
      // keepalive then times out and the call drops "for no reason" while
      // the app is minimized/behind a game. Keep timers full-rate.
      backgroundThrottling: false,
    },
  });

  const serverOrigin = new URL(cfg.serverUrl).origin;

  // Mirror every console line from the web app (all frames, incl. the call
  // iframe and its media-shim) into logs/renderer.log for post-test debugging.
  const CONSOLE_LEVELS = ['debug', 'info', 'warn', 'error'];
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const src = (sourceId || '').split('/').pop() || '';
    appendLog('renderer', `[${CONSOLE_LEVELS[level] ?? level}] ${message} (${src}:${line})`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    logMain(`RENDERER GONE: reason=${details.reason} exitCode=${details.exitCode}`);
    // 'clean-exit' is a normal reload; only offer recovery on real failures.
    if (details.reason === 'clean-exit') return;
    offerRecovery(`The app stopped responding (${details.reason}).`);
  });
  win.webContents.on('unresponsive', () => {
    logMain('window unresponsive');
    offerRecovery('ShuChat is not responding.');
  });
  win.webContents.on('responsive', () => logMain('window responsive again'));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logMain(`did-fail-load code=${code} desc=${desc} url=${url}`);
  });

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
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      const { desktopCapturer } = require('electron');
      logShare('getDisplayMedia request received');

      // Queued extra source from a multi-select share? Grant it instantly
      // without showing the picker (this request came from __shuShareAnother).
      if (extraShareQueue.length > 0) {
        const queued = extraShareQueue.shift();
        logShare(
          `granting QUEUED extra source id=${queued.source.id} name="${queued.source.name}" audio=${queued.audio}`
        );
        const g = { video: queued.source };
        if (queued.audio) g.audio = 'loopback';
        callback(g);
        return;
      }

      // Fetch the sources INSIDE the request handler so the DesktopCapturerSource
      // objects we later hand to callback() are bound to this pending request —
      // sources cached from a separate/earlier call can be silently rejected.
      desktopCapturer
        .getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true,
        })
        .then((sources) => {
          cachedShareSources = sources;
          logShare(`fetched ${sources.length} sources inside handler`);
          return pickScreenShareSource(win);
        })
        .then((choice) => {
          if (!choice || !choice.items || choice.items.length === 0) {
            logShare('no source chosen (cancelled) → deny');
            callback({}); // cancelled → deny gracefully
            return;
          }
          const [first, ...rest] = choice.items;
          logShare(
            `granting id=${first.source.id} name="${first.source.name}" audio=${first.audio} (+${rest.length} queued)`
          );
          // NB: the `audio` key must be OMITTED entirely when not sharing audio —
          // Electron rejects `audio: undefined` with "audio must be a WebFrameMain,
          // 'loopback' or 'loopbackWithMute'" and the share never starts.
          const grant = { video: first.source };
          if (first.audio) grant.audio = 'loopback';
          callback(grant);
          logShare('grant callback completed OK');
          if (rest.length > 0) {
            // each queued entry keeps its own audio choice
            extraShareQueue = rest.map((it) => ({ source: it.source, audio: it.audio }));
            setTimeout(() => {
              if (win && !win.isDestroyed()) {
                win.webContents.send('shuchat-extra-shares', rest.length);
              }
            }, 800);
          }
        })
        .catch((e) => {
          logShare(`handler error: ${e && e.message ? e.message : e}`);
          callback({});
        });
    },
    // Use our custom picker, not the OS one (we add screen/window + audio choice).
    { useSystemPicker: false }
  );

  // External links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(serverOrigin)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    // Stream pop-out window (Discord-style): real always-on-top BrowserWindow.
    // The page's "Stay on top" toggle + "Return to main window" use the popout
    // IPC below (preload is inherited so window.shuchatDesktop exists there).
    if (url.includes('#shuchat-popout')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 720,
          height: 460,
          alwaysOnTop: true,
          autoHideMenuBar: true,
          backgroundColor: '#0e0e12',
          title: 'ShuChat — Stream',
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            // keep the stream rendering at full rate even when covered
            backgroundThrottling: false,
          },
        },
      };
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
      items.push({
        label: 'Copy image',
        // role:copyImage fails on blob:/E2EE images. Fetch the image in the page
        // context (which can read its own blob URL), get a data URL, and write it
        // to the OS clipboard here in main. Fall back to the built-in copy.
        click: async () => {
          try {
            const src = params.srcURL;
            const dataURL = await win.webContents.executeJavaScript(
              '(async () => { try { const r = await fetch(' +
                JSON.stringify(src) +
                '); const b = await r.blob(); return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); }); } catch (e) { return null; } })()',
              true
            );
            if (dataURL && typeof dataURL === 'string') {
              const img = nativeImage.createFromDataURL(dataURL);
              if (!img.isEmpty()) {
                clipboard.writeImage(img);
                return;
              }
            }
          } catch (e) {
            /* fall through to built-in */
          }
          try {
            win.webContents.copyImageAt(params.x, params.y);
          } catch (e) {
            /* nothing to copy */
          }
        },
      });
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
      {
        label: 'Reload Page',
        click: () => {
          if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache();
        },
      },
      {
        label: 'Restart App',
        click: () => {
          quitting = true;
          app.relaunch();
          app.exit(0);
        },
      },
      { label: 'Check for Updates…', click: () => checkForUpdatesInteractive() },
      { label: 'Open Logs Folder', click: () => { shell.openPath(logsDir()); } },
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

// ---- launch-at-login (Windows/macOS) ----
// Electron writes the HKCU\...\Run entry on Windows; works with our per-user
// (AppData\Local\Programs) install. Started minimized so logging in doesn't
// throw a window in your face — the app lands in the tray.
function applyAutoStart(enabled) {
  if (process.platform === 'linux') return false; // no login-item API on Linux
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: true,            // macOS
      args: enabled ? ['--hidden'] : [],
      path: process.execPath,
    });
    return true;
  } catch (e) {
    logMain(`setLoginItemSettings failed: ${e && e.message ? e.message : e}`);
    return false;
  }
}

function syncAutoStartFromConfig() {
  const cfg = readConfig();
  // Only enforce when packaged — running from source shouldn't register autostart.
  if (!app.isPackaged) return;
  applyAutoStart(cfg.autoStart !== false);
}

// ---- updater IPC for the in-app UI ----
ipcMain.handle('shuchat-get-version', () => app.getVersion());
ipcMain.handle('shuchat-get-autostart', () => {
  if (process.platform === 'linux') return { supported: false, enabled: false };
  const cfg = readConfig();
  let actual = cfg.autoStart !== false;
  try {
    if (app.isPackaged) actual = !!app.getLoginItemSettings({ path: process.execPath }).openAtLogin;
  } catch (e) {
    /* fall back to stored value */
  }
  return { supported: true, enabled: actual };
});
ipcMain.handle('shuchat-set-autostart', (_evt, enabled) => {
  const on = !!enabled;
  writeConfig({ ...readConfig(), autoStart: on });
  const ok = applyAutoStart(on);
  logMain(`autostart ${on ? 'enabled' : 'disabled'} (applied=${ok})`);
  return { supported: process.platform !== 'linux', enabled: on };
});
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
    logMain(`=== ShuChat desktop v${app.getVersion()} starting (${process.platform}) ===`);
    // Windows "Efficiency Mode" can suspend a backgrounded app — mid-call
    // that reads as the call randomly ending. Keep the process unsuspended
    // (screen may still sleep; this only blocks app suspension).
    try {
      const { powerSaveBlocker } = require('electron');
      powerSaveBlocker.start('prevent-app-suspension');
    } catch (e) {
      logMain(`powerSaveBlocker failed: ${e && e.message ? e.message : e}`);
    }
    // Register/refresh the Windows login item to match the stored preference
    // (default ON). Runs every launch so a reinstall/move of the exe re-points
    // the Run entry at the current path.
    syncAutoStartFromConfig();
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
