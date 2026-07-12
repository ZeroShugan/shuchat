export enum AccountDataEvent {
  PushRules = 'm.push_rules',
  Direct = 'm.direct',
  IgnoredUserList = 'm.ignored_user_list',

  CinnySpaces = 'in.cinny.spaces',

  ElementRecentEmoji = 'io.element.recent_emoji',

  PoniesUserEmotes = 'im.ponies.user_emotes',
  PoniesEmoteRooms = 'im.ponies.emote_rooms',

  SecretStorageDefaultKey = 'm.secret_storage.default_key',

  CrossSigningMaster = 'm.cross_signing.master',
  CrossSigningSelf = 'm.cross_signing.self',
  CrossSigningUser = 'm.cross_signing.user',
  MegolmBackupV1 = 'm.megolm_backup.v1',

  ShuChatUserNotes = 'im.shuchat.user_notes',
  ShuChatProfile = 'im.shuchat.profile',
  // Recently-used custom/pack emoji (mxc:// images), tracked separately from
  // io.element.recent_emoji (which only ever stores unicode codepoints) so a
  // custom-emoji "recent" doesn't collide with — or get silently dropped by —
  // other Element-family clients writing that shared key.
  ShuChatRecentCustomEmoji = 'im.shuchat.recent_custom_emoji',
  // Curated favourite emoji (unicode + custom), starred by the user.
  ShuChatFavoriteEmoji = 'im.shuchat.favorite_emoji',
}

export type MDirectContent = Record<string, string[]>;

export type SecretStorageDefaultKeyContent = {
  key: string;
};

export type SecretStoragePassphraseContent = {
  algorithm: string;
  salt: string;
  iterations: number;
  bits?: number;
};

export type SecretStorageKeyContent = {
  name?: string;
  algorithm: string;
  iv?: string;
  mac?: string;
  passphrase?: SecretStoragePassphraseContent;
};

export type SecretContent = {
  iv: string;
  ciphertext: string;
  mac: string;
};

export type SecretAccountData = {
  encrypted: Record<string, SecretContent>;
};
