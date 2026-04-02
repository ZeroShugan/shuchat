import React, { useState } from 'react';
import {
  Avatar,
  Box,
  Icon,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
} from 'folds';
import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';
import * as css from './styles.css';
import { UserAvatar } from '../user-avatar';
import colorMXID from '../../../util/colorMXID';
import { getMxIdLocalPart } from '../../utils/matrix';
import { BreakWord, LineClamp3 } from '../../styles/Text.css';
import { UserPresence } from '../../hooks/useUserPresence';
import { AvatarPresence, PresenceBadge } from '../presence';
import { ImageViewer } from '../image-viewer';
import { stopPropagation } from '../../utils/keyboard';

type UserHeroProps = {
  userId: string;
  avatarUrl?: string;
  bannerUrl?: string;
  presence?: UserPresence;
  onEditBanner?: () => void;
  onEditAvatar?: () => void;
};
export function UserHero({ userId, avatarUrl, bannerUrl, presence, onEditBanner, onEditAvatar }: UserHeroProps) {
  const [viewAvatar, setViewAvatar] = useState<string>();
  const [hoverBanner, setHoverBanner] = useState(false);
  const [hoverAvatar, setHoverAvatar] = useState(false);

  return (
    <Box direction="Column" className={css.UserHero}>
      {/* ── Banner area ──────────────────────────────────────────────── */}
      <div
        className={css.UserHeroCoverContainer}
        style={{
          backgroundColor: colorMXID(userId),
          filter: (bannerUrl || avatarUrl) ? undefined : 'brightness(50%)',
          position: 'relative',
          overflow: 'visible',   /* allow edit button to show at edges */
        }}
        onMouseEnter={onEditBanner ? () => setHoverBanner(true) : undefined}
        onMouseLeave={onEditBanner ? () => setHoverBanner(false) : undefined}
      >
        {/* clip only the image, not the whole container */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit' }}>
          {(bannerUrl || avatarUrl) && (
            <img
              className={css.UserHeroCover}
              src={bannerUrl || avatarUrl}
              alt={userId}
              draggable="false"
              style={{
                objectFit: 'cover',
                width: '100%',
                height: '100%',
                ...(bannerUrl ? {} : { filter: 'blur(16px)', transform: 'scale(2)' }),
              }}
            />
          )}
        </div>
        {onEditBanner && hoverBanner && (
          <button
            onClick={onEditBanner}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'rgba(0,0,0,0.65)',
              border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: 'white',
              fontSize: 12,
              fontFamily: 'inherit',
              zIndex: 3,
              backdropFilter: 'blur(4px)',
            }}
            title="Edit banner"
          >
            ✏️ Edit banner
          </button>
        )}
      </div>

      {/* ── Avatar area ───────────────────────────────────────────────── */}
      <div className={css.UserHeroAvatarContainer}>
        <AvatarPresence
          className={css.UserAvatarContainer}
          badge={presence && <PresenceBadge presence={presence.presence} status={presence.status} />}
          onMouseEnter={onEditAvatar ? () => setHoverAvatar(true) : undefined}
          onMouseLeave={onEditAvatar ? () => setHoverAvatar(false) : undefined}
        >
          <Avatar
            as={onEditAvatar ? 'button' : (avatarUrl ? 'button' : 'div')}
            onClick={onEditAvatar ?? (avatarUrl ? () => setViewAvatar(avatarUrl) : undefined)}
            className={css.UserHeroAvatar}
            size="500"
          >
            <UserAvatar
              className={css.UserHeroAvatarImg}
              userId={userId}
              src={avatarUrl}
              alt={userId}
              renderFallback={() => <Icon size="500" src={Icons.User} filled />}
            />
            {/* Pencil overlay — rendered INSIDE Avatar so it's always on top of the image */}
            {onEditAvatar && hoverAvatar && (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.45)',
                  borderRadius: '50%',
                  fontSize: 22,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                ✏️
              </span>
            )}
          </Avatar>
        </AvatarPresence>

        {viewAvatar && (
          <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setViewAvatar(undefined),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Modal size="500" onContextMenu={(evt: any) => evt.stopPropagation()}>
                  <ImageViewer
                    src={viewAvatar}
                    alt={userId}
                    requestClose={() => setViewAvatar(undefined)}
                  />
                </Modal>
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
        )}
      </div>
    </Box>
  );
}

type UserHeroNameProps = {
  displayName?: string;
  userId: string;
};
export function UserHeroName({ displayName, userId }: UserHeroNameProps) {
  const username = getMxIdLocalPart(userId);
  return (
    <Box grow="Yes" direction="Column" gap="0">
      <Box alignItems="Baseline" gap="200" wrap="Wrap">
        <Text size="H4" className={classNames(BreakWord, LineClamp3)} title={displayName ?? username}>
          {displayName ?? username ?? userId}
        </Text>
      </Box>
      <Box alignItems="Center" gap="100" wrap="Wrap">
        <Text size="T200" className={classNames(BreakWord, LineClamp3)} title={username}>
          @{username}
        </Text>
      </Box>
    </Box>
  );
}
