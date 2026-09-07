import type { ChartConfiguration } from "chart.js"
import { Chart, COLORS, areaFill, reduceMotion, tooltipStyle } from "./Chart"
import type { Granularity, MetricBlock } from "./api"
import { Icon } from "./Sidebar"

const LIMA = "America/Lima"
const int = new Intl.NumberFormat("es-PE")

export function pct(value: number | null, digits = 1) {
  if (value == null) return "—"
  return `${(value * 100).toFixed(digits)}%`
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: LIMA })
}

function bucketLabel(iso: string, granularity: Granularity) {
  const d = new Date(iso)
  if (granularity === "month")
    return d.toLocaleDateString("es-PE", { month: "short", year: "2-digit", timeZone: LIMA })
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: LIMA })
}

/** Diferencia en puntos porcentuales: la lectura honesta entre dos tasas. */
function deltaPoints(current: number | null, previous: number | null) {
  if (current == null || previous == null) return null
  return (current - previous) * 100
}

function DeltaChip({ points, caption }: { points: number | null; caption: string }) {
  if (points == null) {
    return (
      <>
        <div className="delta-chip delta-flat">Sin referencia previa</div>
        <div className="delta-caption">{caption}</div>
      </>
    )
  }
  const flat = Math.abs(points) < 0.05
  const cls = flat ? "delta-flat" : points > 0 ? "delta-up" : "delta-down"
  const icono = flat ? "trend-flat" : points > 0 ? "trend-up" : "trend-down"
  const text = flat ? "sin cambio" : `${Math.abs(points).toFixed(1)} pp`
  return (
    <>
      <div className={`delta-chip ${cls}`}>
        <Icon name={icono} size={14} /> {text}
      </div>
      <div className="delta-caption">{caption}</div>
    </>
  )
}

function hasData(points: { numerator: number; denominator: number }[]) {
  return points.some((p) => p.denominator > 0 || p.numerator > 0)
}

/** Acumulado diario del mes en curso. */
function trendConfig(block: MetricBlock, numLabel: string, denLabel: string): ChartConfiguration {
  const points = block.trend
  return {
    type: "line",
    data: {
      labels: points.map((p) => dayLabel(p.date)),
      datasets: [
        {
          data: points.map((p) => (p.value == null ? null : p.value * 100)),
          borderColor: COLORS.pulse,
          borderWidth: 2.5,
          pointRadius: (c: { dataIndex: number }) => (c.dataIndex === points.length - 1 ? 5 : 0),
          pointHoverRadius: 5,
          pointBackgroundColor: COLORS.pulse,
          pointBorderColor: "#0b1018",
          pointBorderWidth: 2,
          tension: 0.35,
          fill: true,
          backgroundColor: areaFill(COLORS.pulseFill),
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 900, easing: "easeOutCubic" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle,
          displayColors: false,
          callbacks: {
            label: (item) => {
              const p = points[item.dataIndex]
              return [
                `Tasa acumulada: ${p.value == null ? "—" : `${(p.value * 100).toFixed(1)}%`}`,
                `${numLabel}: ${int.format(Math.round(p.numerator))}`,
                `${denLabel}: ${int.format(Math.round(p.denominator))}`,
              ]
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: { color: COLORS.tick, font: { size: 10.5 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        },
        y: {
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.tick, font: { size: 10.5 }, callback: (v) => `${v}%` },
          min: 0,
        },
      },
    },
  }
}

/** Combo histórico: barras de numerador y denominador + línea de la tasa. */
function historyConfig(
  block: MetricBlock,
  granularity: Granularity,
  numLabel: string,
  denLabel: string,
): ChartConfiguration {
  const s = block.series
  return {
    type: "bar",
    data: {
      labels: s.map((p) => bucketLabel(p.start, granularity)),
      datasets: [
        {
          type: "bar",
          label: denLabel,
          data: s.map((p) => p.denominator),
          backgroundColor: COLORS.registroSoft,
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: "y",
          order: 2,
          barPercentage: 0.8,
          categoryPercentage: 0.72,
        },
        {
          type: "bar",
          label: numLabel,
          data: s.map((p) => p.numerator),
          backgroundColor: COLORS.asistenciaSoft,
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: "y",
          order: 2,
          barPercentage: 0.8,
          categoryPercentage: 0.72,
        },
        {
          type: "line",
          label: "Tasa",
          data: s.map((p) => (p.value == null ? null : p.value * 100)),
          borderColor: COLORS.pulse,
          backgroundColor: COLORS.pulse,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: "#0f1520",
          pointBorderColor: COLORS.pulse,
          pointBorderWidth: 2,
          tension: 0.3,
          yAxisID: "y1",
          order: 1,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 700 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            boxWidth: 9,
            boxHeight: 9,
            usePointStyle: true,
            pointStyle: "circle",
            color: COLORS.textSecondary,
            font: { size: 11.5 },
          },
        },
        tooltip: {
          ...tooltipStyle,
          callbacks: {
            label: (item) =>
              item.dataset.type === "line"
                ? `Tasa: ${item.parsed.y == null ? "—" : `${item.parsed.y.toFixed(1)}%`}`
                : `${item.dataset.label}: ${int.format(Math.round(item.parsed.y))}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: COLORS.tick, font: { size: 10.5 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
        },
        y: {
          position: "left",
          beginAtZero: true,
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.tick, font: { size: 10.5 }, precision: 0 },
        },
        y1: {
          position: "right",
          min: 0,
          max: 100,
          grid: { display: false },
          ticks: {
            color: COLORS.pulse,
            font: { size: 10.5 },
            // Con la gráfica a lo ancho, Chart.js metía un tick cada 10 %.
            stepSize: 25,
            callback: (v) => `${v}%`,
          },
        },
      },
    },
  }
}

export function MetricSection({
  eyebrow,
  name,
  subtitle,
  numLabel,
  denLabel,
  current,
  previous,
  previousLabel,
  history,
  granularity,
  monthLabel,
  footnote,
  starred = false,
  compact = false,
  onOpen,
}: {
  eyebrow: string
  name: string
  subtitle: string
  numLabel: string
  denLabel: string
  current: MetricBlock
  previous: MetricBlock | null
  previousLabel: string | null
  history: MetricBlock
  granularity: Granularity
  monthLabel: string
  footnote: string
  /** Resumen en teléfono: solo la cifra; las gráficas viven en su sección. */
  compact?: boolean
  onOpen?: () => void
  starred?: boolean
}) {
  if (!current.available) {
    return (
      <section className="panel metric-section">
        <div className="section-title">
          <div>
            <div className="metric-eyebrow">{eyebrow}</div>
            <h2 className="metric-name">{name}</h2>
            <div className="sub">{subtitle}</div>
          </div>
        </div>
        <p className="unavail">
          Sin instrumentar aún: faltan eventos <code>event_viewed</code> en la plataforma.
        </p>
      </section>
    )
  }

  const head = current.series[0]
  const numerator = head?.numerator ?? 0
  const denominator = head?.denominator ?? 0
  const points = deltaPoints(current.range.value, previous?.range.value ?? null)
  const caption = previousLabel
    ? `${monthLabel} vs ${previousLabel} (${pct(previous?.range.value ?? null)})`
    : monthLabel

  return (
    <section className={`panel metric-section${starred ? " starred" : ""}`}>
      <div className="section-title">
        <div>
          <div className="metric-eyebrow">{eyebrow}</div>
          <h2 className="metric-name">{name}</h2>
          <div className="sub">{subtitle}</div>
        </div>
      </div>

      <div className="readout">
        <div className={`metric-value${starred ? "" : " sm"}`}>
          {current.range.value == null ? "—" : (current.range.value * 100).toFixed(1)}
          <span className="unit">%</span>
        </div>
        <div className="readout-side">
          <DeltaChip points={points} caption={caption} />
        </div>
        <div className="breakdown">
          <div className="bd-item">
            <div className="n" style={{ color: COLORS.registro }}>
              {int.format(Math.round(denominator))}
            </div>
            <div className="l">
              <span className="dot" style={{ background: COLORS.registro }} />
              {denLabel}
            </div>
          </div>
          <div className="bd-item">
            <div className="n" style={{ color: COLORS.asistencia }}>
              {int.format(Math.round(numerator))}
            </div>
            <div className="l">
              <span className="dot" style={{ background: COLORS.asistencia }} />
              {numLabel}
            </div>
          </div>
        </div>
      </div>

      {compact ? (
        <button type="button" className="metric-open" onClick={onOpen}>
          Ver gráficas de {name.toLowerCase()}
          <Icon name="chevron-right" size={16} />
        </button>
      ) : (
      <div className="chart-grid">
        <div className="chart-block">
          <div className="chart-head">
            <span className="t">Cómo se armó {monthLabel}</span>
          </div>
          {hasData(current.trend) ? (
            <Chart config={trendConfig(current, numLabel, denLabel)} />
          ) : (
            <div className="chart-wrap">
              <div className="chart-empty">Aún no hay datos en {monthLabel}.</div>
            </div>
          )}
        </div>
        <div className="chart-block">
          <div className="chart-head">
            <span className="t">
              Histórico por {granularity === "month" ? "mes" : "semana"}
            </span>
          </div>
          {hasData(history.series) ? (
            <Chart config={historyConfig(history, granularity, numLabel, denLabel)} />
          ) : (
            <div className="chart-wrap">
              <div className="chart-empty">Sin registros en los periodos seleccionados.</div>
            </div>
          )}
        </div>
      </div>
      )}

      {compact ? null : <p className="foot-note">{footnote}</p>}
    </section>
  )
}
