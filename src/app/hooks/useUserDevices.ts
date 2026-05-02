import { useEffect, useState, useCallback } from 'react';
import { MatrixClient } from 'matrix-js-sdk';
import { CryptoEvent, CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { Device, DeviceVerification } from 'matrix-js-sdk/lib/models/device';

export type UserDeviceInfo = {
  device: Device;
  crossSigned: boolean;
  localVerified: boolean;
  isBlocked: boolean;
};

/**
 * Blocks or unblocks a device by calling the underlying Rust OlmMachine
 * directly, since the public CryptoApi only exposes Verified / Unset.
 */
export async function setDeviceBlocked(
  crypto: CryptoApi,
  userId: string,
  deviceId: string,
  blocked: boolean
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const olmMachine = (crypto as any).olmMachine;
  if (!olmMachine) {
    await crypto.setDeviceVerified(userId, deviceId, false);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const RustSdk = await import('@matrix-org/matrix-sdk-crypto-wasm' as any);
  const device = await olmMachine.getDevice(
    new RustSdk.UserId(userId),
    new RustSdk.DeviceId(deviceId)
  );
  if (!device) throw new Error(`Unknown device ${userId}|${deviceId}`);
  try {
    await device.setLocalTrust(
      blocked ? RustSdk.LocalTrust.BlackListed : RustSdk.LocalTrust.Unset
    );
  } finally {
    device.free?.();
  }
}

/**
 * Marks a device as locally trusted (LocalTrust.Verified).
 * Manual "I trust this device" without requiring a cross-signing ceremony.
 */
export async function setDeviceLocallyTrusted(
  crypto: CryptoApi,
  userId: string,
  deviceId: string
): Promise<void> {
  await crypto.setDeviceVerified(userId, deviceId, true);
}

/**
 * Returns a live-updating list of another user's devices with trust/blocked state.
 */
export function useUserDevices(
  mx: MatrixClient,
  crypto: CryptoApi | undefined,
  userId: string
): UserDeviceInfo[] | undefined {
  const [devices, setDevices] = useState<UserDeviceInfo[] | undefined>(undefined);

  const fetchDevices = useCallback(async () => {
    if (!crypto) return;
    try {
      const deviceMap = await crypto.getUserDeviceInfo([userId], true);
      const userDevices = deviceMap.get(userId);
      if (!userDevices) { setDevices([]); return; }

      const infos: UserDeviceInfo[] = await Promise.all(
        Array.from(userDevices.values()).map(async (device) => {
          const status = await crypto.getDeviceVerificationStatus(userId, device.deviceId).catch(() => null);
          return {
            device,
            crossSigned: status?.crossSigningVerified ?? false,
            localVerified: status?.localVerified ?? false,
            isBlocked: device.verified === DeviceVerification.Blocked,
          };
        })
      );

      // Sort: cross-signed first, locally trusted next, blocked last
      infos.sort((a, b) => {
        if (a.isBlocked && !b.isBlocked) return 1;
        if (!a.isBlocked && b.isBlocked) return -1;
        if (a.crossSigned && !b.crossSigned) return -1;
        if (!a.crossSigned && b.crossSigned) return 1;
        if (a.localVerified && !b.localVerified) return -1;
        return 0;
      });
      setDevices(infos);
    } catch {
      setDevices([]);
    }
  }, [crypto, userId]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  useEffect(() => {
    const handleTrust = (changedUserId: string) => {
      if (changedUserId === userId) fetchDevices();
    };
    const handleDevices = (userIds: string[]) => {
      if (userIds.includes(userId)) fetchDevices();
    };
    mx.on(CryptoEvent.UserTrustStatusChanged as any, handleTrust);
    mx.on(CryptoEvent.DevicesUpdated as any, handleDevices);
    return () => {
      mx.removeListener(CryptoEvent.UserTrustStatusChanged as any, handleTrust);
      mx.removeListener(CryptoEvent.DevicesUpdated as any, handleDevices);
    };
  }, [mx, userId, fetchDevices]);

  return devices;
}
