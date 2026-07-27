import React, { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Icon, Icons, Spinner, Text, color } from 'folds';
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
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import * as css from './style.css';

/**
 * Inline preview for text attachments — a small scrollable window showing the
 * file's contents right in the timeline, with a Copy button in the top-right.
 *
 * Cinny already downloads + decrypts text files for its *modal* viewer; this
 * reuses exactly that path so end-to-end encrypted files work identically. The
 * modal ("Open File") and Download are left untouched — this is an additional
 * affordance, not a replacement.
 */

/** Auto-fetch cap. Anything bigger needs an explicit click — nobody wants a
 *  40 MB log silently pulled just because it scrolled past. */
export const INLINE_PREVIEW_AUTO_MAX_BYTES = 256 * 1024;

/** How much text we actually render. A pathological single-line file would
 *  otherwise lock up the timeline. */
const MAX_RENDER_CHARS = 200 * 1000;

type InlineTextPreviewProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  /** size from the event's file info, when the sender provided it */
  size?: number;
};

export function InlineTextPreview({
  body,
  mimeType,
  url,
  encInfo,
  size,
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

  if (textState.status === AsyncStatus.Error) {
    return (
      <Box className={css.InlinePreviewNotice} alignItems="Center" gap="200">
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
      <Box className={css.InlinePreviewNotice} alignItems="Center" gap="200">
        <Spinner size="100" variant="Secondary" />
        <Text size="T200" priority="300">
          Loading preview…
        </Text>
      </Box>
    );
  }

  if (textState.status !== AsyncStatus.Success) {
    // Idle: either auto-load is off, or the file is too big to pull unasked.
    return (
      <Box className={css.InlinePreviewNotice} alignItems="Center" gap="200">
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

  const full = textState.data;
  const truncated = full.length > MAX_RENDER_CHARS;
  const shown = truncated ? full.slice(0, MAX_RENDER_CHARS) : full;

  return (
    <Box className={css.InlinePreview} direction="Column" data-shuchat-textpreview="">
      <Box className={css.InlinePreviewHeader} alignItems="Center" gap="200">
        <Box grow="Yes">
          <Text size="T200" priority="300" truncate>
            {body}
          </Text>
        </Box>
        <Chip
          variant={copied ? 'Success' : 'Secondary'}
          radii="Pill"
          onClick={handleCopy}
          before={<Icon size="50" src={copied ? Icons.Check : Icons.Link} />}
        >
          <Text size="B300">{copied ? 'Copied' : 'Copy'}</Text>
        </Chip>
      </Box>
      <pre className={css.InlinePreviewBody}>{shown}</pre>
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
