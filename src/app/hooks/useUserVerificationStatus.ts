import { useCallback, useEffect, useState } from 'react';
import { UserVerificationStatus } from 'matrix-js-sdk/lib/crypto-api';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent';
import { useMatrixClient } from './useMatrixClient';
import { useAlive } from './useAlive';

export const useUserVerificationStatus = (
  userId: string | undefined
): UserVerificationStatus | undefined => {
  const mx = useMatrixClient();
  const alive = useAlive();
  const [status, setStatus] = useState<UserVerificationStatus>();

  const update = useCallback(async () => {
    if (!userId) return;
    const crypto = mx.getCrypto();
    if (!crypto) return;
    const s = await crypto.getUserVerificationStatus(userId);
    if (alive()) setStatus(s);
  }, [mx, userId, alive]);

  useEffect(() => {
    setStatus(undefined);
    update();
  }, [update]);

  useEffect(() => {
    const handleChange = (changedUserId: string) => {
      if (changedUserId === userId) update();
    };
    mx.on(CryptoEvent.UserTrustStatusChanged, handleChange);
    return () => {
      mx.removeListener(CryptoEvent.UserTrustStatusChanged, handleChange);
    };
  }, [mx, userId, update]);

  return status;
};
