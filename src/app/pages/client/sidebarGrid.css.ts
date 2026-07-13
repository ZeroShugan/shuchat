import { style, globalStyle } from '@vanilla-extract/css';

/* When the space/server sidebar is resized to roughly double its default
   width, flow the tabs into two columns instead of one long strip. The
   stack containers become display:contents so the individual tabs are the
   grid items. */
export const SidebarTwoColumns = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  justifyItems: 'center',
  alignItems: 'start',
  rowGap: '4px',
});

globalStyle(`${SidebarTwoColumns} > *`, {
  display: 'contents',
});

/* separators keep spanning the full width */
globalStyle(`${SidebarTwoColumns} hr, ${SidebarTwoColumns} [role="separator"]`, {
  gridColumn: '1 / -1',
  display: 'block',
  width: '100%',
});
