import { MatrixClient } from 'matrix-js-sdk';
import { getAccountData } from '../utils/room';
import { IEmoji, emojis } from './emoji';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { ImageUsage, PackImageReader } from './custom-emoji';

// A favourite is [type, key, shortcode, body?] where type is 'e' (unicode emoji,
// key = the unicode char) or 'c' (custom/pack emoji, key = the mxc:// url). Stored in
// a ShuChat-namespaced account-data key so it survives across clients and can never be
// clobbered by another Element-family client writing a shared key.
export type FavoriteEmojiEntry = ['e' | 'c', string, string, string?];
export type IFavoriteEmojiContent = { favorite_emoji?: FavoriteEmojiEntry[] };

function readFavorites(mx: MatrixClient): FavoriteEmojiEntry[] {
  const ev = getAccountData(mx, AccountDataEvent.ShuChatFavoriteEmoji);
  const list = ev?.getContent<IFavoriteEmojiContent>().favorite_emoji;
  return Array.isArray(list) ? list : [];
}

/** Set of favourite keys (unicode char OR mxc url) — for O(1) "is favourite?" checks. */
export const getFavoriteEmojiKeys = (mx: MatrixClient): Set<string> =>
  new Set(readFavorites(mx).map(([, key]) => key));

export const isFavoriteEmoji = (mx: MatrixClient, key: string): boolean =>
  readFavorites(mx).some(([, k]) => k === key);

/** Favourites resolved to renderable emoji/pack-image objects, in saved order. */
export const getFavoriteEmojis = (
  mx: MatrixClient,
  limit?: number
): Array<IEmoji | PackImageReader> =>
  readFavorites(mx)
    .slice(0, limit)
    .reduce<Array<IEmoji | PackImageReader>>((out, [type, key, shortcode, body]) => {
      if (type === 'e') {
        const emoji = emojis.find((e) => e.unicode === key);
        if (emoji) out.push(emoji);
      } else {
        const reader = PackImageReader.fromPackImage(shortcode, {
          url: key,
          body,
          usage: [ImageUsage.Emoticon],
        });
        if (reader) out.push(reader);
      }
      return out;
    }, []);

/** Toggle an emoji's favourite state (add to front if absent, else remove). */
export function toggleFavoriteEmoji(
  mx: MatrixClient,
  entry: { type: 'e' | 'c'; key: string; shortcode: string; body?: string }
) {
  const list = structuredClone(readFavorites(mx));
  const idx = list.findIndex(([, k]) => k === entry.key);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift([entry.type, entry.key, entry.shortcode, entry.body]);
  }
  mx.setAccountData(AccountDataEvent.ShuChatFavoriteEmoji, {
    favorite_emoji: list.slice(0, 200),
  });
}
