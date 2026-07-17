import { prepare, layout } from '@chenglou/pretext';

type PreparedText = ReturnType<typeof prepare>;

// Per pretext guidance: prepare() once per text+font, then layout() is cheap
// per width. Capped so a long session doesn't accumulate every message body
// ever measured; on overflow the oldest half is dropped (Map preserves
// insertion order).
const MAX_PREPARED_CACHE = 4000;
const preparedCache = new Map<string, PreparedText>();

export function measureText(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number
): { height: number; lineCount: number } {
  const key = text + '|' + font;
  let prepared = preparedCache.get(key);
  if (!prepared) {
    prepared = prepare(text, font);
    if (preparedCache.size >= MAX_PREPARED_CACHE) {
      const drop = Math.floor(MAX_PREPARED_CACHE / 2);
      let i = 0;
      const keys = preparedCache.keys();
      let k = keys.next();
      while (!k.done && i < drop) {
        preparedCache.delete(k.value);
        k = keys.next();
        i += 1;
      }
    }
    preparedCache.set(key, prepared);
  }
  return layout(prepared, maxWidth, lineHeight);
}

// Read once from a rendered element, then cache for the session
let _msgFont: string | undefined;
export function getMessageFont(el: HTMLElement): string {
  if (!_msgFont) _msgFont = getComputedStyle(el).font;
  return _msgFont;
}

export function clearPretextCache(): void {
  preparedCache.clear();
  _msgFont = undefined;
}
