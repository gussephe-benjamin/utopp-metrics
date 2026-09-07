import { useEffect, useMemo, useState } from "react"
import {
  fetchEventDetail,
  fetchEvents,
  type EventAttendee,
  type EventDetail,
  type EventRow,
  type EventStatus,
} from "./api"
import { buildCsv, downloadCsv, slug } from "./csv"
import { Icon } from "./Sidebar"

/**
 * El catálogo de eventos: la lista y, al abrir uno, sus cifras y sus inscritos.
 *
 * Las cuatro métricas responden «cómo va todo». Esto responde «¿y este evento?»,
 * que es lo que se pregunta quien está en la puerta mientras la gente entra. Por
 * eso el detalle refresca solo cada 20 s: un evento en curso cambia de cifra
 * mientras lo miras, y un número quieto mentiría.
 */

const ESTADOS: Record<EventStatus, { texto: string; cls: string }> = {
  en_curso: { texto: "En curso", cls: "ev-live" },
  proximo: { texto: "Próximo", cls: "ev-soon" },
  pasado: { texto: "Pasado", cls: "ev-past" },
  borrador: { texto: "Borrador", cls: "ev-draft" },
  sin_fecha: { texto: "Sin fecha", cls: "ev-draft" },
}

const REFRESCO_MS = 20_000

const fecha = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "America/Lima",
})
const hora = new Intl.DateTimeFormat("es-PE", {
  hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Lima",
})
const entero = new Intl.NumberFormat("es-PE")
/** Para el CSV: en una hoja de cálculo una hora suelta no dice de qué día es. */
const fechaHora = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima",
})

function cuando(iso: string | null) {
  if (!iso) return "Sin fecha"
  const d = new Date(iso)
  return `${fecha.format(d)} · ${hora.format(d)}`
}

function Estado({ status }: { status: EventStatus }) {
  const e = ESTADOS[status] ?? ESTADOS.sin_fecha
  return (
    <span className={`ev-chip ${e.cls}`}>
      {status === "en_curso" ? <span className="live-dot" /> : null}
      {e.texto}
    </span>
  )
}

/* ---------------------------------------------------------------- lista --- */

function ListaEventos({ onOpen }: { onOpen: (id: string) => void }) {
  const [datos, setDatos] = useState<EventRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [filtro, setFiltro] = useState<"todos" | "en_curso" | "proximo" | "pasado">("todos")

  useEffect(() => {
    let vivo = true
    const cargar = () =>
      fetchEvents()
        .then((r) => vivo && setDatos(r.events))
        .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron cargar los eventos."))
    cargar()
    const t = window.setInterval(cargar, REFRESCO_MS)
    return () => { vivo = false; window.clearInterval(t) }
  }, [])

  const visibles = useMemo(() => {
    if (!datos) return []
    const texto = q.trim().toLowerCase()
    return datos.filter((e) => {
      if (filtro !== "todos" && e.status !== filtro) return false
      if (!texto) return true
      return (
        e.title.toLowerCase().includes(texto) ||
        (e.location ?? "").toLowerCase().includes(texto)
      )
    })
  }, [datos, q, filtro])

  if (error) return <p className="error">{error}</p>
  if (!datos) return <div className="loading">Cargando eventos…</div>

  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <div className="metric-eyebrow">Catálogo</div>
          <h2 className="metric-name">Eventos</h2>
          <div className="sub">
            {entero.format(datos.length)} publicados. Toca uno para ver sus inscritos y quién ya entró.
          </div>
        </div>
      </div>

      <div className="ev-controls">
        <input
          className="ev-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o lugar"
          aria-label="Buscar eventos"
        />
        <div className="tabs" role="tablist" aria-label="Filtrar por estado">
          {([["todos", "Todos"], ["en_curso", "En curso"], ["proximo", "Próximos"], ["pasado", "Pasados"]] as const).map(
            ([id, etiqueta]) => (
              <button
                key={id}
                role="tab"
                aria-selected={filtro === id}
                className={`tab-btn${filtro === id ? " active" : ""}`}
                onClick={() => setFiltro(id)}
              >
                {etiqueta}
              </button>
            )
          )}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="ev-empty">
          {q.trim() ? `Ningún evento coincide con «${q.trim()}».` : "No hay eventos en este estado."}
        </p>
      ) : (
        <ul className="ev-list">
          {visibles.map((e) => (
            <li key={e.id}>
              <button className="ev-row" onClick={() => onOpen(e.id)}>
                <span className="ev-row-main">
                  <span className="ev-row-top">
                    <Estado status={e.status} />
                    <span className="ev-when">{cuando(e.starts_at)}</span>
                  </span>
                  <span className="ev-title">{e.title}</span>
                  {e.location ? <span className="ev-place">{e.location}</span> : null}
                </span>
                <span className="ev-row-nums">
                  <span className="ev-num ev-num-den">
                    <b>{entero.format(e.signups)}</b> inscritos
                  </span>
                  <span className="ev-num ev-num-num">
                    <b>{entero.format(e.check_ins)}</b> entraron
                  </span>
                </span>
                <Icon name="chevron-right" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* --------------------------------------------------------------- detalle --- */

function Inscritos({ gente, evento }: { gente: EventAttendee[]; evento: EventRow }) {
  const [q, setQ] = useState("")
  const [filtro, setFiltro] = useState<"todos" | "entraron" | "faltan">("todos")

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase()
    return gente.filter((p) => {
      if (filtro === "entraron" && !p.checked_in) return false
      if (filtro === "faltan" && p.checked_in) return false
      if (!texto) return true
      return p.full_name.toLowerCase().includes(texto) || p.email.toLowerCase().includes(texto)
    })
  }, [gente, q, filtro])

  function descargar() {
    // Se exporta lo que se está viendo, no todo: si alguien filtró por «Faltan»
    // es porque quiere esa lista. El número va en el botón para que no haya
    // duda de cuántas filas salen.
    const filas = visibles.map((p) => [
      p.full_name,
      p.email,
      p.registered_at ? fechaHora.format(new Date(p.registered_at)) : "",
      p.checked_in ? "Sí" : "No",
      p.checked_in_at ? fechaHora.format(new Date(p.checked_in_at)) : "",
      evento.title,
      evento.starts_at ? fechaHora.format(new Date(evento.starts_at)) : "",
    ])
    const csv = buildCsv(
      ["Nombre", "Correo", "Se inscribió", "Entró", "Hora de entrada", "Evento", "Fecha del evento"],
      filas
    )
    const hoy = new Date().toISOString().slice(0, 10)
    downloadCsv(`inscritos-${slug(evento.title)}-${hoy}.csv`, csv)
  }

  return (
    <div className="ev-people">
      <div className="ev-controls">
        <input
          className="ev-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar persona o correo"
          aria-label="Buscar entre los inscritos"
        />
        <div className="tabs" role="tablist" aria-label="Filtrar inscritos">
          {([["todos", "Todos"], ["entraron", "Entraron"], ["faltan", "Faltan"]] as const).map(([id, etiqueta]) => (
            <button
              key={id}
              role="tab"
              aria-selected={filtro === id}
              className={`tab-btn${filtro === id ? " active" : ""}`}
              onClick={() => setFiltro(id)}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ev-export"
          onClick={descargar}
          disabled={visibles.length === 0}
          title="Descarga un CSV que Excel y Google Sheets abren directamente"
        >
          <Icon name="download" size={16} />
          Descargar {visibles.length === gente.length ? "" : "lo filtrado "}
          ({entero.format(visibles.length)})
        </button>
      </div>

      {visibles.length === 0 ? (
        <p className="ev-empty">
          {q.trim() ? `Nadie coincide con «${q.trim()}».` : "Nadie en este estado todavía."}
        </p>
      ) : (
        /* Lista y no tabla: en un teléfono una tabla de cuatro columnas obliga a
           desplazar en horizontal, que es justo lo que no se puede hacer aquí. */
        <ul className="ev-guests">
          {visibles.map((p) => (
            <li key={p.id} className={p.checked_in ? "is-in" : ""}>
              <span className="ev-guest-id">
                <span className="ev-guest-name">{p.full_name}</span>
                <span className="ev-guest-mail">{p.email}</span>
              </span>
              <span className="ev-guest-state">
                {p.checked_in ? (
                  <span className="ev-chip ev-live">
                    {p.checked_in_at ? hora.format(new Date(p.checked_in_at)) : "Entró"}
                  </span>
                ) : (
                  <span className="ev-chip ev-past">Falta</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DetalleEvento({ id, onBack }: { id: string; onBack: () => void }) {
  const [datos, setDatos] = useState<EventDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setDatos(null)
    setError(null)
    const cargar = () =>
      fetchEventDetail(id)
        .then((r) => vivo && setDatos(r))
        .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar el evento."))
    cargar()
    const t = window.setInterval(cargar, REFRESCO_MS)
    return () => { vivo = false; window.clearInterval(t) }
  }, [id])

  if (error) {
    return (
      <section className="panel">
        <button className="ev-back" onClick={onBack}>
          <Icon name="arrow-left" size={16} /> Todos los eventos
        </button>
        <p className="error">{error}</p>
      </section>
    )
  }
  if (!datos) return <div className="loading">Cargando el evento…</div>

  const e = datos.event
  const enCurso = e.status === "en_curso"

  return (
    <section className="panel">
      <button className="ev-back" onClick={onBack}>
        <Icon name="arrow-left" size={16} /> Todos los eventos
      </button>

      <div className="section-title">
        <div>
          <div className="ev-row-top">
            <Estado status={e.status} />
            <span className="ev-when">{cuando(e.starts_at)}</span>
          </div>
          <h2 className="ev-detail-title">{e.title}</h2>
          {e.location ? <div className="sub">{e.location}</div> : null}
        </div>
      </div>

      <div className="ev-stats">
        <div className="ev-stat">
          <div className="ev-stat-n" style={{ color: "#5b8def" }}>{entero.format(e.signups)}</div>
          <div className="ev-stat-l">Inscritos</div>
        </div>
        <div className="ev-stat">
          <div className="ev-stat-n" style={{ color: "#f2a65c" }}>{entero.format(e.check_ins)}</div>
          <div className="ev-stat-l">
            {/* En curso la cifra se mueve sola; decirlo evita que alguien la
                lea como definitiva y cierre la puerta antes de tiempo. */}
            {enCurso ? "Entraron · en vivo" : "Entraron"}
          </div>
        </div>
        <div className="ev-stat">
          <div className="ev-stat-n ev-stat-rate">
            {e.rate == null ? "—" : `${(e.rate * 100).toFixed(1)}%`}
          </div>
          <div className="ev-stat-l">Asistencia</div>
        </div>
      </div>

      {e.public_url ? (
        <a className="ev-link" href={e.public_url} target="_blank" rel="noopener noreferrer">
          Abrir la página del evento
          <Icon name="external" size={16} />
        </a>
      ) : null}

      <div className="ev-people-head">
        Inscritos ({entero.format(datos.attendees.length)})
      </div>
      <Inscritos gente={datos.attendees} evento={e} />
    </section>
  )
}

/* ----------------------------------------------------------------- raíz --- */

export function EventsSection({
  eventId,
  onOpen,
  onBack,
}: {
  eventId: string | null
  onOpen: (id: string) => void
  onBack: () => void
}) {
  return eventId ? <DetalleEvento id={eventId} onBack={onBack} /> : <ListaEventos onOpen={onOpen} />
}
