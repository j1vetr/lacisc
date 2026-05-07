import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface State {
  error: Error | null;
}

// Top-level boundary: keeps a render error from blanking the whole app and
// reports the failure to the server log via POST /api/client-errors so it
// shows up in pino output / alerting alongside server-side errors.
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught", error, info);
    // Fire-and-forget — never block recovery on the report itself.
    try {
      const csrf = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrf_token="))
        ?.split("=")[1];
      void fetch("/api/client-errors", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      }).catch(() => undefined);
    } catch {
      // Reporting failure must never break the boundary.
    }
  }

  private handleReset = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-lg font-semibold tracking-tight">Beklenmeyen bir hata oluştu</h1>
          <p className="text-sm text-muted-foreground">
            Sayfa yüklenirken bir sorunla karşılaştık. Sayfayı yeniden yükleyebilir veya panele dönebilirsiniz.
          </p>
          <pre className="text-[11px] font-mono text-left bg-secondary/50 border border-border rounded-md p-3 overflow-auto max-h-40 text-muted-foreground">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2 justify-center pt-2">
            <Button onClick={this.handleReset}>Sayfayı Yenile</Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Panele Dön
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
