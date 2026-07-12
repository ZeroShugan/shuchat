import { CSSProperties, PointerEvent as ReactPointerEvent, useCallback, useMemo, useState } from 'react';

const STORAGE_PREFIX = 'shuchat_panel_width_';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export type PanelResizeHandleProps = {
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  style: CSSProperties;
};

/**
 * Persistent, drag-resizable panel width.
 * `edge` is which edge of the panel the user drags: 'end' = panel grows when
 * dragging right (nav column), 'start' = panel grows when dragging left
 * (members drawer).
 *
 * Kept deliberately self-contained (localStorage, no settings atom) so the
 * whole feature can be rolled back by reverting one commit.
 */
export const usePanelWidth = (
  key: string,
  defaultWidth: number,
  min: number,
  max: number,
  edge: 'start' | 'end'
): [number, (e: ReactPointerEvent<HTMLElement>) => void] => {
  const storageKey = STORAGE_PREFIX + key;
  const [width, setWidth] = useState<number>(() => {
    const raw = localStorage.getItem(storageKey);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? clamp(n, min, max) : defaultWidth;
  });

  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);

      let latest = startWidth;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        latest = clamp(edge === 'end' ? startWidth + dx : startWidth - dx, min, max);
        setWidth(latest);
      };
      const onUp = () => {
        localStorage.setItem(storageKey, String(Math.round(latest)));
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [width, min, max, edge, storageKey]
  );

  return useMemo(() => [width, onHandlePointerDown], [width, onHandlePointerDown]);
};
