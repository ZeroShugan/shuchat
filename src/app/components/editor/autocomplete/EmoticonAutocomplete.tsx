import React, { KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo } from 'react';
import { Editor } from 'slate';
import { Box, MenuItem, Text, toRem } from 'folds';
import { Room } from 'matrix-js-sdk';

import { AutocompleteQuery } from './autocompleteQuery';
import { AutocompleteMenu } from './AutocompleteMenu';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { UseAsyncSearchOptions, useAsyncSearch } from '../../../hooks/useAsyncSearch';
import { onTabPress } from '../../../utils/keyboard';
import { createEmoticonElement, moveCursor, replaceWithElement } from '../utils';
import { useRecentEmoji } from '../../../hooks/useRecentEmoji';
import { useRelevantImagePacks } from '../../../hooks/useImagePacks';
import { IEmoji, emojis } from '../../../plugins/emoji';
import { useKeyDown } from '../../../hooks/useKeyDown';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { ImageUsage, PackImageReader } from '../../../plugins/custom-emoji';
import { getEmoticonSearchStr } from '../../../plugins/utils';
import { addRecentEmoji, addRecentCustomEmoji } from '../../../plugins/recent-emoji';
import { useFavoriteEmojiKeys } from '../../../hooks/useFavoriteEmoji';

type EmoticonCompleteHandler = (key: string, shortcode: string) => void;

type EmoticonSearchItem = PackImageReader | IEmoji;

type EmoticonAutocompleteProps = {
  imagePackRooms: Room[];
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
};

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  matchOptions: {
    contain: true,
  },
};

export function EmoticonAutocomplete({
  imagePackRooms,
  editor,
  query,
  requestClose,
}: EmoticonAutocompleteProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const imagePacks = useRelevantImagePacks(ImageUsage.Emoticon, imagePackRooms);
  const recentEmoji = useRecentEmoji(mx, 20);

  const searchList = useMemo(() => {
    const all: Array<EmoticonSearchItem> = ([] as Array<EmoticonSearchItem>).concat(
      imagePacks.flatMap((pack) => pack.getImages(ImageUsage.Emoticon)),
      emojis
    );
    // De-dup identical emojis (e.g. the same emote present in two packs) so the
    // autocomplete never lists the same shortcode twice.
    const seen = new Set<string>();
    const list: Array<EmoticonSearchItem> = [];
    all.forEach((it) => {
      const dedupKey = ('url' in it ? it.url : it.unicode) + '|' + it.shortcode;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);
      list.push(it);
    });
    return list;
  }, [imagePacks]);

  const [result, search, resetSearch] = useAsyncSearch(
    searchList,
    getEmoticonSearchStr,
    SEARCH_OPTIONS
  );
  const favoriteKeys = useFavoriteEmojiKeys(mx);
  const sortedItems = useMemo(() => {
    if (!result) return undefined;
    const recentKeys = new Set(recentEmoji.map((e) => ('url' in e ? e.url : e.unicode)));
    const rank = (it: EmoticonSearchItem) => {
      const k = 'url' in it ? it.url : it.unicode;
      if (favoriteKeys.has(k)) return 0;
      if (recentKeys.has(k)) return 1;
      return 2;
    };
    // stable sort: keep the fuzzy-match order within each rank
    return result.items
      .map((it, i) => [it, i] as const)
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
      .map(([it]) => it);
  }, [result, recentEmoji, favoriteKeys]);
  const autoCompleteEmoticon = sortedItems ? sortedItems.slice(0, 20) : recentEmoji;

  useEffect(() => {
    if (query.text) search(query.text);
    else resetSearch();
  }, [query.text, search, resetSearch]);

  const handleAutocomplete: EmoticonCompleteHandler = (key, shortcode) => {
    const emoticonEl = createEmoticonElement(key, shortcode);
    replaceWithElement(editor, query.range, emoticonEl);
    moveCursor(editor, true);
    // Typing :shortcode: counts as using the emoji → record it in Recent too.
    if (key.startsWith('mxc://')) addRecentCustomEmoji(mx, shortcode, key);
    else addRecentEmoji(mx, key);
    requestClose();
  };

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (autoCompleteEmoticon.length === 0) return;
      const emoticon = autoCompleteEmoticon[0];
      const key = 'url' in emoticon ? emoticon.url : emoticon.unicode;
      handleAutocomplete(key, emoticon.shortcode);
    });
  });

  return autoCompleteEmoticon.length === 0 ? null : (
    <AutocompleteMenu headerContent={<Text size="L400">Emojis</Text>} requestClose={requestClose}>
      {autoCompleteEmoticon.map((emoticon) => {
        const isCustomEmoji = 'url' in emoticon;
        const key = isCustomEmoji ? emoticon.url : emoticon.unicode;
        const customEmojiUrl = mxcUrlToHttp(mx, key, useAuthentication);

        return (
          <MenuItem
            key={emoticon.shortcode + key}
            as="button"
            radii="300"
            onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
              onTabPress(evt, () => handleAutocomplete(key, emoticon.shortcode))
            }
            onClick={() => handleAutocomplete(key, emoticon.shortcode)}
            before={
              isCustomEmoji && customEmojiUrl ? (
                <Box
                  shrink="No"
                  as="img"
                  src={customEmojiUrl}
                  alt={emoticon.shortcode}
                  style={{ width: toRem(24), height: toRem(24), objectFit: 'contain' }}
                />
              ) : (
                <Box
                  shrink="No"
                  as="span"
                  display="InlineFlex"
                  style={{ fontSize: toRem(24), lineHeight: toRem(24) }}
                >
                  {key}
                </Box>
              )
            }
          >
            <Text style={{ flexGrow: 1 }} size="B400" truncate>
              :{emoticon.shortcode}:
            </Text>
          </MenuItem>
        );
      })}
    </AutocompleteMenu>
  );
}
