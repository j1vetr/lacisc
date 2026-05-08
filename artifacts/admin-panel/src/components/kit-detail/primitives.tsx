import * as React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card ${className}`}>
      {children}
    </div>
  );
}

export type PillTone = "neutral" | "ok" | "warn" | "info";

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: PillTone;
}) {
  const tones: Record<PillTone, string> = {
    neutral: "bg-secondary text-muted-foreground border-border",
    ok: "bg-[#9fc9a2]/30 text-foreground border-[#9fc9a2]",
    warn: "bg-[#dfa88f]/30 text-foreground border-[#dfa88f]",
    info: "bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-widest border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export type QuotaStatTone = "primary" | "ok" | "warn" | "muted";

export function QuotaStat({
  label,
  value,
  unit,
  tone = "muted",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: QuotaStatTone;
}) {
  const valueClass: Record<QuotaStatTone, string> = {
    primary: "text-foreground",
    ok: "text-[#5fa67c]",
    warn: "text-[#f54e00]",
    muted: "text-muted-foreground",
  };
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3.5 min-w-0 overflow-hidden">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5 truncate">
        {label}
      </div>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className={`font-mono text-xl sm:text-2xl tabular-nums truncate min-w-0 ${valueClass[tone]}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

export type MetricTileTone = "neutral" | "ok" | "warn" | "info";

export function MetricTile({
  label,
  value,
  unit,
  icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon?: React.ReactNode;
  tone?: MetricTileTone;
  hint?: React.ReactNode;
}) {
  const accents: Record<MetricTileTone, string> = {
    neutral: "border-l-border",
    ok: "border-l-[#9fc9a2]",
    warn: "border-l-[#dfa88f]",
    info: "border-l-[#9fbbe0]",
  };
  return (
    <div
      className={`rounded-lg border border-border border-l-2 ${accents[tone]} bg-card px-3 py-2.5 min-w-0 overflow-hidden`}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
        <span className="flex items-center gap-1 min-w-0 truncate">
          {icon}
          <span className="truncate">{label}</span>
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1 min-w-0">
        <span className="font-mono text-base text-foreground truncate min-w-0">{value}</span>
        {unit && <span className="text-[11px] text-muted-foreground shrink-0">{unit}</span>}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] font-mono text-muted-foreground truncate">
          {hint}
        </div>
      )}
    </div>
  );
}
