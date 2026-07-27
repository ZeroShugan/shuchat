import { style } from '@vanilla-extract/css';
import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

export const Attachment = recipe({
  base: {
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    borderRadius: config.radii.R400,
    overflow: 'hidden',
    maxWidth: '100%',
    width: toRem(400),
    selectors: {
      // A text-file preview is meant to be read, so let it use the full width of
      // the timeline like a normal message. Scoped with :has() so image/video/
      // audio/pdf attachments keep the compact 400px card.
      '&:has([data-shuchat-textpreview])': {
        width: '100%',
      },
    },
  },
  variants: {
    outlined: {
      true: {
        boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.ContainerLine}`,
      },
    },
  },
});

export type AttachmentVariants = RecipeVariants<typeof Attachment>;

export const AttachmentHeader = style({
  padding: config.space.S300,
});

export const AttachmentBox = style([
  DefaultReset,
  {
    maxWidth: '100%',
    maxHeight: toRem(600),
    width: toRem(400),
    overflow: 'hidden',
    selectors: {
      // Same exception as Attachment above: a text preview is for reading, so it
      // gets the full message width. This box pins its own 400px independently
      // of the outer card, so BOTH need the override or the card widens while
      // the content inside stays narrow.
      '&:has([data-shuchat-textpreview])': {
        width: '100%',
        // A source file needs more vertical room than a thumbnail.
        maxHeight: 'none',
      },
    },
  },
]);

export const AttachmentContent = style({
  padding: config.space.S300,
  paddingTop: 0,
});
