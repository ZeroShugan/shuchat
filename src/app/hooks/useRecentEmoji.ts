import { useEffect, useState } from 'react';
import { ClientEvent, MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { getRecentEmojisAndCustom } from '../plugins/recent-emoji';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { IEmoji } from '../plugins/emoji';
import { PackImageReader } from '../plugins/custom-emoji';

export const useRecentEmoji = (
  mx: MatrixClient,
  limit?: number
): Array<IEmoji | PackImageReader> => {
  const [recentEmoji, setRecentEmoji] = useState(() => getRecentEmojisAndCustom(mx, limit));

  useEffect(() => {
    const handleAccountData = (event: MatrixEvent) => {
      const type = event.getType();
      if (type !== AccountDataEvent.ElementRecentEmoji
        && type !== AccountDataEvent.ShuChatRecentCustomEmoji) return;
      setRecentEmoji(getRecentEmojisAndCustom(mx, limit));
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx, limit]);

  return recentEmoji;
};
