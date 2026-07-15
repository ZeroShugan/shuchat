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

type GridWindow = Window & {
  __shuGetGrid?: () => GridParticipant[] | null;
  __shuStopStreamBySid?: (sid: string) => void;
};

/** LiveKit identity in MatrixRTC = `${mxid}:${deviceId}` — strip the device. */
const identityToUserId = (identity: string): string => {
  const i = identity.lastIndexOf(':');
  return i > 0 ? identity.slice(0, i) : identity;
};

function StreamVideo({ stream, muted }: { stream: MediaStream; muted: boolean }) {
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
      muted={muted}
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
    />
  );
}

type TileMenu = { cords: RectCords; userId: string; own: boolean; video?: GridVideo };

/**
 * ShuChat's own Discord-style call grid, rendered ON TOP of the Element Call
 * iframe (which stays alive underneath as the audio/RTC engine). One tile per
 * person (avatar + name + speaking ring) plus one tile per video stream
 * (camera or any of the multi screen-shares). Click a stream = it fills the
 * panel (Exit bottom-right or click again to return). Right-click a stream:
 * stop (own) / volume (others) / pop out.
 */
export function CallGridOverlay({ callEmbed }: { callEmbed: CallEmbed }) {
  const mx = useMatrixClient();
  const joined = useCallJoined(callEmbed);
  const useAuthentication = useMediaAuthentication();
  const setPopout = useSetAtom(callPopoutAtom);
  const [grid, setGrid] = useState<GridParticipant[] | null>(null);
  const [spotlightSid, setSpotlightSid] = useState<string | null>(null);
  const [menu, setMenu] = useState<TileMenu | undefined>();

  // Poll the shim's grid snapshot on change events (+ slow safety interval).
  useEffect(() => {
    if (!joined) return undefined;
    const win = callEmbed.iframe.contentWindow as GridWindow | null;
    if (!win) return undefined;
    const refresh = () => {
      try {
        setGrid(win.__shuGetGrid ? win.__shuGetGrid() : null);
      } catch {
        setGrid(null);
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

  // Not joined yet, or the room hook is unavailable (EC update) → let EC's own
  // UI show through (clean degradation).
  if (!joined || !grid || grid.length === 0) return null;

  const allVideos: { p: GridParticipant; v: GridVideo }[] = [];
  grid.forEach((p) => p.videos.forEach((v) => allVideos.push({ p, v })));
  const spotlight = spotlightSid ? allVideos.find((x) => x.v.sid === spotlightSid) : undefined;

  const openTileMenu = (evt: React.MouseEvent, userId: string, own: boolean, video?: GridVideo) => {
    evt.preventDefault();
    evt.stopPropagation();
    setMenu({ cords: { x: evt.clientX, y: evt.clientY, width: 0, height: 0 }, userId, own, video });
  };

  const tileBase: React.CSSProperties = {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    minHeight: 0,
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

  return (
    <div
      className={classNames(ContainerColor({ variant: 'Background' }))}
      style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column' }}
    >
      {spotlight ? (
        // ---- Spotlight: one stream fills the panel ----
        <div
          style={{ position: 'relative', flex: 1, minHeight: 0, cursor: 'pointer' }}
          onClick={() => setSpotlightSid(null)}
          onContextMenu={(e) =>
            openTileMenu(e, identityToUserId(spotlight.p.identity), spotlight.p.isLocal, spotlight.v)
          }
        >
          <StreamVideo stream={spotlight.v.stream} muted />
          <span style={nameTag}>
            {memberName(identityToUserId(spotlight.p.identity))}
            {spotlight.v.source === 'camera' ? ' — Camera' : ' — Stream'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSpotlightSid(null);
            }}
            style={{
              position: 'absolute', right: 12, bottom: 12,
              display: 'flex', alignItems: 'center', gap: 6,
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
              background: 'rgba(0,0,0,0.6)', color: '#e6e8ee',
              padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Icon size="50" src={Icons.ChevronLeft} /> Back to grid
          </button>
        </div>
      ) : (
        // ---- Grid: person tiles + one tile per stream ----
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gap: 10,
            padding: 12,
            gridTemplateColumns: `repeat(auto-fit, minmax(${
              allVideos.length + grid.length > 4 ? 220 : 320
            }px, 1fr))`,
            gridAutoRows: '1fr',
            alignItems: 'stretch',
            overflowY: 'auto',
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
                  aspectRatio: '16/9',
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
              <div
                key={v.sid}
                style={{ ...tileBase, cursor: 'pointer', aspectRatio: '16/9' }}
                onClick={() => setSpotlightSid(v.sid)}
                onContextMenu={(e) => openTileMenu(e, userId, p.isLocal, v)}
                title="Click to enlarge"
              >
                <StreamVideo stream={v.stream} muted />
                <span style={nameTag}>
                  {memberName(userId)}
                  {v.source === 'camera' ? ' — Camera' : ' — Stream'}
                </span>
              </div>
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
    </div>
  );
}
