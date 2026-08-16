import { useEffect, useState } from "react"
import { fetchMe, fetchMetrics, getToken, setToken, type MetricsResponse } from "./api"
import { Login } from "./Login"
import { MetricCard } from "./MetricCard"

const LABELS = {
  north_star: { num: "Check-ins únicos", den: "Inscripciones únicas" },
  useful_supply: { num: "Eventos con tracción", den: "Eventos publicados" },
  match: { num: "Inscripciones", den: "Vistas de detalle" },
  habit: { num: "Con ≥2 asistencias", den: "Con ≥1 asistencia" },
} as const

function formatDay(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

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
      </header>

      {error ? <p className="error">{error}</p> : null}

      {data ? (
        <>
          <section className="section">
            <div className="section-head">
              <div>
                <h1>Tiempo real</h1>
                <p className="muted">
                  Desde el primer evento ({formatDay(data.lifetime.first_event_at)}) hasta ahora.
                  Último evento creado: {formatDay(data.lifetime.last_event_at)}.
                </p>
              </div>
            </div>
            <div className="grid">
              <MetricCard
                title="Estrella norte"
                block={data.lifetime.north_star}
                granularity={granularity}
                numeratorLabel={LABELS.north_star.num}
                denominatorLabel={LABELS.north_star.den}
                showSeries={false}
              />
              <MetricCard
                title="Oferta útil"
                block={data.lifetime.useful_supply}
                granularity={granularity}
                numeratorLabel={LABELS.useful_supply.num}
                denominatorLabel={LABELS.useful_supply.den}
                showSeries={false}
              />
              <MetricCard
                title="Match"
                block={data.lifetime.match}
                granularity={granularity}
                numeratorLabel={LABELS.match.num}
                denominatorLabel={LABELS.match.den}
                showSeries={false}
              />
              <MetricCard
                title="Hábito"
                block={data.lifetime.habit}
                granularity={granularity}
                numeratorLabel={LABELS.habit.num}
                denominatorLabel={LABELS.habit.den}
                showSeries={false}
              />
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <h1>Avance por periodo</h1>
                <p className="muted">Tasas pooled en cada ventana. El filtro no cambia el bloque de tiempo real.</p>
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
              </div>
            </div>
            <div className="grid">
              <MetricCard
                title="Estrella norte"
                block={data.north_star}
                granularity={granularity}
                numeratorLabel={LABELS.north_star.num}
                denominatorLabel={LABELS.north_star.den}
              />
              <MetricCard
                title="Oferta útil"
                block={data.useful_supply}
                granularity={granularity}
                numeratorLabel={LABELS.useful_supply.num}
                denominatorLabel={LABELS.useful_supply.den}
              />
              <MetricCard
                title="Match"
                block={data.match}
                granularity={granularity}
                numeratorLabel={LABELS.match.num}
                denominatorLabel={LABELS.match.den}
              />
              <MetricCard
                title="Hábito"
                block={data.habit}
                granularity={granularity}
                numeratorLabel={LABELS.habit.num}
                denominatorLabel={LABELS.habit.den}
              />
            </div>
          </section>

          <section className="section glossary">
            <h1>Cómo se calcula</h1>
            <dl>
              <dt>Estrella norte</dt>
              <dd>
                Fracción de inscripciones que terminaron en asistencia verificada (QR). Numerador:
                pares únicos (email, evento) con check-in. Denominador: pares únicos inscritos.
                En el recorte temporal el numerador usa <code>checked_in_at</code> y el denominador
                <code>registered_at</code>.
              </dd>
              <dt>Oferta útil</dt>
              <dd>
                Fracción de eventos no-draft que consiguieron al menos una inscripción en los 7 días
                posteriores a publicarse. Numerador: eventos con tracción. Denominador: eventos
                publicados en el periodo.
              </dd>
              <dt>Match</dt>
              <dd>
                Inscripciones sobre vistas únicas de detalle (<code>event_viewed</code>). Si aún no
                hay vistas, el bloque queda sin instrumentar.
              </dd>
              <dt>Hábito</dt>
              <dd>
                Semana o mes: estudiantes con ≥2 check-ins en los 30 días que cierran el bucket /
                estudiantes con ≥1 check-in en el bucket. Año: ≥2 / ≥1 en el año. Tiempo real: ≥2 /
                ≥1 en toda la historia.
              </dd>
              <dt>Pooled y timezone</dt>
              <dd>
                El % de un rango no promedia las barras: se suman numeradores y denominadores y
                recién ahí se divide. Todo en America/Lima. Se excluyen eventos en borrador.
              </dd>
            </dl>
          </section>
        </>
      ) : (
        <p className="muted">Cargando métricas…</p>
      )}
    </div>
  )
}
