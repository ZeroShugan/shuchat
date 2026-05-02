import React from 'react';
import { Box, Text, IconButton, Icon, Icons, Scroll, Switch } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useDeviceIds, useDeviceList, useSplitCurrentDevice } from '../../../hooks/useDeviceList';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { LocalBackup } from './LocalBackup';
import { DeviceLogoutBtn, DeviceKeyDetails, DeviceTile, DeviceTilePlaceholder } from './DeviceTile';
import { OtherDevices } from './OtherDevices';
import {
  DeviceVerificationOptions,
  EnableVerification,
  VerificationStatusBadge,
  VerifyCurrentDeviceTile,
} from './Verification';
import {
  useDeviceVerificationStatus,
  useUnverifiedDeviceCount,
  VerificationStatus,
} from '../../../hooks/useDeviceVerificationStatus';
import {
  useSecretStorageDefaultKeyId,
  useSecretStorageKeyContent,
} from '../../../hooks/useSecretStorage';
import { useCrossSigningActive } from '../../../hooks/useCrossSigning';
import { BackupRestoreTile } from '../../../components/BackupRestore';

function DevicesPlaceholder() {
  return (
    <Box direction="Column" gap="100">
      <DeviceTilePlaceholder />
      <DeviceTilePlaceholder />
    </Box>
  );
}

type DevicesProps = {
  requestClose: () => void;
};
export function Devices({ requestClose }: DevicesProps) {
  const mx = useMatrixClient();
  const crypto = mx.getCrypto();
  const crossSigningActive = useCrossSigningActive();
  const [shareKeysWith, setShareKeysWith] = useSetting(settingsAtom, 'shareKeysWith');

  // Apply isolation mode whenever the setting changes
  React.useEffect(() => {
    if (!crypto) return;
    if (shareKeysWith === 'cross-verified') {
      crypto.setDeviceIsolationMode(new OnlySignedDevicesIsolationMode());
    } else if (shareKeysWith === 'verified') {
      crypto.setDeviceIsolationMode(new AllDevicesIsolationMode(true));
    } else {
      crypto.setDeviceIsolationMode(new AllDevicesIsolationMode(false));
    }
  }, [crypto, shareKeysWith]);
  const [devices, refreshDeviceList] = useDeviceList();

  const [currentDevice, otherDevices] = useSplitCurrentDevice(devices);
  const verificationStatus = useDeviceVerificationStatus(
    crypto,
    mx.getSafeUserId(),
    currentDevice?.device_id
  );

  const otherDevicesId = useDeviceIds(otherDevices);
  const unverifiedDeviceCount = useUnverifiedDeviceCount(
    crypto,
    mx.getSafeUserId(),
    otherDevicesId
  );

  const defaultSecretStorageKeyId = useSecretStorageDefaultKeyId();
  const defaultSecretStorageKeyContent = useSecretStorageKeyContent(
    defaultSecretStorageKeyId ?? ''
  );

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Devices
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">Security</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Device Verification"
                    description="To verify device identity and grant access to encrypted messages."
                    after={
                      <>
                        <EnableVerification visible={!crossSigningActive} />
                        {crossSigningActive && (
                          <Box gap="200" alignItems="Center">
                            <VerificationStatusBadge
                              verificationStatus={verificationStatus}
                              otherUnverifiedCount={unverifiedDeviceCount}
                            />
                            <DeviceVerificationOptions />
                          </Box>
                        )}
                      </>
                    }
                  />
                  <SettingTile
                    title="Share keys with…"
                    description="Which devices should receive your encryption keys in encrypted chats?"
                    after={
                      <select
                        value={shareKeysWith ?? 'all'}
                        onChange={(e) => setShareKeysWith(e.target.value as any)}
                        style={{
                          background: 'var(--mx-surface-variant-container, #2b2d31)',
                          color: 'inherit',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 13,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <option value="all">All devices</option>
                        <option value="verified">Verified devices</option>
                        <option value="cross-verified">Cross-verified devices only</option>
                      </select>
                    }
                  />
                </SequenceCard>
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Current</Text>
                {currentDevice ? (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <DeviceTile
                      device={currentDevice}
                      refreshDeviceList={refreshDeviceList}
                      options={<DeviceLogoutBtn />}
                    >
                      {crypto && <DeviceKeyDetails crypto={crypto} />}
                    </DeviceTile>
                    {crossSigningActive &&
                      verificationStatus === VerificationStatus.Unverified &&
                      defaultSecretStorageKeyId &&
                      defaultSecretStorageKeyContent && (
                        <VerifyCurrentDeviceTile
                          secretStorageKeyId={defaultSecretStorageKeyId}
                          secretStorageKeyContent={defaultSecretStorageKeyContent}
                        />
                      )}
                    {crypto && verificationStatus === VerificationStatus.Verified && (
                      <BackupRestoreTile crypto={crypto} />
                    )}
                  </SequenceCard>
                ) : (
                  <DeviceTilePlaceholder />
                )}
              </Box>
              {devices === undefined && <DevicesPlaceholder />}
              {otherDevices && (
                <OtherDevices
                  devices={otherDevices}
                  refreshDeviceList={refreshDeviceList}
                  showVerification={
                    crossSigningActive && verificationStatus === VerificationStatus.Verified
                  }
                />
              )}
              <LocalBackup />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
