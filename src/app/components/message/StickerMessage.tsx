import React, { useState, useCallback } from 'react';
import { Icon, Icons, Spinner, Text } from 'folds';
import { MatrixClient } from 'matrix-js-sdk';
import { ImageUsage } from '../../plugins/custom-emoji/types';
import { useAddToUserPack, AddResult } from '../../hooks/useAddToUserPack';

type StickerMessageProps = {
  mx: MatrixClient;
  mxcUrl: string;
  body: string;
  info?: Record<string, unknown>;
  children: React.ReactNode;
};

const RESULT_LABEL: Record<AddResult, string> = {
  added: '✓ Added to your pack',
  duplicate: 'Already in your pack',
  limit: 'Pack full (100 max)',
};
const RESULT_COLOR: Record<AddResult, string> = {
  added: '#3ba55d',
  duplicate: '#3b82f6',
  limit: '#f0a500',
};

export function StickerMessage({ mx, mxcUrl, body, info, children }: StickerMessageProps) {
  const [hovered, setHovered] = useState(false);
  const { addImage, busy, result, resetResult } = useAddToUserPack(mx);

  const handleAdd = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    await addImage(mxcUrl, body || 'sticker', [ImageUsage.Sticker], info as any);
    setTimeout(resetResult, 2500);
  }, [addImage, mxcUrl, body, info, busy, resetResult]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!result) setHovered(false); }}>
      {children}
      {(hovered || !!result) && (
        <button type="button" onClick={handleAdd}
          title={result ? RESULT_LABEL[result] : 'Add sticker to my pack'}
          style={{
            position: 'absolute', top: 6, right: 6,
            background: result ? RESULT_COLOR[result] : 'rgba(0,0,0,0.6)',
            border: 'none', borderRadius: '50%', width: 28, height: 28,
            cursor: busy ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, zIndex: 10, transition: 'background 0.15s',
          }}>
          {busy ? <Spinner size="100" variant="Primary" fill="Solid" />
                : <Icon src={Icons.Star} size="50" style={{ color: '#fff' }} filled={!!result} />}
        </button>
      )}
      {result && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 4px)', left: '50%',
          transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.85)',
          borderRadius: 6, padding: '3px 10px', whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 20,
        }}>
          <Text size="T200" style={{ color: RESULT_COLOR[result], fontSize: 11 }}>
            {RESULT_LABEL[result]}
          </Text>
        </div>
      )}
    </div>
  );
}
