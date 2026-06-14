import React, { useState, useRef, useCallback } from 'react';
import { Icon, Icons, config } from 'folds';

// ── Embed detection ──────────────────────────────────────────────────────────

type EmbedInfo = {
  embedUrl: string;
  thumbnailUrl?: string;
  type: 'youtube' | 'twitch' | 'vimeo' | 'twitter' | 'discord_video' | 'discord_image';
  isPortrait: boolean; // e.g. YouTube Shorts
};

export function getEmbedInfo(url: string): EmbedInfo | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');

    // ── YouTube ──────────────────────────────────────────────────────────────
    if (host === 'youtube.com' || host === 'youtu.be') {
      let videoId: string | null = null;
      let isPortrait = false;
      const parts = u.pathname.split('/').filter(Boolean);

      if (host === 'youtu.be') {
        videoId = parts[0] ?? null;
      } else if (parts[0] === 'shorts' && parts[1]) {
        videoId = parts[1];
        isPortrait = true;
      } else if (parts[0] === 'watch') {
        videoId = u.searchParams.get('v');
      } else if (parts[0] === 'embed' && parts[1]) {
        videoId = parts[1];
      }

      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return {
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&enablejsapi=1`,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          type: 'youtube',
          isPortrait,
        };
      }
    }

    // ── Twitch ───────────────────────────────────────────────────────────────
    if (host === 'twitch.tv') {
      const parts = u.pathname.split('/').filter(Boolean);
      const parent =
        typeof window !== 'undefined' ? window.location.hostname : 'localhost';

      if (parts[0] === 'videos' && parts[1]) {
        return {
          embedUrl: `https://player.twitch.tv/?video=${parts[1]}&parent=${parent}&autoplay=true`,
          type: 'twitch',
          isPortrait: false,
        };
      }
      if (parts[1] === 'clip' && parts[2]) {
        return {
          embedUrl: `https://clips.twitch.tv/embed?clip=${parts[2]}&parent=${parent}&autoplay=true`,
          type: 'twitch',
          isPortrait: false,
        };
      }
      if (parts.length === 1) {
        return {
          embedUrl: `https://player.twitch.tv/?channel=${parts[0]}&parent=${parent}&autoplay=true`,
          type: 'twitch',
          isPortrait: false,
        };
      }
    }

    // ── Vimeo ────────────────────────────────────────────────────────────────
    if (host === 'vimeo.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      const videoId = parts.find((p) => /^\d+$/.test(p));
      if (videoId) {
        return {
          embedUrl: `https://player.vimeo.com/video/${videoId}?autoplay=1`,
          type: 'vimeo',
          isPortrait: false,
        };
      }
    }

    // ── Twitter / X ──────────────────────────────────────────────────────────
    if (host === 'twitter.com' || host === 'x.com') {
      const vxUrl = `https://vxtwitter.com${u.pathname}${u.search}`;
      return {
        embedUrl: vxUrl,
        type: 'twitter',
        isPortrait: false,
      };
    }

    // ── Discord CDN — direct media files ────────────────────────────────────
    if (host === 'cdn.discordapp.com' || host === 'media.discordapp.net') {
      // Extract filename from path (before query params)
      const pathSegments = u.pathname.split('/');
      const filename = pathSegments[pathSegments.length - 1] ?? '';
      const ext = filename.split('.').pop()?.toLowerCase() ?? '';
      const videoExts = ['mp4', 'webm', 'mov', 'mkv', 'ogg'];
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'];
      if (videoExts.includes(ext)) {
        return {
          embedUrl: url,
          type: 'discord_video',
          isPortrait: false,
        };
      }
      if (imageExts.includes(ext)) {
        return {
          embedUrl: url,
          type: 'discord_image',
          isPortrait: false,
        };
      }
    }
  } catch {
    // invalid URL
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────

type EmbedPreviewProps = { url: string };

export function EmbedPreview({ url }: EmbedPreviewProps) {
  const [playing, setPlaying] = useState(false);
  const info = getEmbedInfo(url);
  if (!info) return null;

  // ── Discord CDN: render native video or image directly ──────────────────
  if (info.type === 'discord_video') {
    return (
      <video
        src={info.embedUrl}
        controls
        style={{
          marginTop: config.space.S200,
          maxWidth: 480,
          maxHeight: 360,
          width: '100%',
          height: 'auto',
          borderRadius: config.radii.R400,
          background: '#0d0d0d',
          display: 'block',
        }}
      />
    );
  }

  if (info.type === 'discord_image') {
    return (
      <img
        src={info.embedUrl}
        alt="Discord attachment"
        style={{
          marginTop: config.space.S200,
          maxWidth: 480,
          maxHeight: 360,
          width: '100%',
          height: 'auto',
          borderRadius: config.radii.R400,
          display: 'block',
          objectFit: 'contain',
        }}
      />
    );
  }

  const maxWidth = info.isPortrait ? 220 : 480;
  // aspect ratio: shorts 9/16, everything else 16/9
  const aspectRatio = info.isPortrait ? (16 / 9) : (9 / 16);
  const height = Math.round(maxWidth * aspectRatio);

  const containerStyle: React.CSSProperties = {
    marginTop: config.space.S200,
    width: '100%',
    maxWidth,
    height,
    borderRadius: config.radii.R400,
    overflow: 'hidden',
    position: 'relative',
    background: '#0d0d0d',
    cursor: playing ? 'default' : 'pointer',
    flexShrink: 0,
  };

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    if (info?.type === 'youtube') {
      // YouTube IFrame API: set volume to 50 after load
      // Small delay to ensure the player is ready
      setTimeout(() => {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'setVolume', args: [50] }),
          '*'
        );
      }, 800);
    }
  }, [info]);

  if (playing) {
    return (
      <div style={containerStyle}>
        <iframe
          ref={iframeRef}
          src={info.embedUrl}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          title="Embedded video"
          onLoad={handleIframeLoad}
        />
      </div>
    );
  }

  // Click-to-play thumbnail state
  return (
    <div style={containerStyle} onClick={() => setPlaying(true)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setPlaying(true)}
      title="Click to play"
    >
      {/* Thumbnail */}
      {info.thumbnailUrl && (
        <img
          src={info.thumbnailUrl}
          alt="Video thumbnail"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}

      {/* Dark overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: info.thumbnailUrl ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Play button circle */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: info.type === 'youtube' ? 'rgba(255,0,0,0.9)' :
                      info.type === 'twitch'  ? 'rgba(100,65,165,0.9)' :
                      info.type === 'twitter' ? 'rgba(29,161,242,0.9)' :
                                                'rgba(26,183,234,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          transition: 'transform 0.1s',
        }}>
          <Icon src={Icons.Play} size="400" style={{ color: '#fff', marginLeft: 3 }} />
        </div>
      </div>

      {/* Site badge */}
      <div style={{
        position: 'absolute', bottom: 6, left: 8,
        background: 'rgba(0,0,0,0.65)',
        borderRadius: 4, padding: '1px 6px',
        fontSize: 11, color: '#fff', fontWeight: 600, letterSpacing: 0.3,
      }}>
        {info.type === 'youtube' ? '▶ YouTube' :
         info.type === 'twitch'  ? '● Twitch'  :
         info.type === 'twitter' ? '𝕏 Twitter/X' : 'Vimeo'}
      </div>
    </div>
  );
}
