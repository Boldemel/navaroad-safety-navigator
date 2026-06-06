/**
 * Voice engine — abstraction over text-to-speech so the web app can use the
 * browser SpeechSynthesis API today and native platforms (iOS / Android via
 * Capacitor) can swap in a native TTS engine later without changing callers.
 *
 * Callers only use:
 *   - voiceEngine.speak(text, { priority })
 *   - voiceEngine.cancel()
 *   - voiceEngine.isAvailable()
 *
 * Settings (volume / muted / rate) are read live from useVoiceSettings.
 */

import { getVoiceSettings, type VoiceSettings } from "./voice-settings";

export type SpeakPriority = "low" | "normal" | "high" | "critical";

export interface VoiceEngine {
  isAvailable(): boolean;
  speak(text: string, opts?: { priority?: SpeakPriority; dedupeKey?: string }): void;
  cancel(): void;
}

// In-memory dedupe so the same announcement (e.g. "In 1 mile turn left") is
// not re-queued by every geolocation tick.
const recentlySpoken = new Map<string, number>();
const DEDUPE_WINDOW_MS = 8_000;

function dedupe(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentlySpoken) if (now - t > DEDUPE_WINDOW_MS) recentlySpoken.delete(k);
  if (recentlySpoken.has(key)) return true;
  recentlySpoken.set(key, now);
  return false;
}

class WebSpeechEngine implements VoiceEngine {
  private synth: SpeechSynthesis | null;
  private duckCtx: AudioContext | null = null;

  constructor() {
    this.synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  }

  isAvailable(): boolean {
    return this.synth != null;
  }

  /**
   * Best-effort "audio ducking" hook — on web we cannot lower another tab/app's
   * music volume, but priming an AudioContext + MediaSession lets native
   * adapters (Capacitor) implement proper ducking later. On iOS/Android web,
   * triggering MediaSession also helps SpeechSynthesis continue when the
   * screen locks for short periods.
   */
  private duck() {
    if (typeof window === "undefined") return;
    try {
      if (!this.duckCtx && "AudioContext" in window) {
        this.duckCtx = new AudioContext();
      }
      if (this.duckCtx?.state === "suspended") void this.duckCtx.resume();
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
    } catch {
      /* ignore */
    }
  }

  speak(text: string, opts: { priority?: SpeakPriority; dedupeKey?: string } = {}) {
    if (!this.synth) return;
    const settings = getVoiceSettings();
    if (settings.muted) return;
    if (!text.trim()) return;

    const key = opts.dedupeKey ?? text;
    if (dedupe(key)) return;

    const priority = opts.priority ?? "normal";
    // High / critical: clear the queue so urgent announcements come through.
    if (priority === "high" || priority === "critical") {
      this.synth.cancel();
    }

    this.duck();

    const utter = new SpeechSynthesisUtterance(text);
    utter.volume = Math.max(0, Math.min(1, settings.volume));
    utter.rate = Math.max(0.5, Math.min(2, settings.rate));
    utter.pitch = 1;
    utter.lang = "en-US";
    try {
      this.synth.speak(utter);
    } catch {
      /* ignore — speech engine occasionally rejects on first call */
    }
  }

  cancel() {
    try {
      this.synth?.cancel();
    } catch {
      /* ignore */
    }
  }
}

class NoopEngine implements VoiceEngine {
  isAvailable() { return false; }
  speak() { /* noop */ }
  cancel() { /* noop */ }
}

// Singleton instance — swap to a NativeEngine in Capacitor builds later.
let _engine: VoiceEngine | null = null;
export function getVoiceEngine(): VoiceEngine {
  if (_engine) return _engine;
  if (typeof window === "undefined") return new NoopEngine();
  _engine = new WebSpeechEngine();
  return _engine;
}

export function speak(text: string, opts?: { priority?: SpeakPriority; dedupeKey?: string }) {
  getVoiceEngine().speak(text, opts);
}

export function cancelSpeech() {
  getVoiceEngine().cancel();
}

export type { VoiceSettings };
