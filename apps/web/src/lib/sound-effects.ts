/**
 * ALOS Sound Effects — Web Audio API (no dependencies)
 *
 * All sounds are procedurally generated using oscillators.
 * Toggle via localStorage key 'alos_sounds' = 'on' | 'off'
 * Default: ON
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const pref = localStorage.getItem('alos_sounds');
  return pref !== 'off'; // default: on
}

export function toggleSound(): boolean {
  const now = isSoundEnabled();
  localStorage.setItem('alos_sounds', now ? 'off' : 'on');
  return !now;
}

/** Play a single tone */
function playTone(
  frequency: number,
  duration: number,
  startTime: number,
  gainValue: number,
  type: OscillatorType = 'sine',
  ctx: AudioContext,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(gainValue, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

/**
 * Correct answer chime — ascending two-note C5→E5 chime
 */
export function playCorrect(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(523.25, 0.18, t, 0.22, 'sine', ctx);       // C5
  playTone(659.25, 0.30, t + 0.12, 0.18, 'sine', ctx); // E5
}

/**
 * Wrong answer tone — short descending thud
 */
export function playWrong(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(220, 0.25, t, 0.20, 'triangle', ctx);       // A3
  playTone(196, 0.25, t + 0.10, 0.15, 'triangle', ctx); // G3
}

/**
 * Level-up fanfare — triumphant ascending arpeggio (C5, E5, G5, C6)
 */
export function playLevelUp(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    playTone(freq, 0.35, t + i * 0.12, 0.25, 'sine', ctx);
  });
  // Final chord bloom
  playTone(1046.50, 0.6, t + 0.52, 0.18, 'sine', ctx);
  playTone(783.99, 0.6, t + 0.52, 0.12, 'sine', ctx);
}

/**
 * Achievement unlock — 3-note ascending sparkle
 */
export function playAchievement(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(880, 0.15, t, 0.20, 'sine', ctx);        // A5
  playTone(1108.73, 0.15, t + 0.1, 0.18, 'sine', ctx); // C#6
  playTone(1318.51, 0.40, t + 0.2, 0.22, 'sine', ctx); // E6
}

/**
 * Session complete fanfare
 */
export function playSessionComplete(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  const melody = [523.25, 659.25, 523.25, 783.99, 1046.50];
  const durations = [0.15, 0.15, 0.10, 0.20, 0.50];
  let offset = 0;
  melody.forEach((freq, i) => {
    playTone(freq, durations[i], t + offset, 0.22, 'sine', ctx);
    offset += durations[i] + 0.04;
  });
}

/**
 * Button click tick — very subtle
 */
export function playTick(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(1200, 0.04, ctx.currentTime, 0.08, 'sine', ctx);
}
