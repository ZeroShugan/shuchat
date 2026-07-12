import React, { useEffect, useState } from 'react';
import { getDesktop, DesktopUpdateState } from '../../desktop';

/**
 * Bottom-left floating pill shown in the desktop app when an update is
 * downloading / ready (Discord-style). Clicking a ready update restarts and
 * installs. Renders nothing in the browser.
 */
export function DesktopUpdatePill() {
  const desktop = getDesktop();
  const [state, setState] = useState<DesktopUpdateState | undefined>(desktop?.getUpdateState());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!desktop) return undefined;
    return desktop.onUpdateState((s) => {
      setState(s);
      if (s.status === 'ready') setDismissed(false);
    });
  }, [desktop]);

  if (!desktop || dismissed) return null;
  if (state?.status !== 'ready' && state?.status !== 'downloading') return null;

  const ready = state.status === 'ready';

  return (
    <div
      style={{
        position: 'fixed',
        left: '16px',
        bottom: '16px',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: ready ? '#2f8a4b' : 'var(--mx-surface-bg, #2b2d31)',
        color: '#fff',
        borderRadius: '999px',
        padding: '8px 14px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
        fontSize: '13px',
        cursor: ready ? 'pointer' : 'default',
      }}
      onClick={ready ? () => desktop.installUpdate() : undefined}
      role={ready ? 'button' : undefined}
      title={ready ? 'Restart ShuChat to apply the update' : undefined}
    >
      <span aria-hidden>{ready ? '⬆' : '⏳'}</span>
      <span>
        {ready
          ? `Update ${state.version ? `v${state.version} ` : ''}ready — click to restart & install`
          : `Downloading update${state.version ? ` v${state.version}` : ''}…`}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDismissed(true);
        }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer',
          fontSize: '14px',
          padding: 0,
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
