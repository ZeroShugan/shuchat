import { useEffect, useState } from 'react';
import { ClientEvent, MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { getFavoriteEmojis, getFavoriteEmojiKeys } from '../plugins/favorite-emoji';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { IEmoji } from '../plugins/emoji';
import { PackImageReader } from '../plugins/custom-emoji';

export const useFavoriteEmoji = (
  mx: MatrixClient,
  limit?: number
): Array<IEmoji | PackImageReader> => {
  const [favorite, setFavorite] = useState(() => getFavoriteEmojis(mx, limit));

  useEffect(() => {
    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== AccountDataEvent.ShuChatFavoriteEmoji) return;
      setFavorite(getFavoriteEmojis(mx, limit));
    };
    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx, limit]);

  return favorite;
};

/** Reactive Set of favourite keys (unicode char / mxc url), for sorting + badges. */
export const useFavoriteEmojiKeys = (mx: MatrixClient): Set<string> => {
  const [keys, setKeys] = useState(() => getFavoriteEmojiKeys(mx));

  useEffect(() => {
    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== AccountDataEvent.ShuChatFavoriteEmoji) return;
      setKeys(getFavoriteEmojiKeys(mx));
    };
    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx]);

  return keys;
};
