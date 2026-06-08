import { useEffect, useState, useCallback } from "react";

// Federal HOS limits (property-carrying CMV)
export const LIMITS = {
  driveMaxMin: 11 * 60,     // 11h driving
  windowMaxMin: 14 * 60,    // 14h on-duty window
  breakRequiredAfterMin: 8 * 60, // 30-min break after 8h driving
  cycleMaxMin: 70 * 60,     // 70h / 8 days
};

export type DutyStatus = "off" | "sleeper" | "driving" | "onduty";

type HosState = {
  status: DutyStatus;
  statusStartedAt: number; // epoch ms
  dayStartedAt: number | null; // start of current 14h window
  driveMinToday: number;
  onDutyMinToday: number;
  cycleMin: number; // last 8 days
  lastBreakAt: number | null; // ms epoch of last 30+ min off/sleeper
  driveSinceBreakMin: number;
};

const STORAGE_KEY = "navaroad.hos.v1";

function load(): HosState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as HosState;
  } catch {}
  return defaultState();
}

function defaultState(): HosState {
  return {
    status: "off",
    statusStartedAt: Date.now(),
    dayStartedAt: null,
    driveMinToday: 0,
    onDutyMinToday: 0,
    cycleMin: 0,
    lastBreakAt: null,
    driveSinceBreakMin: 0,
  };
}

function save(s: HosState) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export function useHos() {
  const [state, setState] = useState<HosState>(load);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Live "current segment" elapsed minutes
  const segmentMin = Math.max(0, Math.floor((now - state.statusStartedAt) / 60000));

  const liveDriveMinToday = state.driveMinToday + (state.status === "driving" ? segmentMin : 0);
  const liveDriveSinceBreak = state.driveSinceBreakMin + (state.status === "driving" ? segmentMin : 0);
  const liveOnDutyMinToday = state.onDutyMinToday + ((state.status === "driving" || state.status === "onduty") ? segmentMin : 0);
  const liveCycleMin = state.cycleMin + ((state.status === "driving" || state.status === "onduty") ? segmentMin : 0);
  const windowElapsed = state.dayStartedAt ? Math.max(0, Math.floor((now - state.dayStartedAt) / 60000)) : 0;

  const setStatus = useCallback((next: DutyStatus) => {
    setState((prev) => {
      const seg = Math.max(0, Math.floor((Date.now() - prev.statusStartedAt) / 60000));
      const addOnDuty = (prev.status === "driving" || prev.status === "onduty") ? seg : 0;
      const addDrive = prev.status === "driving" ? seg : 0;
      // qualifying break = 30+ min off-duty or sleeper
      const tookBreak = (prev.status === "off" || prev.status === "sleeper") && seg >= 30;
      const onDutyToday = prev.onDutyMinToday + addOnDuty;
      const driveToday = prev.driveMinToday + addDrive;
      const cycle = prev.cycleMin + addOnDuty;
      const driveSinceBreak = tookBreak ? 0 : prev.driveSinceBreakMin + addDrive;
      // Start a new 14h window when transitioning from rest to on-duty/driving
      const startingDuty = (next === "driving" || next === "onduty") && (prev.status === "off" || prev.status === "sleeper");
      const newDayStart = startingDuty && (!prev.dayStartedAt || seg >= 10 * 60)
        ? Date.now()
        : prev.dayStartedAt ?? (startingDuty ? Date.now() : null);
      // Full 10h reset wipes daily counters
      const fullReset = (prev.status === "off" || prev.status === "sleeper") && seg >= 10 * 60;
      const ns: HosState = {
        status: next,
        statusStartedAt: Date.now(),
        dayStartedAt: fullReset ? (startingDuty ? Date.now() : null) : newDayStart,
        driveMinToday: fullReset ? 0 : driveToday,
        onDutyMinToday: fullReset ? 0 : onDutyToday,
        cycleMin: cycle,
        lastBreakAt: tookBreak ? Date.now() : prev.lastBreakAt,
        driveSinceBreakMin: fullReset ? 0 : driveSinceBreak,
      };
      save(ns);
      return ns;
    });
  }, []);

  const reset = useCallback(() => {
    const s = defaultState();
    save(s);
    setState(s);
  }, []);

  return {
    state,
    setStatus,
    reset,
    segmentMin,
    liveDriveMinToday,
    liveDriveSinceBreak,
    liveOnDutyMinToday,
    liveCycleMin,
    windowElapsed,
    remaining: {
      drive: Math.max(0, LIMITS.driveMaxMin - liveDriveMinToday),
      window: Math.max(0, LIMITS.windowMaxMin - windowElapsed),
      untilBreak: Math.max(0, LIMITS.breakRequiredAfterMin - liveDriveSinceBreak),
      cycle: Math.max(0, LIMITS.cycleMaxMin - liveCycleMin),
    },
  };
}

export function fmtHm(mins: number) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${r.toString().padStart(2, "0")}m`;
}
