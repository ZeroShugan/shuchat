import React from 'react';
import { Avatar, Box, Icon, Icons, Text, config, toRem } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useUserPresence, Presence } from '../../hooks/useUserPresence';
import { UserAvatar } from '../user-avatar';
import { AvatarPresence, PresenceBadge } from '../presence';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { getMxIdLocalPart } from '../../utils/matrix';
import { nameInitials } from '../../utils/common';

const presenceLabel: Record<Presence, string> = {
  [Presence.Online]: 'Online',
  [Presence.Unavailable]: 'Away',
  [Presence.Offline]: 'Offline',
};

export function UserPanel() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getSafeUserId();
  const profile = useUserProfile(userId);
  const userPresence = useUserPresence(userId);
  const presence = userPresence?.presence ?? Presence.Offline;

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mx.mxcUrlToHttp(profile.avatarUrl, 40, 40, 'crop', undefined, false, useAuthentication) ?? undefined
    : undefined;

  return (
    <Box
      alignItems="Center"
      gap="200"
      style={{
        padding: `${toRem(8)} ${config.space.S300}`,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.15)',
        minHeight: toRem(52),
        flexShrink: 0,
      }}
    >
      <AvatarPresence
        badge={<PresenceBadge presence={presence} size="200" />}
      >
        <Avatar size="200" radii="Pill">
          <UserAvatar
            userId={userId}
            src={avatarUrl}
            alt={displayName}
            renderFallback={() => (
              <Text as="span" size="T200" style={{ fontSize: '0.6rem' }}>
                {nameInitials(displayName, 2)}
              </Text>
            )}
          />
        </Avatar>
      </AvatarPresence>
      <Box grow="Yes" direction="Column" style={{ minWidth: 0 }}>
        <Text size="T300" truncate style={{ fontWeight: 600, fontSize: toRem(13) }}>
          {displayName}
        </Text>
        <Text size="T200" truncate style={{ opacity: 0.5, fontSize: toRem(11) }}>
          {presenceLabel[presence]}
        </Text>
      </Box>
    </Box>
  );
}
