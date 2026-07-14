import { useCallback } from 'react';
import { Method, ClientPrefix } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { AsyncState, useAsyncCallbackValue } from './useAsyncCallback';
import { useSpecVersions } from './useSpecVersions';

// MSC2666 has been stabilised: newer Synapse advertises
// `uk.half-shot.msc2666.query_mutual_rooms.stable` and serves the endpoint at
// GET /_matrix/client/v1/mutual_rooms — NOT the old
// /unstable/uk.half-shot.msc2666/user/mutual_rooms path that matrix-js-sdk's
// `_unstable_getSharedRooms` still uses (it 404s). So we detect the stable flag
// and call the v1 endpoint ourselves; otherwise fall back to the SDK helper.
const STABLE_FLAG = 'uk.half-shot.msc2666.query_mutual_rooms.stable';
const UNSTABLE_FLAGS = [
  'uk.half-shot.msc2666',
  'uk.half-shot.msc2666.mutual_rooms',
  'uk.half-shot.msc2666.query_mutual_rooms',
];

export const useMutualRoomsSupport = (): boolean => {
  const { unstable_features: unstableFeatures } = useSpecVersions();
  const supported =
    !!unstableFeatures?.[STABLE_FLAG] || UNSTABLE_FLAGS.some((f) => !!unstableFeatures?.[f]);
  return supported;
};

const useMutualRoomsStable = (): boolean => {
  const { unstable_features: unstableFeatures } = useSpecVersions();
  return !!unstableFeatures?.[STABLE_FLAG];
};

export const useMutualRooms = (userId: string): AsyncState<string[], unknown> => {
  const mx = useMatrixClient();
  const supported = useMutualRoomsSupport();
  const stable = useMutualRoomsStable();

  const [mutualRoomsState] = useAsyncCallbackValue(
    useCallback(async () => {
      if (!supported) return [];
      if (stable) {
        const rooms: string[] = [];
        let token: string | undefined;
        do {
          const query: Record<string, string> = { user_id: userId };
          if (token) query.batch_token = token;
          // eslint-disable-next-line no-await-in-loop
          const res: { joined?: string[]; next_batch_token?: string } = await mx.http.authedRequest(
            Method.Get,
            '/mutual_rooms',
            query,
            undefined,
            { prefix: ClientPrefix.V1 }
          );
          rooms.push(...(res.joined ?? []));
          token = res.next_batch_token;
        } while (token);
        return rooms;
      }
      return mx._unstable_getSharedRooms(userId);
    }, [mx, userId, supported, stable])
  );

  return mutualRoomsState;
};
