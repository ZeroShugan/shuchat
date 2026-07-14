import React, { useState, useCallback, useRef, useEffect } from 'react';
import { usePanelWidth } from '../../hooks/usePanelWidth';
import { ResizeHandle } from '../../components/resize-handle';
import {
  Box, Text, Icon, Icons, IconButton, config, color, Line, Spinner, Button,
} from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { SetPresence, UserEvent } from 'matrix-js-sdk';
import { useUserPresence, Presence } from '../../hooks/useUserPresence';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { getMxIdLocalPart, mxcUrlToHttp, getMxIdServer } from '../../utils/matrix';
import { UserHero, UserHeroName } from '../../components/user-profile/UserHero';
import { useExtendedProfile, setOwnExtendedProfile } from '../../hooks/useExtendedProfile';
import { useUserNotes } from '../../hooks/useUserNotes';
import { MutualRoomsChip, ServerChip } from '../../components/user-profile/UserChips';
import { useUserVerificationStatus } from '../../hooks/useUserVerificationStatus';
import { useUserDevices, setDeviceBlocked, setDeviceLocallyTrusted } from '../../hooks/useUserDevices';
import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { Switch } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';

// ── Presence persistence ──────────────────────────────────────────────────
const PRESENCE_STORAGE_KEY = 'shuchat-manual-presence';
// Module-level cooldown survives component unmount/remount.
// Prevents multiple setPresence API calls within Synapse's rate-limit window.
let _lastPresenceNetworkCall = 0;
const PRESENCE_NETWORK_COOLDOWN_MS = 10_000; // 10 s — Synapse allows ~1 change per 2 s

const presenceLabel: Record<Presence, string> = {
  [Presence.Online]: 'Online',
  [Presence.Unavailable]: 'Away',
  [Presence.Offline]: 'Offline',
};
const presenceColor: Record<Presence, string> = {
  [Presence.Online]: '#3ba55d',
  [Presence.Unavailable]: '#f0a500',
  [Presence.Offline]: '#747f8d',
};

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);
  return (
    <button
      onClick={copy}
      title={label}
      style={{
        background: 'none',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 4,
        padding: '1px 6px',
        cursor: 'pointer',
        color: 'inherit',
        opacity: 0.6,
        fontSize: 11,
        fontFamily: 'inherit',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.6')}
    >
      {copied ? '✓ Copied' : '⧉ Copy'}
    </button>
  );
}

// ── Private notes ─────────────────────────────────────────────────────────────
function PrivateNotes({ userId }: { userId: string }) {
  const { note, setNote } = useUserNotes(userId);
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  React.useEffect(() => { setDraft(note); }, [note]);
  const save = useCallback(async () => {
    if (draft === note) return;
    setSaving(true);
    try { await setNote(draft); } finally { setSaving(false); }
  }, [draft, note, setNote]);
  const inputStyle: React.CSSProperties = {
    resize: 'vertical',
    background: color.SurfaceVariant.Container,
    border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
    borderRadius: '6px', padding: '6px 8px',
    fontSize: '13px', color: 'inherit', outline: 'none',
    width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5,
  };
  return (
    <Box direction="Column" gap="100">
      <Text size="T200" style={{ opacity: 0.55, textTransform: 'uppercase', fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em' }}>
        Private note
      </Text>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
        placeholder="Add a note visible only to you…" rows={3} style={inputStyle} />
      {saving && <Text size="T200" style={{ opacity: 0.5 }}>Saving…</Text>}
    </Box>
  );
}

// ── Own profile editor — status + bio only (avatar/banner edited via hover) ───
type OwnProfileEditorProps = {
  userId: string;
  bannerUploading: boolean;
  avatarUploading: boolean;
};
function OwnProfileEditor({ userId, bannerUploading, avatarUploading }: OwnProfileEditorProps) {
  const mx = useMatrixClient();
  const extProfile = useExtendedProfile(userId);
  const userPresence = useUserPresence(userId);

  const [bio, setBio] = useState(extProfile.bio ?? '');
  const [bioSaving, setBioSaving] = useState(false);
  const [status, setStatus] = useState(userPresence?.status ?? '');
  const [statusSaving, setStatusSaving] = useState(false);

  React.useEffect(() => { setBio(extProfile.bio ?? ''); }, [extProfile.bio]);
  React.useEffect(() => { setStatus(userPresence?.status ?? ''); }, [userPresence?.status]);

  const saveBio = useCallback(async () => {
    setBioSaving(true);
    try { await setOwnExtendedProfile(mx, { bio: bio.trim() || undefined }); }
    finally { setBioSaving(false); }
  }, [mx, bio]);

  const saveStatus = useCallback(async () => {
    // Skip if the status text hasn't actually changed — prevents duplicate
    // setPresence calls when blur fires at the same time as presence picker click.
    const currentStatusMsg = userPresence?.status ?? '';
    if (status.trim() === currentStatusMsg) return;
    const pres = userPresence?.presence ?? 'online';
    setStatusSaving(true);
    try { await mx.setPresence({ presence: pres as any, status_msg: status.trim() || undefined }); }
    catch { /* ignore */ }
    finally { setStatusSaving(false); }
  }, [mx, userPresence, status]);

  const inputStyle: React.CSSProperties = {
    background: color.SurfaceVariant.Container,
    border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
    borderRadius: '6px', padding: '5px 8px',
    fontSize: '13px', color: 'inherit', outline: 'none',
    width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5,
  };
  const sectionLabel: React.CSSProperties = {
    opacity: 0.55, textTransform: 'uppercase', fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em',
  };

  return (
    <Box direction="Column" gap="300">
      <Text size="T200" style={sectionLabel}>Edit profile</Text>
      {(avatarUploading || bannerUploading) && (
        <Box gap="100" alignItems="Center">
          <Spinner variant="Secondary" size="200" />
          <Text size="T200" style={{ opacity: 0.6 }}>
            {avatarUploading ? 'Uploading avatar…' : 'Uploading banner…'}
          </Text>
        </Box>
      )}
      <Box direction="Column" gap="100">
        <Text size="T200" style={{ opacity: 0.7 }}>Custom status</Text>
        <Box gap="100" alignItems="Center">
          <input value={status} onChange={(e) => setStatus(e.target.value)}
            onBlur={saveStatus}
            onKeyDown={(e) => { if (e.key === 'Enter') { saveStatus(); (e.target as HTMLInputElement).blur(); } }}
            placeholder="Set a status…" maxLength={128} style={inputStyle} />
          {statusSaving && <Text size="T200" style={{ opacity: 0.5, flexShrink: 0 }}>Saving…</Text>}
        </Box>
      </Box>
      <Box direction="Column" gap="100">
        <Text size="T200" style={{ opacity: 0.7 }}>Bio</Text>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} onBlur={saveBio}
          placeholder="Write something about yourself…" rows={4} maxLength={500}
          style={{ ...inputStyle, resize: 'vertical' } as React.CSSProperties} />
        {bioSaving && <Text size="T200" style={{ opacity: 0.5 }}>Saving…</Text>}
      </Box>
      <Text size="T200" style={{ opacity: 0.4, fontSize: '11px' }}>
        Hover your avatar or banner above to edit them.
      </Text>
    </Box>
  );
}


// ── User device list (for other users' profiles) ─────────────────────────────
type UserDeviceListProps = {
  crypto: CryptoApi;
  userId: string;
  mx: import('matrix-js-sdk').MatrixClient;
};
function UserDeviceList({ crypto, userId, mx }: UserDeviceListProps) {
  const [expanded, setExpanded] = React.useState(false);
  const devices = useUserDevices(mx, crypto, userId);

  const verifiedCount  = devices?.filter((d) => (d.crossSigned || d.localVerified) && !d.isBlocked).length ?? 0;
  const blockedCount   = devices?.filter((d) => d.isBlocked).length ?? 0;
  const unverifiedCount = devices?.filter((d) => !d.crossSigned && !d.localVerified && !d.isBlocked).length ?? 0;

  return (
    <Box direction="Column" gap="200">
      {/* ── Clickable header ─────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', flexDirection: 'column', gap: 4,
          color: 'inherit', textAlign: 'left',
        }}
      >
        <Box gap="100" alignItems="Center">
          <Text size="T200" style={{ opacity: 0.55, textTransform: 'uppercase', fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em' }}>
            Encryption devices
          </Text>
          <span style={{ opacity: 0.4, fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
        </Box>
        <Text size="T200" style={{ opacity: 0.5, lineHeight: 1.4 }}>
          Each device this person uses to send and receive messages.
          Toggle off any device you want to stop receiving your messages.
        </Text>
        {/* Mini summary badges */}
        {devices && (
          <Box gap="200" style={{ marginTop: 2 }}>
            {verifiedCount > 0 && (
              <Text size="T200" style={{ color: '#3ba55d', fontSize: 11 }}>
                ✓ {verifiedCount} verified
              </Text>
            )}
            {unverifiedCount > 0 && (
              <Text size="T200" style={{ color: '#f0a500', fontSize: 11 }}>
                ⚠ {unverifiedCount} unverified
              </Text>
            )}
            {blockedCount > 0 && (
              <Text size="T200" style={{ color: '#f87171', fontSize: 11 }}>
                ⊘ {blockedCount} blocked
              </Text>
            )}
          </Box>
        )}
      </button>

      {/* ── Expanded content ─────────────────────────────────────────── */}
      {expanded && (
        <Box direction="Column" gap="200">
          {/* Legend */}
          <Box
            direction="Column"
            gap="100"
            shrink="No"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 6,
              padding: '8px 10px',
              flexShrink: 0,
            }}
          >
            <Text size="T200" style={{ fontWeight: 700, opacity: 0.6, fontSize: 11 }}>What do the colours mean?</Text>
            <Text size="T200" style={{ opacity: 0.7, lineHeight: 1.5 }}>
              <span style={{ color: '#3ba55d', fontWeight: 600 }}>● Cross-signed</span>
              {' — verified via a cross-signing ceremony, safest.'}
            </Text>
            <Text size="T200" style={{ opacity: 0.7, lineHeight: 1.5 }}>
              <span style={{ color: '#3b82f6', fontWeight: 600 }}>● Locally trusted</span>
              {' — you manually marked it as trusted.'}
            </Text>
            <Text size="T200" style={{ opacity: 0.7, lineHeight: 1.5 }}>
              <span style={{ color: '#f0a500', fontWeight: 600 }}>● Unverified</span>
              {' — unknown device, use with caution.'}
            </Text>
            <Text size="T200" style={{ opacity: 0.7, lineHeight: 1.5 }}>
              <span style={{ color: '#f87171', fontWeight: 600 }}>● Blocked</span>
              {' — your messages will NOT be delivered here.'}
            </Text>
          </Box>

          {!devices && (
            <Box gap="100" alignItems="Center">
              <Spinner size="100" variant="Secondary" />
              <Text size="T200" style={{ opacity: 0.5 }}>Loading…</Text>
            </Box>
          )}
          {devices?.length === 0 && (
            <Text size="T200" style={{ opacity: 0.5 }}>No devices found.</Text>
          )}
          {devices && devices.length > 0 && (
            <Box
              direction="Column"
              gap="200"
              style={{ maxHeight: '45vh', overflowY: 'auto', paddingRight: 4 }}
            >
              {devices.map((info) => (
                <DeviceRow
                  key={info.device.deviceId}
                  crypto={crypto}
                  userId={userId}
                  info={info}
                />
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

type DeviceRowProps = {
  crypto: CryptoApi;
  userId: string;
  info: import('../../hooks/useUserDevices').UserDeviceInfo;
};
function DeviceRow({ crypto, userId, info }: DeviceRowProps) {
  const { device, crossSigned, localVerified, isBlocked } = info;

  const [toggleState, doToggle] = useAsyncCallback(
    useCallback(async (trusted: boolean) => {
      if (trusted) {
        // Un-block: revert to Unset (still unverified, just no longer blocked)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const olmMachine = (crypto as any).olmMachine;
        if (olmMachine) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const RustSdk = await import('@matrix-org/matrix-sdk-crypto-wasm' as any);
          const dev = await olmMachine.getDevice(
            new RustSdk.UserId(userId), new RustSdk.DeviceId(device.deviceId)
          );
          if (dev) { try { await dev.setLocalTrust(RustSdk.LocalTrust.Unset); } finally { dev.free?.(); } }
        } else {
          await crypto.setDeviceVerified(userId, device.deviceId, false);
        }
      } else {
        // Block via Rust OlmMachine (BlackListed)
        await setDeviceBlocked(crypto, userId, device.deviceId, true);
      }
    }, [crypto, userId, device.deviceId])
  );
  const [verifyState, doVerify] = useAsyncCallback(
    useCallback(async () => {
      await setDeviceLocallyTrusted(crypto, userId, device.deviceId);
    }, [crypto, userId, device.deviceId])
  );
  const loading = toggleState.status === AsyncStatus.Loading || verifyState.status === AsyncStatus.Loading;

  // Determine label + colour
  let label: string;
  let labelColor: string;
  if (isBlocked) {
    label = 'Blocked';
    labelColor = '#f87171';  // red
  } else if (crossSigned) {
    label = 'Cross-signed';
    labelColor = '#3ba55d';  // green
  } else if (localVerified) {
    label = 'Locally verified';
    labelColor = '#3b82f6';  // blue
  } else {
    label = 'Unverified';
    labelColor = '#f0a500';  // amber
  }

  // Full fingerprint formatted as 3 rows of ~12 chars (groups of 4 separated by space)
  const fingerprint = device.getFingerprint() ?? '';
  const grouped = fingerprint.replace(/(.{4})/g, '$1 ').trim();
  const third = Math.ceil(grouped.length / 3);
  // Split on space boundaries near each third
  const words = grouped.split(' ');
  const perRow = Math.ceil(words.length / 3);
  const fpRows = [
    words.slice(0, perRow).join(' '),
    words.slice(perRow, perRow * 2).join(' '),
    words.slice(perRow * 2).join(' '),
  ].filter(Boolean);

  const toggleOn = !isBlocked;

  return (
    <Box
      direction="Column"
      gap="100"
      shrink="No"
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 6,
        padding: '8px 10px',
        opacity: loading ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <Box gap="200" alignItems="Center" justifyContent="SpaceBetween">
        {/* Toggle — title explains what it does */}
        <Box direction="Column" gap="100" alignItems="Center" style={{ flexShrink: 0 }}>
          <Switch
            value={toggleOn}
            onChange={(val) => !loading && doToggle(val)}
            title={toggleOn ? 'Click to block — this device will stop receiving your messages' : 'Click to unblock — this device will receive your messages again'}
          />
          <Text size="T200" style={{ fontSize: 9, opacity: 0.4, textAlign: 'center', lineHeight: 1 }}>
            {loading ? '…' : toggleOn ? 'allowed' : 'blocked'}
          </Text>
        </Box>
        {/* Label + device name */}
        <Box direction="Column" gap="100" style={{ flex: 1, minWidth: 0 }}>
          <Box gap="200" alignItems="Center">
            <Text size="T200" style={{ color: labelColor, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
              {label}
            </Text>
            <Text size="T200" style={{ opacity: 0.7, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {device.displayName || 'Unknown device'}
            </Text>
          </Box>
          <Text size="T200" style={{ opacity: 0.4, fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.02em' }}>
            ID: {device.deviceId}
          </Text>
          {fpRows.map((row, i) => (
            <Text key={i} size="T200" style={{ opacity: 0.35, fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.04em' }}>
              {row}
            </Text>
          ))}
          {isBlocked && (
            <Text size="T200" style={{ color: '#f87171', opacity: 0.7, fontSize: 11, marginTop: 2 }}>
              ⚠ Your messages are not delivered to this device. Toggle on to restore.
            </Text>
          )}
          {!isBlocked && !crossSigned && !localVerified && (
            <Box gap="200" alignItems="Center" style={{ marginTop: 4, flexWrap: 'wrap' }}>
              <Text size="T200" style={{ color: '#f0a500', opacity: 0.7, fontSize: 11 }}>
                Not verified — identity unconfirmed.
              </Text>
              <button
                type="button"
                onClick={() => !loading && doVerify()}
                disabled={loading}
                title="I have manually confirmed this device belongs to this person (locally trusted, no cross-signing needed)"
                style={{
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.35)',
                  borderRadius: 5,
                  color: '#3b82f6',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  padding: '2px 8px',
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                ✓ Trust locally
              </button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
type UserProfilePanelProps = {
  userId: string;
  roomId?: string;
  inColumn?: boolean;
  onClose?: () => void;
};
export function UserProfilePanel({ userId, roomId, inColumn, onClose }: UserProfilePanelProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const myUserId = mx.getSafeUserId();
  const crypto = mx.getCrypto();
  const isOwnProfile = userId === myUserId;

  const profile = useUserProfile(userId);
  const presence = useUserPresence(userId);
  const extProfile = useExtendedProfile(userId);
  const verifStatus = useUserVerificationStatus(userId);
  const isVerified = verifStatus?.isVerified() ?? false;

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const server = getMxIdServer(userId);

  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication) ?? undefined
    : undefined;
  const bannerUrl = extProfile.banner
    ? mxcUrlToHttp(mx, extProfile.banner, useAuthentication) ?? undefined
    : undefined;

  const activePresence = presence?.presence ?? Presence.Offline;
  const [showPresencePicker, setShowPresencePicker] = useState(false);
  const presencePickerRef = useRef<HTMLDivElement>(null);

  // Close presence picker on outside click
  useEffect(() => {
    if (!showPresencePicker) return;
    const handler = (e: MouseEvent) => {
      if (presencePickerRef.current && !presencePickerRef.current.contains(e.target as Node)) {
        setShowPresencePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPresencePicker]);

  const presenceValueMap: Record<'online' | 'unavailable' | 'offline', Presence> = {
    online: Presence.Online,
    unavailable: Presence.Unavailable,
    offline: Presence.Offline,
  };
  const presenceToSyncMap: Record<'online' | 'unavailable' | 'offline', SetPresence> = {
    online: SetPresence.Online,
    unavailable: SetPresence.Unavailable,
    offline: SetPresence.Offline,
  };
  const handleSetPresence = useCallback(async (p: 'online' | 'unavailable' | 'offline') => {
    setShowPresencePicker(false);

    // ── Step 1: Instant UI update everywhere ──────────────────────────────
    // Mutate the SDK User object directly so that ALL useUserPresence hooks
    // (member list, DM sidebar, avatar dots, etc.) re-render immediately
    // without waiting for the server round-trip.
    const ownUser = mx.getUser(mx.getUserId() ?? '');
    if (ownUser) {
      (ownUser as any).presence = p;
      ownUser.emit(UserEvent.Presence, null as any, ownUser);
    }

    // ── Step 2: Persist selection (survives refresh / reconnect) ──────────
    localStorage.setItem(PRESENCE_STORAGE_KEY, p);

    // ── Step 3: Tell the SDK to carry this value in every future /sync ───
    // Without this, Synapse auto-resets presence to 'online' on each sync.
    mx.setSyncPresence(presenceToSyncMap[p]);

    // ── Step 4: Send the explicit PUT (rate-limited to once per 10 s) ────
    const now = Date.now();
    if (now - _lastPresenceNetworkCall < PRESENCE_NETWORK_COOLDOWN_MS) {
      // UI already updated; the next sync will carry the right set_presence.
      return;
    }
    _lastPresenceNetworkCall = now;
    try { await mx.setPresence({ presence: p, status_msg: presence?.status || undefined }); }
    catch (err: any) {
      console.warn('setPresence failed:', err?.message);
    }
  }, [mx, presence?.status]);

  // File inputs for own-profile editing
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  const handleAvatarFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setAvatarUploading(true);
    try {
      const { content_uri: mxcUrl } = await mx.uploadContent(file) as { content_uri: string };
      await mx.setAvatarUrl(mxcUrl);
    } catch (err) { console.error('Avatar upload failed:', err); }
    finally { setAvatarUploading(false); if (avatarFileRef.current) avatarFileRef.current.value = ''; }
  }, [mx]);

  const handleBannerFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBannerUploading(true);
    try {
      const { content_uri: mxcUrl } = await mx.uploadContent(file) as { content_uri: string };
      await setOwnExtendedProfile(mx, { banner: mxcUrl });
    } catch (err) { console.error('Banner upload failed:', err); }
    finally { setBannerUploading(false); if (bannerFileRef.current) bannerFileRef.current.value = ''; }
  }, [mx]);

  const handleEditAvatar = useCallback(() => { avatarFileRef.current?.click(); }, []);
  const handleEditBanner = useCallback(() => { bannerFileRef.current?.click(); }, []);

  // Persisted, drag-resizable width (drag the panel's left edge).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [panelWidth, onPanelResize, resetPanelWidth] = usePanelWidth('profile-panel', 320, 240, 520, 'start');

  return (
    <Box
      direction="Column"
      style={{
        ...(inColumn
          ? { width: '100%' }
          : { width: panelWidth, minWidth: 240, flexShrink: 0, borderLeft: `1px solid ${color.Surface.ContainerLine}`, height: '100%', position: 'relative' }),
        overflowY: inColumn ? 'visible' : 'auto',
      }}
    >
      {!inColumn && (
        <ResizeHandle edge="start" onPointerDown={onPanelResize} onReset={resetPanelWidth} />
      )}
      {isOwnProfile && (
        <>
          <input ref={avatarFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile} />
          <input ref={bannerFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBannerFile} />
        </>
      )}

      {onClose && (
        <Box shrink="No" alignItems="Center" justifyContent="End"
          style={{ padding: `${config.space.S100} ${config.space.S200}` }}>
          <IconButton size="300" fill="None" onClick={onClose} aria-label="Close profile">
            <Icon src={Icons.Cross} size="200" />
          </IconButton>
        </Box>
      )}

      <UserHero
        userId={userId}
        avatarUrl={avatarUrl}
        bannerUrl={bannerUrl}
        presence={presence && presence.lastActiveTs !== 0 ? presence : undefined}
        onEditBanner={isOwnProfile && inColumn ? handleEditBanner : undefined}
        onEditAvatar={isOwnProfile && inColumn ? handleEditAvatar : undefined}
      />

      <Box direction="Column" gap="300" style={{ padding: config.space.S400 }}>

        {/* Name + server + copy ID */}
        <Box direction="Column" gap="100">
          <Box gap="200" alignItems="Center" wrap="Wrap">
            <UserHeroName displayName={displayName} userId={userId} />
            {isVerified && !isOwnProfile && (
              <Icon src={Icons.ShieldUser} size="200" style={{ color: '#3ba55d', flexShrink: 0 }} />
            )}
          </Box>
          <Box gap="100" alignItems="Center" wrap="Wrap">
            {server && <Text size="T200" style={{ opacity: 0.45 }}>{server}</Text>}
            <CopyButton text={userId} label={`Copy user ID: ${userId}`} />
          </Box>
        </Box>

        {/* Presence dot + status — clickable picker for own profile */}
        <div ref={isOwnProfile ? presencePickerRef : undefined} style={{ position: 'relative', display: 'inline-flex' }}>
          <Box
            gap="200" alignItems="Center"
            as={isOwnProfile ? 'button' : 'div'}
            onClick={isOwnProfile ? () => setShowPresencePicker((v) => !v) : undefined}
            onMouseDown={isOwnProfile ? (e: React.MouseEvent) => e.preventDefault() : undefined}
            style={isOwnProfile ? {
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
              borderRadius: 6, color: 'inherit',
              ...(showPresencePicker ? { background: 'rgba(255,255,255,0.08)' } : {}),
            } : {}}
            title={isOwnProfile ? 'Change presence' : undefined}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: presenceColor[activePresence], flexShrink: 0, display: 'inline-block',
            }} />
            <Text size="T300" style={{ opacity: 0.8 }}>
              {presence?.status
                ? <>{presence.status} <span style={{ opacity: 0.5 }}>({presenceLabel[activePresence]})</span></>
                : presenceLabel[activePresence]}
            </Text>
            {isOwnProfile && <span style={{ opacity: 0.4, fontSize: 10, marginLeft: 2 }}>&#9660;</span>}
          </Box>
          {isOwnProfile && showPresencePicker && (
            <div style={{
              position: 'absolute', top: '110%', left: 0, zIndex: 100,
              background: '#1e2124', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, padding: '4px', minWidth: 140,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              {([
                { value: 'online',      label: 'Online',  color: '#3ba55d', pres: Presence.Online      },
                { value: 'unavailable', label: 'Away',    color: '#f0a500', pres: Presence.Unavailable },
                { value: 'offline',     label: 'Offline', color: '#747f8d', pres: Presence.Offline     },
              ] as const).map(({ value, label, color: c, pres }) => (
                <button
                  key={value}
                  onClick={() => handleSetPresence(value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', background: activePresence === pres ? 'rgba(255,255,255,0.08)' : 'none',
                    border: 'none', borderRadius: 6, padding: '6px 10px',
                    cursor: 'pointer', color: 'inherit', fontSize: 13, fontFamily: 'inherit',
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={(e) => { if (activePresence !== pres) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = activePresence === pres ? 'rgba(255,255,255,0.08)' : 'none'; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' }} />
                  <span>{label}</span>
                  {activePresence === pres && <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>&#10003;</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bio (other users, directly under status) */}
        {!isOwnProfile && extProfile.bio && (
          <Text size="T300" style={{ wordBreak: 'break-word', lineHeight: 1.5, opacity: 0.85 }}>
            {extProfile.bio}
          </Text>
        )}

        {/* Copy banner URL (other users with banner) */}
        {!isOwnProfile && extProfile.banner && (
          <Box alignItems="Center" gap="100">
            <Text size="T200" style={{ opacity: 0.55, fontSize: '11px' }}>Banner</Text>
            <CopyButton text={extProfile.banner} label="Copy banner MXC URL" />
          </Box>
        )}

        {/* Sections for OTHER users only */}
        {!isOwnProfile && (
          <>
            <Line variant="Surface" size="300" />
            <Box direction="Column" gap="100">
              <Text size="T200" style={{ opacity: 0.55, textTransform: 'uppercase', fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em' }}>
                Mutual rooms
              </Text>
              <MutualRoomsChip userId={userId} />
            </Box>
            <Line variant="Surface" size="300" />
            <PrivateNotes userId={userId} />
            {crypto && (
              <>
                <Line variant="Surface" size="300" />
                <UserDeviceList crypto={crypto} userId={userId} mx={mx} />
              </>
            )}
          </>
        )}

        {/* Own profile editor (status + bio fields only — avatar/banner via hover) */}
        {isOwnProfile && (
          <>
            <Line variant="Surface" size="300" />
            <OwnProfileEditor
              userId={userId}
              bannerUploading={bannerUploading}
              avatarUploading={avatarUploading}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
