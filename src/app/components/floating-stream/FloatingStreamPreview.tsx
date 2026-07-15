import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useCallEmbed } from '../../hooks/useCallEmbed';
import { CallEmbed, useCallControlState } from '../../plugins/call';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { callPopoutAtom } from '../../state/callEmbed';

type Corner = 'tl' | 'tr' | 'bl' | 'br';
const CORNER_KEY = 'shuchat-float-corner';
const MARGIN = 16;

function loadCorner(): Corner {
  try {
    const c = localStorage.getItem(CORNER_KEY);
    if (c === 'tl' || c === 'tr' || c === 'bl' || c === 'br') return c;
  } catch {
    /* default */
  }
  return 'br';
}

function cornerStyle(corner: Corner): React.CSSProperties {
  return {
    top: corner === 'tl' || corner === 'tr' ? MARGIN : undefined,
    bottom: corner === 'bl' || corner === 'br' ? MARGIN : undefined,
    left: corner === 'tl' || corner === 'bl' ? MARGIN : undefined,
    right: corner === 'tr' || corner === 'br' ? MARGIN : undefined,
  };
}

/**
 * Discord-style floating preview of the user's OWN screen share.
 * Visible only while sharing AND a room other than the voice room is selected
 * (in the voice room, Element Call's grid shows the stream) AND the stream is
 * not popped out into its own window. Draggable; snaps to the nearest of the
 * 4 corners on release (persisted). Double-click opens the voice room.
 */
export function FloatingStreamPreview() {
  const callEmbed = useCallEmbed();
  if (!callEmbed) return null;
  return <FloatingStreamPreviewInner callEmbed={callEmbed} />;
}

function FloatingStreamPreviewInner({ callEmbed }: { callEmbed: CallEmbed }) {
  const selectedRoom = useSelectedRoom();
  const popout = useAtomValue(callPopoutAtom);
  const { navigateRoom } = useRoomNavigate();

  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [corner, setCorner] = useState<Corner>(loadCorner);
  const [dragging, setDragging] = useState(false);
  const [hasStream, setHasStream] = useState(false);
  const dragStart = useRef<{ x: number; y: number; rect: DOMRect } | null>(null);

  const controlState = useCallControlState(callEmbed.control);
  const sharing = !!controlState?.screenshare;
  const visible = sharing && selectedRoom !== callEmbed.roomId && !popout;

  // Attach/detach the live screen-share MediaStream exposed by the media-shim
  // inside the (same-origin) Element Call iframe.
  useEffect(() => {
    if (!callEmbed) return undefined;
    const win = callEmbed.iframe.contentWindow as
      | (Window & { __shuScreenShare?: MediaStream | null })
      | null;
    if (!win) return undefined;

    const attach = () => {
      const stream = win.__shuScreenShare ?? null;
      setHasStream(!!stream);
      const video = videoRef.current;
      if (video && video.srcObject !== stream) {
        video.srcObject = stream;
        if (stream) video.play().catch(() => {});
      }
    };
    attach();
    win.addEventListener('shu-screenshare', attach);
    return () => {
      try {
        win.removeEventListener('shu-screenshare', attach);
      } catch {
        /* iframe may be gone */
      }
    };
  }, [callEmbed, visible]);

  // Drag + snap-to-nearest-corner
  const onPointerDown = useCallback((evt: React.PointerEvent) => {
    if ((evt.target as HTMLElement).tagName === 'BUTTON') return; // buttons stay clickable
    const box = boxRef.current;
    if (!box) return;
    dragStart.current = { x: evt.clientX, y: evt.clientY, rect: box.getBoundingClientRect() };
    setDragging(true);
    box.setPointerCapture(evt.pointerId);
  }, []);

  const onPointerMove = useCallback((evt: React.PointerEvent) => {
    const start = dragStart.current;
    const box = boxRef.current;
    if (!start || !box) return;
    const dx = evt.clientX - start.x;
    const dy = evt.clientY - start.y;
    box.style.transform = `translate(${dx}px, ${dy}px)`;
  }, []);

  const onPointerUp = useCallback((evt: React.PointerEvent) => {
    const start = dragStart.current;
    const box = boxRef.current;
    dragStart.current = null;
    setDragging(false);
    if (!start || !box) return;
    box.style.transform = '';
    const cx = start.rect.left + start.rect.width / 2 + (evt.clientX - start.x);
    const cy = start.rect.top + start.rect.height / 2 + (evt.clientY - start.y);
    const next: Corner = `${cy < window.innerHeight / 2 ? 't' : 'b'}${
      cx < window.innerWidth / 2 ? 'l' : 'r'
    }` as Corner;
    setCorner(next);
    try {
      localStorage.setItem(CORNER_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (callEmbed) navigateRoom(callEmbed.roomId);
  }, [callEmbed, navigateRoom]);

  if (!visible) return null;

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={handleDoubleClick}
      title="Double-click to open the voice room"
      style={{
        position: 'fixed',
        ...cornerStyle(corner),
        width: 280,
        zIndex: 1200,
        borderRadius: 10,
        overflow: 'hidden',
        background: '#101014',
        boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.12)',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        transition: dragging ? 'none' : 'top .18s ease, bottom .18s ease, left .18s ease, right .18s ease',
      }}
      className="shu-float-preview"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: '16/9',
          objectFit: 'contain',
          background: '#000',
          pointerEvents: 'none',
        }}
      />
      {!hasStream && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#9aa0ad', fontSize: 12,
          }}
        >
          Streaming…
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
        }}
      >
        <span
          style={{
            flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis', fontSize: 11, color: '#e6e8ee', opacity: 0.85,
          }}
        >
          {callEmbed.room?.name ?? 'Voice room'}
        </span>
        <button
          type="button"
          onClick={() => callEmbed.control.restartScreenshare()}
          title="Restart the share to include audio (the source picker reopens)"
          style={{
            border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6,
            background: 'rgba(255,255,255,0.12)', color: '#e6e8ee',
            fontSize: 11, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Share audio
        </button>
        <button
          type="button"
          onClick={() => callEmbed.control.toggleScreenshare()}
          title="Stop streaming"
          style={{
            border: '1px solid rgba(237,66,69,0.5)', borderRadius: 6,
            background: 'rgba(237,66,69,0.2)', color: '#ed4245',
            fontSize: 11, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          }}
        >
          Stop
        </button>
      </div>
    </div>
  );
}
