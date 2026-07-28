import { describe, expect, it } from 'vitest';
import {
  AUDIO_MIME_TYPES,
  READABLE_EXT_TO_MIME_TYPE,
  READABLE_TEXT_MIME_TYPES,
  getFileNameExt,
  mimeTypeToExt,
} from './mimeTypes';

// Guards the language-resolution chain the inline text preview AND the modal
// viewer both depend on (round 2026-07-27): a .py attachment must resolve to
// a Prism-highlightable language name, unknown types must not crash.

const resolve = (body: string, mimeType: string) =>
  READABLE_TEXT_MIME_TYPES.includes(mimeType)
    ? mimeTypeToExt(mimeType)
    : mimeTypeToExt(READABLE_EXT_TO_MIME_TYPE[getFileNameExt(body)] ?? mimeType);

describe('text preview language resolution', () => {
  it('python file by extension', () => {
    expect(resolve('script.py', 'application/octet-stream')).toBe('python');
  });

  it('json by mime', () => {
    expect(resolve('data.json', 'application/json')).toBe('json');
  });

  it('typescript by extension', () => {
    expect(resolve('index.ts', 'application/octet-stream')).toBe('typescript');
  });

  it('unknown type does not throw', () => {
    expect(() => resolve('blob.xyz', 'application/octet-stream')).not.toThrow();
  });
});

describe('upstream pick regression guards', () => {
  it('ogg audio is playable (cherry-pick 21bbf4b, 2026-07-28)', () => {
    expect(AUDIO_MIME_TYPES).toContain('audio/ogg');
  });
});
