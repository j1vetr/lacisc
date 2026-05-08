import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  useGetKits,
  getGetKitsQueryKey,
  useGetStarlinkTerminals,
  getGetStarlinkTerminalsQueryKey,
  useGetLeobridgeTerminals,
  getGetLeobridgeTerminalsQueryKey,
} from "@workspace/api-client-react";

export type FleetRow = {
  source: "satcom" | "starlink" | "norway";
  kitNo: string;
  shipName: string;
  currentPeriodGb: number;
  online: boolean;
};

const REFETCH_MS = 30_000;

function isOnlineSatcom(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

export function detailHref(row: FleetRow): string {
  if (row.source === "satcom") return `/kits/${encodeURIComponent(row.kitNo)}`;
  if (row.source === "starlink")
    return `/starlink/${encodeURIComponent(row.kitNo)}`;
  return `/norway/${encodeURIComponent(row.kitNo)}`;
}

export type FleetState = {
  fleet: FleetRow[];
  /** true until the first fetch of all three sources completes (success or error). */
  isLoading: boolean;
  /** true if at least one source is currently fetching (e.g. background refresh). */
  isFetching: boolean;
};

export function useCustomerFleet(): FleetState {
  const satcomQ = useGetKits(
    { sortBy: "totalGib" },
    {
      query: {
        queryKey: getGetKitsQueryKey({ sortBy: "totalGib" }),
        refetchInterval: REFETCH_MS,
      },
    },
  );
  const starlinkQ = useGetStarlinkTerminals({
    query: {
      queryKey: getGetStarlinkTerminalsQueryKey(),
      refetchInterval: REFETCH_MS,
    },
  });
  const leobridgeQ = useGetLeobridgeTerminals({
    query: {
      queryKey: getGetLeobridgeTerminalsQueryKey(),
      refetchInterval: REFETCH_MS,
    },
  });

  const fleet = useMemo<FleetRow[]>(() => {
    const out: FleetRow[] = [];
    for (const k of satcomQ.data ?? []) {
      out.push({
        source: "satcom",
        kitNo: k.kitNo,
        shipName: k.shipName?.trim() || "Adsız Gemi",
        // Satcom GiB → GB; Starlink + Norway zaten GB.
        currentPeriodGb: (k.totalGib ?? 0) * 1.073741824,
        online: isOnlineSatcom(k.lastSyncedAt ?? null),
      });
    }
    for (const t of starlinkQ.data ?? []) {
      out.push({
        source: "starlink",
        kitNo: t.kitSerialNumber,
        shipName: t.nickname?.trim() || t.assetName?.trim() || "Adsız Gemi",
        currentPeriodGb: t.currentPeriodTotalGb ?? 0,
        online: t.isOnline ?? false,
      });
    }
    for (const t of leobridgeQ.data ?? []) {
      out.push({
        source: "norway",
        kitNo: t.kitSerialNumber,
        shipName: t.nickname?.trim() || "Adsız Gemi",
        currentPeriodGb: t.currentPeriodTotalGb ?? 0,
        online: t.isOnline ?? false,
      });
    }
    out.sort((a, b) => b.currentPeriodGb - a.currentPeriodGb);
    return out;
  }, [satcomQ.data, starlinkQ.data, leobridgeQ.data]);

  // True until ALL three queries have resolved at least once. We use the
  // react-query convention: a query is "loading" only on its first fetch
  // (no cached data yet). After that, refetches surface via isFetching but
  // not isLoading — so the empty state isn't flashed on every poll.
  const isLoading = satcomQ.isLoading || starlinkQ.isLoading || leobridgeQ.isLoading;
  const isFetching = satcomQ.isFetching || starlinkQ.isFetching || leobridgeQ.isFetching;

  return { fleet, isLoading, isFetching };
}

export type FleetContextValue = FleetState & {
  filteredFleet: FleetRow[];
  query: string;
};

const CustomerFleetContext = createContext<FleetContextValue | null>(null);

export function CustomerFleetProvider({
  value,
  children,
}: {
  value: FleetContextValue;
  children: ReactNode;
}) {
  return (
    <CustomerFleetContext.Provider value={value}>
      {children}
    </CustomerFleetContext.Provider>
  );
}

export function useCustomerFleetContext(): FleetContextValue {
  const v = useContext(CustomerFleetContext);
  if (!v) {
    throw new Error(
      "useCustomerFleetContext must be used inside <CustomerLayout>",
    );
  }
  return v;
}
