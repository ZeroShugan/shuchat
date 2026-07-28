import { describe, expect, it } from 'vitest';
import { cleanFormattedBody, cleanTextBody, cleanUrl, wouldClean } from './clearUrls';

// Codifies the manual verification run from the 2026-07-27 round — these are
// the exact behaviours the feature was accepted on. clearUrls is currently
// UNWIRED (kept for later re-enable); these tests keep it healthy until then.

describe('cleanUrl', () => {
  it('strips global tracking params', () => {
    expect(cleanUrl('https://a.com/p?utm_source=x&utm_medium=y&id=5')).toBe('https://a.com/p?id=5');
    expect(cleanUrl('https://shop.example/item?fbclid=abc123')).toBe('https://shop.example/item');
    expect(cleanUrl('https://a.com/?gclid=1&mc_cid=2&igshid=3')).toBe('https://a.com/');
  });

  it('strips host-scoped params only on their hosts', () => {
    expect(cleanUrl('https://youtu.be/dQw4w9WgXcQ?si=SHARETOKEN')).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(cleanUrl('https://open.spotify.com/track/x?si=token')).toBe('https://open.spotify.com/track/x');
    expect(cleanUrl('https://x.com/user/status/1?s=20&t=abc')).toBe('https://x.com/user/status/1');
    // `si` is legitimate elsewhere — must SURVIVE on unknown hosts
    expect(cleanUrl('https://a.com/?si=keep-me')).toBe('https://a.com/?si=keep-me');
  });

  it('drops a now-empty query string entirely', () => {
    expect(cleanUrl('https://a.com/page?utm_source=x')).toBe('https://a.com/page');
  });

  it('preserves fragments and non-tracking params', () => {
    expect(cleanUrl('https://a.com/p?utm_source=x&q=1#frag')).toBe('https://a.com/p?q=1#frag');
  });

  it('returns non-http and malformed input unchanged', () => {
    expect(cleanUrl('mailto:a@b.c?utm_source=x')).toBe('mailto:a@b.c?utm_source=x');
    expect(cleanUrl('not a url')).toBe('not a url');
  });
});

describe('cleanTextBody', () => {
  it('cleans URLs inside sentences, keeping punctuation', () => {
    expect(cleanTextBody('see https://a.com/?utm_source=x.')).toBe('see https://a.com/.');
  });

  it('leaves code fences and inline code verbatim', () => {
    const fenced = '```\nhttps://a.com/?utm_source=x\n```';
    expect(cleanTextBody(fenced)).toBe(fenced);
    const inline = 'run `curl https://a.com/?utm_source=x` now';
    expect(cleanTextBody(inline)).toBe(inline);
  });

  it('cleans multiple URLs in one message', () => {
    const out = cleanTextBody('https://a.com/?fbclid=1 and https://b.com/?gclid=2');
    expect(out).toBe('https://a.com/ and https://b.com/');
  });
});

describe('cleanFormattedBody', () => {
  it('cleans href targets and visible link text', () => {
    const html = '<a href="https://a.com/?utm_source=x">https://a.com/?utm_source=x</a>';
    expect(cleanFormattedBody(html)).toBe('<a href="https://a.com/">https://a.com/</a>');
  });

  it('skips pre/code blocks', () => {
    const html = '<pre><code>https://a.com/?utm_source=x</code></pre>';
    expect(cleanFormattedBody(html)).toBe(html);
  });
});

describe('wouldClean', () => {
  it('detects cleanable and clean bodies', () => {
    expect(wouldClean('https://a.com/?utm_source=x')).toBe(true);
    expect(wouldClean('https://a.com/?id=5')).toBe(false);
  });
});
