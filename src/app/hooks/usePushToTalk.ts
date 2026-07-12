import { useEffect, useRef } from 'react';
import { CallEmbed } from '../plugins/call';
import { getSettings } from '../state/settings';

/**
 * Discord-style push-to-talk for the Element Call embed.
 * While enabled (Settings → Voice & Video), the mic is force-muted when the
 * call is joined and un-muted only while the configured key is held.
 * Listeners are attached to both the ShuChat window and the same-origin call
 * iframe so the key works regardless of which document has focus.
 */
export const usePushToTalk = (embed: CallEmbed | undefined, joined: boolean) => {
  const heldRef = useRef(false);

  useEffect(() => {
    if (!embed || !joined) return undefined;
    const initial = getSettings();
    if (!initial.vvPushToTalk || !initial.vvPttKey) return undefined;

    // PTT baseline: start the call muted
    embed.control.setMicrophone(false).catch(() => {});

    const isTypingTarget = (e: KeyboardEvent): boolean => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    };

    const down = (e: KeyboardEvent) => {
      const s = getSettings();
      if (!s.vvPushToTalk || e.code !== s.vvPttKey || heldRef.current) return;
      if (isTypingTarget(e)) return;
      heldRef.current = true;
      embed.control.setMicrophone(true).catch(() => {});
    };
    const up = (e: KeyboardEvent) => {
      const s = getSettings();
      if (e.code !== s.vvPttKey || !heldRef.current) return;
      heldRef.current = false;
      embed.control.setMicrophone(false).catch(() => {});
    };
    const release = () => {
      if (!heldRef.current) return;
      heldRef.current = false;
      embed.control.setMicrophone(false).catch(() => {});
    };

    const targets: (Window | undefined)[] = [window, embed.iframe.contentWindow ?? undefined];
    targets.forEach((w) => {
      w?.addEventListener('keydown', down as EventListener);
      w?.addEventListener('keyup', up as EventListener);
      w?.addEventListener('blur', release);
    });

    // Desktop shell (Electron): the preload forwards a TRUE global hotkey as
    // DOM events, so PTT works even while the window is unfocused.
    const isDesktop = !!(window as Window & { shuchatDesktop?: unknown }).shuchatDesktop;
    const globalDown = () => {
      const s = getSettings();
      if (!s.vvPushToTalk || heldRef.current) return;
      heldRef.current = true;
      embed.control.setMicrophone(true).catch(() => {});
    };
    const globalUp = () => {
      if (!heldRef.current) return;
      heldRef.current = false;
      embed.control.setMicrophone(false).catch(() => {});
    };
    if (isDesktop) {
      window.addEventListener('shuchat-ptt-down', globalDown);
      window.addEventListener('shuchat-ptt-up', globalUp);
    }

    return () => {
      targets.forEach((w) => {
        try {
          w?.removeEventListener('keydown', down as EventListener);
          w?.removeEventListener('keyup', up as EventListener);
          w?.removeEventListener('blur', release);
        } catch {
          // iframe may be gone already
        }
      });
      if (isDesktop) {
        window.removeEventListener('shuchat-ptt-down', globalDown);
        window.removeEventListener('shuchat-ptt-up', globalUp);
      }
      heldRef.current = false;
    };
  }, [embed, joined]);
};
