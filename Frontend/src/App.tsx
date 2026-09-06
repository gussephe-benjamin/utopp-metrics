import { useCallback, useEffect, useRef, useState } from "react"
import {
  fetchMe,
  fetchMetrics,
  getToken,
  setToken,
  type Granularity,
  type MetricKey,
  type MetricsResponse,
} from "./api"
import { Login } from "./Login"
import { MetricSection, pct } from "./MetricSection"
import { LiveFeed } from "./LiveFeed"
import { VolumePanel } from "./VolumePanel"
import { Icon, Sidebar, VIEWS, viewLabel, type View } from "./Sidebar"

const LIMA = "America/Lima"
const REFRESH_MS = 30_000
const PIN_KEY = "utopp_metrics_sidebar_pinned"

type Meta = {
  key: MetricKey
  eyebrow: string
  name: string
  subtitle: string
  num: string
  den: string
  footnote: string
}

const METRICS: Meta[] = [
  {
    key: "north_star",
    eyebrow: "Métrica estrella del norte",
    name: "Asistencia / Inscripción",
    subtitle:
      "De los eventos que ya ocurrieron en el periodo, qué fracción de sus inscritos apareció con QR.",
    num: "Asistieron",
    den: "Inscritos",
    footnote:
      "Cada evento aporta toda su gente al periodo de su fecha, sin importar cuándo se inscribió: los inscritos de un evento de octubre no mueven la cifra de septiembre. El evento entra apenas pasa su hora de inicio, así que el porcentaje sube con cada check-in del día.",
  },
  {
    key: "useful_supply",
    eyebrow: "Métrica de apoyo",
    name: "Oferta útil",
    subtitle: "Eventos publicados que consiguieron al menos una inscripción en su primera semana.",
    num: "Con tracción",
    den: "Publicados",
    footnote:
      "Un evento recién publicado no entra hasta que sus 7 días de ventana cierran, para no castigar al periodo en curso con eventos que todavía no tuvieron su oportunidad.",
  },
  {
    key: "match",
    eyebrow: "Métrica de apoyo",
    name: "Match",
    subtitle: "De quienes vieron el detalle de un evento, cuántos se inscribieron.",
    num: "Inscripciones",
    den: "Vistas de detalle",
    footnote:
      "Requiere eventos event_viewed en la plataforma. Ambos lados se cuentan por su timestamp dentro del periodo.",
  },
  {
    key: "habit",
    eyebrow: "Métrica de apoyo",
    name: "Hábito",
    subtitle: "De quienes ya asistieron en el periodo, cuántos volvieron a otro evento.",
    num: "Con ≥2 asistencias",
    den: "Con ≥1 asistencia",
    footnote:
      "La regla de repetición mira los 30 días que cierran el periodo, así que un estudiante puede contar como recurrente por eventos apenas anteriores al bucket.",
  },
]

function monthName(iso: string) {
  const label = new Date(iso).toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
    timeZone: LIMA,
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function clock(date: Date) {
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: LIMA })
}

/** El hash es la fuente de verdad de la vista: recargar no pierde el sitio. */
function viewFromHash(): View {
  const raw = window.location.hash.replace(/^#\/?/, "")
  return (VIEWS as string[]).includes(raw) ? (raw as View) : "resumen"
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [me, setMe] = useState<{ email: string } | null>(null)
  const [granularity, setGranularity] = useState<Granularity>("month")
  const [periods, setPeriods] = useState(6)
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [view, setView] = useState<View>(viewFromHash)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pinned, setPinned] = useState(() => localStorage.getItem(PIN_KEY) === "1")

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
    const sync = () => setView(viewFromHash())
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const load = useCallback(async () => {
    try {
      const next = await fetchMetrics(granularity, periods)
      setData(next)
      setRefreshedAt(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
    }
  }, [granularity, periods])

  // Un ref evita reiniciar el intervalo cada vez que cambia el filtro.
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    if (!authed) return
    void load()
  }, [authed, load])

  useEffect(() => {
    if (!authed) return
    const tick = () => void loadRef.current()
    const timer = window.setInterval(tick, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", tick)
    }
  }, [authed])

  function go(next: View) {
    window.location.hash = `/${next}`
    setView(next)
    setMenuOpen(false)
    window.scrollTo({ top: 0 })
  }

  function togglePin() {
    setPinned((was) => {
      const next = !was
      localStorage.setItem(PIN_KEY, next ? "1" : "0")
      return next
    })
  }

  function logout() {
    setToken(null)
    setAuthed(false)
    setData(null)
  }

  if (!ready) return null
  if (!authed) return <Login onDone={() => void boot()} />

  const current = data?.headline.current ?? null
  const previous = data?.headline.previous ?? null
  const monthLabel = current ? monthName(current.start) : "—"

  // "En vivo" solo significa algo si hay un evento ocurriendo ahora mismo.
  const activeEvents = data?.live.active_events ?? []
  const liveNow = activeEvents.length > 0
  const liveTitle = liveNow
    ? `En curso: ${activeEvents.map((e) => e.title).join(", ")}`
    : "Ningún evento está ocurriendo en este momento"

  const sidebarValues: Partial<Record<MetricKey, string>> = {}
  if (current) {
    for (const m of METRICS) {
      const block = current[m.key]
      sidebarValues[m.key] = block.available ? pct(block.range.value) : "—"
    }
  }

  const shown = view === "resumen" ? METRICS : METRICS.filter((m) => m.key === view)

  const subtitle =
    view === "glossary"
      ? "Definiciones exactas de cada bloque del panel."
      : view === "resumen"
        ? `${monthLabel} · las cuatro métricas del mes en curso`
        : `${monthLabel} · mes en curso, actualizado en vivo`

  return (
    <div className={`shell${pinned ? " pinned" : ""}`}>
      <Sidebar
        view={view}
        onSelect={go}
        values={sidebarValues}
        email={me?.email ?? null}
        onLogout={logout}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        pinned={pinned}
        onTogglePin={togglePin}
      />
      {menuOpen ? (
        <button className="scrim" type="button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />
      ) : null}

      <div className="content">
        <div className="content-inner">
          <header className="topbar">
            <div className="page-head">
              <button
                className="menu-btn"
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Abrir menú"
              >
                <Icon name="menu" size={19} />
              </button>
              <div>
                <h1>{viewLabel(view)}</h1>
                <div className="sub">{subtitle}</div>
              </div>
            </div>
            <div className="topbar-right">
              {view !== "glossary" ? (
                <div className="controls">
                  <div className="tabs" role="tablist" aria-label="Granularidad del histórico">
                    {(["week", "month"] as const).map((g) => (
                      <button
                        key={g}
                        role="tab"
                        aria-selected={granularity === g}
                        className={`tab-btn${granularity === g ? " active" : ""}`}
                        onClick={() => setGranularity(g)}
                        type="button"
                      >
                        {g === "week" ? "Semanal" : "Mensual"}
                      </button>
                    ))}
                  </div>
                  <div className="periods">
                    <span className="periods-label">Últimos</span>
                    <div className="tabs" role="tablist" aria-label="Cantidad de periodos">
                      {[4, 6, 8, 12].map((n) => (
                        <button
                          key={n}
                          role="tab"
                          aria-selected={periods === n}
                          className={`tab-btn narrow${periods === n ? " active" : ""}`}
                          onClick={() => setPeriods(n)}
                          type="button"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="status-pill" title={liveTitle}>
                <span className={`live-dot${error ? " stale" : liveNow ? "" : " idle"}`} />
                {error ? "Sin conexión" : liveNow ? "En vivo" : "Nada en curso"} ·{" "}
                <b>{refreshedAt ? clock(refreshedAt) : "—"}</b>
              </div>
            </div>
          </header>

          {error ? <p className="error">{error}</p> : null}

          {data && current ? (
            <>
              {view === "glossary" ? (
                <section className="panel glossary">
                  <dl>
                    <dt>El periodo de la estrella norte lo fija el evento</dt>
                    <dd>
                      Un evento pertenece al periodo de su <code>date_time</code> y aporta ahí todos
                      sus inscritos y todos sus asistentes, sin importar cuándo se registró la gente.
                      Entra en cuanto su hora de inicio queda atrás.
                    </dd>
                    <dt>Pooled</dt>
                    <dd>
                      El % de un rango no promedia las barras: se suman numeradores y denominadores y
                      recién ahí se divide.
                    </dd>
                    <dt>Delta en puntos porcentuales</dt>
                    <dd>
                      El chip compara dos tasas, así que la diferencia va en <strong>pp</strong>, no
                      en porcentaje relativo: de 40% a 45% son +5 pp.
                    </dd>
                    <dt>Acumulado del mes</dt>
                    <dd>
                      La curva de la izquierda recalcula la misma métrica con cortes sucesivos, un
                      punto por día. Su último punto es, por construcción, la cifra grande.
                    </dd>
                    <dt>Colores</dt>
                    <dd>
                      Azul es siempre el denominador, naranja el numerador y turquesa la tasa. El
                      mismo código se repite en las cuatro secciones.
                    </dd>
                    <dt>Timezone y exclusiones</dt>
                    <dd>
                      Todo en <code>America/Lima</code>, semana de lunes a domingo. Se excluyen los
                      eventos en borrador. El panel se refresca solo cada 30 s.
                    </dd>
                  </dl>
                </section>
              ) : (
                <>
                  {view === "resumen" ? (
                    <div className="hero-grid">
                      <VolumePanel
                        title="Eventos creados"
                        subtitle="Formularios de evento publicados, según su fecha de creación."
                        unit="eventos"
                        current={current.events_created}
                        previous={previous ? previous.events_created : null}
                        previousLabel={previous ? monthName(previous.start) : null}
                        history={data.events_created}
                        granularity={granularity}
                        monthLabel={monthLabel}
                        footnote="Cuenta todo lo publicado, sin la ventana de 7 días de Oferta útil: aquí la pregunta es cuánto se publicó, no cuánto consiguió tracción. Se excluyen los borradores."
                      />
                      <LiveFeed live={data.live} />
                    </div>
                  ) : null}
                  {shown.map((m) => (
                  <MetricSection
                    key={m.key}
                    eyebrow={m.eyebrow}
                    name={m.name}
                    subtitle={m.subtitle}
                    numLabel={m.num}
                    denLabel={m.den}
                    current={current[m.key]}
                    previous={previous ? previous[m.key] : null}
                    previousLabel={previous ? monthName(previous.start) : null}
                    history={data[m.key]}
                    granularity={granularity}
                    monthLabel={monthLabel}
                    footnote={m.footnote}
                    starred={view !== "resumen" || m.key === "north_star"}
                  />
                  ))}
                </>
              )}


              <footer>
                <div>
                  Datos en vivo de la base de Utopp · {data.timezone} · corte{" "}
                  {refreshedAt ? clock(refreshedAt) : "—"}
                </div>
                <div className="mono">
                  {data.totals.events.toLocaleString("es-PE")} eventos ·{" "}
                  {data.totals.signups.toLocaleString("es-PE")} inscripciones
                </div>
              </footer>
            </>
          ) : (
            <p className="loading">Cargando métricas…</p>
          )}
        </div>
      </div>
    </div>
  )
}
