import React, { PointerEvent as ReactPointerEvent } from 'react';

type ResizeHandleProps = {
  edge: 'start' | 'end'; // which edge of the parent panel the handle sits on
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
};

/**
 * Invisible 6px grab strip on a panel edge (parent must be position:relative).
 * Shows a subtle line on hover so users can discover it.
 */
export function ResizeHandle({ edge, onPointerDown }: ResizeHandleProps) {
  const [hover, setHover] = React.useState(false);
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [edge === 'end' ? 'right' : 'left']: '-3px',
        width: '6px',
        cursor: 'col-resize',
        zIndex: 20,
        background: hover ? 'rgba(128,128,128,0.35)' : 'transparent',
        transition: 'background 120ms ease',
      }}
    />
  );
}
