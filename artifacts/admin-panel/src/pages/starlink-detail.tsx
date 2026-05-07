import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetStarlinkTerminalDetail,
  getGetStarlinkTerminalDetailQueryKey,
  useGetStarlinkTerminalDaily,
  getGetStarlinkTerminalDailyQueryKey,
  useGetStarlinkTerminalMonthly,
  getGetStarlinkTerminalMonthlyQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Satellite,
  HardDrive,
  CalendarClock,
  CheckCircle2,
  Activity,
  Wifi,
  WifiOff,
  AlertTriangle,
  MapPin,
  Gauge,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody as Body,
  TableCell as Cell,
  TableHead as Head,
  TableHeader as Header,
  TableRow as Row,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber, formatDate } from "@/lib/format";
import { useDocumentTitle } from "@/hooks/use-document-title";

function formatPeriodLabel(period?: string | null) {
  if (!period) return "-";
  if (/^\d{6}$/.test(period)) {
    return `${period.slice(4, 6)}/${period.slice(0, 4)}`;
  }
  return period;
}

function formatDay(dayDate: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) {
    return `${dayDate.slice(8, 10)}.${dayDate.slice(5, 7)}`;
  }
  return dayDate;
}

export default function StarlinkDetail({ kit }: { kit: string }) {
  useDocumentTitle(kit);

  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined);

  const { data: detail, isLoading: detailLoading } = useGetStarlinkTerminalDetail(
    kit,
    {
      query: {
        queryKey: getGetStarlinkTerminalDetailQueryKey(kit),
        enabled: Boolean(kit),
      },
    }
  );
  const { data: monthly, isLoading: monthlyLoading } = useGetStarlinkTerminalMonthly(
    kit,
    {
      query: {
        queryKey: getGetStarlinkTerminalMonthlyQueryKey(kit),
        enabled: Boolean(kit),
      },
    }
  );

  const dailyParams = selectedPeriod ? { period: selectedPeriod } : {};
  const { data: daily, isLoading: dailyLoading } = useGetStarlinkTerminalDaily(
    kit,
    dailyParams,
    {
      query: {
        queryKey: getGetStarlinkTerminalDailyQueryKey(kit, dailyParams),
        enabled: Boolean(kit),
      },
    }
  );

  const activePeriod = selectedPeriod ?? detail?.currentPeriod ?? null;
  const periodLabel = formatPeriodLabel(activePeriod);

  const chartData = useMemo(() => {
    return (daily ?? []).map((r) => ({
      day: formatDay(r.dayDate),
      gib: r.deltaPackageGb ?? 0,
    }));
  }, [daily]);

  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    if (detail?.currentPeriod) set.add(detail.currentPeriod);
    (monthly ?? []).forEach((m) => m.period && set.add(m.period));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [monthly, detail?.currentPeriod]);

  const displayName = detail?.nickname || detail?.assetName || kit;

  return (
    <div className="space-y-6 lg:space-y-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:gap-4">
        <Link href="/kits">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors w-fit">
            <ArrowLeft className="w-3.5 h-3.5" />
            Tüm terminaller
          </div>
        </Link>
        <div className="flex items-start gap-3 lg:gap-4 min-w-0">
          <div className="p-2.5 lg:p-3 rounded-xl bg-card border border-border shrink-0">
            <Satellite className="w-5 h-5 lg:w-6 lg:h-6 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[20px] sm:text-[24px] lg:text-[32px] leading-[1.1] font-mono tracking-tight text-foreground break-all">
                {kit}
              </h1>
              <Badge className="bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0] hover:bg-[#dde9f7] uppercase tracking-widest text-[10px] font-semibold">
                Tototheo
              </Badge>
            </div>
            <p className="text-sm lg:text-base text-muted-foreground mt-1 truncate">
              {detailLoading ? (
                <Skeleton className="h-4 w-48 inline-block align-middle" />
              ) : (
                displayName
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Live status */}
      <Card className="border border-border bg-card shadow-none rounded-xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-normal tracking-tight">Canlı Durum</CardTitle>
              <CardDescription className="mt-1 text-sm">
                Tototheo portalından son alınan telemetri.
              </CardDescription>
            </div>
            {!detailLoading && (
              <Badge
                className={
                  detail?.isOnline
                    ? "bg-[#9fc9a2]/30 text-foreground border-[#9fc9a2]"
                    : "bg-[#dfa88f]/30 text-foreground border-[#dfa88f]"
                }
              >
                {detail?.isOnline ? (
                  <>
                    <Wifi className="w-3 h-3 mr-1" /> Çevrimiçi
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 mr-1" /> Çevrimdışı
                  </>
                )}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {detailLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <Stat
                label="Sinyal"
                value={
                  detail?.signalQuality != null ? `${detail.signalQuality}%` : "—"
                }
                icon={<Gauge className="w-3.5 h-3.5" />}
              />
              <Stat
                label="Gecikme"
                value={
                  detail?.latency != null ? `${detail.latency} ms` : "—"
                }
                icon={<Activity className="w-3.5 h-3.5" />}
              />
              <Stat
                label="İndirme"
                value={
                  detail?.downloadSpeed != null
                    ? `${formatNumber(detail.downloadSpeed, 1)} Mbps`
                    : "—"
                }
              />
              <Stat
                label="Yükleme"
                value={
                  detail?.uploadSpeed != null
                    ? `${formatNumber(detail.uploadSpeed, 1)} Mbps`
                    : "—"
                }
              />
              <Stat
                label="Engellenme"
                value={
                  detail?.obstruction != null
                    ? `${formatNumber(detail.obstruction * 100, 1)}%`
                    : "—"
                }
              />
              <Stat
                label="Aktif Uyarı"
                value={String(detail?.activeAlertsCount ?? 0)}
                icon={
                  (detail?.activeAlertsCount ?? 0) > 0 ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-[#dfa88f]" />
                  ) : undefined
                }
              />
              <Stat
                label="Konum"
                value={
                  detail?.lat != null && detail?.lng != null
                    ? `${detail.lat.toFixed(2)}, ${detail.lng.toFixed(2)}`
                    : "—"
                }
                icon={<MapPin className="w-3.5 h-3.5" />}
              />
              <Stat
                label="Son Görülme"
                value={detail?.lastSeenAt ? formatDate(detail.lastSeenAt) : "—"}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Period KPIs */}
      <div className="grid gap-3 sm:gap-6 grid-cols-2 xl:grid-cols-3">
        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Aktif Dönem
            </CardTitle>
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <Skeleton className="h-9 w-24 rounded" />
            ) : (
              <div className="text-2xl font-normal tracking-tight text-foreground font-mono">
                {periodLabel}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Dönem Veri (Toplam)
            </CardTitle>
            <HardDrive className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <Skeleton className="h-9 w-32 rounded" />
            ) : (
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-normal tracking-tight text-foreground font-mono">
                  {formatNumber(detail?.currentPeriodTotalGb, 2)}
                </div>
                <span className="text-sm font-medium text-muted-foreground">GB</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Son Senkronizasyon
            </CardTitle>
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <Skeleton className="h-9 w-32 rounded" />
            ) : (
              <div className="text-sm font-mono text-foreground leading-snug">
                {detail?.updatedAt ? formatDate(detail.updatedAt) : "-"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily breakdown */}
      <Card className="border border-border bg-card shadow-none rounded-xl">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div>
              <CardTitle className="text-lg font-normal tracking-tight">Günlük Tüketim</CardTitle>
              <CardDescription className="mt-1 text-sm">
                {periodLabel} dönemi içinde gün gün veri tüketimi (GB) — kümülatif sayaç
                farkından hesaplanır.
              </CardDescription>
            </div>
            {periodOptions.length > 0 && (
              <Select
                value={activePeriod ?? undefined}
                onValueChange={(v) => setSelectedPeriod(v)}
              >
                <SelectTrigger className="w-full sm:w-[160px] h-9 rounded-lg border-border shadow-none font-mono text-[12px] shrink-0">
                  <SelectValue placeholder="Dönem seç" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((p) => (
                    <SelectItem key={p} value={p} className="font-mono text-[12px]">
                      {formatPeriodLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {dailyLoading ? (
            <Skeleton className="h-56 w-full rounded-lg" />
          ) : chartData.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              Bu dönem için günlük okuma yok.
            </div>
          ) : (
            <div className="h-56 w-full -mx-2 sm:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e6e5e0" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke="#a8a79e"
                    tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e6e5e0" }}
                  />
                  <YAxis
                    stroke="#9fbbe0"
                    tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fffefb",
                      border: "1px solid #e6e5e0",
                      borderRadius: 8,
                      fontFamily: "Inter, sans-serif",
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [`${formatNumber(value, 2)} GB`, "Veri"]}
                  />
                  <Bar dataKey="gib" fill="#9fbbe0" radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly summary */}
      <Card className="border border-border bg-card shadow-none rounded-xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-normal tracking-tight">Aylık Özet</CardTitle>
              <CardDescription className="mt-1 text-sm">
                Tototheo "poolPlanMonthlyUsage" verisinden — her dönem için toplam.
              </CardDescription>
            </div>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {monthlyLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : !monthly || monthly.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              Henüz aylık veri yok.
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-x-auto">
              <Table className="w-full text-[13px] min-w-[560px]">
                <Header className="bg-secondary/40">
                  <Row className="hover:bg-transparent border-none">
                    <Head className="pl-3 sm:pl-6 font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                      Dönem
                    </Head>
                    <Head className="text-right font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                      Toplam GB
                    </Head>
                    <Head className="text-right font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10 hidden sm:table-cell">
                      Paket
                    </Head>
                    <Head className="text-right font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10 hidden sm:table-cell">
                      Öncelik
                    </Head>
                    <Head className="text-right font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10 hidden sm:table-cell">
                      Aşım
                    </Head>
                    <Head className="text-right pr-3 sm:pr-6 font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10 hidden sm:table-cell">
                      Tarama
                    </Head>
                  </Row>
                </Header>
                <Body className="divide-y divide-border">
                  {monthly.map((row) => (
                    <Row
                      key={row.period}
                      className="border-none h-11 hover:bg-secondary/30 cursor-pointer"
                      onClick={() => setSelectedPeriod(row.period)}
                    >
                      <Cell className="pl-3 sm:pl-6 font-mono text-[11px] sm:text-[12px] text-foreground whitespace-nowrap">
                        {formatPeriodLabel(row.period)}
                      </Cell>
                      <Cell className="text-right font-mono text-[11px] sm:text-[12px] text-foreground whitespace-nowrap">
                        {formatNumber(row.totalGb, 2)}
                      </Cell>
                      <Cell className="text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {formatNumber(row.packageUsageGb, 2)}
                      </Cell>
                      <Cell className="text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {formatNumber(row.priorityGb, 2)}
                      </Cell>
                      <Cell className="text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {formatNumber(row.overageGb, 2)}
                      </Cell>
                      <Cell className="text-right pr-3 sm:pr-6 font-mono text-[11px] text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {row.scrapedAt ? formatDate(row.scrapedAt) : "-"}
                      </Cell>
                    </Row>
                  ))}
                </Body>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-mono text-[13px] text-foreground truncate">{value}</div>
    </div>
  );
}
