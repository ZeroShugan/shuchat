import { useEffect, useMemo, useState } from 'react';
import { User, UserEvent, UserEventHandlerMap } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';

export enum Presence {
  Online = 'online',
  Unavailable = 'unavailable',
  Offline = 'offline',
}

export type UserPresence = {
  presence: Presence;
  status?: string;
  active: boolean;
  lastActiveTs?: number;
};

const getUserPresence = (user: User): UserPresence => ({
  presence: user.presence as Presence,
  status: user.presenceStatusMsg,
  active: user.currentlyActive,
  lastActiveTs: user.getLastActiveTs(),
});

export const useUserPresence = (userId: string): UserPresence | undefined => {
  const mx = useMatrixClient();
  const user = mx.getUser(userId);

  const [presence, setPresence] = useState(() => (user ? getUserPresence(user) : undefined));

  // The sync stream only carries presence for users we share active sync
    // windows with — the cached User object can go stale (e.g. profile says
    // Offline while the room list dot says Online). Fetch the authoritative
    // state once per mount so every surface agrees.
  useEffect(() => {
    let disposed = false;
    mx.getPresence(userId)
      .then((p) => {
        if (disposed) return;
        setPresence((prev) => ({
          presence: (p.presence as Presence) ?? Presence.Offline,
          status: p.status_msg ?? prev?.status,
          active: p.currently_active ?? prev?.active ?? false,
          lastActiveTs:
            typeof p.last_active_ago === 'number'
              ? Date.now() - p.last_active_ago
              : prev?.lastActiveTs,
        }));
      })
      .catch(() => {}); // no permission / federation error — keep cached value
    return () => {
      disposed = true;
    };
  }, [mx, userId]);

  useEffect(() => {
    const updatePresence: UserEventHandlerMap[UserEvent.Presence] = (event, u) => {
      if (u.userId === user?.userId) {
        setPresence(getUserPresence(user));
      }
    };
    user?.on(UserEvent.Presence, updatePresence);
    user?.on(UserEvent.CurrentlyActive, updatePresence);
    user?.on(UserEvent.LastPresenceTs, updatePresence);
    return () => {
      user?.removeListener(UserEvent.Presence, updatePresence);
      user?.removeListener(UserEvent.CurrentlyActive, updatePresence);
      user?.removeListener(UserEvent.LastPresenceTs, updatePresence);
    };
  }, [user]);

  return presence;
};

export const usePresenceLabel = (): Record<Presence, string> =>
  useMemo(
    () => ({
      [Presence.Online]: 'Active',
      [Presence.Unavailable]: 'Busy',
      [Presence.Offline]: 'Away',
    }),
    []
  );
