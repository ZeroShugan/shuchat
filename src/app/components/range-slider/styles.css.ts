import { style } from '@vanilla-extract/css';
import { color } from 'folds';

const trackBg = color.SurfaceVariant.ContainerActive;
const fill = color.Primary.Main;

export const RangeSlider = style({
  appearance: 'none',
  WebkitAppearance: 'none',
  height: '20px',
  margin: 0,
  padding: 0,
  background: 'transparent',
  cursor: 'pointer',
  selectors: {
    // WebKit (Chrome/Edge/Safari) — filled portion via --rs-fill custom property
    '&::-webkit-slider-runnable-track': {
      height: '6px',
      borderRadius: '3px',
      background: `linear-gradient(to right, ${fill} 0%, ${fill} var(--rs-fill, 50%), ${trackBg} var(--rs-fill, 50%), ${trackBg} 100%)`,
    },
    '&::-webkit-slider-thumb': {
      WebkitAppearance: 'none',
      appearance: 'none',
      width: '14px',
      height: '14px',
      marginTop: '-4px',
      borderRadius: '50%',
      background: fill,
      border: 'none',
      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      transition: 'transform 100ms ease',
    },
    '&:hover::-webkit-slider-thumb': {
      background: color.Primary.MainHover,
      transform: 'scale(1.15)',
    },
    '&:active::-webkit-slider-thumb': {
      background: color.Primary.MainActive,
    },
    // Firefox — native progress pseudo-element
    '&::-moz-range-track': {
      height: '6px',
      borderRadius: '3px',
      background: trackBg,
    },
    '&::-moz-range-progress': {
      height: '6px',
      borderRadius: '3px',
      background: fill,
    },
    '&::-moz-range-thumb': {
      width: '14px',
      height: '14px',
      borderRadius: '50%',
      background: fill,
      border: 'none',
      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      transition: 'transform 100ms ease',
    },
    '&:hover::-moz-range-thumb': {
      background: color.Primary.MainHover,
      transform: 'scale(1.15)',
    },
    '&:active::-moz-range-thumb': {
      background: color.Primary.MainActive,
    },
    '&:focus-visible': {
      outline: `2px solid ${color.Primary.MainLine}`,
      outlineOffset: '2px',
      borderRadius: '4px',
    },
    '&:disabled': {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
  },
});
