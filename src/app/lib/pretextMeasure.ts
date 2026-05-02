import { prepare, layout } from '@chenglou/pretext';

type PreparedText = ReturnType<typeof prepare>;

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
