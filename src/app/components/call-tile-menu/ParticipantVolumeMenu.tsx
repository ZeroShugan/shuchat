import React, { useRef, useState } from 'react';
import { Box, Icon, Icons, MenuItem, Text, config } from 'folds';
import { CallEmbed } from '../../plugins/call';
import { RangeSlider } from '../range-slider';

type ParticipantVolumeMenuProps = {
  callEmbed: CallEmbed;
  userId: string;
};

/**
 * Per-participant audio controls (shared by the grid tile right-click menu and
 * the left-nav voice member right-click menu): a theme-matching 0–200% volume
 * slider plus a local "Mute for me" toggle (volume 0, previous level restored
 * on unmute). Applies live via CallControl.setParticipantVolume.
 */
export function ParticipantVolumeMenu({ callEmbed, userId }: ParticipantVolumeMenuProps) {
  const [volume, setVolume] = useState(() =>
    Math.round((callEmbed.control.getParticipantVolume(userId) ?? 1) * 100)
  );
  // Volume to restore when unmuting (last non-zero level).
  const restoreRef = useRef(volume > 0 ? volume : 100);
  const muted = volume === 0;

  const applyVolume = (v: number) => {
    if (v > 0) restoreRef.current = v;
    setVolume(v);
    callEmbed.control.setParticipantVolume(userId, v / 100);
  };

  const toggleMute = () => {
    applyVolume(muted ? restoreRef.current : 0);
  };

  return (
    <Box direction="Column" gap="100">
      <Box
        direction="Column"
        gap="100"
        style={{ padding: `${config.space.S100} ${config.space.S200}` }}
      >
        <Box justifyContent="SpaceBetween" alignItems="Center" gap="200">
          <Text size="L400">Volume</Text>
          <Text size="T200">{muted ? 'Muted' : `${volume}%`}</Text>
        </Box>
        <RangeSlider
          min={0}
          max={200}
          step={5}
          value={volume}
          onChange={(v) => applyVolume(Math.round(v))}
          width="100%"
        />
      </Box>
      <MenuItem
        size="300"
        variant="Surface"
        radii="300"
        onClick={toggleMute}
        before={<Icon size="50" src={muted ? Icons.VolumeMute : Icons.VolumeHigh} />}
      >
        <Text size="B300" truncate style={muted ? undefined : { color: '#ed4245' }}>
          {muted ? 'Unmute for me' : 'Mute for me'}
        </Text>
      </MenuItem>
    </Box>
  );
}
