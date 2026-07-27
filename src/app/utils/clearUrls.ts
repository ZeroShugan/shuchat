/**
 * ClearURLs — strip tracking parameters from links you send.
 *
 * Inspired by the ClearURLs browser extension and Vencord's plugin of the same
 * name, but deliberately much smaller: a curated list of parameters that are
 * *only* ever used for tracking. We do not ship the full ClearURLs ruleset
 * because a wrong rule silently breaks somebody's link, and a broken link is
 * worse than a tracked one.
 *
 * Scope: only applies to messages YOU send, and only when the setting is on
 * (it is OFF by default). Received messages are never modified.
 */

/** Parameters stripped from every host. Each is tracking-only — none carry
 *  content addressing on any site we know of. */
const GLOBAL_TRACKING_PARAMS: string[] = [
  // Google Analytics / UTM family
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_name', 'utm_cid', 'utm_reader', 'utm_viz_id', 'utm_pubreferrer',
  'utm_swu', 'utm_id', 'utm_social', 'utm_social-type', 'utm_brand',
  '_ga', '_gl', 'ga_source', 'ga_medium', 'ga_campaign',
  // Ad-click identifiers
  'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',   // Google
  'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_ref', 'fb_source', // Meta
  'msclkid',                                          // Microsoft
  'twclid',                                           // Twitter/X
  'yclid',                                            // Yandex
  'ttclid', 'ttc',                                    // TikTok
  'igshid', 'igsh',                                   // Instagram
  'epik',                                             // Pinterest
  'irclickid',                                        // Impact
  'vero_conv', 'vero_id',
  // Email marketing
  'mc_cid', 'mc_eid',                                 // Mailchimp
  'mkt_tok',                                          // Marketo
  '_hsenc', '_hsmi', 'hsCtaTracking',                 // HubSpot
  'oly_anon_id', 'oly_enc_id',
  // Misc analytics
  'icid', 'wickedid', 'otc', 'cmpid', 'os_ehash',
  'ref_src', 'ref_url',
];

/**
 * Host-specific parameters. Kept separate because these names are ambiguous —
 * `si`, `s`, `t`, `ref` and `tag` are all legitimate query keys somewhere on the
 * web, so they must only be removed on hosts where they are known to be tracking.
 */
const HOST_TRACKING_PARAMS: { match: RegExp; params: string[] }[] = [
  // `si` is the share-attribution token; `feature` marks where the click came from.
  { match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/, params: ['si', 'feature', 'kw'] },
  { match: /(^|\.)twitter\.com$|(^|\.)x\.com$/, params: ['s', 't'] },
  { match: /(^|\.)spotify\.com$/, params: ['si', 'nd', 'context'] },
  { match: /(^|\.)instagram\.com$/, params: ['igshid', 'igsh', 'img_index'] },
  { match: /(^|\.)tiktok\.com$/, params: ['is_from_webapp', 'sender_device', 'sender_web_id', '_r', '_t'] },
  { match: /(^|\.)reddit\.com$|(^|\.)redd\.it$/, params: ['share_id', 'correlation_id', 'ref_source', 'ref_campaign', 'rdt'] },
  { match: /(^|\.)amazon\.[a-z.]+$/, params: [
    'pd_rd_i', 'pd_rd_r', 'pd_rd_w', 'pd_rd_wg', 'pf_rd_i', 'pf_rd_m', 'pf_rd_p',
    'pf_rd_r', 'pf_rd_s', 'pf_rd_t', 'psc', 'ref', 'ref_', '_encoding', 'smid',
    'th', 'linkCode', 'creativeASIN', 'tag',
  ] },
  { match: /(^|\.)aliexpress\.[a-z.]+$/, params: ['spm', 'scm', 'scm_id', 'pvid', 'algo_pvid', 'algo_expid', 'btsid', 'ws_ab_test'] },
  { match: /(^|\.)ebay\.[a-z.]+$/, params: ['_trkparms', '_trksid', 'hash'] },
  { match: /(^|\.)bilibili\.com$/, params: ['vd_source', 'spm_id_from', 'from_source'] },
  { match: /(^|\.)steampowered\.com$|(^|\.)steamcommunity\.com$/, params: ['snr', 'curator_clanid'] },
  { match: /(^|\.)twitch\.tv$/, params: ['tt_content', 'tt_medium'] },
];

/** Clean a single URL string. Returns the input unchanged if it is not an
 *  http(s) URL, or if anything at all goes wrong — never throw into a send. */
export function cleanUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw;
    if (!url.search) return raw;

    const host = url.hostname.toLowerCase();
    const hostParams = HOST_TRACKING_PARAMS
      .filter((rule) => rule.match.test(host))
      .flatMap((rule) => rule.params);
    const strip = new Set([...GLOBAL_TRACKING_PARAMS, ...hostParams].map((p) => p.toLowerCase()));

    let removed = false;
    // Collect first — deleting while iterating URLSearchParams is unreliable.
    const doomed: string[] = [];
    url.searchParams.forEach((_value, key) => {
      if (strip.has(key.toLowerCase())) doomed.push(key);
    });
    doomed.forEach((key) => {
      url.searchParams.delete(key);
      removed = true;
    });
    if (!removed) return raw;

    // Rebuild, dropping a now-empty '?' so we don't leave "example.com/?" behind.
    let out = url.toString();
    if (!url.searchParams.toString()) out = out.replace(/\?(?=#|$)/, '');
    return out;
  } catch {
    return raw;
  }
}

// Matches bare http(s) URLs. Trailing punctuation is excluded so "see http://x.com/?a=1."
// does not swallow the sentence's full stop.
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

/** Trailing characters that are almost certainly sentence punctuation, not URL. */
const TRAILING_JUNK = /[.,;:!?)\]}>'"]+$/;

function cleanUrlToken(token: string): string {
  const m = TRAILING_JUNK.exec(token);
  const tail = m ? m[0] : '';
  const core = tail ? token.slice(0, -tail.length) : token;
  return cleanUrl(core) + tail;
}

/**
 * Clean every URL in a plain-text message body.
 *
 * Content inside code fences (```) and inline code (`) is left alone — a URL in
 * a code sample is usually being quoted verbatim, and silently editing someone's
 * example would be worse than leaving a tracker in it.
 */
export function cleanTextBody(body: string): string {
  if (!body) return body;
  try {
    // Split on fenced blocks and inline code, keeping the delimiters, then only
    // rewrite the segments that are not code.
    const parts = body.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
    return parts
      .map((part) => {
        if (part.startsWith('```') || (part.startsWith('`') && part.endsWith('`') && part.length > 1)) {
          return part; // code — leave verbatim
        }
        return part.replace(URL_RE, (t) => cleanUrlToken(t));
      })
      .join('');
  } catch {
    return body;
  }
}

/**
 * Clean URLs in an HTML formatted_body: both the href targets and any visible
 * link text (Cinny renders a bare link with the URL as its own label, so the
 * text must be cleaned too or the message would show a dirty URL pointing at a
 * clean one). <code>/<pre> spans are skipped, same reasoning as above.
 */
export function cleanFormattedBody(html: string): string {
  if (!html) return html;
  try {
    const parts = html.split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/gi);
    return parts
      .map((part) => {
        if (/^<pre/i.test(part) || /^<code/i.test(part)) return part;
        return part
          // href="..." / href='...'
          .replace(/(href=")([^"]+)(")/gi, (_m, a, url, b) => a + cleanUrl(url) + b)
          .replace(/(href=')([^']+)(')/gi, (_m, a, url, b) => a + cleanUrl(url) + b)
          // bare URLs appearing as text between tags
          .replace(/(>)([^<]*)(?=<)/g, (_m, gt, text) => gt + text.replace(URL_RE, (t) => cleanUrlToken(t)));
      })
      .join('');
  } catch {
    return html;
  }
}

/** True if cleaning would change anything — useful for tests/telemetry. */
export function wouldClean(body: string): boolean {
  return cleanTextBody(body) !== body;
}
