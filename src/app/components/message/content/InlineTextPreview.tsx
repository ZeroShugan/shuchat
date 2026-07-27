import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { Box, Chip, Icon, Icons, Scroll, Spinner, Text, color } from 'folds';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '../../../utils/matrix';
import { copyToClipboard } from '../../../utils/dom';
import {
  READABLE_EXT_TO_MIME_TYPE,
  READABLE_TEXT_MIME_TYPES,
  getFileNameExt,
  mimeTypeToExt,
} from '../../../utils/mimeTypes';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { TextViewerContent } from '../../text-viewer/TextViewer';
import * as css from './style.css';

/**
 * Inline preview for text attachments — a scrollable window showing the file's
 * contents right in the timeline, with Copy / Open File / Download in its
 * header.
 *
 * Cinny already downloads + decrypts text files for its *modal* viewer; this
 * reuses exactly that path so end-to-end encrypted files work identically, and
 * reuses `TextViewerContent` so syntax highlighting is the same Prism setup the
 * modal uses (no second highlighter to keep in sync).
 */

/** Auto-fetch cap. Anything bigger needs an explicit click — nobody wants a
 *  40 MB log silently pulled just because it scrolled past. */
export const INLINE_PREVIEW_AUTO_MAX_BYTES = 256 * 1024;

/** How much text we actually render. A pathological single-line file would
 *  otherwise lock up the timeline. */
const MAX_RENDER_CHARS = 200 * 1000;

/** Above this, skip Prism. Highlighting is synchronous and several previews can
 *  be mounted at once in a timeline — a big file would jank the whole room.
 *  The modal viewer ("Open File") still highlights the full text on demand. */
const HIGHLIGHT_MAX_CHARS = 50 * 1000;

type InlineTextPreviewProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  /** size from the event's file info, when the sender provided it */
  size?: number;
  /** Extra header controls (Open File / Download) rendered next to Copy, so the
   *  file's actions all live in one row instead of stacking around the box. */
  actions?: ReactNode;
};

export function InlineTextPreview({
  body,
  mimeType,
  url,
  encInfo,
  size,
  actions,
}: InlineTextPreviewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  // Respect the user's existing "Media Auto Load" choice — someone who turned
  // that off does not want attachments fetched without asking, and a text file
  // is no different.
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [copied, setCopied] = useState(false);

  const [textState, loadText] = useAsyncCallback<string, Error, []>(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);
      return fileContent.text();
    }, [mx, useAuthentication, mimeType, encInfo, url])
  );

  const smallEnough = typeof size !== 'number' || size <= INLINE_PREVIEW_AUTO_MAX_BYTES;
  const autoLoad = mediaAutoLoad && smallEnough;

  useEffect(() => {
    if (autoLoad && textState.status === AsyncStatus.Idle) loadText();
  }, [autoLoad, textState.status, loadText]);

  const handleCopy = useCallback(() => {
    if (textState.status !== AsyncStatus.Success) return;
    copyToClipboard(textState.data);
    setCopied(true);
  }, [textState]);

  // Reset the "Copied" confirmation shortly after, so the button is reusable.
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  // Same language resolution the modal viewer uses: trust the MIME type when it
  // is one we know, otherwise fall back to the file extension.
  const langName = READABLE_TEXT_MIME_TYPES.includes(mimeType)
    ? mimeTypeToExt(mimeType)
    : mimeTypeToExt(READABLE_EXT_TO_MIME_TYPE[getFileNameExt(body)] ?? mimeType);

  const loaded = textState.status === AsyncStatus.Success ? textState.data : undefined;
  const truncated = loaded !== undefined && loaded.length > MAX_RENDER_CHARS;
  const shown = loaded === undefined ? undefined : loaded.slice(0, MAX_RENDER_CHARS);

  const renderBody = () => {
    if (textState.status === AsyncStatus.Error) {
      return (
        <Box className={css.InlinePreviewState} alignItems="Center" gap="200">
          <Icon size="50" src={Icons.Warning} filled style={{ color: color.Critical.Main }} />
          <Text size="T200" style={{ color: color.Critical.Main }}>
            Failed to load preview
          </Text>
          <Chip variant="Secondary" radii="Pill" onClick={() => loadText()}>
            <Text size="B300">Retry</Text>
          </Chip>
        </Box>
      );
    }

    if (textState.status === AsyncStatus.Loading) {
      return (
        <Box className={css.InlinePreviewState} alignItems="Center" gap="200">
          <Spinner size="100" variant="Secondary" />
          <Text size="T200" priority="300">
            Loading preview…
          </Text>
        </Box>
      );
    }

    if (shown === undefined) {
      // Idle: either auto-load is off, or the file is too big to pull unasked.
      return (
        <Box className={css.InlinePreviewState} alignItems="Center" gap="200">
          <Chip variant="Secondary" radii="Pill" onClick={() => loadText()}>
            <Text size="B300">Show preview</Text>
          </Chip>
          {!smallEnough && (
            <Text size="T200" priority="300">
              large file
            </Text>
          )}
        </Box>
      );
    }

    return (
      <Scroll
        className={css.InlinePreviewScroll}
        variant="SurfaceVariant"
        visibility="Always"
        size="300"
        direction="Vertical"
      >
        {shown.length <= HIGHLIGHT_MAX_CHARS ? (
          <TextViewerContent
            className={css.InlinePreviewPre}
            text={shown}
            langName={langName}
            size="T200"
          />
        ) : (
          <Text as="pre" size="T200" className={css.InlinePreviewPre}>
            <code>{shown}</code>
          </Text>
        )}
      </Scroll>
    );
  };

  return (
    <Box className={css.InlinePreview} direction="Column" data-shuchat-textpreview="">
      <Box className={css.InlinePreviewHeader} alignItems="Center" gap="200">
        <Box grow="Yes">
          <Text size="T200" priority="300" truncate>
            {body}
          </Text>
        </Box>
        <Box shrink="No" alignItems="Center" gap="200">
          {actions}
          <Chip
            variant={copied ? 'Success' : 'Secondary'}
            radii="Pill"
            onClick={handleCopy}
            disabled={loaded === undefined}
            before={<Icon size="50" src={copied ? Icons.Check : Icons.Link} />}
          >
            <Text size="B300">{copied ? 'Copied' : 'Copy'}</Text>
          </Chip>
        </Box>
      </Box>
      {renderBody()}
      {truncated && (
        <Box className={css.InlinePreviewFooter} alignItems="Center">
          <Text size="T200" priority="300">
            Preview truncated — use Open File to see all of it.
          </Text>
        </Box>
      )}
    </Box>
  );
}
