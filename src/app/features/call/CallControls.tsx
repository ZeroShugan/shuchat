import React, { MouseEventHandler, useCallback, useRef, useState } from 'react';
import {
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
  toRem,
  Tooltip,
  TooltipProvider,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { SequenceCard } from '../../components/sequence-card';
import * as css from './styles.css';
import {
  ChatButton,
  ControlDivider,
  MicrophoneButton,
  ScreenShareButton,
  SoundButton,
  VideoButton,
} from './Controls';
import { CallEmbed, useCallControlState } from '../../plugins/call';
import { useVoiceControls } from '../../hooks/useVoiceControls';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { stopPropagation } from '../../utils/keyboard';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';

type CallControlsProps = {
  callEmbed: CallEmbed;
};
export function CallControls({ callEmbed }: CallControlsProps) {
  const controlRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(document.body.clientWidth < 500);

  useResizeObserver(
    useCallback(() => {
      const element = controlRef.current;
      if (!element) return;
      setCompact(element.clientWidth < 500);
    }, []),
    useCallback(() => controlRef.current, [])
  );

  const { video, screenshare, spotlight } = useCallControlState(callEmbed.control);
  // Mic/sound go through the unified hook so ALL mute/deafen buttons stay in
  // sync and play the feedback tones.
  const { microphone, sound, toggleMicrophone, toggleSound } = useVoiceControls();

  // Camera picker: starting the camera first shows a device menu (like the
  // screen-share picker); stopping toggles directly.
  const [camCords, setCamCords] = useState<RectCords>();
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [, setCamDeviceId] = useSetting(settingsAtom, 'vvCamDeviceId');
  const handleVideoToggle = async () => {
    if (video) {
      callEmbed.control.toggleVideo();
      return;
    }
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const found = list.filter((d) => d.kind === 'videoinput' && d.label !== '');
      if (found.length > 1) {
        setCams(found);
        const btn = document.querySelector('[data-shu-video-btn]');
        setCamCords(btn ? btn.getBoundingClientRect() : undefined);
        if (btn) return; // menu opens; selection starts the camera
      }
    } catch {
      /* fall through to direct start */
    }
    callEmbed.control.toggleVideo();
  };
  const startCameraWith = (deviceId: string) => {
    setCamDeviceId(deviceId);
    setCamCords(undefined);
    // give the settings storage event a beat to reach the call iframe shim
    setTimeout(() => callEmbed.control.toggleVideo(), 120);
  };

  const [cords, setCords] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSpotlightClick = () => {
    callEmbed.control.toggleSpotlight();
    setCords(undefined);
  };

  const handleReactionsClick = () => {
    callEmbed.control.toggleReactions();
    setCords(undefined);
  };

  const handleSettingsClick = () => {
    callEmbed.control.toggleSettings();
    setCords(undefined);
  };

  const [hangupState, hangup] = useAsyncCallback(
    useCallback(() => callEmbed.hangup(), [callEmbed])
  );
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

  return (
    <Box
      ref={controlRef}
      className={css.CallControlContainer}
      justifyContent="Center"
      alignItems="Center"
    >
      <SequenceCard
        className={css.ControlCard}
        variant="SurfaceVariant"
        gap="400"
        radii="500"
        alignItems="Center"
        justifyContent="SpaceBetween"
      >
        <Box alignItems="Center" gap="Inherit" grow="Yes" direction={compact ? 'Column' : 'Row'}>
          <Box shrink="No" alignItems="Inherit" justifyContent="Inherit" gap="200">
            <MicrophoneButton enabled={microphone} onToggle={async () => toggleMicrophone()} />
            <SoundButton enabled={sound} onToggle={toggleSound} />
          </Box>
          {!compact && <ControlDivider />}
          <Box shrink="No" alignItems="Inherit" justifyContent="Inherit" gap="200">
            <span data-shu-video-btn>
              <VideoButton enabled={video} onToggle={handleVideoToggle} />
            </span>
            <PopOut
              anchor={camCords}
              position="Top"
              align="Center"
              content={
                <FocusTrap
                  focusTrapOptions={{
                    initialFocus: false,
                    onDeactivate: () => setCamCords(undefined),
                    clickOutsideDeactivates: true,
                    escapeDeactivates: stopPropagation,
                  }}
                >
                  <Menu>
                    <Box direction="Column" style={{ padding: config.space.S100, minWidth: 220 }}>
                      <Box style={{ padding: config.space.S100 }}>
                        <Text size="L400">Start camera with…</Text>
                      </Box>
                      {cams.map((c) => (
                        <MenuItem
                          key={c.deviceId}
                          size="300"
                          variant="Surface"
                          radii="300"
                          onClick={() => startCameraWith(c.deviceId)}
                        >
                          <Text size="B300" truncate>
                            {c.label || 'Camera'}
                          </Text>
                        </MenuItem>
                      ))}
                    </Box>
                  </Menu>
                </FocusTrap>
              }
            >
              <span />
            </PopOut>
            <ScreenShareButton
              enabled={screenshare}
              onToggle={() => callEmbed.control.toggleScreenshare()}
            />
            {screenshare && callEmbed.control.multiShareReady && (
              <TooltipProvider
                position="Top"
                tooltip={
                  <Tooltip>
                    <Text size="T200">Share another screen</Text>
                  </Tooltip>
                }
              >
                {(anchorRef) => (
                  <IconButton
                    ref={anchorRef}
                    variant="Surface"
                    fill="Soft"
                    radii="400"
                    size="400"
                    outlined
                    onClick={() => callEmbed.control.shareAnotherScreen()}
                  >
                    <Icon size="300" src={Icons.Plus} />
                  </IconButton>
                )}
              </TooltipProvider>
            )}
          </Box>
        </Box>
        {!compact && <ControlDivider />}
        <Box alignItems="Center" gap="Inherit" grow="Yes" direction={compact ? 'Column' : 'Row'}>
          <Box shrink="No" alignItems="Inherit" justifyContent="Inherit" gap="200">
            <ChatButton />
            <PopOut
              anchor={cords}
              position="Top"
              align="Center"
              content={
                <FocusTrap
                  focusTrapOptions={{
                    initialFocus: false,
                    onDeactivate: () => setCords(undefined),
                    clickOutsideDeactivates: true,
                    isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                    isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                    escapeDeactivates: stopPropagation,
                  }}
                >
                  <Menu>
                    <Box direction="Column" style={{ padding: config.space.S100 }}>
                      <MenuItem
                        size="300"
                        variant="Surface"
                        radii="300"
                        onClick={handleSpotlightClick}
                      >
                        <Text size="B300" truncate>
                          {spotlight ? 'Grid View' : 'Spotlight View'}
                        </Text>
                      </MenuItem>
                      <MenuItem
                        size="300"
                        variant="Surface"
                        radii="300"
                        onClick={handleReactionsClick}
                      >
                        <Text size="B300" truncate>
                          Reactions
                        </Text>
                      </MenuItem>
                      <MenuItem
                        size="300"
                        variant="Surface"
                        radii="300"
                        onClick={handleSettingsClick}
                      >
                        <Text size="B300" truncate>
                          Settings
                        </Text>
                      </MenuItem>
                    </Box>
                  </Menu>
                </FocusTrap>
              }
            >
              <IconButton
                variant="Surface"
                fill="Soft"
                radii="400"
                size="400"
                onClick={handleOpenMenu}
                outlined
                aria-pressed={!!cords}
              >
                <Icon size="400" src={Icons.VerticalDots} />
              </IconButton>
            </PopOut>
          </Box>
          <Box shrink="No" direction="Column">
            <Button
              style={{ minWidth: toRem(88) }}
              variant="Critical"
              fill="Solid"
              onClick={hangup}
              before={
                exiting ? (
                  <Spinner variant="Critical" fill="Solid" size="200" />
                ) : (
                  <Icon src={Icons.PhoneDown} size="200" filled />
                )
              }
              disabled={exiting}
            >
              <Text size="B400">End</Text>
            </Button>
          </Box>
        </Box>
      </SequenceCard>
    </Box>
  );
}
