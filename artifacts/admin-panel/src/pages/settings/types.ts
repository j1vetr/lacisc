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
