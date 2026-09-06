import { useEffect, useRef } from "react"
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from "chart.js"

ChartJS.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
)

export const COLORS = {
  registro: "#5b8def",
  registroSoft: "rgba(91,141,239,0.75)",
  asistencia: "#f2a65c",
  asistenciaSoft: "rgba(242,166,92,0.8)",
  pulse: "#52e3c2",
  pulseFill: "rgba(82,227,194,0.32)",
  grid: "rgba(255,255,255,0.05)",
  tick: "#5c6478",
  panel2: "#0f1520",
  border: "#232d42",
  textPrimary: "#edf1f8",
  textSecondary: "#8d97ac",
} as const

export const reduceMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

ChartJS.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif"
ChartJS.defaults.color = COLORS.textSecondary

export const tooltipStyle = {
  backgroundColor: COLORS.panel2,
  borderColor: COLORS.border,
  borderWidth: 1,
  titleColor: COLORS.textSecondary,
  bodyColor: COLORS.textPrimary,
  padding: 10,
} as const

/** Degradado vertical para el área bajo la línea; necesita el área del chart. */
export function areaFill(top: string) {
  return (context: { chart: ChartJS }) => {
    const { ctx, chartArea } = context.chart
    if (!chartArea) return "transparent"
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
    g.addColorStop(0, top)
    g.addColorStop(1, "rgba(0,0,0,0)")
    return g
  }
}

/**
 * Monta un Chart.js sobre un canvas y lo recrea cuando cambia la config.
 * Recrear en vez de mutar mantiene el componente declarativo: la config es
 * función de los datos y no hay estado del chart que sincronizar a mano.
 */
export function Chart({
  config,
  className = "chart-wrap",
}: {
  config: ChartConfiguration
  className?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const chart = useRef<ChartJS | null>(null)
  const json = JSON.stringify(config, (_k, v) => (typeof v === "function" ? "fn" : v))

  useEffect(() => {
    if (!canvas.current) return
    chart.current = new ChartJS(canvas.current, config)
    return () => {
      chart.current?.destroy()
      chart.current = null
    }
    // `json` captura los datos; las funciones de estilo son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json])

  return (
    <div className={className}>
      <canvas ref={canvas} />
    </div>
  )
}
