import { useCallback, useEffect, useState } from 'react';
import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api';
import { verifiedDevice } from '../utils/matrix-crypto';
import { useAlive } from './useAlive';
import { fulfilledPromiseSettledResult } from '../utils/common';
import { useMatrixClient } from './useMatrixClient';
import { useDeviceListChange } from './useDeviceList';

export enum VerificationStatus {
  Unknown,
  Unverified,
  Verified,
  Unsupported,
}

export const useDeviceVerificationDetect = (
  crypto: CryptoApi | undefined,
  userId: string,
  deviceId: string | undefined,
  callback: (status: VerificationStatus) => void
): void => {
  const mx = useMatrixClient();

  const updateStatus = useCallback(async () => {
    if (crypto && deviceId) {
      const data = await verifiedDevice(crypto, userId, deviceId);
      if (data === null) {
        callback(VerificationStatus.Unsupported);
        return;
      }
      callback(data ? VerificationStatus.Verified : VerificationStatus.Unverified);
      return;
    }
    callback(VerificationStatus.Unknown);
  }, [crypto, deviceId, userId, callback]);

  useEffect(() => {
    updateStatus();
  }, [mx, updateStatus, userId]);

  useDeviceListChange(
    useCallback(
      (userIds) => {
        if (userIds.includes(userId)) {
          updateStatus();
        }
      },
      [userId, updateStatus]
    )
  );

  // DevicesUpdated does NOT fire after self-verifying via the recovery key, so
  // the "unverified" banner would linger until a manual refresh. Cross-signing
  // completion emits KeysChanged + UserTrustStatusChanged — re-check on those.
  useEffect(() => {
    const onKeysChanged = () => updateStatus();
    const onTrustChanged = (changedUserId: string) => {
      if (changedUserId === userId) updateStatus();
    };
    mx.on(CryptoEvent.KeysChanged, onKeysChanged);
    mx.on(CryptoEvent.UserTrustStatusChanged, onTrustChanged);
    return () => {
      mx.removeListener(CryptoEvent.KeysChanged, onKeysChanged);
      mx.removeListener(CryptoEvent.UserTrustStatusChanged, onTrustChanged);
    };
  }, [mx, userId, updateStatus]);
};

export const useDeviceVerificationStatus = (
  crypto: CryptoApi | undefined,
  userId: string,
  deviceId: string | undefined
): VerificationStatus => {
  const [verificationStatus, setVerificationStatus] = useState(VerificationStatus.Unknown);

  useDeviceVerificationDetect(crypto, userId, deviceId, setVerificationStatus);

  return verificationStatus;
};

export const useUnverifiedDeviceCount = (
  crypto: CryptoApi | undefined,
  userId: string,
  devices: string[]
): number | undefined => {
  const [unverifiedCount, setUnverifiedCount] = useState<number>();
  const alive = useAlive();

  const updateCount = useCallback(async () => {
    let count = 0;
    if (crypto) {
      const promises = devices.map((deviceId) => verifiedDevice(crypto, userId, deviceId));
      const result = await Promise.allSettled(promises);
      const settledResult = fulfilledPromiseSettledResult(result);
      settledResult.forEach((status) => {
        if (status === false) {
          count += 1;
        }
      });
    }
    if (alive()) {
      setUnverifiedCount(count);
    }
  }, [crypto, userId, devices, alive]);

  useDeviceListChange(
    useCallback(
      (userIds) => {
        if (userIds.includes(userId)) {
          updateCount();
        }
      },
      [userId, updateCount]
    )
  );

  useEffect(() => {
    updateCount();
  }, [updateCount]);

  return unverifiedCount;
};
