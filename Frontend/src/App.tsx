import { useEffect, useState } from "react"
import { fetchMe, fetchMetrics, getToken, setToken, type MetricsResponse } from "./api"
import { Login } from "./Login"
import { MetricCard } from "./MetricCard"

export default function App() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [me, setMe] = useState<{ email: string } | null>(null)
  const [granularity, setGranularity] = useState<"week" | "month" | "year">("week")
  const [periods, setPeriods] = useState(8)
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function boot() {
    if (!getToken()) {
      setAuthed(false)
      setReady(true)
      return
    }
    try {
      const profile = await fetchMe()
      setMe(profile)
      setAuthed(true)
    } catch {
      setToken(null)
      setAuthed(false)
    } finally {
      setReady(true)
    }
  }

  useEffect(() => {
    void boot()
  }, [])

  useEffect(() => {
    if (!authed) return
    setError(null)
    fetchMetrics(granularity, periods)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Error"))
  }, [authed, granularity, periods])

  if (!ready) return null
  if (!authed) return <Login onDone={() => void boot()} />

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <div className="brand">UTOPP METRICS</div>
          <div className="muted">{me?.email} · America/Lima</div>
        </div>
        <div className="filters">
          {(["week", "month", "year"] as const).map((g) => (
            <button
              key={g}
              className={granularity === g ? "active" : ""}
              onClick={() => setGranularity(g)}
              type="button"
            >
              {g === "week" ? "Semana" : g === "month" ? "Mes" : "Año"}
            </button>
          ))}
          <select value={periods} onChange={(e) => setPeriods(Number(e.target.value))}>
            {[4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>
                Últimos {n}
              </option>
            ))}
          </select>
          <button
            className="linkish"
            type="button"
            onClick={() => {
              setToken(null)
              setAuthed(false)
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {data ? (
        <section className="grid">
          <MetricCard
            title="Estrella norte"
            unit="asistencias"
            block={data.north_star}
            granularity={granularity}
          />
          <MetricCard
            title="Oferta útil"
            unit="eventos"
            block={data.useful_supply}
            granularity={granularity}
          />
          <MetricCard title="Match" block={data.match} granularity={granularity} />
          <MetricCard title="Hábito" block={data.habit} granularity={granularity} />
        </section>
      ) : (
        <p className="muted">Cargando métricas…</p>
      )}

      {data ? (
        <p className="muted" style={{ marginTop: 24 }}>
          Puente (inscripciones en el rango): {data.signups_bridge.range.value}. No es la estrella norte.
        </p>
      ) : null}
    </div>
  )
}
