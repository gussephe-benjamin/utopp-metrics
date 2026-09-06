import { useState } from "react"
import type { FeedEntry, LiveFeed as Feed } from "./api"

const LIMA = "America/Lima"
const rtf = new Intl.RelativeTimeFormat("es-PE", { numeric: "auto" })

type Tab = "checkin" | "pending"

/** Filas que caben en el alto máximo de la lista antes de que aparezca scroll. */
const ROWS_BEFORE_SCROLL = 7

/** "hace 5 min" mientras sea reciente; fecha corta cuando ya no lo es. */
function ago(iso: string | null) {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  const mins = Math.round((then - Date.now()) / 60000)
  const abs = Math.abs(mins)
  if (abs < 60) return rtf.format(mins, "minute")
  if (abs < 24 * 60) return rtf.format(Math.round(mins / 60), "hour")
  if (abs < 7 * 24 * 60) return rtf.format(Math.round(mins / 1440), "day")
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    timeZone: LIMA,
  })
}

function eventPassed(entry: FeedEntry) {
  return entry.event_at != null && new Date(entry.event_at).getTime() < Date.now()
}

function Row({ entry, tab }: { entry: FeedEntry; tab: Tab }) {
  // Un inscrito de un evento que ya pasó no está pendiente: no apareció.
  const noShow = tab === "pending" && eventPassed(entry)
  const badge =
    tab === "checkin"
      ? { cls: "badge-si", text: "Asistió" }
      : noShow
        ? { cls: "badge-no", text: "No asistió" }
        : { cls: "badge-wait", text: "Pendiente" }

  // El evento y el aula van al title: informan sin gastar una tercera línea.
  const detail = entry.location ? `${entry.event} · ${entry.location}` : entry.event
  return (
    <li className="feed-row" title={detail}>
      <div className="feed-main">
        <div className="feed-name">{entry.name}</div>
        <div className="feed-mail">{entry.email}</div>
      </div>
      <div className="feed-meta">
        <span className={`badge ${badge.cls}`}>{badge.text}</span>
        <span className="feed-time">{ago(entry.at)}</span>
      </div>
    </li>
  )
}

const EMPTY: Record<Tab, string> = {
  checkin: "Todavía no hay check-ins registrados.",
  pending: "No hay inscritos sin check-in.",
}

/**
 * Las dos listas comparten un solo espacio y se alternan con el selector.
 * Apiladas, el panel crecía hasta el doble que la columna de al lado.
 */
export function LiveFeed({ live }: { live: Feed }) {
  const [tab, setTab] = useState<Tab>(live.check_ins.length ? "checkin" : "pending")
  const entries = tab === "checkin" ? live.check_ins : live.pending

  return (
    <section className="panel feed-panel">
      <div className="section-title">
        <div>
          <div className="metric-eyebrow">Actividad reciente</div>
          <h2 className="metric-name">Quién se está sumando</h2>
        </div>
      </div>

      <div className="tabs feed-tabs" role="tablist" aria-label="Tipo de movimiento">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "checkin"}
          className={`tab-btn${tab === "checkin" ? " active" : ""}`}
          onClick={() => setTab("checkin")}
        >
          Check-in <span className="tab-count">{live.check_ins.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pending"}
          className={`tab-btn${tab === "pending" ? " active" : ""}`}
          onClick={() => setTab("pending")}
        >
          Pendientes <span className="tab-count">{live.pending.length}</span>
        </button>
      </div>

      {entries.length ? (
        <ul className={`feed-list${entries.length > ROWS_BEFORE_SCROLL ? " fades" : ""}`}>
          {entries.map((e, i) => (
            <Row key={`${e.email}-${e.event}-${e.at}-${i}`} entry={e} tab={tab} />
          ))}
        </ul>
      ) : (
        <div className="feed-empty">{EMPTY[tab]}</div>
      )}
    </section>
  )
}
