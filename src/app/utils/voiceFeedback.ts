/**
 * Voice UI feedback sounds - played when mute/deafen state changes.
 * Uses Web Audio API to synthesise short tones; no asset files needed.
 */

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume = 0.35,
  type: OscillatorType = 'sine'
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.value = frequency;
  // Soft attack + release envelope
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
  gain.gain.setValueAtTime(volume, startTime + duration - 0.012);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

function makeCtx(): AudioContext | null {
  try { return new AudioContext(); } catch { return null; }
}

/** Mic muted — two descending tones (high → low) */
export function playMuteSound(): void {
  const ctx = makeCtx(); if (!ctx) return;
  const t = ctx.currentTime;
  playTone(ctx, 900, t,        0.07, 0.38);
  playTone(ctx, 660, t + 0.08, 0.07, 0.30);
  setTimeout(() => ctx.close(), 600);
}

/** Mic unmuted — two ascending tones (low → high) */
export function playUnmuteSound(): void {
  const ctx = makeCtx(); if (!ctx) return;
  const t = ctx.currentTime;
  playTone(ctx, 660, t,        0.07, 0.30);
  playTone(ctx, 900, t + 0.08, 0.07, 0.38);
  setTimeout(() => ctx.close(), 600);
}

/**
 * Deafened — two lower descending tones.
 * Lower pitch than mic sounds so users can tell them apart.
 */
export function playDeafenSound(): void {
  const ctx = makeCtx(); if (!ctx) return;
  const t = ctx.currentTime;
  playTone(ctx, 450, t,        0.09, 0.32);
  playTone(ctx, 330, t + 0.10, 0.09, 0.25);
  setTimeout(() => ctx.close(), 600);
}

/** Undeafened — two lower ascending tones */
export function playUndeafenSound(): void {
  const ctx = makeCtx(); if (!ctx) return;
  const t = ctx.currentTime;
  playTone(ctx, 330, t,        0.09, 0.25);
  playTone(ctx, 450, t + 0.10, 0.09, 0.32);
  setTimeout(() => ctx.close(), 600);
}
