/**
 * Module-level cache of image URLs that have permanently failed to load.
 * This persists across React component unmount/remount cycles (e.g. virtualizer
 * removing and re-adding items from the DOM), preventing infinite retry loops
 * for URLs that require auth headers that <img> tags cannot send (ORB errors).
 */
const failedUrls = new Set<string>();

export function hasImageFailed(url: string | undefined): boolean {
  if (!url) return false;
  return failedUrls.has(url);
}

export function markImageFailed(url: string | undefined): void {
  if (url) failedUrls.add(url);
}
