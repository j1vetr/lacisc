import React, { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  useGetKitDetail,
  getGetKitDetailQueryKey,
  useGetKitDaily,
  getGetKitDailyQueryKey,
  useGetKitMonthly,
  getGetKitMonthlyQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Terminal,
  HardDrive,
  DollarSign,
  CalendarClock,
  CheckCircle2,
  Activity,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";
import { useDocumentTitle } from "@/hooks/use-document-title";

function formatPeriodLabel(period?: string | null) {
  if (!period) return "-";
  // YYYYMM -> "MM/YYYY"
  if (/^\d{6}$/.test(period)) {
    return `${period.slice(4, 6)}/${period.slice(0, 4)}`;
  }
  return period;
}

function formatDay(snapshotDate: string) {
  // YYYY-MM-DD -> DD.MM
  if (/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    return `${snapshotDate.slice(8, 10)}.${snapshotDate.slice(5, 7)}`;
  }
  return snapshotDate;
}

export default function KitDetail() {
  const [, params] = useRoute("/kits/:kitNo");
  const rawKitNo = params?.kitNo ?? "";
  const kitNo = decodeURIComponent(rawKitNo);
  useDocumentTitle(kitNo);

  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined);

  const { data: detail, isLoading: detailLoading } = useGetKitDetail(kitNo, {
    query: { queryKey: getGetKitDetailQueryKey(kitNo), enabled: Boolean(kitNo) },
  });
  const { data: monthly, isLoading: monthlyLoading } = useGetKitMonthly(kitNo, {
    query: { queryKey: getGetKitMonthlyQueryKey(kitNo), enabled: Boolean(kitNo) },
  });

  const dailyParams = selectedPeriod ? { period: selectedPeriod } : {};
  const { data: daily, isLoading: dailyLoading } = useGetKitDaily(
    kitNo,
    dailyParams,
    {
      query: {
        queryKey: getGetKitDailyQueryKey(kitNo, dailyParams),
        enabled: Boolean(kitNo),
      },
    }
  );

  const activePeriod = selectedPeriod ?? detail?.currentPeriod ?? null;

  const dailyWithDeltas = useMemo(() => {
    if (!daily) return [];
    return daily.map((row, i) => {
      const prev = i > 0 ? daily[i - 1] : null;
      const deltaGb =
        row.totalGb != null && prev?.totalGb != null ? row.totalGb - prev.totalGb : null;
      const deltaPrice =
        row.totalPrice != null && prev?.totalPrice != null
          ? row.totalPrice - prev.totalPrice
          : null;
      return { ...row, deltaGb, deltaPrice };
    });
  }, [daily]);

  const chartData = useMemo(
    () =>
      (daily ?? []).map((p) => ({
        day: formatDay(p.snapshotDate),
        gb: p.totalGb ?? 0,
        price: p.totalPrice ?? 0,
      })),
    [daily]
  );

  const currency = detail?.currency || "USD";
  const periodLabel = formatPeriodLabel(activePeriod);

  // Period options: union of monthly periods + currentPeriod, sorted desc.
  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    if (detail?.currentPeriod) set.add(detail.currentPeriod);
    (monthly ?? []).forEach((m) => m.period && set.add(m.period));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [monthly, detail?.currentPeriod]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link href="/kits">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors w-fit">
            <ArrowLeft className="w-3.5 h-3.5" />
            Tüm terminaller
          </div>
        </Link>
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-card border border-border shrink-0">
            <Terminal className="w-6 h-6 text-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[32px] leading-[1.1] font-mono tracking-tight text-foreground truncate">
              {kitNo}
            </h1>
            <p className="text-base text-muted-foreground mt-1 truncate">
              {detailLoading ? (
                <Skeleton className="h-4 w-48 inline-block align-middle" />
              ) : (
                detail?.shipName || "Gemi adı henüz alınmadı"
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
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
              Dönem Veri
            </CardTitle>
            <HardDrive className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <Skeleton className="h-9 w-32 rounded" />
            ) : (
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-normal tracking-tight text-foreground font-mono">
                  {formatNumber(detail?.totalGb, 2)}
                </div>
                <span className="text-sm font-medium text-muted-foreground">GB</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Dönem Tutarı
            </CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <Skeleton className="h-9 w-36 rounded" />
            ) : (
              <div className="text-2xl font-normal tracking-tight text-foreground font-mono">
                {formatCurrency(detail?.totalPrice, currency)}
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
                {detail?.lastSyncedAt ? formatDate(detail.lastSyncedAt) : "-"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily trend */}
      <Card className="border border-border bg-card shadow-none rounded-xl">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-normal tracking-tight">Günlük Seyir</CardTitle>
              <CardDescription className="mt-1 text-sm">
                {periodLabel} dönemi içerisinde gün sonu toplamları (her gün için en son senkronizasyon değeri).
              </CardDescription>
            </div>
            {periodOptions.length > 0 && (
              <Select
                value={activePeriod ?? undefined}
                onValueChange={(v) => setSelectedPeriod(v)}
              >
                <SelectTrigger className="w-[160px] h-9 rounded-lg border-border shadow-none font-mono text-[12px] shrink-0">
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
              Bu dönem için henüz günlük snapshot verisi yok. Bir senkronizasyon çalıştığında ilk veri yazılacak.
            </div>
          ) : (
            <>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e6e5e0" strokeDasharray="2 4" vertical={false} />
                    <XAxis
                      dataKey="day"
                      stroke="#a8a79e"
                      tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                      tickLine={false}
                      axisLine={{ stroke: "#e6e5e0" }}
                    />
                    <YAxis
                      yAxisId="gb"
                      stroke="#9fbbe0"
                      tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="price"
                      orientation="right"
                      stroke="#dfa88f"
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
                      formatter={(value: number, name: string) => {
                        if (name === "gb") return [`${formatNumber(value, 2)} GB`, "Veri"];
                        if (name === "price") return [formatCurrency(value, currency), "Tutar"];
                        return [value, name];
                      }}
                    />
                    <Line
                      yAxisId="gb"
                      type="monotone"
                      dataKey="gb"
                      stroke="#9fbbe0"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#9fbbe0" }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      yAxisId="price"
                      type="monotone"
                      dataKey="price"
                      stroke="#dfa88f"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#dfa88f" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <Table className="w-full text-[13px]">
                  <Header className="bg-secondary/40">
                    <Row className="hover:bg-transparent border-none">
                      <Head className="pl-6 font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                        Tarih
                      </Head>
                      <Head className="text-right font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                        Toplam GB
                      </Head>
                      <Head className="text-right font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                        Δ GB
                      </Head>
                      <Head className="text-right font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                        Toplam Tutar
                      </Head>
                      <Head className="text-right pr-6 font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                        Δ Tutar
                      </Head>
                    </Row>
                  </Header>
                  <Body className="divide-y divide-border">
                    {dailyWithDeltas.map((row) => (
                      <Row key={row.snapshotDate} className="border-none h-11 hover:bg-secondary/30">
                        <Cell className="pl-6 font-mono text-[12px] text-foreground">
                          {row.snapshotDate}
                        </Cell>
                        <Cell className="text-right font-mono text-[12px] text-foreground">
                          {formatNumber(row.totalGb, 2)}
                        </Cell>
                        <Cell className="text-right font-mono text-[11px]">
                          {row.deltaGb == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : row.deltaGb > 0 ? (
                            <span className="text-foreground">+{formatNumber(row.deltaGb, 2)}</span>
                          ) : (
                            <span className="text-muted-foreground">
                              {formatNumber(row.deltaGb, 2)}
                            </span>
                          )}
                        </Cell>
                        <Cell className="text-right font-mono text-[12px] text-foreground">
                          {formatCurrency(row.totalPrice, row.currency || currency)}
                        </Cell>
                        <Cell className="text-right pr-6 font-mono text-[11px]">
                          {row.deltaPrice == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : row.deltaPrice > 0 ? (
                            <span className="text-foreground">
                              +{formatCurrency(row.deltaPrice, row.currency || currency)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {formatCurrency(row.deltaPrice, row.currency || currency)}
                            </span>
                          )}
                        </Cell>
                      </Row>
                    ))}
                  </Body>
                </Table>
              </div>
            </>
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
                Her dönem için kaydedilen son snapshot.
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
            <div className="rounded-xl border border-border overflow-hidden">
              <Table className="w-full text-[13px]">
                <Header className="bg-secondary/40">
                  <Row className="hover:bg-transparent border-none">
                    <Head className="pl-6 font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                      Dönem
                    </Head>
                    <Head className="text-right font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                      Toplam GB
                    </Head>
                    <Head className="text-right font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                      Toplam Tutar
                    </Head>
                    <Head className="text-right pr-6 font-semibold uppercase tracking-widest text-[10px] text-muted-foreground h-10">
                      Son Snapshot
                    </Head>
                  </Row>
                </Header>
                <Body className="divide-y divide-border">
                  {monthly.map((row) => (
                    <Row key={row.period} className="border-none h-11 hover:bg-secondary/30">
                      <Cell className="pl-6 font-mono text-[12px] text-foreground">
                        {formatPeriodLabel(row.period)}
                      </Cell>
                      <Cell className="text-right font-mono text-[12px] text-foreground">
                        {formatNumber(row.totalGb, 2)}
                      </Cell>
                      <Cell className="text-right font-mono text-[12px] text-foreground">
                        {formatCurrency(row.totalPrice, row.currency || currency)}
                      </Cell>
                      <Cell className="text-right pr-6 font-mono text-[11px] text-muted-foreground">
                        {row.lastSnapshotDate || "-"}
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
