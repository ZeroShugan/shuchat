import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { Avatar, Box, config, Icon, Icons, Menu, MenuItem, PopOut, RectCords, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import classNames from 'classnames';
import { CallEmbed } from '../../plugins/call';
import { useCallJoined } from '../../hooks/useCallEmbed';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { getMemberDisplayName, getMemberAvatarMxc } from '../../utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { UserAvatar } from '../user-avatar';
import { ParticipantVolumeMenu } from '../call-tile-menu/ParticipantVolumeMenu';
import { popOutStream, popOutSupported } from '../floating-stream/popout';
import { callPopoutAtom } from '../../state/callEmbed';
import { stopPropagation } from '../../utils/keyboard';
import { ContainerColor } from '../../styles/ContainerColor.css';

type GridVideo = { sid: string; source: string; stream: MediaStream };
type GridParticipant = {
  identity: string;
  isLocal: boolean;
  isSpeaking: boolean;
  videos: GridVideo[];
};

type CropRect = { x: number; y: number; w: number; h: number };
type GridWindow = Window & {
  __shuGetGrid?: () => GridParticipant[] | null;
  __shuStopStreamBySid?: (sid: string) => void;
  __shuGetOriginal?: (sid: string) => MediaStream | null;
  __shuGetCrop?: (sid: string) => CropRect | null;
  __shuSetCrop?: (sid: string, rect: CropRect) => boolean;
  __shuClearCrop?: (sid: string) => void;
};

/** LiveKit identity in MatrixRTC = `${mxid}:${deviceId}` — strip the device. */
const identityToUserId = (identity: string): string => {
  const i = identity.lastIndexOf(':');
  return i > 0 ? identity.slice(0, i) : identity;
};

/** Signature so we only re-render on real roster/track/speaker changes. */
const gridSignature = (g: GridParticipant[] | null): string =>
  g
    ? g
        .map(
          (p) => `${p.identity}:${p.isSpeaking ? 1 : 0}:${p.videos.map((v) => v.sid).join(',')}`
        )
        .join('|')
    : '';

const StreamVideo = React.memo(function StreamVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v && v.srcObject !== stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
    />
  );
});

const ZOOM_MIN = 1;
const ZOOM_MAX = 8;

const clampPan = (
  scale: number,
  x: number,
  y: number,
  rect: { width: number; height: number }
): [number, number] => {
  const maxX = Math.max(0, ((scale - 1) * rect.width) / 2);
  const maxY = Math.max(0, ((scale - 1) * rect.height) / 2);
  return [Math.min(maxX, Math.max(-maxX, x)), Math.min(maxY, Math.max(-maxY, y))];
};

/**
 * Video with image-viewer-style zoom & pan: wheel zooms toward the cursor,
 * click-drag pans while zoomed in, double-click resets. Overlays (name tag,
 * buttons) are passed as children and are NOT transformed. A clean click at
 * 1× (no drag) calls onPlainClick — used to collapse the spotlight, matching
 * the old click-to-return behavior.
 */
function ZoomableVideo({
  stream,
  onPlainClick,
  children,
}: {
  stream: MediaStream;
  onPlainClick?: () => void;
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const panRef = useRef({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const setPanClamped = useCallback((s: number, x: number, y: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const [cx, cy] = rect ? clampPan(s, x, y, rect) : [x, y];
    panRef.current = { x: cx, y: cy };
    setPan({ x: cx, y: cy });
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setPanClamped(1, 0, 0);
  }, [setPanClamped]);

  // Native non-passive wheel listener so preventDefault actually stops the
  // page/panel from scrolling while zooming.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setScale((prev) => {
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev * factor));
        // Keep the point under the cursor fixed (transform-origin = center).
        const cxp = e.clientX - rect.left - rect.width / 2;
        const cyp = e.clientY - rect.top - rect.height / 2;
        const ratio = next / prev;
        const nx = cxp - (cxp - panRef.current.x) * ratio;
        const ny = cyp - (cyp - panRef.current.y) * ratio;
        if (next <= ZOOM_MIN) setPanClamped(next, 0, 0);
        else setPanClamped(next, nx, ny);
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setPanClamped]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || scale <= ZOOM_MIN) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, ox: panRef.current.x, oy: panRef.current.y, moved: false };
    setGrabbing(true);
    containerRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
    setPanClamped(scale, d.ox + dx, d.oy + dy);
  };
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current) {
      try {
        containerRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    drag.current = null;
    setGrabbing(false);
  };

  const onClick = () => {
    // Suppress the collapse if this click was actually a pan gesture.
    if (drag.current?.moved) return;
    if (scale <= ZOOM_MIN) onPlainClick?.();
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        cursor: scale > ZOOM_MIN ? (grabbing ? 'grabbing' : 'grab') : 'pointer',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onClick}
      onDoubleClick={reset}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: drag.current ? 'none' : 'transform 60ms linear',
        }}
      >
        <StreamVideo stream={stream} />
      </div>
      {scale > ZOOM_MIN && (
        <span
          style={{
            position: 'absolute',
            left: 8,
            top: 8,
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(0,0,0,0.6)',
            fontSize: 12,
            color: '#e6e8ee',
          }}
        >
          {Math.round(scale * 100)}%
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * Crop editor: shows the LIVE full (uncropped) capture; drag a rectangle over
 * it, Apply → viewers see only that region (shim swaps the outgoing track for
 * a canvas-cropped one). Re-open to adjust; Remove crop restores the full
 * stream. Selection is kept in SOURCE pixels; display mapping accounts for
 * the letterboxed (object-fit: contain) preview.
 */
function CropEditor({
  win,
  sid,
  onClose,
}: {
  win: GridWindow;
  sid: string;
  onClose: () => void;
}) {
  const [stream] = useState<MediaStream | null>(() => {
    try {
      return win.__shuGetOriginal?.(sid) ?? null;
    } catch {
      return null;
    }
  });
  const hadCrop = useRef<boolean>(false);
  const [sel, setSel] = useState<CropRect | null>(() => {
    try {
      const r = win.__shuGetCrop?.(sid) ?? null;
      hadCrop.current = !!r;
      return r;
    } catch {
      return null;
    }
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [, forceRender] = useState(0);
  const drag = useRef<{ sx: number; sy: number } | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (v && stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
      const onMeta = () => forceRender((n) => n + 1);
      v.addEventListener('loadedmetadata', onMeta);
      return () => v.removeEventListener('loadedmetadata', onMeta);
    }
    return undefined;
  }, [stream]);

  // The video content box inside the letterboxed container (display px).
  const contentBox = () => {
    const el = boxRef.current;
    const v = videoRef.current;
    if (!el || !v || !v.videoWidth || !v.videoHeight) return null;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min(cw / v.videoWidth, ch / v.videoHeight);
    const w = v.videoWidth * scale;
    const h = v.videoHeight * scale;
    return { x: (cw - w) / 2, y: (ch - h) / 2, w, h, scale };
  };

  const toSource = (dx: number, dy: number): [number, number] | null => {
    const box = contentBox();
    const v = videoRef.current;
    if (!box || !v) return null;
    const x = Math.min(Math.max((dx - box.x) / box.scale, 0), v.videoWidth);
    const y = Math.min(Math.max((dy - box.y) / box.scale, 0), v.videoHeight);
    return [x, y];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = toSource(e.clientX - rect.left, e.clientY - rect.top);
    if (!p) return;
    drag.current = { sx: p[0], sy: p[1] };
    setSel({ x: p[0], y: p[1], w: 0, h: 0 });
    boxRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = boxRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const p = toSource(e.clientX - rect.left, e.clientY - rect.top);
    if (!p) return;
    setSel({
      x: Math.min(d.sx, p[0]),
      y: Math.min(d.sy, p[1]),
      w: Math.abs(p[0] - d.sx),
      h: Math.abs(p[1] - d.sy),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
    // discard accidental tiny selections
    setSel((s) => (s && (s.w < 16 || s.h < 16) ? null : s));
  };

  const apply = () => {
    if (!sel) return;
    const rect = {
      x: Math.round(sel.x),
      y: Math.round(sel.y),
      w: Math.round(sel.w),
      h: Math.round(sel.h),
    };
    try {
      win.__shuSetCrop?.(sid, rect);
    } catch {
      /* iframe gone */
    }
    onClose();
  };
  const removeCrop = () => {
    try {
      win.__shuClearCrop?.(sid);
    } catch {
      /* iframe gone */
    }
    onClose();
  };

  const box = contentBox();
  const selDisplay =
    sel && box
      ? {
          left: box.x + sel.x * box.scale,
          top: box.y + sel.y * box.scale,
          width: sel.w * box.scale,
          height: sel.h * box.scale,
        }
      : null;

  const btn: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 8,
    background: '#2b2d31',
    color: '#e6e8ee',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 14,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
      }}
    >
      <Text size="H5" style={{ color: '#e6e8ee' }}>
        Crop stream — drag to select the region viewers will see
      </Text>
      <div
        ref={boxRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: 'relative',
          width: 'min(90vw, 1400px)',
          height: 'min(70vh, 800px)',
          background: '#000',
          borderRadius: 10,
          overflow: 'hidden',
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
        />
        {selDisplay && (
          <div
            style={{
              position: 'absolute',
              ...selDisplay,
              border: '2px solid #3ba55d',
              boxShadow: '0 0 0 100000px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
            }}
          />
        )}
        {!stream && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#e6e8ee',
            }}
          >
            Stream not available
          </div>
        )}
      </div>
      <Box gap="300" alignItems="Center">
        <button type="button" style={btn} onClick={onClose}>
          Cancel
        </button>
        {hadCrop.current && (
          <button type="button" style={{ ...btn, color: '#ed4245' }} onClick={removeCrop}>
            Remove crop
          </button>
        )}
        <button
          type="button"
          style={{
            ...btn,
            background: sel ? '#3ba55d' : '#2b2d31',
            opacity: sel ? 1 : 0.5,
            cursor: sel ? 'pointer' : 'default',
          }}
          onClick={apply}
          disabled={!sel}
        >
          Apply crop
        </button>
      </Box>
    </div>
  );
}

const requestTileFullscreen = (el: HTMLElement | null) => {
  if (!el) return;
  const anyEl = el as any;
  (el.requestFullscreen?.bind(el) || anyEl.webkitRequestFullscreen?.bind(el))?.();
};

const cornerBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 6,
  background: 'rgba(0,0,0,0.55)',
  color: '#e6e8ee',
  padding: 4,
  cursor: 'pointer',
};

type TileMenu = { cords: RectCords; userId: string; own: boolean; video?: GridVideo };

/**
 * ShuChat's own Discord-style call grid, rendered ON TOP of the Element Call
 * iframe (which stays alive underneath as the audio/RTC engine). One tile per
 * person plus one tile per video stream (camera or any screen-share). Click a
 * stream = it fills the panel (click again to return). Hover a stream tile for
 * a fullscreen button; right-click for stop/volume/pop-out.
 */
export function CallGridOverlay({ callEmbed }: { callEmbed: CallEmbed }) {
  const mx = useMatrixClient();
  const joined = useCallJoined(callEmbed);
  const useAuthentication = useMediaAuthentication();
  const setPopout = useSetAtom(callPopoutAtom);
  const [grid, setGrid] = useState<GridParticipant[] | null>(null);
  const [spotlightSid, setSpotlightSid] = useState<string | null>(null);
  const [menu, setMenu] = useState<TileMenu | undefined>();
  const [cropSid, setCropSid] = useState<string | null>(null);
  const sigRef = useRef('');

  // Refresh the grid snapshot on change events (+ slow safety interval), but
  // only commit to React state when the signature actually changed — avoids
  // needless re-renders (and the stream objects are cached in the shim, so
  // videos never re-attach).
  useEffect(() => {
    if (!joined) return undefined;
    const win = callEmbed.iframe.contentWindow as GridWindow | null;
    if (!win) return undefined;
    const refresh = () => {
      let next: GridParticipant[] | null = null;
      try {
        next = win.__shuGetGrid ? win.__shuGetGrid() : null;
      } catch {
        next = null;
      }
      const sig = gridSignature(next);
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setGrid(next);
      }
    };
    refresh();
    win.addEventListener('shu-grid-update', refresh);
    const timer = setInterval(refresh, 2000);
    return () => {
      clearInterval(timer);
      try {
        win.removeEventListener('shu-grid-update', refresh);
      } catch {
        /* iframe gone */
      }
    };
  }, [callEmbed, joined]);

  const stopStream = useCallback(
    (sid: string) => {
      const win = callEmbed.iframe.contentWindow as GridWindow | null;
      win?.__shuStopStreamBySid?.(sid);
    },
    [callEmbed]
  );

  const memberName = useCallback(
    (userId: string) =>
      getMemberDisplayName(callEmbed.room, userId) ?? getMxIdLocalPart(userId) ?? userId,
    [callEmbed.room]
  );
  const memberAvatar = useCallback(
    (userId: string) => {
      const mxc = getMemberAvatarMxc(callEmbed.room, userId);
      return mxc ? mxcUrlToHttp(mx, mxc, useAuthentication, 96, 96) ?? undefined : undefined;
    },
    [callEmbed.room, mx, useAuthentication]
  );

  if (!joined || !grid || grid.length === 0) return null;

  // Dedupe streams: the same capture can surface under more than one
  // publication entry during (re)publish races — key by sid AND by the
  // underlying track id so a stream never renders twice.
  const allVideos: { p: GridParticipant; v: GridVideo }[] = [];
  const seen = new Set<string>();
  grid.forEach((p) =>
    p.videos.forEach((v) => {
      const trackId = v.stream.getVideoTracks()[0]?.id ?? v.sid;
      if (seen.has(v.sid) || seen.has(trackId)) return;
      seen.add(v.sid);
      seen.add(trackId);
      allVideos.push({ p, v });
    })
  );
  const spotlight = spotlightSid ? allVideos.find((x) => x.v.sid === spotlightSid) : undefined;

  // A tile menu only makes sense with items: others → volume; own stream →
  // stop; any stream (desktop) → pop out. Own PERSON tile (no video) = no menu
  // (prevents the focus-trap "no tabbable node" crash).
  const menuHasItems = (own: boolean, video?: GridVideo) =>
    !own || !!video || (!!video && popOutSupported());
  const openTileMenu = (evt: React.MouseEvent, userId: string, own: boolean, video?: GridVideo) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (!menuHasItems(own, video)) return;
    setMenu({ cords: { x: evt.clientX, y: evt.clientY, width: 0, height: 0 }, userId, own, video });
  };

  const tileBase: React.CSSProperties = {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    minHeight: 0,
    minWidth: 0,
  };
  const nameTag: React.CSSProperties = {
    position: 'absolute',
    left: 8,
    bottom: 8,
    padding: '2px 8px',
    borderRadius: 6,
    background: 'rgba(0,0,0,0.6)',
    fontSize: 12,
    color: '#e6e8ee',
    maxWidth: '80%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const tileCount = allVideos.length + grid.length;

  return (
    <div
      className={classNames(ContainerColor({ variant: 'Background' }))}
      style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column' }}
    >
      {spotlight ? (
        <SpotlightTile
          key={spotlight.v.sid}
          stream={spotlight.v.stream}
          label={`${memberName(identityToUserId(spotlight.p.identity))}${
            spotlight.v.source === 'camera' ? ' — Camera' : ' — Stream'
          }`}
          nameTag={nameTag}
          onCollapse={() => setSpotlightSid(null)}
          onContextMenu={(e) =>
            openTileMenu(e, identityToUserId(spotlight.p.identity), spotlight.p.isLocal, spotlight.v)
          }
        />
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gap: 10,
            padding: 12,
            // Discord-style packing: computed columns/rows so ALL tiles always
            // fit the panel — cells share the space equally (no aspect-ratio
            // forcing → no overlap, no scrollbars; videos letterbox inside).
            gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(tileCount))}, 1fr)`,
            gridTemplateRows: `repeat(${Math.ceil(
              tileCount / Math.ceil(Math.sqrt(tileCount))
            )}, 1fr)`,
            overflow: 'hidden',
          }}
        >
          {grid.map((p) => {
            const userId = identityToUserId(p.identity);
            return (
              <div
                key={p.identity}
                style={{
                  ...tileBase,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: p.isSpeaking ? 'inset 0 0 0 2px #3ba55d' : undefined,
                }}
                onContextMenu={(e) => openTileMenu(e, userId, p.isLocal)}
              >
                <Box direction="Column" alignItems="Center" gap="200">
                  <Avatar size="500">
                    <UserAvatar
                      userId={userId}
                      src={memberAvatar(userId)}
                      alt={memberName(userId)}
                      renderFallback={() => <Icon size="400" src={Icons.User} filled />}
                    />
                  </Avatar>
                  <Text size="T300" style={{ color: p.isSpeaking ? '#3ba55d' : undefined }}>
                    {memberName(userId)}
                  </Text>
                </Box>
              </div>
            );
          })}
          {allVideos.map(({ p, v }) => {
            const userId = identityToUserId(p.identity);
            return (
              <StreamTile
                key={v.sid}
                stream={v.stream}
                label={`${memberName(userId)}${v.source === 'camera' ? ' — Camera' : ' — Stream'}`}
                tileBase={tileBase}
                nameTag={nameTag}
                onClick={() => setSpotlightSid(v.sid)}
                onContextMenu={(e) => openTileMenu(e, userId, p.isLocal, v)}
              />
            );
          })}
        </div>
      )}

      {menu && (
        <PopOut
          anchor={menu.cords}
          offset={0}
          alignOffset={0}
          position="Bottom"
          align="Start"
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => setMenu(undefined),
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
              }}
            >
              <Menu>
                <Box direction="Column" style={{ padding: config.space.S100, minWidth: 200 }}>
                  {!menu.own && (
                    <ParticipantVolumeMenu callEmbed={callEmbed} userId={menu.userId} />
                  )}
                  {menu.own && menu.video && (
                    <MenuItem
                      size="300"
                      variant="Surface"
                      radii="300"
                      onClick={() => {
                        setCropSid(menu.video!.sid);
                        setMenu(undefined);
                      }}
                    >
                      <Text size="B300" truncate>
                        Crop stream…
                      </Text>
                    </MenuItem>
                  )}
                  {menu.own && menu.video && (
                    <MenuItem
                      size="300"
                      variant="Surface"
                      radii="300"
                      onClick={() => {
                        stopStream(menu.video!.sid);
                        setMenu(undefined);
                        if (spotlightSid === menu.video!.sid) setSpotlightSid(null);
                      }}
                    >
                      <Text size="B300" truncate style={{ color: '#ed4245' }}>
                        Stop this stream
                      </Text>
                    </MenuItem>
                  )}
                  {popOutSupported() && menu.video && (
                    <MenuItem
                      size="300"
                      variant="Surface"
                      radii="300"
                      onClick={() => {
                        const opened = popOutStream(menu.video!.stream, memberName(menu.userId), () =>
                          setPopout(false)
                        );
                        if (opened) setPopout(true);
                        setMenu(undefined);
                      }}
                    >
                      <Text size="B300" truncate>
                        Pop out stream
                      </Text>
                    </MenuItem>
                  )}
                </Box>
              </Menu>
            </FocusTrap>
          }
        >
          <span />
        </PopOut>
      )}

      {cropSid && (
        <CropEditor
          win={callEmbed.iframe.contentWindow as GridWindow}
          sid={cropSid}
          onClose={() => setCropSid(null)}
        />
      )}
    </div>
  );
}

function StreamTile({
  stream,
  label,
  tileBase,
  nameTag,
  onClick,
  onContextMenu,
}: {
  stream: MediaStream;
  label: string;
  tileBase: React.CSSProperties;
  nameTag: React.CSSProperties;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      style={{ ...tileBase, cursor: 'pointer' }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title="Click to enlarge"
      className="shu-stream-tile"
    >
      <StreamVideo stream={stream} />
      <span style={nameTag}>{label}</span>
      <button
        type="button"
        title="Fullscreen"
        onClick={(e) => {
          e.stopPropagation();
          requestTileFullscreen(ref.current);
        }}
        style={{ ...cornerBtn, position: 'absolute', top: 8, right: 8, fontSize: 13, lineHeight: 1 }}
      >
        ⤢
      </button>
    </div>
  );
}

function SpotlightTile({
  stream,
  label,
  nameTag,
  onCollapse,
  onContextMenu,
}: {
  stream: MediaStream;
  label: string;
  nameTag: React.CSSProperties;
  onCollapse: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      style={{ position: 'relative', flex: 1, minHeight: 0 }}
      onContextMenu={onContextMenu}
      title="Scroll to zoom · drag to pan · double-click to reset"
    >
      <ZoomableVideo stream={stream} onPlainClick={onCollapse}>
        <span style={nameTag}>{label}</span>
        <button
          type="button"
          title="Fullscreen"
          onClick={(e) => {
            e.stopPropagation();
            requestTileFullscreen(ref.current);
          }}
          style={{
            ...cornerBtn,
            position: 'absolute',
            top: 12,
            right: 12,
            padding: 6,
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ⤢
        </button>
      </ZoomableVideo>
    </div>
  );
}
