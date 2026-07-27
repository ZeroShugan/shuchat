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
// A scrollable window showing a text attachment's contents in the timeline.
// Copy / Open File / Download all live in the header row. The body reuses the
// modal viewer's Prism markup, so highlighting matches "Open File" exactly.

export const InlinePreview = style([
  DefaultReset,
  {
    marginTop: config.space.S200,
    width: '100%',
    borderRadius: config.radii.R400,
    border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    overflow: 'hidden',
  },
]);

export const InlinePreviewHeader = style([
  DefaultReset,
  {
    padding: `${config.space.S100} ${config.space.S200}`,
    borderBottom: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    backgroundColor: color.SurfaceVariant.Container,
    // Keep the action row reachable while the body scrolls under it.
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
]);

// The scrollable window itself. folds' <Scroll> owns the scrollbar styling, so
// the bar matches the active ShuChat theme instead of the browser default.
// resize:vertical lets the reader drag it taller for a long file.
export const InlinePreviewScroll = style([
  DefaultReset,
  {
    maxHeight: '320px',
    minHeight: '48px',
    resize: 'vertical',
  },
]);

export const InlinePreviewPre = style([
  DefaultReset,
  {
    margin: 0,
    padding: config.space.S200,
    fontFamily: 'monospace',
    lineHeight: 1.5,
    // Long log lines must wrap instead of forcing the timeline sideways.
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
]);

// Loading / error / "show preview" placeholder shown in place of the body.
export const InlinePreviewState = style([
  DefaultReset,
  {
    padding: config.space.S200,
  },
]);

export const InlinePreviewFooter = style([
  DefaultReset,
  {
    padding: `${config.space.S100} ${config.space.S200}`,
    borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  },
]);
