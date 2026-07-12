import { style, globalStyle } from '@vanilla-extract/css';
import { color } from 'folds';

/* Theme-matching native <select>. The popup list rendered by the browser only
   respects solid background/color set on the <option> elements — without this
   the options render white-on-white in dark themes. */
export const NativeSelect = style({
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: '8px',
  padding: '6px 10px',
  outline: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '13px',
  maxWidth: '240px',
  width: '100%',
  selectors: {
    '&:focus-visible': {
      borderColor: color.Primary.Main,
    },
  },
});

globalStyle(`${NativeSelect} option, ${NativeSelect} optgroup`, {
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
});
