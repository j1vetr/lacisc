import { useState } from "react";
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

function fmt(dt: string | null | undefined): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("tr-TR");
}

export default function AuditLogs() {
  useDocumentTitle("Denetim Kayıtları");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string>("__all__");

  const params = {
    page,
    limit: 50,
    ...(action !== "__all__" ? { action } : {}),
  };
  const { data, isLoading } = useListAuditLogs(params, {
    query: { queryKey: getListAuditLogsQueryKey(params) },
  });

  const logs = data?.logs ?? [];
  const totalPages = data?.totalPages ?? 1;
  const actions = data?.actions ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Denetim Kayıtları</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sistem üzerinde gerçekleştirilen tüm önemli işlemlerin kaydı.
        </p>
      </div>

      <Card className="shadow-none border-border">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base font-medium">
            {data ? `${data.total} kayıt` : "Yükleniyor…"}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={action}
              onValueChange={(v) => {
                setAction(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Tüm eylemler" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tüm eylemler</SelectItem>
                {actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Yükleniyor…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground tracking-widest">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-medium">Zaman</th>
                    <th className="text-left py-2 font-medium">Aktör</th>
                    <th className="text-left py-2 font-medium">Eylem</th>
                    <th className="text-left py-2 font-medium">Hedef</th>
                    <th className="text-left py-2 font-medium">IP</th>
                    <th className="text-left py-2 font-medium">Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 align-top">
                      <td className="py-2 font-mono text-[11px] whitespace-nowrap">{fmt(l.createdAt)}</td>
                      <td className="py-2">
                        <div className="text-xs">{l.actorName ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {l.actorEmail ?? "anonim"}
                        </div>
                      </td>
                      <td className="py-2 font-mono text-xs">{l.action}</td>
                      <td className="py-2 font-mono text-xs">{l.target ?? "—"}</td>
                      <td className="py-2 font-mono text-[11px]">{l.ip ?? "—"}</td>
                      <td className="py-2">
                        {l.success ? (
                          <Badge variant="outline" className="text-xs">başarılı</Badge>
                        ) : (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                            başarısız
                          </Badge>
                        )}
                        {l.meta != null && (
                          <details className="mt-1">
                            <summary className="text-[10px] text-muted-foreground cursor-pointer">
                              detay
                            </summary>
                            <pre className="text-[10px] font-mono mt-1 max-w-md whitespace-pre-wrap break-all bg-secondary/40 p-2 rounded">
                              {JSON.stringify(l.meta, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Kayıt bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
            <div className="text-xs text-muted-foreground font-mono">
              Sayfa {page} / {totalPages}
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
