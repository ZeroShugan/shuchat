import React, { useCallback } from 'react';
import { Box, Text, config, toRem } from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import { callEmbedAtom } from '../../state/callEmbed';

/** Shows a thin "Voice Connected" strip above UserPanel — only visible during a call. */
export function VoiceStatusBar() {
  const callEmbed = useAtomValue(callEmbedAtom);
  const setCallEmbed = useSetAtom(callEmbedAtom);
  const handleLeave = useCallback(() => setCallEmbed(undefined), [setCallEmbed]);

  if (!callEmbed) return null;

  return (
    <Box
      shrink="No"
      alignItems="Center"
      justifyContent="SpaceBetween"
      style={{
        padding: `${toRem(5)} ${config.space.S300}`,
        background: 'rgba(59,165,93,0.1)',
        borderTop: '1px solid rgba(59,165,93,0.25)',
        gap: toRem(8),
      }}
    >
      <Box direction="Column" style={{ minWidth: 0 }}>
        <Box gap="100" alignItems="Center">
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3ba55d', display: 'inline-block', flexShrink: 0 }} />
          <Text size="T200" style={{ fontWeight: 600, fontSize: toRem(11), color: '#3ba55d' }}>
            Voice Connected
          </Text>
        </Box>
        {callEmbed.room?.name && (
          <Text size="T200" truncate style={{ opacity: 0.55, fontSize: toRem(11), paddingLeft: toRem(15) }}>
            {callEmbed.room.name}
          </Text>
        )}
      </Box>
      <button
        onClick={handleLeave}
        style={{
          background: 'rgba(237,66,69,0.15)',
          border: '1px solid rgba(237,66,69,0.4)',
          borderRadius: 6, padding: `${toRem(3)} ${toRem(10)}`,
          cursor: 'pointer', color: '#ed4245',
          fontSize: 12, fontFamily: 'inherit', flexShrink: 0, fontWeight: 600,
        }}
      >
        Leave
      </button>
    </Box>
  );
}
