import { createClient, MatrixClient, IndexedDBStore, IndexedDBCryptoStore } from 'matrix-js-sdk';

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
