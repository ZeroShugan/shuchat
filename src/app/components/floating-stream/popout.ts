/* Pop-out stream window — DESKTOP APP ONLY. The Electron shell recognizes the
   `#shuchat-popout` marker in setWindowOpenHandler and opens a real always-on-
   top BrowserWindow; the page (public/popout.html, same origin) receives the
   MediaStream directly from this window (same renderer process). Web browsers
   never see the option (popOutSupported gates on the desktop preload flag). */

type ShuDesktop = {
  platform?: string;
  popoutSetAlwaysOnTop?: (flag: boolean) => void;
  popoutFocusMain?: () => void;
};

type PopoutWindow = Window & {
  __shuSetStream?: (stream: MediaStream, title: string) => void;
};

export const popOutSupported = (): boolean =>
  !!(window as Window & { shuchatDesktop?: ShuDesktop }).shuchatDesktop;

/**
 * Open the pop-out window for a stream. Returns the popup (or null if it could
 * not be opened). `onClosed` fires once when the popup goes away.
 */
export function popOutStream(
  stream: MediaStream,
  title: string,
  onClosed: () => void
): Window | null {
  const url = `${window.location.origin}/popout.html#shuchat-popout`;
  const popup = window.open(url, '_blank', 'width=720,height=460') as PopoutWindow | null;
  if (!popup) return null;

  const feed = () => {
    try {
      if (popup.__shuSetStream) {
        popup.__shuSetStream(stream, title);
        return true;
      }
    } catch {
      /* not ready yet */
    }
    return false;
  };

  // The page defines __shuSetStream on load; retry briefly until it's there.
  let tries = 0;
  const feedTimer = setInterval(() => {
    tries += 1;
    if (feed() || tries > 50 || popup.closed) clearInterval(feedTimer);
  }, 100);

  const watch = setInterval(() => {
    if (popup.closed) {
      clearInterval(watch);
      onClosed();
    }
  }, 500);

  return popup;
}
