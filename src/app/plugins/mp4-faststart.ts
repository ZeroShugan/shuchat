/**
 * mp4-faststart.ts — in-memory MP4 "faststart" remux.
 *
 * Firefox refuses to play large blob-URL MP4s whose `moov` (metadata) box sits at the
 * END of the file (typical of Clipchamp/OBS exports without web-optimization): the
 * <video> element fires loadstart → suspend at readyState 0 and never recovers.
 * Since encrypted-room media MUST be played from an in-memory blob, we fix the file
 * itself: move `moov` in front of the first `mdat` and patch every chunk-offset table
 * (stco/co64) by the shift. Pure box shuffling — no transcoding, lossless, O(n) copy.
 *
 * Returns the remuxed buffer, or null when no remux is needed (already faststart) or
 * the structure is unexpected (caller then just plays the original bytes).
 */

const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'mvex', 'udta']);

type Box = { type: string; start: number; size: number; hdr: number };

function readBoxes(dv: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let i = start;
  while (i + 8 <= end) {
    let size: number = dv.getUint32(i);
    const type = String.fromCharCode(
      dv.getUint8(i + 4),
      dv.getUint8(i + 5),
      dv.getUint8(i + 6),
      dv.getUint8(i + 7)
    );
    let hdr = 8;
    if (size === 1) {
      if (i + 16 > end) break;
      size = dv.getUint32(i + 8) * 2 ** 32 + dv.getUint32(i + 12);
      hdr = 16;
    } else if (size === 0) {
      size = end - i; // box extends to end of file
    }
    if (size < hdr || i + size > end) break;
    out.push({ type, start: i, size, hdr });
    i += size;
  }
  return out;
}

function collectChunkOffsetBoxes(dv: DataView, box: Box, acc: Box[]) {
  const inner = readBoxes(dv, box.start + box.hdr, box.start + box.size);
  inner.forEach((b) => {
    if (b.type === 'stco' || b.type === 'co64') acc.push(b);
    else if (CONTAINER_BOXES.has(b.type)) collectChunkOffsetBoxes(dv, b, acc);
  });
}

export function mp4ToFaststart(buf: ArrayBuffer): ArrayBuffer | null {
  const dv = new DataView(buf);
  const top = readBoxes(dv, 0, buf.byteLength);
  if (top.length < 2) return null;

  const moovIdx = top.findIndex((b) => b.type === 'moov');
  const mdatIdx = top.findIndex((b) => b.type === 'mdat');
  if (moovIdx < 0 || mdatIdx < 0) return null; // not a regular mp4
  if (moovIdx < mdatIdx) return null; // already faststart — nothing to do

  const moov = top[moovIdx];

  // Work on a copy of moov so we can patch its chunk-offset tables.
  const moovBytes = new Uint8Array(buf.slice(moov.start, moov.start + moov.size));
  const mdv = new DataView(moovBytes.buffer);
  const offsetBoxes: Box[] = [];
  collectChunkOffsetBoxes(mdv, { type: 'moov', start: 0, size: moov.size, hdr: moov.hdr }, offsetBoxes);
  if (offsetBoxes.length === 0) return null;

  // moov moves in front of the first mdat → every byte from there on shifts by +moov.size,
  // and chunk offsets always point into mdat payload, so a uniform delta is correct.
  const delta = moov.size;
  for (const b of offsetBoxes) {
    const count = mdv.getUint32(b.start + b.hdr + 4);
    let p = b.start + b.hdr + 8;
    if (b.type === 'stco') {
      if (p + count * 4 > b.start + b.size) return null;
      for (let k = 0; k < count; k += 1, p += 4) {
        const v = mdv.getUint32(p) + delta;
        if (v > 0xffffffff) return null; // 32-bit table would overflow — bail, play original
        mdv.setUint32(p, v);
      }
    } else {
      if (p + count * 8 > b.start + b.size) return null;
      for (let k = 0; k < count; k += 1, p += 8) {
        const v = mdv.getUint32(p) * 2 ** 32 + mdv.getUint32(p + 4) + delta;
        mdv.setUint32(p, Math.floor(v / 2 ** 32));
        // eslint-disable-next-line no-bitwise
        mdv.setUint32(p + 4, v % 2 ** 32 >>> 0);
      }
    }
  }

  // Reassemble: [boxes before first mdat (ftyp, free, …)] [patched moov] [rest, minus moov].
  const src = new Uint8Array(buf);
  const out = new Uint8Array(buf.byteLength);
  let w = 0;
  const write = (bytes: Uint8Array) => {
    out.set(bytes, w);
    w += bytes.byteLength;
  };
  top.slice(0, mdatIdx).forEach((b) => {
    if (b.type !== 'moov') write(src.subarray(b.start, b.start + b.size));
  });
  write(moovBytes);
  top.slice(mdatIdx).forEach((b) => {
    if (b.type !== 'moov') write(src.subarray(b.start, b.start + b.size));
  });
  if (w !== buf.byteLength) return null; // sanity: sizes must match exactly

  return out.buffer;
}
