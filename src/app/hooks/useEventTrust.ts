import { useEffect, useState } from 'react';
import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { EventShieldColour } from 'matrix-js-sdk/lib/crypto-api';

export { EventShieldColour };

// Module-level cache so results survive re-renders and component unmounts.
// Key: eventId, Value: EventShieldColour
const trustCache = new Map<string, EventShieldColour>();

/**
 * Returns the encryption trust level for a Matrix event.
 * Uses getEncryptionInfoForEvent() and caches the result so each event
 * is only looked up once regardless of how many times the component renders.
 *
 * Returns EventShieldColour.NONE for unencrypted events or when trust is fine.
 * Returns EventShieldColour.GREY for unverified/unsigned device.
 * Returns EventShieldColour.RED for unknown device, mismatched keys, etc.
 */
export function useEventTrust(mx: MatrixClient, mEvent: MatrixEvent): EventShieldColour {
  const eventId = mEvent.getId() ?? '';
  const cached = trustCache.get(eventId);

  const [colour, setColour] = useState<EventShieldColour>(
    cached ?? EventShieldColour.NONE
  );

  useEffect(() => {
    if (!eventId) return;

    // Non-encrypted events: no warning needed
    if (!mEvent.isEncrypted()) {
      trustCache.set(eventId, EventShieldColour.NONE);
      return;
    }

    // Already cached
    if (trustCache.has(eventId)) {
      const c = trustCache.get(eventId)!;
      setColour(c);
      return;
    }

    const crypto = mx.getCrypto();
    if (!crypto) return;

    let cancelled = false;
    crypto.getEncryptionInfoForEvent(mEvent)
      .then((info) => {
        if (cancelled) return;
        const c = info?.shieldColour ?? EventShieldColour.NONE;
        trustCache.set(eventId, c);
        setColour(c);
      })
      .catch(() => {
        // Silently ignore — leave as NONE
      });

    return () => { cancelled = true; };
  // mEvent identity is stable for a given event, eventId covers the dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mx, eventId]);

  return colour;
}
