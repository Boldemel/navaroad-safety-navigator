/**
 * Voice settings persistence — stored in localStorage so they survive across
 * sessions and pages. A custom event keeps every subscriber in sync.
 */
import { useCallback, useEffect, useState } from "react";

export type VoiceSettings = {
  muted: boolean;
  volume: number; // 0..1
  rate: number;   // 0.5..2.0
  hazardAlerts: boolean;
};

const KEY = "navaroad.voiceSettings";
const EVT = "navaroad:voice-settings";

const DEFAULTS: VoiceSettings = {
  muted: true,
  volume: 1,
  rate: 1,
  hazardAlerts: true,
};

export function getVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function setVoiceSettings(patch: Partial<VoiceSettings>) {
  if (typeof window === "undefined") return;
  const next = { ...getVoiceSettings(), ...patch };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useVoiceSettings(): [VoiceSettings, (p: Partial<VoiceSettings>) => void] {
  const [s, setS] = useState<VoiceSettings>(DEFAULTS);
  const sync = useCallback(() => setS(getVoiceSettings()), []);
  useEffect(() => {
    sync();
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) sync(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVT, sync);
    };
  }, [sync]);
  return [s, setVoiceSettings];
}
