import * as React from "react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/components/ue/motion";

/**
 * Redesign 27.07.2026 — kleines UI-Set aus Leons Entwurf.
 *
 * Bewusst nur Bausteine, die im Entwurf mehrfach vorkommen. Farben kommen
 * ausschliesslich aus den Tokens in index.css; kein hex im Markup.
 */

/* ------------------------------------------------------------------ Dot */
export type DotTone = "emerald" | "amber" | "danger" | "muted";

const DOT_TONE: Record<DotTone, string> = {
  emerald: "bg-primary",
  amber: "bg-amber",
  danger: "bg-danger",
  muted: "bg-tx-weak",
};

export function Dot({
  tone = "emerald",
  pulse = false,
  className,
}: {
  tone?: DotTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "ue-dot",
        DOT_TONE[tone],
        pulse && (tone === "amber" ? "animate-dot-pulse-amber" : "animate-dot-pulse"),
        className,
      )}
    />
  );
}

/* ----------------------------------------------------------- PageHeader */
export function PageHeader({
  kicker,
  title,
  accent,
  subtitle,
  actions,
  className,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  /** Serif-Akzent am Ende der Zeile — sparsam einsetzen (Login + Heute). */
  accent?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 animate-fade-up", className)}>
      <div className="min-w-0">
        {kicker ? <p className="ue-kicker mb-2">{kicker}</p> : null}
        <h1 className="text-[26px] leading-[1.12] font-semibold tracking-[-0.02em] text-foreground">
          {title}
          {accent ? <> <span className="ue-serif text-[28px]">{accent}</span></> : null}
        </h1>
        {subtitle ? (
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------ StatCard */
export function StatCard({
  label,
  value,
  suffix,
  hint,
  tone = "emerald",
  glow = false,
  decimals = 0,
  className,
  onClick,
}: {
  label: React.ReactNode;
  /** null/undefined = Server hat (noch) nichts geliefert → "–" statt 0. */
  value: number | null | undefined;
  suffix?: string;
  hint?: React.ReactNode;
  tone?: DotTone;
  /** Atmender Emerald-Schein hinter der Zahl (nur fuer die Leitkennzahl). */
  glow?: boolean;
  decimals?: number;
  className?: string;
  onClick?: () => void;
}) {
  const shown = useCountUp(value);
  const isMissing = shown === null;
  const text = isMissing
    ? "–"
    : shown.toLocaleString("de-DE", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  const Wrapper: React.ElementType = onClick ? "button" : "div";

  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "ue-card-raised relative overflow-hidden px-4 py-3.5 text-left",
        onClick && "transition-colors hover:border-primary/40",
        className,
      )}
    >
      {glow && !isMissing ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-4 -top-6 h-24 w-24 rounded-full bg-primary/20 blur-2xl animate-breathe"
        />
      ) : null}
      <p className="relative ue-kicker">{label}</p>
      <p
        className={cn(
          "relative mt-2 text-[30px] leading-none font-semibold tabular tracking-[-0.02em]",
          isMissing ? "text-tx-weak" : "text-foreground",
        )}
      >
        {text}
        {suffix && !isMissing ? (
          <span className="ml-1 text-base font-medium text-muted-foreground">{suffix}</span>
        ) : null}
      </p>
      {hint ? (
        <p className="relative mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Dot tone={tone} className="!w-1.5 !h-1.5" />
          {hint}
        </p>
      ) : null}
    </Wrapper>
  );
}

/* ---------------------------------------------------------- SectionCard */
export function SectionCard({
  title,
  kicker,
  action,
  children,
  className,
  bodyClassName,
  live = false,
}: {
  title?: React.ReactNode;
  kicker?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Zeigt einen pulsierenden Live-Punkt neben dem Titel. */
  live?: boolean;
}) {
  return (
    <section className={cn("glass-card animate-fade-up", className)}>
      {(title || action || kicker) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line-soft">
          <div className="min-w-0">
            {kicker ? <p className="ue-kicker mb-1">{kicker}</p> : null}
            {title ? (
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground truncate">
                {live ? <Dot pulse /> : null}
                {title}
              </h2>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ----------------------------------------------------------------- Chip */
export function Chip({
  active = false,
  count,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  count?: number;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-emerald-surface bg-emerald-surface/70 text-emerald-light"
          : "border-border bg-muted text-muted-foreground hover:text-foreground hover:border-primary/35",
        className,
      )}
    >
      {children}
      {typeof count === "number" ? (
        <span className={cn("tabular text-[11px]", active ? "text-emerald-light/80" : "text-tx-weak")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

/* ----------------------------------------------------------- EmptyState */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-10 text-center", className)}>
      {icon ? <div className="text-tx-weak mb-1">{icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-[12.5px] text-muted-foreground leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------- ProgressRing */
export function ProgressRing({
  /** 0…1 */
  value,
  size = 92,
  stroke = 7,
  label,
  sublabel,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--line-soft))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--emerald))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        {label ? <span className="text-[15px] font-semibold tabular">{label}</span> : null}
        {sublabel ? <span className="text-[10px] text-tx-weak">{sublabel}</span> : null}
      </div>
    </div>
  );
}
