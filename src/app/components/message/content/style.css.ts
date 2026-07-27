import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const RelativeBase = style([
  DefaultReset,
  {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
]);

export const AbsoluteContainer = style([
  DefaultReset,
  {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
]);

export const AbsoluteFooter = style([
  DefaultReset,
  {
    position: 'absolute',
    pointerEvents: 'none',
    bottom: config.space.S100,
    left: config.space.S100,
    right: config.space.S100,
  },
]);

export const Blur = style([
  DefaultReset,
  {
    filter: 'blur(44px)',
  },
]);

// ── Inline text-file preview (ShuChat addition) ──────────────────────────────
// A small scrollable window showing a text attachment's contents in the
// timeline, with a Copy button in the header. Sits next to the existing
// Open File / Download buttons rather than replacing them.

export const InlinePreview = style([
  DefaultReset,
  {
    marginTop: config.space.S200,
    width: '100%',
    borderRadius: config.radii.R400,
    border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    backgroundColor: color.SurfaceVariant.Container,
    overflow: 'hidden',
  },
]);

export const InlinePreviewHeader = style([
  DefaultReset,
  {
    padding: `${config.space.S100} ${config.space.S200}`,
    borderBottom: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    backgroundColor: color.SurfaceVariant.Container,
    // Keep the Copy button reachable while the body scrolls under it.
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
]);

export const InlinePreviewBody = style([
  DefaultReset,
  {
    margin: 0,
    padding: config.space.S200,
    // The scrollable window itself. resize:vertical lets the reader drag it
    // taller for a long file without needing the full modal.
    maxHeight: '240px',
    minHeight: '48px',
    overflow: 'auto',
    resize: 'vertical',
    fontFamily: 'monospace',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    // Long log lines must wrap instead of forcing the timeline sideways.
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: color.SurfaceVariant.OnContainer,
  },
]);

export const InlinePreviewFooter = style([
  DefaultReset,
  {
    padding: `${config.space.S100} ${config.space.S200}`,
    borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  },
]);

export const InlinePreviewNotice = style([
  DefaultReset,
  {
    marginTop: config.space.S200,
    padding: `${config.space.S100} ${config.space.S200}`,
    borderRadius: config.radii.R400,
    border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    backgroundColor: color.SurfaceVariant.Container,
  },
]);
