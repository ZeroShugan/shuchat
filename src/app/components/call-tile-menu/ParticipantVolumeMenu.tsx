import React, { useState } from 'react';
import { Box, config, Text } from 'folds';
import { CallEmbed } from '../../plugins/call';

type ParticipantVolumeMenuProps = {
  callEmbed: CallEmbed;
  userId: string;
};

/**
 * Per-participant volume slider (0–200% of the global voice volume). Shared by
 * the grid tile right-click menu and the left-nav voice member right-click
 * menu. Applies live via CallControl.setParticipantVolume.
 */
export function ParticipantVolumeMenu({ callEmbed, userId }: ParticipantVolumeMenuProps) {
  const [volume, setVolume] = useState(() =>
    Math.round((callEmbed.control.getParticipantVolume(userId) ?? 1) * 100)
  );

  const handleVolume = (v: number) => {
    setVolume(v);
    callEmbed.control.setParticipantVolume(userId, v / 100);
  };

  return (
    <Box
      direction="Column"
      gap="100"
      style={{ padding: `${config.space.S100} ${config.space.S200}` }}
    >
      <Box justifyContent="SpaceBetween" alignItems="Center" gap="200">
        <Text size="L400">Volume</Text>
        <Text size="T200">{volume}%</Text>
      </Box>
      <input
        type="range"
        min={0}
        max={200}
        value={volume}
        onChange={(e) => handleVolume(parseInt(e.target.value, 10))}
        style={{ width: '100%', minWidth: 160 }}
      />
    </Box>
  );
}
