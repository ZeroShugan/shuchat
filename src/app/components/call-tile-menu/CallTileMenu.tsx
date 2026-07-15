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
import { ParticipantVolumeMenu } from './ParticipantVolumeMenu';

type TileTarget = {
  cords: RectCords;
  userId: string;
  own: boolean;
  isOwnShare: boolean;
  video: HTMLVideoElement | null;
  multiShareReady: boolean;
  extraShareCount: number;
};

type ShimWindow = Window & {
  __shuScreenShare?: MediaStream | null;
  __shuLKRoom?: unknown;
  __shuExtraShareCount?: number;
  __shuShareAnother?: () => Promise<boolean>;
  __shuStopExtraShares?: () => void;
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
      const win = callEmbed.iframe.contentWindow as ShimWindow | null;
      const isOwnShare =
        own && !!video && !!win?.__shuScreenShare && video.srcObject === win.__shuScreenShare;

      // iframe-relative → viewport coordinates
      const frame = callEmbed.iframe.getBoundingClientRect();
      setTarget({
        cords: { x: frame.left + evt.clientX, y: frame.top + evt.clientY, width: 0, height: 0 },
        userId,
        own,
        isOwnShare,
        video,
        multiShareReady: !!win?.__shuShareAnother && !!win?.__shuLKRoom,
        extraShareCount: win?.__shuExtraShareCount ?? 0,
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
  const handleShareAnother = () => {
    const win = callEmbed.iframe.contentWindow as ShimWindow | null;
    win?.__shuShareAnother?.().catch(() => {
      /* cancelled or room unavailable — shim logs the reason */
    });
    close();
  };
  const handleStopExtras = () => {
    const win = callEmbed.iframe.contentWindow as ShimWindow | null;
    win?.__shuStopExtraShares?.();
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
              {target.own && target.multiShareReady && (
                <MenuItem size="300" variant="Surface" radii="300" onClick={handleShareAnother}>
                  <Text size="B300" truncate>
                    Share another screen…
                  </Text>
                </MenuItem>
              )}
              {target.own && target.extraShareCount > 0 && (
                <MenuItem size="300" variant="Surface" radii="300" onClick={handleStopExtras}>
                  <Text size="B300" truncate style={{ color: '#ed4245' }}>
                    Stop extra shares ({target.extraShareCount})
                  </Text>
                </MenuItem>
              )}
              {!target.own && (
                <ParticipantVolumeMenu callEmbed={callEmbed} userId={target.userId} />
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
