import {
  createClient,
  MatrixClient,
  IndexedDBStore,
  IndexedDBCryptoStore,
  Method,
} from 'matrix-js-sdk';

import { cryptoCallbacks } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { pushSessionToSW } from '../sw-session';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
  isGuest?: boolean;
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: 'web-sync-store',
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, 'crypto-store');

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    // isGuest skips push rules, presence, and other auth-only endpoints
    isGuest: session.isGuest ?? false,
    ...(session.isGuest ? {} : {
      cryptoCallbacks: cryptoCallbacks as any,
      verificationMethods: ['m.sas.v1'],
    }),
  });

  await indexedDBStore.startup();
  // Guests cannot use E2E encryption — skip Rust crypto init
  if (!session.isGuest) {
    await mx.initRustCrypto();

    // ── WS3 verification fix ────────────────────────────────────────────────
    // matrix-js-sdk 38.2.0 sends the in-room verification *request* as a bare
    // `m.key.verification.request`-typed event, but its own receive path
    // (isVerificationEvent / onKeyVerificationEvent) only recognises the spec
    // form: an `m.room.message` with msgtype `m.key.verification.request`. The
    // mismatch means ShuChat<->ShuChat user verification never surfaces on the
    // receiver. Override the internal send (called via `this.` inside
    // requestVerificationDM) to publish the spec-compliant event so both halves
    // agree. Remove when the SDK is upgraded past this bug.
    const cryptoApi = mx.getCrypto?.() as any;
    if (cryptoApi && typeof cryptoApi.sendVerificationRequestContent === 'function') {
      cryptoApi.sendVerificationRequestContent = async (
        roomId: string,
        content: Record<string, unknown>
      ): Promise<string> => {
        // Mirror the SDK's original raw, unencrypted send exactly — only the
        // event type changes (m.room.message) and we add the required msgtype.
        // `content` from the rust SDK is a JSON *string* (not a plain object,
        // not a spreadable wasm object). Normalise to an object either way, then
        // add the required msgtype for the m.room.message form.
        const c = content as unknown;
        const body: Record<string, unknown> =
          typeof c === 'string'
            ? (JSON.parse(c) as Record<string, unknown>)
            : (JSON.parse(JSON.stringify(c)) as Record<string, unknown>);
        body.msgtype = 'm.key.verification.request';
        const txId = mx.makeTxnId();
        // eslint-disable-next-line no-console
        console.info('[ShuChat-verify] send in-room request as m.room.message (raw)', {
          roomId,
          body,
        });
        const res: { event_id: string } = await mx.http.authedRequest(
          Method.Put,
          `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txId)}`,
          undefined,
          body
        );
        // eslint-disable-next-line no-console
        console.info('[ShuChat-verify] request sent, event_id =', res.event_id);
        return res.event_id;
      };
    }
    // ────────────────────────────────────────────────────────────────────────
  }

  mx.setMaxListeners(50);

  return mx;
};

const PRESENCE_STORAGE_KEY = 'shuchat-manual-presence';

export const startClient = async (mx: MatrixClient) => {
  // Restore manually selected presence before starting sync so Synapse
  // sees the right set_presence from the very first /sync request.
  const savedPresence = localStorage.getItem(PRESENCE_STORAGE_KEY);
  if (savedPresence === 'online' || savedPresence === 'unavailable' || savedPresence === 'offline') {
    mx.setSyncPresence(savedPresence as any);
  }

  await mx.startClient({
    lazyLoadMembers: true,
    initialSyncLimit: 20,
  });

  // Bootstrap cross-signing and secret storage so new users get their
  // cross-signing keys published automatically after the client starts.
  const crypto = mx.getCrypto?.() ?? (mx as any).crypto;
  if (crypto) {
    try { await crypto.bootstrapSecretStorage({}); } catch {}
    try { await crypto.bootstrapCrossSigning({ setupNewCrossSigning: false }); } catch {}
  }

  // After sync starts, push the saved presence to the server too.
  if (savedPresence === 'online' || savedPresence === 'unavailable' || savedPresence === 'offline') {
    try { await mx.setPresence({ presence: savedPresence as any }); }
    catch { /* ignore — optimistic UI already correct via setSyncPresence */ }
  }
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  mx.stopClient();
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  window.location.reload();
};

export const logoutClient = async (mx: MatrixClient) => {
  pushSessionToSW();
  mx.stopClient();
  try {
    await mx.logout();
  } catch {
    // ignore if failed to logout
  }
  await mx.clearStores();
  window.localStorage.clear();
  window.location.reload();
};

export const clearLoginData = async () => {
  const dbs = await window.indexedDB.databases();

  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) {
      window.indexedDB.deleteDatabase(name);
    }
  });

  window.localStorage.clear();
  window.location.reload();
};
