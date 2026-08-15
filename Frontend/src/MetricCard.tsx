import { useState } from "react"
import type { MetricBlock, SeriesPoint } from "./api"

function formatValue(block: MetricBlock) {
  const v = block.range.value
  if (v == null) return "—"
  if (block.kind === "rate") return `${(v * 100).toFixed(1)}%`
  return Math.round(v).toLocaleString("es-PE")
}

function formatPoint(block: MetricBlock, p: SeriesPoint) {
  if (block.kind === "rate") {
    const pct = p.denominator ? ((p.numerator / p.denominator) * 100).toFixed(1) : "—"
    return `${p.numerator} / ${p.denominator} · ${pct}%`
  }
  return `${Math.round(p.numerator)}`
}

function shortLabel(iso: string, granularity: string) {
  const d = new Date(iso)
  if (granularity === "year") return String(d.getFullYear())
  if (granularity === "month")
    return d.toLocaleDateString("es-PE", { month: "short" })
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short" })
}

export function MetricCard({
  title,
  unit,
  block,
  granularity,
}: {
  title: string
  unit?: string
  block: MetricBlock
  granularity: string
}) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
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
          <div className="big">
            {formatValue(block)}
            {block.kind === "count" && unit ? (
              <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}> {unit}</span>
            ) : null}
          </div>
          <div
            className={
              delta == null ? "muted" : delta >= 0 ? "delta up" : "delta down"
            }
          >
            {delta == null
              ? "Sin periodo previo"
              : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs rango anterior`}
          </div>
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
                        text: `${shortLabel(p.start, granularity)} · ${formatPoint(block, p)}`,
                      })
                    }}
                    onMouseLeave={() => setTip(null)}
                  />
                  <span className="bar-label">{shortLabel(p.start, granularity)}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
      {tip ? (
        <div className="tooltip" style={{ left: tip.x, top: tip.y, position: "fixed" }}>
          {tip.text}
        </div>
      ) : null}
    </article>
  )
}
