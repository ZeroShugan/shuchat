import { useState, useEffect, useRef } from 'react';
import { CallEmbed } from '../plugins/call/CallEmbed';

export type ConnectionStats = {
  rtt: number | null;       // round-trip time in ms
  packetLoss: number | null; // outbound packet loss percentage
};

export function useConnectionStats(callEmbed: CallEmbed | null, joined: boolean): ConnectionStats {
  const [stats, setStats] = useState<ConnectionStats>({ rtt: null, packetLoss: null });
  const prevSentRef = useRef<{ packets: number; lost: number; timestamp: number } | null>(null);

  useEffect(() => {
    if (!callEmbed || !joined) {
      setStats({ rtt: null, packetLoss: null });
      prevSentRef.current = null;
      return;
    }

    const poll = async () => {
      try {
        const win = callEmbed.iframe.contentWindow as any;
        const pcs: RTCPeerConnection[] = win?.__rtcPCs ?? [];
        
        // Find the first connected peer connection
        const pc = pcs.find(
          (p) => p.connectionState === 'connected' || p.iceConnectionState === 'connected'
        );
        if (!pc) return;

        const report = await pc.getStats();
        let rtt: number | null = null;
        let totalPacketsSent = 0;
        let totalPacketsLost = 0;

        report.forEach((entry: any) => {
          // Get RTT from candidate-pair
          if (entry.type === 'candidate-pair' && entry.state === 'succeeded' && entry.currentRoundTripTime != null) {
            rtt = Math.round(entry.currentRoundTripTime * 1000);
          }
          // Get packet loss from remote-inbound-rtp (what the server reports back)
          if (entry.type === 'remote-inbound-rtp' && entry.kind === 'audio') {
            totalPacketsSent += entry.packetsSent ?? 0;
            totalPacketsLost += entry.packetsLost ?? 0;
          }
        });

        // Calculate packet loss rate over the polling interval
        let packetLoss: number | null = null;
        if (totalPacketsSent > 0) {
          const prev = prevSentRef.current;
          if (prev) {
            const deltaSent = totalPacketsSent - prev.packets;
            const deltaLost = totalPacketsLost - prev.lost;
            if (deltaSent > 0) {
              packetLoss = Math.round((deltaLost / deltaSent) * 1000) / 10; // one decimal
            }
          }
          prevSentRef.current = { packets: totalPacketsSent, lost: totalPacketsLost, timestamp: Date.now() };
        }

        setStats({ rtt, packetLoss });
      } catch {
        // iframe might not be ready yet
      }
    };

    const interval = setInterval(poll, 2000);
    poll();

    return () => clearInterval(interval);
  }, [callEmbed, joined]);

  return stats;
}
