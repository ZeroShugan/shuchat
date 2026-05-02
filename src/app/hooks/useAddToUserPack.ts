import { useCallback, useState } from 'react';
import { MatrixClient } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { PackContent, ImageUsage } from '../plugins/custom-emoji/types';
import { IImageInfo } from '../../types/matrix/common';

const USER_PACK_LIMIT = 100;

export type AddResult = 'added' | 'duplicate' | 'limit';

export function useAddToUserPack(mx: MatrixClient) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AddResult | null>(null);

  const addImage = useCallback(
    async (mxcUrl: string, rawShortcode: string, usage: ImageUsage[], info?: IImageInfo): Promise<AddResult> => {
      setBusy(true);
      setResult(null);
      try {
        const packEvent = mx.getAccountData(AccountDataEvent.PoniesUserEmotes);
        const currentContent = (packEvent?.getContent<PackContent>()) ?? {};
        const images = currentContent.images ?? {};

        if (Object.values(images).some((img) => img.url === mxcUrl)) {
          setResult('duplicate');
          return 'duplicate';
        }
        if (Object.keys(images).length >= USER_PACK_LIMIT) {
          setResult('limit');
          return 'limit';
        }

        let key = rawShortcode.replace(/^:+|:+$/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'image';
        let finalKey = key;
        let i = 1;
        while (images[finalKey]) finalKey = key + '_' + (i++);

        const newContent: PackContent = {
          ...currentContent,
          images: {
            ...images,
            [finalKey]: {
              url: mxcUrl,
              body: rawShortcode.replace(/^:+|:+$/g, '') || finalKey,
              usage,
              ...(info ? { info } : {}),
            },
          },
        };
        await mx.setAccountData(AccountDataEvent.PoniesUserEmotes, newContent);
        setResult('added');
        return 'added';
      } finally {
        setBusy(false);
      }
    },
    [mx]
  );

  return { addImage, busy, result, resetResult: () => setResult(null) };
}
