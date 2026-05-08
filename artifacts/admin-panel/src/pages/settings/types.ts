export type StationAccount = {
  id: number;
  label?: string | null;
  portalUrl: string;
  username: string;
  isActive: boolean;
  syncIntervalMinutes: number;
  lastSuccessSyncAt?: string | null;
  lastErrorMessage?: string | null;
  firstFullSyncAt?: string | null;
  kitCount: number;
};

// T004 — Starlink ve Leo Bridge hesapları artık çoklu credential modeline
// taşındı. Generated tipler `@workspace/api-client-react`'tan geliyor; burada
// sadece UI'nın referans aldığı isim alias'ları var.
export type StarlinkAccount = {
  id: number;
  label?: string | null;
  apiBaseUrl: string;
  hasToken: boolean;
  isActive: boolean;
  syncIntervalMinutes: number;
  lastSuccessSyncAt?: string | null;
  lastErrorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  kitCount: number;
};

export type LeobridgeAccount = {
  id: number;
  label?: string | null;
  portalUrl: string;
  username: string;
  isActive: boolean;
  syncIntervalMinutes: number;
  lastSuccessSyncAt?: string | null;
  lastErrorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  kitCount: number;
};
