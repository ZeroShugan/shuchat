import React, { useCallback, useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';
import { Box, config, Menu, MenuItem, PopOut, RectCords, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useCallEmbed, useCallJoined } from '../../hooks/useCallEmbed';
import { CallEmbed } from '../../plugins/call';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { stopPropagation } from '../../utils/keyboard';
import { callPopoutAtom } from '../../state/callEmbed';
import { popOutStream, popOutSupported } from '../floating-stream/popout';

type TileTarget = {
  cords: RectCords;
  userId: string;
  own: boolean;
  isOwnShare: boolean;
  video: HTMLVideoElement | null;
};

/**
 * Discord-style right-click menu on Element Call grid tiles. The EC grid lives
 * in a same-origin iframe; we listen for contextmenu inside it, resolve the
 * tile (same selector chain as useCallSpeakers: [data-video-fit] → child
 * [aria-label] = mxid), and render a ShuChat-themed menu in the parent app at
 * the translated coordinates.
 */
export function CallTileMenu() {
  const callEmbed = useCallEmbed();
  if (!callEmbed) return null;
  return <CallTileMenuInner callEmbed={callEmbed} />;
}

function CallTileMenuInner({ callEmbed }: { callEmbed: CallEmbed }) {
  const mx = useMatrixClient();
  const joined = useCallJoined(callEmbed);
  const [target, setTarget] = useState<TileTarget | undefined>();
  const [volume, setVolume] = useState(100);
  const setPopout = useSetAtom(callPopoutAtom);

  useEffect(() => {
    if (!joined) return undefined;
    const doc = callEmbed.iframe.contentDocument;
    if (!doc) return undefined;

    const onContextMenu = (evt: MouseEvent) => {
      const el = evt.target as HTMLElement | null;
      const tile = el?.closest?.('[data-video-fit]') as HTMLElement | null;
      if (!tile) return; // not on a tile → let EC/browser behave normally
      evt.preventDefault();
      evt.stopPropagation();

      const userId = tile.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';
      if (!userId.startsWith('@')) return;
      const own = userId === mx.getUserId();

      const video = tile.querySelector('video') as HTMLVideoElement | null;
      // My share tile shows the exact MediaStream the shim captured.
      const win = callEmbed.iframe.contentWindow as
        | (Window & { __shuScreenShare?: MediaStream | null })
        | null;
      const isOwnShare =
        own && !!video && !!win?.__shuScreenShare && video.srcObject === win.__shuScreenShare;

      // iframe-relative → viewport coordinates
      const frame = callEmbed.iframe.getBoundingClientRect();
      setVolume(Math.round((callEmbed.control.getParticipantVolume(userId) ?? 1) * 100));
      setTarget({
        cords: { x: frame.left + evt.clientX, y: frame.top + evt.clientY, width: 0, height: 0 },
        userId,
        own,
        isOwnShare,
        video,
      });
    };

    doc.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      try {
        doc.removeEventListener('contextmenu', onContextMenu, true);
      } catch {
        /* iframe may be gone */
      }
    };
  }, [callEmbed, joined, mx]);

  const close = useCallback(() => setTarget(undefined), []);

  const handleShareAudio = () => {
    callEmbed.control.restartScreenshare();
    close();
  };
  const handleStop = () => {
    callEmbed.control.toggleScreenshare();
    close();
  };
  const handlePopOut = () => {
    if (!target?.video?.srcObject) return;
    const opened = popOutStream(
      target.video.srcObject as MediaStream,
      target.userId,
      () => setPopout(false)
    );
    if (opened) setPopout(true);
    close();
  };
  const handleVolume = (v: number) => {
    setVolume(v);
    if (target) callEmbed.control.setParticipantVolume(target.userId, v / 100);
  };

  if (!target) return null;

  return (
    <PopOut
      anchor={target.cords}
      offset={0}
      alignOffset={0}
      position="Bottom"
      align="Start"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu>
            <Box direction="Column" style={{ padding: config.space.S100, minWidth: 200 }}>
              {target.own && callEmbed.control.screenshare && (
                <>
                  <MenuItem size="300" variant="Surface" radii="300" onClick={handleShareAudio}>
                    <Text size="B300" truncate>
                      Share audio (restarts share)
                    </Text>
                  </MenuItem>
                  <MenuItem size="300" variant="Surface" radii="300" onClick={handleStop}>
                    <Text size="B300" truncate style={{ color: '#ed4245' }}>
                      Stop streaming
                    </Text>
                  </MenuItem>
                </>
              )}
              {!target.own && (
                <Box
                  direction="Column"
                  gap="100"
                  style={{ padding: `${config.space.S100} ${config.space.S200}` }}
                >
                  <Box justifyContent="SpaceBetween" alignItems="Center">
                    <Text size="L400">Volume</Text>
                    <Text size="T200">{volume}%</Text>
                  </Box>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={volume}
                    onChange={(e) => handleVolume(parseInt(e.target.value, 10))}
                    style={{ width: '100%' }}
                  />
                </Box>
              )}
              {popOutSupported() && target.video?.srcObject && (
                <MenuItem size="300" variant="Surface" radii="300" onClick={handlePopOut}>
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
  );
}
