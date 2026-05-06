// In-memory live progress state for the active (or last) sync run. Polled by
// the admin panel every ~1.5s while a sync is running so the UI can show:
//   "Hesap 2/3 · Dönem 4/5 · KIT 15/40  →  yilmazlarBalik · 202604 · KITP00409812"
// plus a scrolling event feed.

export type SyncEventLevel = "info" | "warn" | "error" | "success";

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
  startedAt: number | null;
  finishedAt: number | null;

  totalAccounts: number;
  currentAccountIndex: number; // 1-based for display
  currentAccountId: number | null;
  currentAccountLabel: string | null;

  totalPeriods: number;
  currentPeriodIndex: number; // 1-based
  currentPeriod: string | null;

  totalKits: number;
  currentKitIndex: number; // 1-based
  currentKit: string | null;

  rowsInserted: number;
  rowsUpdated: number;
  rowsFound: number;
  failures: number;

  events: SyncEvent[];
  accountResults: AccountResult[];
  lastMessage: string | null;
}

const MAX_EVENTS = 80;

let state: SyncProgress = freshState();

function freshState(): SyncProgress {
  return {
    running: false,
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

export function startRun(totalAccounts: number): void {
  state = {
    ...freshState(),
    running: true,
    startedAt: Date.now(),
    totalAccounts,
  };
  pushEvent("info", `Senkronizasyon başladı — ${totalAccounts} hesap kuyruğa alındı.`);
}

export function startAccount(
  credentialId: number,
  label: string,
  index: number
): void {
  state.currentAccountId = credentialId;
  state.currentAccountLabel = label;
  state.currentAccountIndex = index;
  // Reset per-account scoped fields.
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
  pushEvent(
    "info",
    `Plan: ${totalKits} KIT × ${totalPeriods} dönem`
  );
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
  state.running = false;
  state.finishedAt = Date.now();
  state.lastMessage = message;
  state.currentKit = null;
  state.currentPeriod = null;
  state.currentAccountLabel = null;
  pushEvent(success ? "success" : "error", message);
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
