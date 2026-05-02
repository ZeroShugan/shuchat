import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { ownProfilePanelAtom } from '../../state/ownProfilePanel';
import { Avatar, Box, Icon, Icons, Text, config, toRem } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useUserPresence, Presence } from '../../hooks/useUserPresence';
import { UserAvatar } from '../user-avatar';
import { AvatarPresence, PresenceBadge } from '../presence';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { getMxIdLocalPart } from '../../utils/matrix';
import { nameInitials } from '../../utils/common';
import { useCallPreferences } from '../../state/hooks/callPreferences';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound } from '../../utils/voiceFeedback';
import { Settings } from '../../features/settings';
import { Modal500 } from '../Modal500';

const presenceLabel: Record<Presence, string> = {
  [Presence.Online]: 'Online',
  [Presence.Unavailable]: 'Away',
  [Presence.Offline]: 'Offline',
};

function CtrlBtn({ onClick, muted, title, children }: {
  onClick: () => void; muted?: boolean; title?: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: muted ? 'rgba(240,100,0,0.12)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${muted ? 'rgba(240,100,0,0.3)' : 'rgba(255,255,255,0.09)'}`,
        borderRadius: 7, padding: '5px 6px',
        cursor: 'pointer', color: muted ? '#f0a500' : 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = muted ? 'rgba(240,100,0,0.22)' : 'rgba(255,255,255,0.12)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = muted ? 'rgba(240,100,0,0.12)' : 'rgba(255,255,255,0.06)')}
    >
      {children}
    </button>
  );
}

export function UserPanel() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getSafeUserId();
  const profile = useUserProfile(userId);
  const userPresence = useUserPresence(userId);
  const presence = userPresence?.presence ?? Presence.Offline;

  const toggleOwnProfile = useSetAtom(ownProfilePanelAtom);
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusInput, setStatusInput] = useState('');

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mx.mxcUrlToHttp(profile.avatarUrl, 40, 40, 'crop', undefined, false, useAuthentication) ?? undefined
    : undefined;

  const saveStatus = useCallback(async () => {
    try { await mx.setPresence({ presence: presence as any, status_msg: statusInput.trim() || undefined }); }
    catch { /* ignore */ }
  }, [mx, presence, statusInput]);

  const handleStatusClick = () => { setStatusInput(userPresence?.status ?? ''); setEditingStatus(true); };
  const handleStatusKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { saveStatus(); setEditingStatus(false); }
    if (e.key === 'Escape') { setEditingStatus(false); }
  };

  const { microphone, sound, toggleMicrophone, toggleSound } = useCallPreferences();
  const [notificationVolume] = useSetting(settingsAtom, 'notificationVolume');
  const [showSettings, setShowSettings] = useState(false);
  const statusText = userPresence?.status || presenceLabel[presence];

  return (
    <>
      {showSettings && (
        <Modal500 requestClose={() => setShowSettings(false)}>
          <Settings requestClose={() => setShowSettings(false)} />
        </Modal500>
      )}
      <Box
        alignItems="Center"
        gap="200"
        shrink="No"
        style={{
          padding: `${toRem(8)} ${config.space.S300}`,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.15)',
          minHeight: toRem(52),
        }}
      >
        <AvatarPresence
          as="button"
          onClick={() => toggleOwnProfile((v) => !v)}
          badge={<PresenceBadge presence={presence} size="200" />}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          title="View your profile"
          data-own-profile-toggle="true"
        >
          <Avatar size="200" radii="Pill">
            <UserAvatar
              userId={userId} src={avatarUrl} alt={displayName}
              renderFallback={() => (
                <Text as="span" size="T200" style={{ fontSize: '0.6rem' }}>{nameInitials(displayName, 2)}</Text>
              )}
            />
          </Avatar>
        </AvatarPresence>

        <Box grow="Yes" direction="Column" style={{ minWidth: 0 }}>
          <Text size="T300" truncate style={{ fontWeight: 600, fontSize: toRem(13) }}>
            {displayName}
          </Text>
          {editingStatus ? (
            <input
              autoFocus
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value)}
              onBlur={() => { saveStatus(); setEditingStatus(false); }}
              onKeyDown={handleStatusKeyDown}
              placeholder="Set a status…"
              maxLength={128}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px', padding: '1px 5px',
                fontSize: toRem(11), color: 'inherit', outline: 'none', width: '100%',
              }}
            />
          ) : (
            <Text size="T200" truncate
              style={{ opacity: 0.5, fontSize: toRem(11), cursor: 'pointer' }}
              onClick={handleStatusClick}
              title="Click to set custom status"
            >
              {statusText}
            </Text>
          )}
        </Box>

        <Box shrink="No" alignItems="Center" style={{ gap: toRem(4) }}>
          <CtrlBtn
            onClick={() => { if (microphone) playMuteSound(notificationVolume); else playUnmuteSound(notificationVolume); toggleMicrophone(); }}
            muted={!microphone}
            title={microphone ? 'Mute microphone' : 'Unmute microphone'}
          >
            <Icon size="200" src={microphone ? Icons.Mic : Icons.MicMute} filled={!microphone} />
          </CtrlBtn>
          <CtrlBtn
            onClick={() => { if (sound) playDeafenSound(notificationVolume); else playUndeafenSound(notificationVolume); toggleSound(); }}
            muted={!sound}
            title={sound ? 'Deafen' : 'Undeafen'}
          >
            <Icon size="200" src={sound ? Icons.Headphone : Icons.HeadphoneMute} filled={!sound} />
          </CtrlBtn>
          <CtrlBtn onClick={() => setShowSettings(true)} title="User Settings">
            <Icon size="200" src={Icons.Setting} />
          </CtrlBtn>
        </Box>
      </Box>
    </>
  );
}
