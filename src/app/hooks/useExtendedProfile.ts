import { useEffect, useState, useCallback } from 'react';
import { Method } from 'matrix-js-sdk/lib/http-api';
import { useMatrixClient } from './useMatrixClient';
import { useAccountData } from './useAccountData';
import { AccountDataEvent } from '../../types/matrix/accountData';

export type ExtendedProfile = {
  banner?: string; // mxc:// URL
  bio?: string;
};

// Read own extended profile from account data (always works)
function useOwnExtendedProfile(myUserId: string, userId: string): ExtendedProfile {
  const mx = useMatrixClient();
  const event = useAccountData(AccountDataEvent.ShuChatProfile);
  if (userId !== myUserId) return {};
  const data = (event?.getContent() as ExtendedProfile) ?? {};
  return data;
}

// Try to read another user's extended profile from their Matrix profile endpoint.
// This works if the homeserver supports MSC4133 or exposes custom profile fields.
function useOtherExtendedProfile(myUserId: string, userId: string): ExtendedProfile {
  const mx = useMatrixClient();
  const [profile, setProfile] = useState<ExtendedProfile>({});

  useEffect(() => {
    if (userId === myUserId) return;
    let cancelled = false;
    (mx.http as any)
      .authedRequest(Method.Get, '/profile/' + encodeURIComponent(userId))
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        setProfile({
          banner: typeof data['im.shuchat.banner'] === 'string' ? data['im.shuchat.banner'] : undefined,
          bio: typeof data['im.shuchat.bio'] === 'string' ? data['im.shuchat.bio'] : undefined,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mx, userId, myUserId]);

  return profile;
}

export function useExtendedProfile(userId: string): ExtendedProfile {
  const mx = useMatrixClient();
  const myUserId = mx.getSafeUserId();
  const ownProfile = useOwnExtendedProfile(myUserId, userId);
  const otherProfile = useOtherExtendedProfile(myUserId, userId);
  return userId === myUserId ? ownProfile : otherProfile;
}

export async function setOwnExtendedProfile(
  mx: ReturnType<typeof useMatrixClient>,
  update: Partial<ExtendedProfile>
): Promise<void> {
  const current = (mx.getAccountData(AccountDataEvent.ShuChatProfile)?.getContent() as ExtendedProfile) ?? {};
  const next = { ...current, ...update };
  // Clean up undefined
  if (next.banner === undefined) delete next.banner;
  if (next.bio === undefined) delete next.bio;
  await mx.setAccountData(AccountDataEvent.ShuChatProfile, next);

  // Also try to push to the Matrix profile endpoint for cross-client visibility
  // (works if the homeserver supports extended profile fields, silently fails otherwise)
  try {
    if (update.banner !== undefined) {
      await (mx.http as any).authedRequest(
        Method.Put,
        '/profile/' + encodeURIComponent(mx.getSafeUserId()) + '/im.shuchat.banner',
        {},
        { 'im.shuchat.banner': update.banner }
      );
    }
    if (update.bio !== undefined) {
      await (mx.http as any).authedRequest(
        Method.Put,
        '/profile/' + encodeURIComponent(mx.getSafeUserId()) + '/im.shuchat.bio',
        {},
        { 'im.shuchat.bio': update.bio }
      );
    }
  } catch {
    // Server doesn't support custom profile fields — account data is sufficient for own profile
  }
}
