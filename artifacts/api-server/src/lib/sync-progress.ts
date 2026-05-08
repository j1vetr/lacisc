// In-memory live progress state for the active (or last) sync run. Polled by
// the admin panel every ~1.5s while a sync is running. A full tick now has
// two phases: Starlink (Tototheo API) → Satcom (Playwright scraper).
//
// `phase` reflects which one is currently active. The Satcom-specific fields
// (totalAccounts, currentKit, etc.) are kept for backward compat; the new
// starlink* fields are populated during the Starlink phase.

export type SyncEventLevel = "info" | "warn" | "error" | "success";
export type SyncPhase = "idle" | "starlink" | "leobridge" | "satcom";

export interface SyncEvent {
  ts: number;
  level: SyncEventLevel;
  message: string;
}

export interface AccountResult {
  credentialId: number;
  label: string;
  success: boolean;
  message: string;
  recordsFound: number;
  recordsInserted: number;
  recordsUpdated: number;
}

export interface SyncProgress {
  running: boolean;
  phase: SyncPhase;
  startedAt: number | null;
  finishedAt: number | null;

  // Satcom phase counters
  totalAccounts: number;
  currentAccountIndex: number;
  currentAccountId: number | null;
  currentAccountLabel: string | null;

  totalPeriods: number;
  currentPeriodIndex: number;
  currentPeriod: string | null;

  totalKits: number;
  currentKitIndex: number;
  currentKit: string | null;

  rowsInserted: number;
  rowsUpdated: number;
  rowsFound: number;
  failures: number;

  // Starlink phase counters
  starlinkTotalTerminals: number;
  starlinkProcessedTerminals: number;
  starlinkSuccessTerminals: number;
  starlinkFailures: number;
  currentTerminalKit: string | null;
  currentTerminalLabel: string | null;

  // Leo Bridge phase counters (mirrors Starlink shape)
  leobridgeTotalTerminals: number;
  leobridgeProcessedTerminals: number;
  leobridgeSuccessTerminals: number;
  leobridgeFailures: number;
  currentLeobridgeKit: string | null;
  currentLeobridgeLabel: string | null;

  events: SyncEvent[];
  accountResults: AccountResult[];
  lastMessage: string | null;
}

const MAX_EVENTS = 80;

let state: SyncProgress = freshState();

function freshState(): SyncProgress {
  return {
    running: false,
    phase: "idle",
    startedAt: null,
    finishedAt: null,
    totalAccounts: 0,
    currentAccountIndex: 0,
    currentAccountId: null,
    currentAccountLabel: null,
    totalPeriods: 0,
    currentPeriodIndex: 0,
    currentPeriod: null,
    totalKits: 0,
    currentKitIndex: 0,
    currentKit: null,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsFound: 0,
    failures: 0,
    starlinkTotalTerminals: 0,
    starlinkProcessedTerminals: 0,
    starlinkSuccessTerminals: 0,
    starlinkFailures: 0,
    currentTerminalKit: null,
    currentTerminalLabel: null,
    leobridgeTotalTerminals: 0,
    leobridgeProcessedTerminals: 0,
    leobridgeSuccessTerminals: 0,
    leobridgeFailures: 0,
    currentLeobridgeKit: null,
    currentLeobridgeLabel: null,
    events: [],
    accountResults: [],
    lastMessage: null,
  };
}

export function getProgress(): SyncProgress {
  return state;
}

export function isRunning(): boolean {
  return state.running;
}

// ---------------------------------------------------------------------------
// Multi-phase orchestration helpers
// ---------------------------------------------------------------------------

// Start a fresh combined run (Starlink + Satcom). Resets all counters.
// Caller follows up with startStarlinkPhase() and/or startRun() (Satcom).
export function startCombinedRun(): void {
  state = {
    ...freshState(),
    running: true,
    startedAt: Date.now(),
  };
  pushEvent("info", "Senkronizasyon turu başladı.");
}

export function finishCombinedRun(message: string, success: boolean): void {
  state.running = false;
  state.phase = "idle";
  state.finishedAt = Date.now();
  state.lastMessage = message;
  state.currentKit = null;
  state.currentPeriod = null;
  state.currentAccountLabel = null;
  state.currentTerminalKit = null;
  state.currentTerminalLabel = null;
  pushEvent(success ? "success" : "error", message);
}

// ---------------------------------------------------------------------------
// Leo Bridge phase
// ---------------------------------------------------------------------------

export function startLeobridgePhase(totalTerminals: number): void {
  if (!state.running) {
    state = { ...freshState(), running: true, startedAt: Date.now() };
  }
  state.phase = "leobridge";
  state.leobridgeTotalTerminals = totalTerminals;
  state.leobridgeProcessedTerminals = 0;
  state.leobridgeSuccessTerminals = 0;
  state.leobridgeFailures = 0;
  state.currentLeobridgeKit = null;
  state.currentLeobridgeLabel = null;
  pushEvent(
    "info",
    `Leo Bridge (Space Norway) fazı başladı — ${totalTerminals} terminal.`
  );
}

// T002 — multi-account: her credential listing'i kümülatif olarak ekler.
export function bumpLeobridgePlan(extraTerminals: number, label?: string): void {
  state.leobridgeTotalTerminals += extraTerminals;
  pushEvent(
    "info",
    label
      ? `Leo Bridge hesap "${label}": +${extraTerminals} terminal.`
      : `Leo Bridge: +${extraTerminals} terminal kuyruğa alındı.`
  );
}

export function startLeobridgeTerminal(
  kitSerialNumber: string,
  label: string | null,
  index: number
): void {
  state.currentLeobridgeKit = kitSerialNumber;
  state.currentLeobridgeLabel = label;
  state.leobridgeProcessedTerminals = index;
}

export function reportLeobridgeDone(): void {
  state.leobridgeSuccessTerminals += 1;
  if (state.currentLeobridgeKit) {
    pushEvent("success", `${state.currentLeobridgeKit} güncellendi.`);
  }
}

export function reportLeobridgeFailure(
  kitSerialNumber: string,
  reason: string
): void {
  state.leobridgeFailures += 1;
  pushEvent("warn", `${kitSerialNumber} atlandı: ${reason}`);
}

export function finishLeobridgePhase(message: string, success: boolean): void {
  pushEvent(success ? "success" : "error", message);
  state.currentLeobridgeKit = null;
  state.currentLeobridgeLabel = null;
  // Don't flip running=false — Satcom may still follow.
}

// ---------------------------------------------------------------------------
// Starlink phase
// ---------------------------------------------------------------------------

export function startStarlinkPhase(): void {
  // If no combined run is active (caller hit Starlink-only sync directly),
  // bootstrap the run state ourselves.
  if (!state.running) {
    state = { ...freshState(), running: true, startedAt: Date.now() };
  }
  state.phase = "starlink";
  state.starlinkTotalTerminals = 0;
  state.starlinkProcessedTerminals = 0;
  state.starlinkSuccessTerminals = 0;
  state.starlinkFailures = 0;
  state.currentTerminalKit = null;
  state.currentTerminalLabel = null;
  pushEvent("info", "Starlink (Tototheo) fazı başladı.");
}

export function setStarlinkPlan(totalTerminals: number): void {
  state.starlinkTotalTerminals = totalTerminals;
  pushEvent("info", `Starlink: ${totalTerminals} terminal kuyruğa alındı.`);
}

// T002 — multi-account: her credential listing'i kümülatif olarak ekler
// (UI counter "X/Toplam" doğru kalır).
export function bumpStarlinkPlan(extraTerminals: number, label?: string): void {
  state.starlinkTotalTerminals += extraTerminals;
  pushEvent(
    "info",
    label
      ? `Starlink hesap "${label}": +${extraTerminals} terminal.`
      : `Starlink: +${extraTerminals} terminal kuyruğa alındı.`
  );
}

export function startStarlinkTerminal(
  kitSerialNumber: string,
  label: string,
  index: number
): void {
  state.currentTerminalKit = kitSerialNumber;
  state.currentTerminalLabel = label;
  state.starlinkProcessedTerminals = index;
}

export function reportStarlinkDone(
  kitSerialNumber: string,
  totalGb: number | null
): void {
  state.starlinkSuccessTerminals += 1;
  pushEvent(
    "success",
    `${kitSerialNumber}${
      totalGb != null ? ` → ${totalGb.toFixed(2)} GB` : ""
    }`
  );
}

export function reportStarlinkFailure(
  kitSerialNumber: string,
  reason: string
): void {
  state.starlinkFailures += 1;
  pushEvent("warn", `${kitSerialNumber} atlandı: ${reason}`);
}

export function finishStarlinkPhase(message: string, success: boolean): void {
  pushEvent(success ? "success" : "error", message);
  state.currentTerminalKit = null;
  state.currentTerminalLabel = null;
  // Don't flip running=false here — Satcom may follow.
}

// ---------------------------------------------------------------------------
// Satcom phase (existing API, used by the Playwright scraper orchestrator)
// ---------------------------------------------------------------------------

export function startRun(totalAccounts: number): void {
  // Bootstrap if no combined run is active (caller invoked Satcom directly).
  if (!state.running) {
    state = { ...freshState(), running: true, startedAt: Date.now() };
  }
  state.phase = "satcom";
  state.totalAccounts = totalAccounts;
  state.currentAccountIndex = 0;
  state.currentAccountId = null;
  state.currentAccountLabel = null;
  state.totalPeriods = 0;
  state.currentPeriodIndex = 0;
  state.currentPeriod = null;
  state.totalKits = 0;
  state.currentKitIndex = 0;
  state.currentKit = null;
  state.rowsInserted = 0;
  state.rowsUpdated = 0;
  state.rowsFound = 0;
  state.failures = 0;
  state.accountResults = [];
  pushEvent(
    "info",
    `Satcom fazı başladı — ${totalAccounts} hesap kuyruğa alındı.`
  );
}

export function startAccount(
  credentialId: number,
  label: string,
  index: number
): void {
  state.currentAccountId = credentialId;
  state.currentAccountLabel = label;
  state.currentAccountIndex = index;
  state.totalPeriods = 0;
  state.currentPeriodIndex = 0;
  state.currentPeriod = null;
  state.totalKits = 0;
  state.currentKitIndex = 0;
  state.currentKit = null;
  pushEvent(
    "info",
    `[${index}/${state.totalAccounts}] Hesap "${label}" işleniyor…`
  );
}

export function setAccountPlan(totalPeriods: number, totalKits: number): void {
  state.totalPeriods = totalPeriods;
  state.totalKits = totalKits;
  pushEvent("info", `Plan: ${totalKits} KIT × ${totalPeriods} dönem`);
}

export function startPeriod(period: string, index: number): void {
  state.currentPeriod = period;
  state.currentPeriodIndex = index;
  state.currentKitIndex = 0;
  state.currentKit = null;
}

export function startKit(kitNo: string, index: number): void {
  state.currentKit = kitNo;
  state.currentKitIndex = index;
}

export function reportKitDone(
  kitNo: string,
  period: string,
  rows: number,
  inserted: number,
  updated: number,
  totalGib: number | null,
  totalUsd: number | null
): void {
  state.rowsFound += rows;
  state.rowsInserted += inserted;
  state.rowsUpdated += updated;
  pushEvent(
    "success",
    `${kitNo} · ${period} → ${rows} satır${
      totalGib !== null ? `, ${totalGib.toFixed(2)} GiB` : ""
    }${totalUsd !== null ? `, ${totalUsd.toFixed(2)} USD` : ""}`
  );
}

export function reportKitFailure(
  kitNo: string,
  period: string,
  reason: string
): void {
  state.failures += 1;
  pushEvent("warn", `${kitNo} · ${period} atlandı: ${reason}`);
}

export function finishAccount(result: AccountResult): void {
  state.accountResults.push(result);
  pushEvent(
    result.success ? "success" : "error",
    `Hesap "${result.label}" tamamlandı: ${result.message}`
  );
}

export function finishRun(message: string, success: boolean): void {
  // Legacy Satcom-only finish — used when Satcom is the only phase. If a
  // combined run is in flight, the caller (scheduler / sync-now route) will
  // call finishCombinedRun() afterward to flip running=false. Otherwise
  // handle it here so single-phase callers still work.
  state.lastMessage = message;
  state.currentKit = null;
  state.currentPeriod = null;
  state.currentAccountLabel = null;
  pushEvent(success ? "success" : "error", message);
  if (state.phase !== "starlink") {
    state.running = false;
    state.phase = "idle";
    state.finishedAt = Date.now();
  }
}

export function pushEvent(level: SyncEventLevel, message: string): void {
  state.events.push({ ts: Date.now(), level, message });
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }
}

export function resetProgress(): void {
  state = freshState();
}
