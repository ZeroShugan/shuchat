import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const LiveChipText = style({
  color: color.Critical.Main,
});

export const CallStatus = style([
  {
    padding: `${toRem(8)} ${config.space.S300}`,
    borderTop: `${toRem(2)} solid #3ba55d`,
    background: 'rgba(59, 165, 93, 0.08)',
  },
]);

export const VoiceConnectedLabel = style({
  color: '#3ba55d',
  fontWeight: 600,
  fontSize: toRem(12),
  letterSpacing: '0.02em',
});

export const DisconnectButton = style({
  color: '#ed4245',
});

export const ControlDivider = style({
  height: toRem(16),
});

export const SpeakerAvatarOutline = style({
  boxShadow: `0 0 0 ${config.borderWidth.B600} ${color.Success.Main}`,
});
