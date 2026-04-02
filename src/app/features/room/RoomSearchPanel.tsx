import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Box, Text, Icon, Icons, IconButton, Spinner, Chip, Line, config, color } from 'folds';
import { useInfiniteQuery } from '@tanstack/react-query';
import { IEventWithRoomId, IResultContext, SearchOrderBy } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useMessageSearch } from '../message-search/useMessageSearch';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { getMemberDisplayName, getMemberAvatarMxc } from '../../utils/room';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useStateEvent } from '../../hooks/useStateEvent';
import { StateEvent } from '../../../types/matrix/room';
import { useRoom } from '../../hooks/useRoom';

// ─── helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, highlights: string[]): React.ReactNode {
  if (!highlights.length || !text) return text;
  const pattern = highlights.map(escapeRegex).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} style={{ background: '#f0a500', color: '#000', borderRadius: '2px', padding: '0 2px' }}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function getMessageText(event: IEventWithRoomId): string {
  const c = (event.content?.['m.new_content'] ?? event.content) as Record<string, unknown>;
  return typeof c?.body === 'string' ? c.body : '';
}

// ─── query parser ─────────────────────────────────────────────────────────────

type ParsedQuery = {
  term: string;
  fromFilters: string[];
  hasFilters: string[];
  mentionsFilters: string[];
};

function parseQuery(raw: string): ParsedQuery {
  const fromFilters = [...raw.matchAll(/\bfrom:(\S+)/gi)].map((m) => m[1]);
  const hasFilters = [...raw.matchAll(/\bhas:(\S+)/gi)].map((m) => m[1]);
  const mentionsFilters = [...raw.matchAll(/\bmentions:(\S+)/gi)].map((m) => m[1]);
  const term = raw
    .replace(/\bfrom:\S+/gi, '')
    .replace(/\bhas:\S+/gi, '')
    .replace(/\bmentions:\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { term, fromFilters, hasFilters, mentionsFilters };
}

// ─── active filter detection ──────────────────────────────────────────────────

type ActiveFilter =
  | { kind: 'from' | 'has' | 'mentions'; partial: string }
  | { kind: null; partial: '' };

function detectActiveFilter(val: string): ActiveFilter {
  const fromM = val.match(/\bfrom:(\S*)$/i);
  if (fromM) return { kind: 'from', partial: fromM[1] };
  const hasM = val.match(/\bhas:(\S*)$/i);
  if (hasM) return { kind: 'has', partial: hasM[1] };
  const mentM = val.match(/\bmentions:(\S*)$/i);
  if (mentM) return { kind: 'mentions', partial: mentM[1] };
  return { kind: null, partial: '' };
}

// ─── token chip helpers ───────────────────────────────────────────────────────

type FilterToken = { type: 'from' | 'has' | 'mentions'; value: string };

function getFilterTokens(raw: string): FilterToken[] {
  const tokens: FilterToken[] = [];
  [...raw.matchAll(/\bfrom:(\S+)/gi)].forEach((m) => tokens.push({ type: 'from', value: m[1] }));
  [...raw.matchAll(/\bhas:(\S+)/gi)].forEach((m) => tokens.push({ type: 'has', value: m[1] }));
  [...raw.matchAll(/\bmentions:(\S+)/gi)].forEach((m) =>
    tokens.push({ type: 'mentions', value: m[1] })
  );
  return tokens;
}

function removeFilterFromInput(raw: string, type: string, value: string): string {
  return raw
    .replace(new RegExp(`\\b${escapeRegex(type)}:${escapeRegex(value)}`, 'gi'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

const TOKEN_STYLE: Record<string, { bg: string; border: string; label: string }> = {
  from:     { bg: 'rgba(60,120,240,0.18)',  border: 'rgba(60,120,240,0.5)',  label: 'from' },
  has:      { bg: 'rgba(210,120,20,0.18)',  border: 'rgba(210,120,20,0.5)',  label: 'has' },
  mentions: { bg: 'rgba(140,60,220,0.18)',  border: 'rgba(140,60,220,0.5)',  label: 'mentions' },
};

function TokenChipStrip({ inputVal, onChange }: { inputVal: string; onChange: (v: string) => void }) {
  const tokens = useMemo(() => getFilterTokens(inputVal), [inputVal]);
  if (tokens.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '4px 2px 6px' }}>
      {tokens.map((tok, i) => {
        const s = TOKEN_STYLE[tok.type];
        return (
          <div
            key={`${tok.type}-${tok.value}-${i}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 6px 2px 8px', borderRadius: '12px',
              background: s.bg, border: `1px solid ${s.border}`,
              fontSize: '12px', lineHeight: 1.4, userSelect: 'none' as const,
            }}
          >
            <span style={{ opacity: 0.7, fontSize: '11px', fontWeight: 700 }}>{s.label}:</span>
            <span style={{ fontWeight: 600 }}>{tok.value}</span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(removeFilterFromInput(inputVal, tok.type, tok.value));
              }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'inherit',
                padding: '0 0 0 2px', fontSize: '13px', lineHeight: 1, opacity: 0.6,
                display: 'flex', alignItems: 'center',
              }}
              title={`Remove ${tok.type}:${tok.value}`}
            >
              \u00d7
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── client-side search (encrypted) ──────────────────────────────────────────

type ClientResultItem = { rank: number; event: IEventWithRoomId; context: IResultContext };

function runClientSearch(
  room: ReturnType<typeof useRoom>,
  parsed: ParsedQuery,
  sortOrder: string
): ClientResultItem[] {
  const { term, fromFilters, hasFilters, mentionsFilters } = parsed;
  if (!term && !fromFilters.length && !hasFilters.length && !mentionsFilters.length) return [];
  const lowerTerm = term.toLowerCase();
  const events = room.getLiveTimeline().getEvents();
  const matches = events.filter((ev) => {
    if (ev.isRedacted() || ev.getType() !== 'm.room.message') return false;
    const content = ev.getContent();
    const body = (content.body ?? '') as string;
    if (lowerTerm && !body.toLowerCase().includes(lowerTerm)) return false;
    if (fromFilters.length > 0) {
      const sender = ev.getSender() ?? '';
      const member = room.getMember(sender);
      const displayName = (member?.name ?? sender).toLowerCase();
      if (!fromFilters.every((f) =>
        sender.toLowerCase().includes(f.toLowerCase()) || displayName.includes(f.toLowerCase())
      )) return false;
    }
    if (mentionsFilters.length > 0 &&
      !mentionsFilters.every((f) => body.toLowerCase().includes(f.toLowerCase()))) return false;
    if (hasFilters.length > 0) {
      const msgtype = (content.msgtype ?? '') as string;
      for (const h of hasFilters) {
        const lh = h.toLowerCase();
        if (lh === 'image' && msgtype !== 'm.image') return false;
        if (lh === 'file'  && msgtype !== 'm.file')  return false;
        if (lh === 'video' && msgtype !== 'm.video') return false;
        if (lh === 'audio' && msgtype !== 'm.audio') return false;
        if (lh === 'link'  && !/https?:\/\/\S+/.test(body)) return false;
        if ((lh === 'embed' || lh === 'media') &&
          !['m.image', 'm.video', 'm.audio', 'm.file'].includes(msgtype)) return false;
      }
    }
    return true;
  });
  const sorted = sortOrder === 'oldest' ? [...matches] : [...matches].reverse();
  return sorted.map((ev, i) => ({
    rank: i,
    event: {
      event_id: ev.getId() ?? '',
      room_id: room.roomId,
      sender: ev.getSender() ?? '',
      type: ev.getType(),
      origin_server_ts: ev.getTs(),
      content: ev.getContent(),
      unsigned: ev.getUnsigned() as Record<string, unknown>,
    } as unknown as IEventWithRoomId,
    context: { events_before: [], events_after: [], profile_info: {} } as IResultContext,
  }));
}

// ─── context-aware filter panel ───────────────────────────────────────────────

const HAS_OPTIONS = [
  { value: 'link',  hint: 'Messages with URLs' },
  { value: 'image', hint: 'Image attachments' },
  { value: 'file',  hint: 'File attachments' },
  { value: 'video', hint: 'Video attachments' },
  { value: 'audio', hint: 'Audio attachments' },
] as const;

const GENERIC_FILTER_OPTIONS = [
  { icon: Icons.User,       label: 'From a specific user',             hint: 'from: username',               prefix: 'from:' },
  { icon: Icons.Attachment, label: 'Includes a specific type of data', hint: 'has: link \u00b7 image \u00b7 file', prefix: 'has:' },
  { icon: Icons.Mention,    label: 'Mentions a specific user',          hint: 'mentions: username',           prefix: 'mentions:' },
] as const;

type FilterPanelProps = {
  activeFilter: ActiveFilter;
  room: ReturnType<typeof useRoom>;
  mx: ReturnType<typeof useMatrixClient>;
  useAuthentication: boolean;
  onSelect: (val: string) => void;
};

function FilterPanel({ activeFilter, room, mx, useAuthentication, onSelect }: FilterPanelProps) {
  const { kind, partial } = activeFilter;
  const lowerPartial = partial.toLowerCase();

  const panelBase: React.CSSProperties = {
    background: color.SurfaceVariant.Container,
    borderTop: `1px solid ${color.SurfaceVariant.ContainerLine}`,
    borderBottom: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  };

  const sectionLabel = (label: string) => (
    <div style={{ padding: '6px 12px 2px', fontSize: '10px', fontWeight: 700, opacity: 0.55, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
      {label}
    </div>
  );

  const rowBtn = (key: string, content: React.ReactNode, onClick: () => void) => (
    <button
      key={key} type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', textAlign: 'left' as const }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = color.SurfaceVariant.ContainerHover; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
    >
      {content}
    </button>
  );

  // ── from / mentions → member list ─────────────────────────────────────────
  if (kind === 'from' || kind === 'mentions') {
    const allMembers = room.getMembers();
    const filtered = allMembers
      .filter((m) =>
        !partial ||
        m.userId.toLowerCase().includes(lowerPartial) ||
        (m.name ?? '').toLowerCase().includes(lowerPartial)
      )
      .slice(0, 8);

    return (
      <div style={panelBase}>
        {sectionLabel(kind === 'from' ? 'From \u2014 select a user' : 'Mentions \u2014 select a user')}
        {filtered.length === 0 ? (
          <div style={{ padding: '8px 12px', opacity: 0.5, fontSize: '13px' }}>
            No members match &ldquo;{partial}&rdquo;
          </div>
        ) : (
          filtered.map((member) => {
            const avatarMxc = getMemberAvatarMxc(room, member.userId);
            const avatarUrl = avatarMxc
              ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 28, 28, 'crop') ?? undefined
              : undefined;
            const displayName =
              getMemberDisplayName(room, member.userId) ??
              getMxIdLocalPart(member.userId) ??
              member.userId;
            const localPart = getMxIdLocalPart(member.userId) ?? member.userId;

            return rowBtn(member.userId, (
              <>
                <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(128,128,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : displayName.charAt(0).toUpperCase()
                  }
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                  <div style={{ fontSize: '11px', opacity: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.userId}</div>
                </div>
              </>
            ), () => onSelect(localPart));
          })
        )}
      </div>
    );
  }

  // ── has → media type list ──────────────────────────────────────────────────
  if (kind === 'has') {
    const EMOJI: Record<string, string> = { link: '\U0001f517', image: '\U0001f5bc', file: '\U0001f4ce', video: '\U0001f3ac', audio: '\U0001f3b5' };
    const filtered = HAS_OPTIONS.filter((o) => !partial || o.value.startsWith(lowerPartial));
    return (
      <div style={panelBase}>
        {sectionLabel('Has \u2014 select a type')}
        {filtered.length === 0 ? (
          <div style={{ padding: '8px 12px', opacity: 0.5, fontSize: '13px' }}>No type matches &ldquo;{partial}&rdquo;</div>
        ) : (
          filtered.map((opt) =>
            rowBtn(opt.value, (
              <>
                <div style={{ width: 28, height: 28, borderRadius: '6px', background: 'rgba(210,120,20,0.2)', border: '1px solid rgba(210,120,20,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '14px' }}>
                  {EMOJI[opt.value] ?? '\U0001f4c4'}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{opt.value}</div>
                  <div style={{ fontSize: '11px', opacity: 0.5 }}>{opt.hint}</div>
                </div>
              </>
            ), () => onSelect(opt.value))
          )
        )}
      </div>
    );
  }

  // ── default: generic filter types ─────────────────────────────────────────
  return (
    <div style={panelBase}>
      {sectionLabel('Filters \u2014 click to add, combine freely')}
      {GENERIC_FILTER_OPTIONS.map((opt) =>
        rowBtn(opt.prefix, (
          <>
            <Icon src={opt.icon} size="200" style={{ opacity: 0.7, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{opt.label}</div>
              <div style={{ fontSize: '11px', opacity: 0.5 }}>{opt.hint}</div>
            </div>
          </>
        ), () => onSelect(opt.prefix))
      )}
    </div>
  );
}

// ─── result card ──────────────────────────────────────────────────────────────

type CardProps = {
  displayName: string; avatarUrl?: string; ts: number;
  text: string; highlights: string[]; hour24: boolean; onJump: () => void;
};

function SearchResultCard({ displayName, avatarUrl, ts, text, highlights, hour24, onJump }: CardProps) {
  const [hovered, setHovered] = useState(false);

  const timeStr = useMemo(() => {
    const d = new Date(ts), now = new Date(), yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const timeOnly = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !hour24 });
    if (d.toDateString() === now.toDateString()) return `Today at ${timeOnly}`;
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${timeOnly}`;
    return `${d.toLocaleDateString()} ${timeOnly}`;
  }, [ts, hour24]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', padding: '8px 10px', borderRadius: '8px', marginBottom: '4px', background: hovered ? color.Surface.ContainerHover : 'transparent', transition: 'background 0.1s' }}
    >
      {hovered && (
        <button onClick={onJump} style={{ position: 'absolute', top: '6px', right: '8px', background: color.SurfaceVariant.Container, border: `1px solid ${color.SurfaceVariant.ContainerLine}`, borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', color: 'inherit', whiteSpace: 'nowrap', zIndex: 1 }}>
          Jump \u2191
        </button>
      )}
      <Box gap="200" alignItems="Start">
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(128,128,128,0.3)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
          {avatarUrl
            ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : displayName.charAt(0).toUpperCase()
          }
        </div>
        <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
          <Box gap="200" alignItems="Baseline" style={{ flexWrap: 'wrap' }}>
            <Text size="T300" style={{ fontWeight: 'bold', flexShrink: 0 }}>{displayName}</Text>
            <Text size="T200" style={{ opacity: 0.5, fontSize: '11px', flexShrink: 0 }}>{timeStr}</Text>
          </Box>
          <Text size="T300" style={{ wordBreak: 'break-word', opacity: 0.85, marginTop: '2px' }}>
            {highlights.length > 0 ? highlightText(text.slice(0, 300), highlights) : text.slice(0, 300)}
            {text.length > 300 && '\u2026'}
          </Text>
        </Box>
      </Box>
    </div>
  );
}

// ─── main panel ───────────────────────────────────────────────────────────────

type RoomSearchPanelProps = { roomId: string; initialTerm: string; onClose: () => void };

export function RoomSearchPanel({ roomId, initialTerm, onClose }: RoomSearchPanelProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const { navigateRoom } = useRoomNavigate();
  const room = useRoom();

  const [inputVal, setInputVal] = useState(initialTerm);
  const [submittedQuery, setSubmittedQuery] = useState(initialTerm);
  const [order, setOrder] = useState<string>('newest');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [hour24] = useSetting(settingsAtom, 'hour24Clock');
  const encryptionEvent = useStateEvent(room, StateEvent.RoomEncryption);
  const isEncrypted = !!encryptionEvent;

  const parsed = useMemo(() => parseQuery(submittedQuery), [submittedQuery]);
  const activeFilter = useMemo(() => detectActiveFilter(inputVal), [inputVal]);

  const serverOrder = order === 'relevance' ? SearchOrderBy.Rank : SearchOrderBy.Recent;

  const senderIds = useMemo(() => {
    if (!parsed.fromFilters.length || isEncrypted) return undefined;
    const members = room.getMembers();
    const ids = parsed.fromFilters.flatMap((f) => {
      const lower = f.toLowerCase();
      return members
        .filter((m) => m.userId.toLowerCase().includes(lower) || (m.name ?? '').toLowerCase().includes(lower))
        .map((m) => m.userId);
    });
    return ids.length > 0 ? ids : undefined;
  }, [parsed.fromFilters, room, isEncrypted]);

  const searchMessages = useMessageSearch({ term: parsed.term || undefined, order: serverOrder, rooms: [roomId], senders: senderIds });
  const hasServerQuery = !isEncrypted && !!(parsed.term || parsed.fromFilters.length);

  const { status, data, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    enabled: hasServerQuery,
    queryKey: ['room-search-panel', roomId, parsed.term, serverOrder, senderIds],
    queryFn: ({ pageParam }) => searchMessages(pageParam as string),
    initialPageParam: '' as string,
    getNextPageParam: (lastPage) => lastPage.nextToken,
  });

  const serverItems = useMemo(() => data?.pages.flatMap((p) => p.groups.flatMap((g) => g.items)) ?? [], [data]);
  const serverHighlights = useMemo(() => Array.from(new Set(data?.pages.flatMap((p) => p.highlights) ?? [])), [data]);
  const displayedServerItems = useMemo(() => (order === 'oldest' ? [...serverItems].reverse() : serverItems), [serverItems, order]);

  const clientItems = useMemo(() => (!isEncrypted ? [] : runClientSearch(room, parsed, order)), [isEncrypted, room, parsed, order]);
  const activeItems = isEncrypted ? clientItems : displayedServerItems;
  const activeHighlights = isEncrypted ? (parsed.term ? [parsed.term] : []) : serverHighlights;
  const isLoading = hasServerQuery && status === 'pending';
  const hasAnyQuery = !!(parsed.term || parsed.fromFilters.length || parsed.hasFilters.length || parsed.mentionsFilters.length);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || isEncrypted) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 300 && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isEncrypted]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = inputVal.trim();
    if (v) { setSubmittedQuery(v); setShowFilterPanel(false); inputRef.current?.blur(); }
  };

  // Smart completion: if a filter keyword is active at end of input, complete it;
  // otherwise append the new prefix.
  const handleFilterSelect = useCallback((selectedVal: string) => {
    setInputVal((prev) => {
      const active = detectActiveFilter(prev);
      if (active.kind) {
        const toReplace = `${active.kind}:${active.partial}`;
        const replacement = `${active.kind}:${selectedVal} `;
        const lastIdx = prev.toLowerCase().lastIndexOf(toReplace.toLowerCase());
        if (lastIdx !== -1) return prev.slice(0, lastIdx) + replacement;
        return prev + selectedVal + ' ';
      }
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${selectedVal}` : selectedVal;
    });
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  return (
    <Box direction="Column" style={{ width: '320px', minWidth: '320px', borderLeft: `1px solid ${color.Surface.ContainerLine}`, height: '100%' }}>

      {/* ── panel header ── */}
      <Box shrink="No" alignItems="Center" gap="200" style={{ padding: `${config.space.S200} ${config.space.S300}`, borderBottom: `1px solid ${color.Surface.ContainerLine}` }}>
        <Icon src={Icons.Search} size="200" />
        <Box grow="Yes"><Text size="H5">Search</Text></Box>
        <IconButton size="300" fill="None" onClick={onClose} aria-label="Close search">
          <Icon src={Icons.Cross} size="200" />
        </IconButton>
      </Box>

      {/* ── search input + token chips + context dropdown ── */}
      <Box shrink="No" direction="Column" style={{ padding: `${config.space.S300} ${config.space.S300} 0`, position: 'relative', zIndex: showFilterPanel ? 10 : 'auto' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            ref={inputRef} type="text" value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onFocus={() => setShowFilterPanel(true)}
            onBlur={() => { setTimeout(() => setShowFilterPanel(false), 150); }}
            placeholder="Search in this room\u2026" autoFocus
            style={{ flex: 1, background: color.SurfaceVariant.Container, border: `1px solid ${showFilterPanel ? color.Surface.ContainerLine : 'transparent'}`, borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: 'inherit', outline: 'none', transition: 'border-color 0.1s' }}
          />
          <button type="submit" style={{ background: color.SurfaceVariant.Container, border: `1px solid ${color.SurfaceVariant.ContainerLine}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: 'inherit', fontWeight: 'bold', flexShrink: 0 }}>
            Go
          </button>
        </form>

        {/* Live token chip strip — recognized filters as colored removable chips */}
        <TokenChipStrip inputVal={inputVal} onChange={setInputVal} />

        {/* Context-aware filter dropdown — floats over content below */}
        {showFilterPanel && (
          <div style={{ position: 'absolute', top: '100%', left: config.space.S300, right: config.space.S300, zIndex: 20, borderRadius: '0 0 8px 8px', overflow: 'hidden', boxShadow: '0 8px 20px rgba(0,0,0,0.4)' }}>
            <FilterPanel activeFilter={activeFilter} room={room} mx={mx} useAuthentication={useAuthentication} onSelect={handleFilterSelect} />
          </div>
        )}
      </Box>

      <Box shrink="No" style={{ height: config.space.S200 }} />

      {/* ── sort chips ── */}
      <Box shrink="No" gap="200" alignItems="Center" style={{ padding: `${config.space.S100} ${config.space.S300} ${config.space.S200}` }}>
        <Text size="T200" style={{ opacity: 0.6 }}>Sort:</Text>
        {(['newest', 'oldest', 'relevance'] as const).map((o) => (
          <Chip key={o} variant={order === o ? 'Primary' : 'Secondary'} radii="Pill" size="400" onClick={() => setOrder(o)}>
            <Text size="T200">{o.charAt(0).toUpperCase() + o.slice(1)}</Text>
          </Chip>
        ))}
      </Box>

      {isEncrypted && (
        <Box shrink="No" style={{ padding: `${config.space.S200} ${config.space.S300}`, background: 'rgba(80, 160, 80, 0.08)', borderTop: '1px solid rgba(80, 160, 80, 0.2)', borderBottom: '1px solid rgba(80, 160, 80, 0.2)' }}>
          <Text size="T200" style={{ color: '#5ca85c' }}>\U0001f512 Searching locally cached messages (encrypted room).</Text>
        </Box>
      )}

      <Line size="300" variant="Surface" />

      {hasAnyQuery && !isLoading && (
        <Box shrink="No" style={{ padding: `${config.space.S200} ${config.space.S300}` }}>
          <Text size="T200" style={{ opacity: 0.6 }}>
            {activeItems.length > 0
              ? `${activeItems.length}${!isEncrypted && hasNextPage ? '+' : ''} result${activeItems.length !== 1 ? 's' : ''} for "${submittedQuery}"`
              : `No results for "${submittedQuery}"`}
          </Text>
        </Box>
      )}

      {isLoading && <Box justifyContent="Center" alignItems="Center" style={{ padding: config.space.S500 }}><Spinner size="600" variant="Secondary" /></Box>}

      {error && (
        <Box shrink="No" style={{ padding: config.space.S300, background: 'rgba(200,50,50,0.1)', margin: config.space.S200, borderRadius: '8px' }}>
          <Text size="T300">{(error as Error).message}</Text>
        </Box>
      )}

      <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: `${config.space.S100} ${config.space.S200}` }}>
        {activeItems.map((item) => {
          const { event } = item;
          const r = mx.getRoom(roomId);
          const displayName = (r ? getMemberDisplayName(r, event.sender) : undefined) ?? getMxIdLocalPart(event.sender) ?? event.sender;
          const avatarMxc = r ? getMemberAvatarMxc(r, event.sender) : undefined;
          const avatarUrl = avatarMxc ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 32, 32, 'crop') ?? undefined : undefined;
          const rel = event.content?.['m.relates_to'] as { rel_type?: string; event_id?: string } | undefined;
          const mainEventId = rel?.rel_type === 'm.replace' ? rel.event_id ?? event.event_id : event.event_id;
          return (
            <SearchResultCard key={event.event_id} displayName={displayName} avatarUrl={avatarUrl} ts={event.origin_server_ts} text={getMessageText(event)} highlights={activeHighlights} hour24={hour24 ?? false} onJump={() => navigateRoom(roomId, mainEventId)} />
          );
        })}

        {isFetchingNextPage && <Box justifyContent="Center" style={{ padding: config.space.S300 }}><Spinner size="400" variant="Secondary" /></Box>}

        {!hasAnyQuery && !submittedQuery && (
          <Box direction="Column" alignItems="Center" justifyContent="Center" style={{ padding: config.space.S500, opacity: 0.5, textAlign: 'center' as const }}>
            <Icon src={Icons.Search} size="500" />
            <Text size="T300" style={{ marginTop: '8px' }}>Click the input to see filter options, then press Go.</Text>
          </Box>
        )}

        {isEncrypted && hasAnyQuery && activeItems.length === 0 && !isLoading && (
          <Box direction="Column" alignItems="Center" style={{ padding: config.space.S400, opacity: 0.6, textAlign: 'center' as const }}>
            <Text size="T300">No cached messages match. Scroll back further in the chat to load more history, then search again.</Text>
          </Box>
        )}
      </div>
    </Box>
  );
}
