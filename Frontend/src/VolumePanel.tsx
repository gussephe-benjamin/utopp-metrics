import type { ChartConfiguration } from "chart.js"
import { Chart, COLORS, reduceMotion, tooltipStyle } from "./Chart"
import type { Granularity, MetricBlock } from "./api"
import { Icon } from "./Sidebar"

const LIMA = "America/Lima"
const int = new Intl.NumberFormat("es-PE")

function bucketLabel(iso: string, granularity: Granularity) {
  const d = new Date(iso)
  if (granularity === "month")
    return d.toLocaleDateString("es-PE", { month: "short", year: "2-digit", timeZone: LIMA })
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: LIMA })
}

function barsConfig(block: MetricBlock, granularity: Granularity, unit: string): ChartConfiguration {
  const s = block.series
  const last = s.length - 1
  return {
    type: "bar",
    data: {
      labels: s.map((p) => bucketLabel(p.start, granularity)),
      datasets: [
        {
          data: s.map((p) => p.numerator),
          // El bucket en curso va en turquesa: aún no está cerrado.
          backgroundColor: s.map((_p, i) => (i === last ? COLORS.pulse : COLORS.registroSoft)),
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.6,
          categoryPercentage: 0.72,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 700 },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle,
          displayColors: false,
          callbacks: { label: (item) => `${int.format(item.parsed.y)} ${unit}` },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: COLORS.tick, font: { size: 10.5 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
        },
        y: {
          beginAtZero: true,
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.tick, font: { size: 10.5 }, precision: 0 },
        },
      },
    },
  }
}

/** Bloque de volumen: una cuenta, no una tasa. El delta va en unidades, no en pp. */
export function VolumePanel({
  title,
  subtitle,
  unit,
  current,
  previous,
  previousLabel,
  history,
  granularity,
  monthLabel,
  footnote,
}: {
  title: string
  subtitle: string
  unit: string
  current: MetricBlock
  previous: MetricBlock | null
  previousLabel: string | null
  history: MetricBlock
  granularity: Granularity
  monthLabel: string
  footnote: string
}) {
  const value = current.range.value ?? 0
  const prev = previous?.range.value ?? null
  const diff = prev == null ? null : value - prev
  const flat = diff != null && Math.abs(diff) < 1
  const cls = diff == null || flat ? "delta-flat" : diff > 0 ? "delta-up" : "delta-down"
  const icono = diff == null ? null : flat ? "trend-flat" : diff > 0 ? "trend-up" : "trend-down"
  const chipText =
    diff == null
      ? "Sin mes previo"
      : flat
        ? "sin cambio"
        : `${int.format(Math.abs(Math.round(diff)))} ${unit}`

  return (
    <section className="panel metric-section">
      <div className="section-title">
        <div>
          <div className="metric-eyebrow">Volumen</div>
          <h2 className="metric-name">{title}</h2>
          <div className="sub">{subtitle}</div>
        </div>
      </div>

      <div className="volume-readout">
        <div className="volume-value">{int.format(Math.round(value))}</div>
        <div className="readout-side">
          <div className={`delta-chip ${cls}`}>
            {icono ? <Icon name={icono} size={14} /> : null} {chipText}
          </div>
          <div className="delta-caption">
            {previousLabel
              ? `${monthLabel} vs ${previousLabel} (${int.format(Math.round(prev ?? 0))})`
              : monthLabel}
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-block">
          <div className="chart-head">
            <span className="t">Por {granularity === "month" ? "mes" : "semana"}</span>
          </div>
          {history.series.length ? (
            <Chart config={barsConfig(history, granularity, unit)} />
          ) : (
            <div className="chart-wrap">
              <div className="chart-empty">Sin registros en los periodos seleccionados.</div>
            </div>
          )}
        </div>
      </div>

      <p className="foot-note">{footnote}</p>
    </section>
  )
}
