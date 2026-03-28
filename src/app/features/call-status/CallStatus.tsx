import React from 'react';
import { Box, Spinner, Text } from 'folds';
import classNames from 'classnames';
import { LiveChip } from './LiveChip';
import * as css from './styles.css';
import { CallRoomName } from './CallRoomName';
import { CallControl } from './CallControl';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { useCallMembers, useCallSession } from '../../hooks/useCall';
import { ScreenSize, useScreenSize } from '../../hooks/useScreenSize';
import { MemberGlance } from './MemberGlance';
import { StatusDivider } from './components';
import { CallEmbed } from '../../plugins/call/CallEmbed';
import { useCallJoined } from '../../hooks/useCallEmbed';
import { useCallSpeakers } from '../../hooks/useCallSpeakers';
import { MemberSpeaking } from './MemberSpeaking';
import { useConnectionStats } from '../../hooks/useConnectionStats';

type CallStatusProps = {
  callEmbed: CallEmbed;
};
export function CallStatus({ callEmbed }: CallStatusProps) {
  const { room } = callEmbed;

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const screenSize = useScreenSize();
  const callJoined = useCallJoined(callEmbed);
  const speakers = useCallSpeakers(callEmbed);

  const connectionStats = useConnectionStats(callEmbed, callJoined);

  const compact = screenSize === ScreenSize.Mobile;

  const memberVisible = callJoined && callMembers.length > 0;

  return (
    <Box
      className={classNames(css.CallStatus, ContainerColor({ variant: 'Background' }))}
      shrink="No"
      gap="400"
      alignItems={compact ? undefined : 'Center'}
      direction={compact ? 'Column' : 'Row'}
    >
      <Box grow="Yes" alignItems="Center" gap="200">
        {memberVisible ? (
          <Box shrink="No" alignItems="Center" gap="200">
            <span style={{
              width: '10px', height: '10px', borderRadius: '50%',
              backgroundColor: '#3ba55d', display: 'inline-block', flexShrink: 0,
            }} />
            <Box direction="Column" gap="0">
              <Text as="span" className={css.VoiceConnectedLabel}>
                Voice Connected
              </Text>
              {!compact && <CallRoomName room={room} />}
              {!compact && connectionStats.rtt !== null && (
                <Box alignItems="Center" gap="100" style={{ opacity: 0.6 }}>
                  <Text as="span" size="T200" style={{
                    fontSize: '0.65rem',
                    color: connectionStats.rtt! <= 80 ? '#3ba55d' : connectionStats.rtt! <= 150 ? '#faa61a' : '#ed4245',
                    fontWeight: 600,
                  }}>
                    {connectionStats.rtt}ms
                  </Text>
                  {connectionStats.packetLoss !== null && connectionStats.packetLoss > 0 && (
                    <Text as="span" size="T200" style={{
                      fontSize: '0.65rem',
                      color: connectionStats.packetLoss > 5 ? '#ed4245' : connectionStats.packetLoss > 1 ? '#faa61a' : undefined,
                    }}>
                      {connectionStats.packetLoss}% loss
                    </Text>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        ) : (
          <Box shrink="No" alignItems="Center" gap="200">
            <Spinner variant="Secondary" size="200" />
            <Text as="span" size="T200" style={{ opacity: 0.6 }}>Connecting...</Text>
          </Box>
        )}
        <Box grow="Yes" alignItems="Center" gap="Inherit">
          {!compact && speakers.size > 0 && (
            <>
              <StatusDivider />
              <span data-spacing-node />
              <MemberSpeaking room={room} speakers={speakers} />
            </>
          )}
        </Box>
        {memberVisible && (
          <Box shrink="No">
            <MemberGlance room={room} members={callMembers} speakers={speakers} />
          </Box>
        )}
      </Box>
      {memberVisible && !compact && <StatusDivider />}
      <Box shrink="No" alignItems="Center" gap="Inherit">
        {compact && (
          <Box grow="Yes">
            <CallRoomName room={room} />
          </Box>
        )}
        <CallControl callJoined={callJoined} compact={compact} callEmbed={callEmbed} />
      </Box>
    </Box>
  );
}
