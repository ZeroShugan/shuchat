import React, {
  ChangeEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, Icon, Icons, Input, Scroll, Spinner, Text, config, toRem } from 'folds';
import { isKeyHotkey } from 'is-hotkey';
import { editableActiveElement } from '../../utils/dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useDebounce } from '../../hooks/useDebounce';
import { mobileOrTablet } from '../../utils/user-agent';

const GIPHY_KEY = 'kt1VsIL6e804ZVnPf49UkmsF8DKk5GIp';
const FAV_KEY = 'shuchat_gif_favourites';
const ACCOUNT_DATA_TYPE = 'im.shuchat.gif_favourites';

// ── Types ─────────────────────────────────────────────────────────────────────
type GImg = { url: string; width: string; height: string };
export type GiphyGif = {
  id: string;
  title: string;
  images: { fixed_height_small: GImg; fixed_height: GImg; original: GImg };
};
export type FavGif = {
  id: string; title: string; previewUrl: string; sendUrl: string; w: number; h: number;
};
type GiphyCategory = {
  name: string;
  name_encoded: string;
  gif?: GiphyGif;
};

// ── API ───────────────────────────────────────────────────────────────────────
const cache = new Map<string, GiphyGif[]>();
const catCache: { data: GiphyCategory[] | null } = { data: null };

async function giphyFetch(path: string, params: Record<string, string>): Promise<GiphyGif[]> {
  const key = path + JSON.stringify(params);
  if (cache.has(key)) return cache.get(key)!;
  const url = new URL(`https://api.giphy.com/v1/gifs/${path}`);
  url.searchParams.set('api_key', GIPHY_KEY);
  url.searchParams.set('limit', '24');
  url.searchParams.set('rating', 'pg-13');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Giphy ${res.status}`);
  const json = await res.json();
  cache.set(key, json.data);
  return json.data as GiphyGif[];
}

async function fetchCategories(): Promise<GiphyCategory[]> {
  if (catCache.data) return catCache.data;
  const url = `https://api.giphy.com/v1/gifs/categories?api_key=${GIPHY_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  catCache.data = json.data ?? [];
  return catCache.data!;
}

// ── Favourites persistence ────────────────────────────────────────────────────
function loadFavs(): FavGif[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
  catch { return []; }
}
function saveFavs(favs: FavGif[]) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

// ── Server GIF library save (fire-and-forget) ─────────────────────────────────
function saveGifToLibrary(gif: GiphyGif) {
  const payload = {
    id: gif.id,
    title: gif.title,
    previewUrl: gif.images.fixed_height_small.url,
    sendUrl: gif.images.original.url,
    w: parseInt(gif.images.original.width, 10) || 480,
    h: parseInt(gif.images.original.height, 10) || 270,
    source: 'giphy',
    addedAt: new Date().toISOString(),
  };
  fetch('/api/save-gif', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => { /* silent */ });
}

// ── GifItem ───────────────────────────────────────────────────────────────────
type GifItemProps = {
  previewUrl: string; title: string; isFav: boolean;
  onSelect: () => void; onToggleFav: () => void;
};
function GifItem({ previewUrl, title, isFav, onSelect, onToggleFav }: GifItemProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ position: 'relative', cursor: 'pointer', borderRadius: '8px',
        overflow: 'hidden', width: '100%', marginBottom: '6px', lineHeight: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      title={title}
    >
      <img src={previewUrl} alt={title}
        style={{ width: '100%', height: 'auto', display: 'block' }} loading="lazy" />
      {hovered && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
          style={{
            position: 'absolute', top: '4px', right: '4px',
            background: isFav ? '#f0a500' : 'rgba(0,0,0,0.55)',
            border: 'none', borderRadius: '50%', width: '26px', height: '26px',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 0,
          }}
          title={isFav ? 'Remove favourite' : 'Add to favourites'}
        >
          <Icon src={Icons.Star} size="50" filled={isFav} style={{ color: '#fff' }} />
        </button>
      )}
    </div>
  );
}

// ── Masonry 2-column grid ─────────────────────────────────────────────────────
type MasonryProps = {
  gifs: GiphyGif[]; favIds: Set<string>;
  onSelect: (g: GiphyGif) => void; onToggleFav: (g: GiphyGif) => void;
};
function MasonryGrid({ gifs, favIds, onSelect, onToggleFav }: MasonryProps) {
  const c1: GiphyGif[] = []; const c2: GiphyGif[] = [];
  gifs.forEach((g, i) => (i % 2 === 0 ? c1 : c2).push(g));
  const col = (list: GiphyGif[]) => (
    <div style={{ flex: 1 }}>
      {list.map((g) => (
        <GifItem key={g.id} previewUrl={g.images.fixed_height_small.url} title={g.title}
          isFav={favIds.has(g.id)} onSelect={() => onSelect(g)} onToggleFav={() => onToggleFav(g)} />
      ))}
    </div>
  );
  return <div style={{ display: 'flex', gap: '6px', padding: '0 8px' }}>{col(c1)}{col(c2)}</div>;
}

// ── Category tile ─────────────────────────────────────────────────────────────
type TileProps = { label: string; bgUrl?: string; tint?: string; onClick: () => void };
function CategoryTile({ label, bgUrl, tint, onClick }: TileProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', cursor: 'pointer', borderRadius: '10px',
        overflow: 'hidden', aspectRatio: '16 / 9',
        background: tint ?? '#1a1a2e',
        border: hovered ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
        transition: 'border-color 0.15s',
      }}
    >
      {bgUrl && (
        <img src={bgUrl} alt={label}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
        />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.72) 100%)',
        display: 'flex', alignItems: 'flex-end', padding: '6px 8px',
      }}>
        <Text size="T300" style={{ color: '#fff', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          {label}
        </Text>
      </div>
    </div>
  );
}

// ── Home view ─────────────────────────────────────────────────────────────────
type HomeViewProps = {
  favs: FavGif[];
  trendingPreview: string | undefined;
  categories: GiphyCategory[];
  catsLoading: boolean;
  onSelect: (target: 'trending' | 'favourites' | string) => void;
};
function HomeView({ favs, trendingPreview, categories, catsLoading, onSelect }: HomeViewProps) {
  const tiles: Array<{ label: string; bgUrl?: string; tint?: string; target: string }> = [];

  // Favourites tile — always shown; bgUrl set when favourites exist
  tiles.push({
    label: '⭐ Favourites',
    bgUrl: favs.length > 0 ? favs[favs.length - 1].previewUrl : undefined,
    tint: '#2a1a00',
    target: 'favourites',
  });
  tiles.push({ label: '🔥 Trending', bgUrl: trendingPreview, tint: '#1a1230', target: 'trending' });

  categories.forEach((cat) => {
    tiles.push({
      label: cat.name,
      bgUrl: cat.gif?.images?.fixed_height_small?.url,
      target: cat.name_encoded,
    });
  });

  const c1 = tiles.filter((_, i) => i % 2 === 0);
  const c2 = tiles.filter((_, i) => i % 2 !== 0);

  const renderCol = (list: typeof tiles) => (
    <div style={{ flex: 1 }}>
      {list.map((t) => (
        <div key={t.target} style={{ marginBottom: '6px' }}>
          <CategoryTile label={t.label} bgUrl={t.bgUrl} tint={t.tint} onClick={() => onSelect(t.target)} />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {catsLoading ? (
        <Box justifyContent="Center" alignItems="Center" style={{ padding: '32px' }}>
          <Spinner variant="Secondary" size="600" />
        </Box>
      ) : (
        <div style={{ display: 'flex', gap: '6px', padding: '0 8px' }}>
          {renderCol(c1)}{renderCol(c2)}
        </div>
      )}
    </div>
  );
}

// ── GifContent: main stateful content (no FocusTrap) ─────────────────────────
export type GifContentProps = {
  requestClose: () => void;
  returnFocusOnDeactivate?: boolean;
  onGifSelect: (url: string, title: string, w: number, h: number) => void;
  header?: React.ReactNode;
  /** When provided by EmojiBoard, search is controlled externally */
  searchQuery?: string;
};

export function GifContent({ requestClose, onGifSelect, header, searchQuery: externalQuery }: GifContentProps) {
  const mx = useMatrixClient();
  const [view, setView] = useState<'home' | 'browse' | 'search'>('home');
  const [browseTitle, setBrowseTitle] = useState('');
  const [browseTarget, setBrowseTarget] = useState<'trending' | 'favourites' | string>('');
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [trendingFirst, setTrendingFirst] = useState<string | undefined>();
  const [categories, setCategories] = useState<GiphyCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<FavGif[]>(loadFavs);

  // On mount: load from Matrix account data (persists across devices + cache clears)
  // Falls back to localStorage data already loaded above
  useEffect(() => {
    try {
      const event = mx.getAccountData(ACCOUNT_DATA_TYPE);
      if (event) {
        const content = event.getContent() as { favourites?: FavGif[] };
        if (Array.isArray(content.favourites)) {
          setFavourites(content.favourites);
          saveFavs(content.favourites); // keep localStorage in sync
        }
      }
    } catch {
      // silently use localStorage fallback already loaded
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const favIds = useMemo(() => new Set(favourites.map((f) => f.id)), [favourites]);
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = externalQuery !== undefined;

  // When search is controlled externally, sync to internal doSearch
  useEffect(() => {
    if (isControlled) doSearch(externalQuery ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuery]);

  // Preload categories + first trending GIF on mount
  useEffect(() => {
    // Fetch first trending GIF for the tile preview
    giphyFetch('trending', {})
      .then((gs) => { if (gs[0]) setTrendingFirst(gs[0].images.fixed_height_small.url); })
      .catch(() => {});
    // Fetch categories
    fetchCategories()
      .then(setCategories)
      .catch(() => {})
      .finally(() => setCatsLoading(false));
  }, []);

  // Navigate to a browse target (trending / favourites / category)
  const handleSelectTile = useCallback((target: 'trending' | 'favourites' | string) => {
    setBrowseTarget(target);
    if (target === 'favourites') {
      setBrowseTitle('⭐ Favourites');
      setView('browse');
      return;
    }
    const label = target === 'trending'
      ? '🔥 Trending'
      : categories.find((c) => c.name_encoded === target)?.name ?? target;
    setBrowseTitle(label);
    setView('browse');
    setLoading(true);
    setFetchError(null);
    const p = target === 'trending'
      ? giphyFetch('trending', {})
      : giphyFetch('search', { q: target });
    p.then(setGifs)
      .catch((e: Error) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, [categories]);

  // Search
  const doSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setView('home'); return; }
    setView('search');
    setLoading(true);
    setFetchError(null);
    giphyFetch('search', { q: trimmed })
      .then(setGifs)
      .catch((e: Error) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleChange: ChangeEventHandler<HTMLInputElement> = useDebounce(
    useCallback((evt: React.ChangeEvent<HTMLInputElement>) => doSearch(evt.target.value), [doSearch]),
    { wait: 400 }
  );

  const handleBack = useCallback(() => {
    setView('home');
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleSelect = useCallback((gif: GiphyGif) => {
    const o = gif.images.original;
    onGifSelect(o.url, gif.title || 'GIF', parseInt(o.width, 10) || 480, parseInt(o.height, 10) || 270);
    requestClose();
  }, [onGifSelect, requestClose]);

  const handleToggleFav = useCallback((gif: GiphyGif) => {
    setFavourites((prev) => {
      const exists = prev.some((f) => f.id === gif.id);
      let next: FavGif[];
      if (exists) {
        next = prev.filter((f) => f.id !== gif.id);
      } else {
        const s = gif.images.fixed_height_small; const o = gif.images.original;
        next = [...prev, {
          id: gif.id, title: gif.title, previewUrl: s.url, sendUrl: o.url,
          w: parseInt(o.width, 10) || 480, h: parseInt(o.height, 10) || 270,
        }];
        saveGifToLibrary(gif);
      }
      saveFavs(next);
      // Persist to Matrix account data so favourites survive cache clears and sync across devices
      mx.setAccountData(ACCOUNT_DATA_TYPE, { favourites: next }).catch(() => {});
      return next;
    });
  }, []);

  // Browse favourites gifs (convert FavGif → GiphyGif-like for MasonryGrid)
  const browseGifs = view === 'browse' && browseTarget === 'favourites'
    ? favourites.map((f): GiphyGif => ({
        id: f.id, title: f.title,
        images: {
          fixed_height_small: { url: f.previewUrl, width: '200', height: '100' },
          fixed_height: { url: f.previewUrl, width: '200', height: '200' },
          original: { url: f.sendUrl, width: String(f.w), height: String(f.h) },
        },
      }))
    : gifs;

  return (
    <Box direction="Column" style={{ height: '100%' }}>
      {/* Optional external header (tab bar lives there) */}
      {header}

      {/* Search bar — only rendered when used standalone (not controlled by EmojiBoard) */}
      {!isControlled && (
        <Box shrink="No" style={{ padding: '8px 12px 4px' }}>
          <Input
            ref={inputRef}
            variant="SurfaceVariant"
            size="400"
            placeholder="Search GIFs..."
            maxLength={100}
            after={<Icon src={Icons.Search} size="50" />}
            onChange={handleChange}
            autoFocus={!mobileOrTablet()}
          />
        </Box>
      )}

      {/* Browse header (back + title) */}
      {view === 'browse' && (
        <Box shrink="No" alignItems="Center" gap="200"
          style={{ padding: '4px 8px', cursor: 'pointer' }} onClick={handleBack}>
          <Icon src={Icons.ArrowLeft} size="200" />
          <Text size="T300" style={{ fontWeight: 600 }}>{browseTitle}</Text>
        </Box>
      )}

      {/* Content */}
      <Scroll size="400" hideTrack style={{ flex: 1, minHeight: 0 }}>
        <div style={{ paddingBottom: '12px', paddingTop: '4px' }}>
          {view === 'home' && (
            <HomeView
              favs={favourites}
              trendingPreview={trendingFirst}
              categories={categories}
              catsLoading={catsLoading}
              onSelect={handleSelectTile}
            />
          )}
          {(view === 'browse' || view === 'search') && (
            loading ? (
              <Box justifyContent="Center" alignItems="Center" style={{ padding: '40px' }}>
                <Spinner variant="Secondary" size="600" />
              </Box>
            ) : fetchError ? (
              <Box justifyContent="Center" alignItems="Center" style={{ padding: '24px' }}>
                <Text size="T300" style={{ opacity: 0.6 }}>{fetchError}</Text>
              </Box>
            ) : browseGifs.length === 0 ? (
              <Box justifyContent="Center" alignItems="Center" style={{ padding: '24px', flexDirection: 'column', gap: '8px' }}>
                <Text size="T400" style={{ opacity: 0.7 }}>⭐</Text>
                <Text size="T300" style={{ opacity: 0.6, textAlign: 'center' }}>
                  {browseTarget === 'favourites'
                    ? 'No favourites yet — hover a GIF and click the ★ to save it'
                    : 'No GIFs found'}
                </Text>
              </Box>
            ) : (
              <MasonryGrid gifs={browseGifs} favIds={favIds}
                onSelect={handleSelect} onToggleFav={handleToggleFav} />
            )
          )}
        </div>
        <Box justifyContent="Center">
          <Text size="T200" style={{ opacity: 0.35, paddingBottom: '6px' }}>Powered by GIPHY</Text>
        </Box>
      </Scroll>
    </Box>
  );
}

// ── Standalone GifBoard (wraps GifContent with FocusTrap + outer box) ─────────
export type GifBoardProps = {
  requestClose: () => void;
  returnFocusOnDeactivate?: boolean;
  onGifSelect: (url: string, title: string, w: number, h: number) => void;
};
