import type { MetricKey } from "./api"

export type View = "resumen" | "eventos" | MetricKey | "glossary"

type IconName =
  | "grid" | "star" | "layers" | "target" | "repeat" | "book"
  | "logout" | "menu" | "close" | "pin" | "unpin"
  | "eye" | "eye-off"
  | "trend-up" | "trend-down" | "trend-flat" | "chevron-right"
  | "calendar" | "arrow-left" | "external"

const PATHS: Record<IconName, string> = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  star: "M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.4l6-.8z",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  target: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 11.4a.6.6 0 100 1.2.6.6 0 000-1.2z",
  repeat: "M17 2l4 4-4 4M21 6H8a4 4 0 00-4 4v1M7 22l-4-4 4-4M3 18h13a4 4 0 004-4v-1",
  book: "M4 4.5A2.5 2.5 0 016.5 2H20v16H6.5A2.5 2.5 0 004 20.5zM4 20.5A2.5 2.5 0 016.5 18H20v4H6.5A2.5 2.5 0 014 20.5z",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  // Chevrones: « fija abierto, » lo suelta.
  pin: "M13 17l-5-5 5-5M20 17l-5-5 5-5",
  unpin: "M11 7l5 5-5 5M4 7l5 5-5 5",
  // Mostrar/ocultar la contraseña en el acceso.
  eye: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  "eye-off": "M3 3l18 18M10.6 6.1A9.9 9.9 0 0112 6c6.4 0 10 6 10 6a17.3 17.3 0 01-3.3 3.9M6.3 8.1A17.3 17.3 0 002 12s3.6 6.5 10 6.5c1.2 0 2.3-.2 3.2-.5M9.9 9.9a2.5 2.5 0 003.5 3.5",
  // Variación de una métrica. Antes eran los glifos ▲ ▼ ＝: el tercero es
  // U+FF1D, de ancho completo, y ni Inter ni Space Grotesk lo traen, así que
  // se pintaba como un cuadro vacío. Dibujados se comportan igual en todas
  // partes y comparten grosor con el resto de los iconos.
  "trend-up": "M4 17l6-6 4 4 6-7M14 8h6v6",
  "trend-down": "M4 7l6 6 4-4 6 7M14 16h6v-6",
  "trend-flat": "M4 12h16",
  "chevron-right": "M9 6l6 6-6 6",
  calendar: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  "arrow-left": "M19 12H5M11 18l-6-6 6-6",
  external: "M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5",
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

type Item = { id: View; label: string; icon: IconName }

const NAV: { group: string; items: Item[] }[] = [
  {
    group: "Principal",
    items: [
      { id: "resumen", label: "Resumen", icon: "grid" },
      { id: "eventos", label: "Eventos", icon: "calendar" },
    ],
  },
  {
    group: "Métricas",
    items: [
      { id: "north_star", label: "Estrella norte", icon: "star" },
      { id: "useful_supply", label: "Oferta útil", icon: "layers" },
      { id: "match", label: "Match", icon: "target" },
      { id: "habit", label: "Hábito", icon: "repeat" },
    ],
  },
  { group: "Otro", items: [{ id: "glossary", label: "Cómo se calcula", icon: "book" }] },
]

export const VIEWS: View[] = NAV.flatMap((g) => g.items.map((i) => i.id))

export function viewLabel(view: View) {
  for (const g of NAV) for (const i of g.items) if (i.id === view) return i.label
  return "Resumen"
}

export function Sidebar({
  view,
  onSelect,
  values,
  email,
  onLogout,
  open,
  onClose,
  pinned,
  onTogglePin,
}: {
  view: View
  onSelect: (v: View) => void
  /** Cifra del mes por métrica: el sidebar también informa, no solo navega. */
  values: Partial<Record<MetricKey, string>>
  email: string | null
  onLogout: () => void
  open: boolean
  onClose: () => void
  /** Fijado abierto en escritorio; si no, el rail solo se abre al pasar el cursor. */
  pinned: boolean
  onTogglePin: () => void
}) {
  return (
    <aside className={`sidebar${open ? " open" : ""}`} aria-label="Navegación del panel">
      <div className="sb-brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M2 12h4l2.5-7 5 14 2.5-7H22"
              stroke="#0b1018"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="sb-brand-text">
          <div className="sb-name">Utopp</div>
          <div className="sb-sub">Métricas · Pulso</div>
        </div>
        <button
          className="sb-pin"
          type="button"
          onClick={onTogglePin}
          aria-pressed={pinned}
          title={pinned ? "Soltar el panel" : "Fijar el panel abierto"}
          aria-label={pinned ? "Soltar el panel" : "Fijar el panel abierto"}
        >
          <Icon name={pinned ? "pin" : "unpin"} size={18} />
        </button>
        <button className="sb-close" type="button" onClick={onClose} aria-label="Cerrar menú">
          <Icon name="close" size={18} />
        </button>
      </div>

      <nav className="sb-nav">
        {NAV.map((group) => (
          <div className="sb-section" key={group.group}>
            <div className="sb-group">{group.group}</div>
            {group.items.map((item) => {
              const active = view === item.id
              const value = values[item.id as MetricKey]
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sb-item${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelect(item.id)}
                  title={item.label}
                >
                  <span className="sb-icon">
                    <Icon name={item.icon} />
                  </span>
                  <span className="sb-label">{item.label}</span>
                  {value ? <span className="sb-value">{value}</span> : null}
                  {active ? <span className="sb-dot" /> : null}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        {email ? <div className="sb-user" title={email}>{email}</div> : null}
        <button className="sb-logout" type="button" onClick={onLogout} title="Cerrar sesión">
          <span className="sb-icon">
            <Icon name="logout" size={17} />
          </span>
          <span className="sb-label">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
