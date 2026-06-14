import React, { useState, useCallback, useEffect } from 'react';
import { MsgType } from 'matrix-js-sdk';
import { HTMLReactParserOptions } from 'html-react-parser';
import { Opts } from 'linkifyjs';
import { Icon, Icons, config } from 'folds';
import {
  AudioContent,
  DownloadFile,
  FileContent,
  ImageContent,
  MAudio,
  MBadEncrypted,
  MEmote,
  MFile,
  MImage,
  MLocation,
  MNotice,
  MText,
  MVideo,
  ReadPdfFile,
  ReadTextFile,
  RenderBody,
  ThumbnailContent,
  UnsupportedContent,
  VideoContent,
} from './message';
import { EmbedPreview, getEmbedInfo, UrlPreviewCard, UrlPreviewHolder } from './url-preview';
import { Image, MediaControl, Video } from './media';
import { ImageViewer } from './image-viewer';
import { PdfViewer } from './Pdf-viewer';
import { TextViewer } from './text-viewer';
import { testMatrixTo } from '../plugins/matrix-to';
import { URL_REG } from '../utils/regex';
import { IImageContent } from '../../types/matrix/common';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useMediaAuthentication } from '../hooks/useMediaAuthentication';
import FileSaver from 'file-saver';
import { decryptFile, downloadEncryptedMedia, downloadMedia, mxcUrlToHttp } from '../utils/matrix';
import { FALLBACK_MIMETYPE } from '../utils/mimeTypes';
import { FavGif } from './gif-board/GifBoard';

type RenderMessageContentProps = {
  displayName: string;
  senderId?: string;
  msgType: string;
  ts: number;
  edited?: boolean;
  getContent: <T>() => T;
  mediaAutoLoad?: boolean;
  urlPreview?: boolean;
  highlightRegex?: RegExp;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
  outlineAttachment?: boolean;
};

// ── GIF star-favourite overlay ────────────────────────────────────────────────
const GIF_FAV_LS_KEY = 'shuchat_gif_favourites';
const GIF_FAV_ACCT_TYPE = 'im.shuchat.gif_favourites';

type GifImageWrapperProps = {
  content: IImageContent;
  outlined?: boolean;
  mediaAutoLoad?: boolean;
  isOwn?: boolean;
};
function GifImageWrapper({ content, outlined, mediaAutoLoad, isOwn }: GifImageWrapperProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const rawUrl = content.file?.url ?? content.url ?? '';
  const isGif =
    content.info?.mimetype === 'image/gif' ||
    rawUrl.includes('giphy.com') ||
    rawUrl.toLowerCase().endsWith('.gif');

  const [hovered, setHovered] = useState(false);
  const [isFav, setIsFav] = useState(false);

  // Load favourite state from Matrix account data (falls back to localStorage)
  useEffect(() => {
    try {
      const event = mx.getAccountData(GIF_FAV_ACCT_TYPE);
      if (event) {
        const c = event.getContent() as { favourites?: Array<{ id: string }> };
        if (Array.isArray(c.favourites)) {
          setIsFav(c.favourites.some((f) => f.id === rawUrl));
          return;
        }
      }
      const stored: FavGif[] = JSON.parse(localStorage.getItem(GIF_FAV_LS_KEY) || '[]');
      setIsFav(stored.some((f) => f.id === rawUrl));
    } catch { /* ignore */ }
  }, [mx, rawUrl]);

  const handleToggleFav = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const stored: FavGif[] = JSON.parse(localStorage.getItem(GIF_FAV_LS_KEY) || '[]');
        let next: FavGif[];
        if (stored.some((f) => f.id === rawUrl)) {
          next = stored.filter((f) => f.id !== rawUrl);
        } else {
          next = [
            ...stored,
            {
              id: rawUrl,
              title: content.body || 'GIF',
              previewUrl: rawUrl,
              sendUrl: rawUrl,
              w: content.info?.w ?? 480,
              h: content.info?.h ?? 270,
            },
          ];
        }
        localStorage.setItem(GIF_FAV_LS_KEY, JSON.stringify(next));
        mx.setAccountData(GIF_FAV_ACCT_TYPE, { favourites: next }).catch(() => {});
        setIsFav((prev) => !prev);
      } catch { /* ignore */ }
    },
    [mx, rawUrl, content]
  );

  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const filename = content.body || 'image';
      if (!rawUrl.startsWith('mxc://')) {
        const blob = await downloadMedia(rawUrl);
        FileSaver.saveAs(blob, filename);
        return;
      }
      const token = mx.getAccessToken() ?? undefined;
      const httpUrl = mxcUrlToHttp(mx, rawUrl, useAuthentication);
      if (!httpUrl) return;
      if (content.file) {
        const blob = await downloadEncryptedMedia(
          httpUrl,
          (buf) => decryptFile(buf, content.info?.mimetype ?? FALLBACK_MIMETYPE, content.file!),
          token
        );
        FileSaver.saveAs(blob, filename);
      } else {
        const blob = await downloadMedia(httpUrl, token);
        FileSaver.saveAs(blob, filename);
      }
    } catch { /* ignore */ }
  }, [mx, rawUrl, content, useAuthentication]);

  const imgW = content.info?.w ?? 0;
  const imgH = content.info?.h ?? 0;
  const wrapperMaxW = (imgW > 0 && imgH > 0)
    ? Math.max(Math.min(Math.round(imgW * Math.min(400 / imgW, 400 / imgH)), 400), 44)
    : 400;

  return (
    <div
      style={{ position: 'relative', display: 'inline-block', width: '100%', maxWidth: wrapperMaxW }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <MImage
        content={content}
        renderImageContent={(props) => (
          <ImageContent
            {...props}
            isOwn={isOwn}
            autoPlay={mediaAutoLoad}
            renderImage={(p) => <Image {...p} loading="lazy" />}
            renderViewer={(p) => <ImageViewer {...p} />}
          />
        )}
        outlined={outlined}
      />
      {hovered && (
        <button
          type="button"
          onClick={handleDownload}
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            background: 'rgba(0,0,0,0.6)',
            border: 'none',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            zIndex: 10,
            transition: 'background 0.15s',
          }}
          title="Download"
        >
          <Icon src={Icons.Download} size="50" style={{ color: '#fff' }} />
        </button>
      )}
      {isGif && hovered && (
        <button
          type="button"
          onClick={handleToggleFav}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: isFav ? '#f0a500' : 'rgba(0,0,0,0.6)',
            border: 'none',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            zIndex: 10,
            transition: 'background 0.15s',
          }}
          title={isFav ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Icon src={Icons.Star} size="50" filled={isFav} style={{ color: '#fff' }} />
        </button>
      )}
    </div>
  );
}

export function RenderMessageContent({
  displayName,
  senderId,
  msgType,
  ts,
  edited,
  getContent,
  mediaAutoLoad,
  urlPreview,
  highlightRegex,
  htmlReactParserOptions,
  linkifyOpts,
  outlineAttachment,
}: RenderMessageContentProps) {
  const mx = useMatrixClient();
  const isOwn = !!senderId && senderId === mx.getUserId();
  // Extract embeddable URLs from plain text body — used when urlPreview is disabled
  // (e.g. encrypted DMs). Pure client-side: no server calls.
  const getEmbedOnlyContent = (body: string): React.ReactNode => {
    const matches = body.match(URL_REG);
    if (!matches) return null;
    const embedUrls = [...new Set(matches)]
      .filter((u) => !testMatrixTo(u) && getEmbedInfo(u) !== null);
    if (embedUrls.length === 0) return null;
    return (
      <>
        {embedUrls.map((u) => (
          <EmbedPreview key={u} url={u} />
        ))}
      </>
    );
  };

  const renderUrlsPreview = (urls: string[]) => {
    const filteredUrls = urls.filter((url) => !testMatrixTo(url));
    if (filteredUrls.length === 0) return undefined;

    const embedUrls = filteredUrls.filter((url) => getEmbedInfo(url) !== null);
    const plainUrls = filteredUrls.filter((url) => getEmbedInfo(url) === null);

    return (
      <>
        {embedUrls.map((url) => (
          <EmbedPreview key={url} url={url} />
        ))}
        {plainUrls.length > 0 && (
          <UrlPreviewHolder>
            {plainUrls.map((url) => (
              <UrlPreviewCard key={url} url={url} ts={ts} />
            ))}
          </UrlPreviewHolder>
        )}
      </>
    );
  };
  const renderCaption = () => {
    const content: IImageContent = getContent();
    if (content.filename && content.filename !== content.body) {
      return (
        <MText
          style={{ marginTop: config.space.S200 }}
          edited={edited}
          content={content}
          renderBody={(props) => (
            <RenderBody
              {...props}
              highlightRegex={highlightRegex}
              htmlReactParserOptions={htmlReactParserOptions}
              linkifyOpts={linkifyOpts}
            />
          )}
          renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
        />
      );
    }
    return null;
  };

  const renderFile = () => (
    <>
      <MFile
        content={getContent()}
        renderFileContent={({ body, mimeType, info, encInfo, url }) => (
          <FileContent
            body={body}
            mimeType={mimeType}
            renderAsPdfFile={() => (
              <ReadPdfFile
                body={body}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                renderViewer={(p) => <PdfViewer {...p} />}
              />
            )}
            renderAsTextFile={() => (
              <ReadTextFile
                body={body}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                renderViewer={(p) => <TextViewer {...p} />}
              />
            )}
          >
            <DownloadFile body={body} mimeType={mimeType} url={url} encInfo={encInfo} info={info} />
          </FileContent>
        )}
        outlined={outlineAttachment}
      />
      {renderCaption()}
    </>
  );

  if (msgType === MsgType.Text) {
    const textContent = getContent<{ body?: string }>();
    const embedOnly = !urlPreview
      ? getEmbedOnlyContent(textContent.body ?? '')
      : null;
    return (
      <>
        <MText
          edited={edited}
          content={getContent()}
          renderBody={(props) => (
            <RenderBody
              {...props}
              highlightRegex={highlightRegex}
              htmlReactParserOptions={htmlReactParserOptions}
              linkifyOpts={linkifyOpts}
            />
          )}
          renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
        />
        {embedOnly}
      </>
    );
  }

  if (msgType === MsgType.Emote) {
    const emoteContent = getContent<{ body?: string }>();
    const embedOnly = !urlPreview
      ? getEmbedOnlyContent(emoteContent.body ?? '')
      : null;
    return (
      <>
        <MEmote
          displayName={displayName}
          edited={edited}
          content={getContent()}
          renderBody={(props) => (
            <RenderBody
              {...props}
              highlightRegex={highlightRegex}
              htmlReactParserOptions={htmlReactParserOptions}
              linkifyOpts={linkifyOpts}
            />
          )}
          renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
        />
        {embedOnly}
      </>
    );
  }

  if (msgType === MsgType.Notice) {
    const noticeContent = getContent<{ body?: string }>();
    const embedOnly = !urlPreview
      ? getEmbedOnlyContent(noticeContent.body ?? '')
      : null;
    return (
      <>
        <MNotice
          edited={edited}
          content={getContent()}
          renderBody={(props) => (
            <RenderBody
              {...props}
              highlightRegex={highlightRegex}
              htmlReactParserOptions={htmlReactParserOptions}
              linkifyOpts={linkifyOpts}
            />
          )}
          renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
        />
        {embedOnly}
      </>
    );
  }

  if (msgType === MsgType.Image) {
    return (
      <>
        <GifImageWrapper
          content={getContent()}
          outlined={outlineAttachment}
          mediaAutoLoad={mediaAutoLoad}
          isOwn={isOwn}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.Video) {
    return (
      <>
        <MVideo
          content={getContent()}
          renderAsFile={renderFile}
          renderVideoContent={({ body, info, ...props }) => (
            <VideoContent
              body={body}
              info={info}
              {...props}
              isOwn={isOwn}
              renderThumbnail={
                mediaAutoLoad
                  ? () => (
                      <ThumbnailContent
                        info={info}
                        renderImage={(src) => (
                          <Image alt={body} title={body} src={src} loading="lazy" />
                        )}
                      />
                    )
                  : undefined
              }
              renderVideo={(p) => <Video {...p} ref={(el) => { if (el) el.volume = 0.5; }} />}
            />
          )}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.Audio) {
    return (
      <>
        <MAudio
          content={getContent()}
          renderAsFile={renderFile}
          renderAudioContent={(props) => (
            <AudioContent {...props} renderMediaControl={(p) => <MediaControl {...p} />} />
          )}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.File) {
    return renderFile();
  }

  if (msgType === MsgType.Location) {
    return <MLocation content={getContent()} />;
  }

  if (msgType === 'm.bad.encrypted') {
    return <MBadEncrypted />;
  }

  return <UnsupportedContent />;
}
