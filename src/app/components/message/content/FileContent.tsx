import React, { ReactNode, useCallback, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Icon,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  as,
} from 'folds';
import FileSaver from 'file-saver';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import FocusTrap from 'focus-trap-react';
import { IFileInfo } from '../../../../types/matrix/common';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { bytesToSize } from '../../../utils/common';
import {
  READABLE_EXT_TO_MIME_TYPE,
  READABLE_TEXT_MIME_TYPES,
  getFileNameExt,
  mimeTypeToExt,
} from '../../../utils/mimeTypes';
import { stopPropagation } from '../../../utils/keyboard';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { ModalWide } from '../../../styles/Modal.css';

/** Does Cinny treat this attachment as readable text? Exported because callers
 *  need the same answer to decide where the file's action buttons belong. */
export const isReadableTextFile = (body: string, mimeType: string): boolean =>
  READABLE_TEXT_MIME_TYPES.includes(mimeType) ||
  Boolean(READABLE_EXT_TO_MIME_TYPE[getFileNameExt(body)]);

const renderErrorButton = (retry: () => void, text: string) => (
  <TooltipProvider
    tooltip={
      <Tooltip variant="Critical">
        <Text>Failed to load file!</Text>
      </Tooltip>
    }
    position="Top"
    align="Center"
  >
    {(triggerRef) => (
      <Button
        ref={triggerRef}
        size="400"
        variant="Critical"
        fill="Soft"
        outlined
        radii="300"
        onClick={retry}
        before={<Icon size="100" src={Icons.Warning} filled />}
      >
        <Text size="B400" truncate>
          {text}
        </Text>
      </Button>
    )}
  </TooltipProvider>
);

type RenderTextViewerProps = {
  name: string;
  text: string;
  langName: string;
  requestClose: () => void;
};
type ReadTextFileProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  renderViewer: (props: RenderTextViewerProps) => ReactNode;
  /** Render as a pill chip instead of a full-width button, for use inside the
   *  inline preview's header row alongside Copy. */
  compact?: boolean;
};
export function ReadTextFile({
  body,
  mimeType,
  url,
  encInfo,
  renderViewer,
  compact,
}: ReadTextFileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [textViewer, setTextViewer] = useState(false);

  const [textState, loadText] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);

      const text = fileContent.text();
      setTextViewer(true);
      return text;
    }, [mx, useAuthentication, mimeType, encInfo, url])
  );

  const loading = textState.status === AsyncStatus.Loading;
  const handleOpen = () =>
    textState.status === AsyncStatus.Success ? setTextViewer(true) : loadText();

  const renderTrigger = () => {
    if (textState.status === AsyncStatus.Error) return renderErrorButton(loadText, 'Open File');
    if (compact)
      return (
        <Chip
          variant="Secondary"
          radii="Pill"
          onClick={handleOpen}
          disabled={loading}
          before={
            loading ? (
              <Spinner size="100" variant="Secondary" />
            ) : (
              <Icon size="50" src={Icons.ArrowRight} filled />
            )
          }
        >
          <Text size="B300">Open File</Text>
        </Chip>
      );
    return (
      <Button
        variant="Secondary"
        fill="Solid"
        radii="300"
        size="400"
        onClick={handleOpen}
        disabled={loading}
        before={
          loading ? (
            <Spinner fill="Solid" size="100" variant="Secondary" />
          ) : (
            <Icon size="100" src={Icons.ArrowRight} filled />
          )
        }
      >
        <Text size="B400" truncate>
          Open File
        </Text>
      </Button>
    );
  };

  return (
    <>
      {textState.status === AsyncStatus.Success && (
        <Overlay open={textViewer} backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => setTextViewer(false),
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
              }}
            >
              <Modal
                className={ModalWide}
                size="500"
                onContextMenu={(evt: any) => evt.stopPropagation()}
              >
                {renderViewer({
                  name: body,
                  text: textState.data,
                  langName: READABLE_TEXT_MIME_TYPES.includes(mimeType)
                    ? mimeTypeToExt(mimeType)
                    : mimeTypeToExt(READABLE_EXT_TO_MIME_TYPE[getFileNameExt(body)] ?? mimeType),
                  requestClose: () => setTextViewer(false),
                })}
              </Modal>
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
      {renderTrigger()}
    </>
  );
}

type RenderPdfViewerProps = {
  name: string;
  src: string;
  requestClose: () => void;
};
export type ReadPdfFileProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  renderViewer: (props: RenderPdfViewerProps) => ReactNode;
};
export function ReadPdfFile({ body, mimeType, url, encInfo, renderViewer }: ReadPdfFileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [pdfViewer, setPdfViewer] = useState(false);

  const [pdfState, loadPdf] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);
      setPdfViewer(true);
      return URL.createObjectURL(fileContent);
    }, [mx, url, useAuthentication, mimeType, encInfo])
  );

  return (
    <>
      {pdfState.status === AsyncStatus.Success && (
        <Overlay open={pdfViewer} backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => setPdfViewer(false),
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
              }}
            >
              <Modal
                className={ModalWide}
                size="500"
                onContextMenu={(evt: any) => evt.stopPropagation()}
              >
                {renderViewer({
                  name: body,
                  src: pdfState.data,
                  requestClose: () => setPdfViewer(false),
                })}
              </Modal>
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
      {pdfState.status === AsyncStatus.Error ? (
        renderErrorButton(loadPdf, 'Open PDF')
      ) : (
        <Button
          variant="Secondary"
          fill="Solid"
          radii="300"
          size="400"
          onClick={() => (pdfState.status === AsyncStatus.Success ? setPdfViewer(true) : loadPdf())}
          disabled={pdfState.status === AsyncStatus.Loading}
          before={
            pdfState.status === AsyncStatus.Loading ? (
              <Spinner fill="Solid" size="100" variant="Secondary" />
            ) : (
              <Icon size="100" src={Icons.ArrowRight} filled />
            )
          }
        >
          <Text size="B400" truncate>
            Open PDF
          </Text>
        </Button>
      )}
    </>
  );
}

export type DownloadFileProps = {
  body: string;
  mimeType: string;
  url: string;
  info: IFileInfo;
  encInfo?: EncryptedAttachmentInfo;
  /** Render as a pill chip instead of a full-width button — see ReadTextFile. */
  compact?: boolean;
};
export function DownloadFile({
  body,
  mimeType,
  url,
  info,
  encInfo,
  compact,
}: DownloadFileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [downloadState, download] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);

      const fileURL = URL.createObjectURL(fileContent);
      FileSaver.saveAs(fileURL, body);
      return fileURL;
    }, [mx, url, useAuthentication, mimeType, encInfo, body])
  );

  const loading = downloadState.status === AsyncStatus.Loading;
  const label = `Download (${bytesToSize(info.size ?? 0)})`;
  const handleDownload = () =>
    downloadState.status === AsyncStatus.Success
      ? FileSaver.saveAs(downloadState.data, body)
      : download();

  if (downloadState.status === AsyncStatus.Error) {
    return renderErrorButton(download, `Retry ${label}`);
  }

  if (compact) {
    return (
      <Chip
        variant="Secondary"
        radii="Pill"
        onClick={handleDownload}
        disabled={loading}
        before={
          loading ? (
            <Spinner size="100" variant="Secondary" />
          ) : (
            <Icon size="50" src={Icons.Download} filled />
          )
        }
      >
        <Text size="B300">{label}</Text>
      </Chip>
    );
  }

  return (
    <Button
      variant="Secondary"
      fill="Soft"
      radii="300"
      size="400"
      onClick={handleDownload}
      disabled={loading}
      before={
        loading ? (
          <Spinner fill="Soft" size="100" variant="Secondary" />
        ) : (
          <Icon size="100" src={Icons.Download} filled />
        )
      }
    >
      <Text size="B400" truncate>
        {label}
      </Text>
    </Button>
  );
}

type FileContentProps = {
  body: string;
  mimeType: string;
  renderAsTextFile: () => ReactNode;
  renderAsPdfFile: () => ReactNode;
};
export const FileContent = as<'div', FileContentProps>(
  ({ body, mimeType, renderAsTextFile, renderAsPdfFile, children, ...props }, ref) => (
    <Box direction="Column" gap="300" {...props} ref={ref}>
      {isReadableTextFile(body, mimeType) && renderAsTextFile()}
      {mimeType === 'application/pdf' && renderAsPdfFile()}
      {children}
    </Box>
  )
);
