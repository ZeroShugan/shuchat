import { MatrixClient } from 'matrix-js-sdk';
import { getAccountData } from '../utils/room';
import { IEmoji, emojis } from './emoji';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { ImageUsage, PackImageReader } from './custom-emoji';

type EmojiUnicode = string;
type EmojiUsageCount = number;

export type IRecentEmojiContent = {
  recent_emoji?: [EmojiUnicode, EmojiUsageCount][];
};

export const getRecentEmojis = (mx: MatrixClient, limit?: number): IEmoji[] => {
  const recentEmojiEvent = getAccountData(mx, AccountDataEvent.ElementRecentEmoji);
  const recentEmoji = recentEmojiEvent?.getContent<IRecentEmojiContent>().recent_emoji;
  if (!Array.isArray(recentEmoji)) return [];

  return recentEmoji
    .sort((e1, e2) => e2[1] - e1[1])
    .slice(0, limit)
    .reduce<IEmoji[]>((list, [unicode]) => {
      const emoji = emojis.find((e) => e.unicode === unicode);
      if (emoji) list.push(emoji);
      return list;
    }, []);
};

export function addRecentEmoji(mx: MatrixClient, unicode: string) {
  const recentEmojiEvent = getAccountData(mx, AccountDataEvent.ElementRecentEmoji);
  const recentEmojiContent = recentEmojiEvent?.getContent<IRecentEmojiContent>();
  const recentEmoji =
    recentEmojiContent && Array.isArray(recentEmojiContent.recent_emoji)
      ? structuredClone(recentEmojiContent.recent_emoji)
      : [];

  const emojiIndex = recentEmoji.findIndex(([u]) => u === unicode);
  let entry: [EmojiUnicode, EmojiUsageCount];
  if (emojiIndex < 0) {
    entry = [unicode, 1];
  } else {
    [entry] = recentEmoji.splice(emojiIndex, 1);
    entry[1] += 1;
  }
  recentEmoji.unshift(entry);
  mx.setAccountData(AccountDataEvent.ElementRecentEmoji, {
    recent_emoji: recentEmoji.slice(0, 100),
  });
}

// ── Custom/pack emoji recents ───────────────────────────────────────────────
// Upstream (Element/Cinny) only ever tracks unicode emoji in "recent" — custom
// image-pack emoji (personal pack or a shared room pack) never got recorded,
// so they never appeared in the Recent category no matter how often they were
// used. Tracked in a separate ShuChat-namespaced account-data key (rather than
// piggybacking on io.element.recent_emoji) so another Element-family client
// writing that shared key can never silently wipe our custom-emoji history.
type CustomEmojiShortcode = string;
type CustomEmojiUrl = string; // mxc://
type CustomEmojiBody = string | undefined;
type ICustomEmojiEntry = [CustomEmojiShortcode, CustomEmojiUrl, EmojiUsageCount, CustomEmojiBody];

export type IRecentCustomEmojiContent = {
  recent_custom_emoji?: ICustomEmojiEntry[];
};

export const getRecentCustomEmojis = (mx: MatrixClient, limit?: number): PackImageReader[] => {
  const ev = getAccountData(mx, AccountDataEvent.ShuChatRecentCustomEmoji);
  const recent = ev?.getContent<IRecentCustomEmojiContent>().recent_custom_emoji;
  if (!Array.isArray(recent)) return [];

  return recent
    .sort((e1, e2) => e2[2] - e1[2])
    .slice(0, limit)
    .reduce<PackImageReader[]>((list, [shortcode, url, , body]) => {
      const reader = PackImageReader.fromPackImage(shortcode, {
        url,
        body,
        usage: [ImageUsage.Emoticon],
      });
      if (reader) list.push(reader);
      return list;
    }, []);
};

export function addRecentCustomEmoji(
  mx: MatrixClient,
  shortcode: string,
  url: string,
  body?: string
) {
  const ev = getAccountData(mx, AccountDataEvent.ShuChatRecentCustomEmoji);
  const content = ev?.getContent<IRecentCustomEmojiContent>();
  const recent =
    content && Array.isArray(content.recent_custom_emoji)
      ? structuredClone(content.recent_custom_emoji)
      : [];

  // Match by mxc url (stable identity even if the shortcode is later renamed).
  const idx = recent.findIndex(([, u]) => u === url);
  let entry: ICustomEmojiEntry;
  if (idx < 0) {
    entry = [shortcode, url, 1, body];
  } else {
    [entry] = recent.splice(idx, 1);
    entry[0] = shortcode; // keep the shortcode fresh if it was renamed
    entry[2] += 1;
    entry[3] = body;
  }
  recent.unshift(entry);
  mx.setAccountData(AccountDataEvent.ShuChatRecentCustomEmoji, {
    recent_custom_emoji: recent.slice(0, 100),
  });
}

// ── Merged recent list (unicode + custom, for the "Recent" board category) ─
export const getRecentEmojisAndCustom = (
  mx: MatrixClient,
  limit?: number
): Array<IEmoji | PackImageReader> => {
  type Merged =
    | { kind: 'emoji'; unicode: string; count: EmojiUsageCount }
    | { kind: 'custom'; shortcode: string; url: string; body?: string; count: EmojiUsageCount };

  const emojiEvent = getAccountData(mx, AccountDataEvent.ElementRecentEmoji);
  const emojiRaw = emojiEvent?.getContent<IRecentEmojiContent>().recent_emoji;
  const emojiEntries: Merged[] = Array.isArray(emojiRaw)
    ? emojiRaw.map(([unicode, count]) => ({ kind: 'emoji' as const, unicode, count }))
    : [];

  const customEvent = getAccountData(mx, AccountDataEvent.ShuChatRecentCustomEmoji);
  const customRaw = customEvent?.getContent<IRecentCustomEmojiContent>().recent_custom_emoji;
  const customEntries: Merged[] = Array.isArray(customRaw)
    ? customRaw.map(([shortcode, url, count, body]) => ({
        kind: 'custom' as const,
        shortcode,
        url,
        body,
        count,
      }))
    : [];

  return [...emojiEntries, ...customEntries]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .reduce<Array<IEmoji | PackImageReader>>((list, entry) => {
      if (entry.kind === 'emoji') {
        const emoji = emojis.find((e) => e.unicode === entry.unicode);
        if (emoji) list.push(emoji);
      } else {
        const reader = PackImageReader.fromPackImage(entry.shortcode, {
          url: entry.url,
          body: entry.body,
          usage: [ImageUsage.Emoticon],
        });
        if (reader) list.push(reader);
      }
      return list;
    }, []);
};
