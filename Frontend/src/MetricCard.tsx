import { useState } from "react"
import type { MetricBlock, SeriesPoint } from "./api"

function formatValue(block: MetricBlock) {
  const v = block.range.value
  if (v == null) return "—"
  if (block.kind === "rate") return `${(v * 100).toFixed(1)}%`
  return Math.round(v).toLocaleString("es-PE")
}

function formatRange(startIso: string, endIso: string, granularity: string) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const opts: Intl.DateTimeFormatOptions =
    granularity === "year"
      ? { year: "numeric" }
      : granularity === "month"
        ? { month: "short", year: "numeric" }
        : { day: "numeric", month: "short", year: "numeric" }
  return `${start.toLocaleDateString("es-PE", opts)} → ${end.toLocaleDateString("es-PE", opts)}`
}

function shortLabel(iso: string, granularity: string) {
  const d = new Date(iso)
  if (granularity === "year") return String(d.getFullYear())
  if (granularity === "month")
    return d.toLocaleDateString("es-PE", { month: "short" })
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short" })
}

function rateText(p: SeriesPoint) {
  if (!p.denominator) return "Sin denominador"
  return `${((p.numerator / p.denominator) * 100).toFixed(1)}%`
}

export function MetricCard({
  title,
  block,
  granularity,
  numeratorLabel,
  denominatorLabel,
  showSeries = true,
}: {
  title: string
  block: MetricBlock
  granularity: string
  numeratorLabel: string
  denominatorLabel: string
  showSeries?: boolean
}) {
  const [tip, setTip] = useState<{
    x: number
    y: number
    point: SeriesPoint
  } | null>(null)
  const max = Math.max(
    0.0001,
    ...block.series.map((s) =>
      block.kind === "rate" ? (s.denominator ? s.numerator / s.denominator : 0) : s.numerator,
    ),
  )
  const delta = block.range.delta_pct

  return (
    <article className="card">
      <h2>{title}</h2>
      {!block.available ? (
        <p className="unavail">Sin instrumentar aún (faltan vistas de detalle).</p>
      ) : (
        <>
          <div className="big">{formatValue(block)}</div>
          {showSeries ? (
            <div
              className={
                delta == null ? "muted" : delta >= 0 ? "delta up" : "delta down"
              }
            >
              {delta == null
                ? "Sin periodo previo"
                : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs rango anterior`}
            </div>
          ) : (
            <p className="muted">Desde el primer evento hasta ahora</p>
          )}
          {showSeries && block.series.length ? (
            <div className="bars">
              {block.series.map((p) => {
                const raw =
                  block.kind === "rate"
                    ? p.denominator
                      ? p.numerator / p.denominator
                      : 0
                    : p.numerator
                const h = Math.max(6, (raw / max) * 100)
                return (
                  <div className="bar-col" key={p.start}>
                    <div
                      className={raw ? "bar" : "bar empty"}
                      style={{ height: `${h}%` }}
                      onMouseEnter={(e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setTip({
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                          point: p,
                        })
                      }}
                      onMouseLeave={() => setTip(null)}
                    />
                    <span className="bar-label">{shortLabel(p.start, granularity)}</span>
                  </div>
                )
              })}
            </div>
          ) : null}
        </>
      )}
      {tip ? (
        <div className="tooltip" style={{ left: tip.x, top: tip.y, position: "fixed" }}>
          <div className="tooltip-title">{title}</div>
          <div>{formatRange(tip.point.start, tip.point.end, granularity)}</div>
          <div>
            {numeratorLabel}: {Math.round(tip.point.numerator).toLocaleString("es-PE")}
          </div>
          <div>
            {denominatorLabel}: {Math.round(tip.point.denominator).toLocaleString("es-PE")}
          </div>
          <div className="tooltip-pct">{rateText(tip.point)}</div>
        </div>
      ) : null}
    </article>
  )
}
