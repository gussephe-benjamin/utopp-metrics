const TOKEN_KEY = "utopp_metrics_token"
const API = (import.meta.env.VITE_API_URL || "http://localhost:8002").replace(/\/$/, "")

export type SeriesPoint = {
  start: string
  end: string
  value: number | null
  numerator: number
  denominator: number
}

/** Un punto del acumulado diario del mes en curso. */
export type TrendPoint = {
  /** Día que representa el punto (inicio del día, Lima). */
  date: string
  /** Corte con el que se calculó: fin de ese día, o "ahora" para el día actual. */
  as_of: string
  value: number | null
  numerator: number
  denominator: number
}

export type MetricBlock = {
  available: boolean
  kind: "count" | "rate"
  range: { value: number | null; delta_pct: number | null }
  series: SeriesPoint[]
  /** Solo lo trae el mes en curso; vacío en el resto. */
  trend: TrendPoint[]
}

export type MetricKey = "north_star" | "useful_supply" | "match" | "habit"

export type MonthBlock = {
  start: string
  end: string
  /** false mientras el mes sigue corriendo. */
  closed: boolean
  /** Hasta dónde alcanzan los datos: fin de mes, o "ahora" si sigue abierto. */
  as_of: string
  north_star: MetricBlock
  useful_supply: MetricBlock
  match: MetricBlock
  habit: MetricBlock
  /** Volumen de publicaciones del bucket; kind "count", sin denominador. */
  events_created: MetricBlock
}

/** Una persona en el feed en vivo. `at` es el check-in o la inscripción. */
export type FeedEntry = {
  name: string
  email: string
  event: string
  location: string | null
  event_at: string | null
  at: string | null
}

/** Un evento que está ocurriendo ahora mismo. */
export type ActiveEvent = {
  id: string
  title: string
  location: string | null
  starts_at: string | null
  ends_at: string | null
}

export type LiveFeed = {
  /** Vacío = no hay nada en curso; el panel no está realmente "en vivo". */
  active_events: ActiveEvent[]
  check_ins: FeedEntry[]
  pending: FeedEntry[]
}

export type Granularity = "week" | "month"

export type MetricsResponse = {
  timezone: string
  granularity: Granularity
  periods: number
  as_of: string
  totals: { events: number; signups: number }
  live: LiveFeed
  headline: { current: MonthBlock; previous: MonthBlock | null }
  north_star: MetricBlock
  useful_supply: MetricBlock
  match: MetricBlock
  habit: MetricBlock
  events_created: MetricBlock
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, { ...init, headers })
  if (res.status === 401) {
    setToken(null)
    throw new Error("No autenticado")
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function login(email: string, password: string) {
  return request<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
}

export function fetchMe() {
  return request<{ email: string; full_name: string | null; role: string }>("/auth/me")
}

export function fetchMetrics(granularity: Granularity, periods: number) {
  const q = new URLSearchParams({ granularity, periods: String(periods) })
  return request<MetricsResponse>(`/metrics?${q}`)
}

/** Un evento del catálogo, con sus dos cifras ya calculadas por el servidor. */
export type EventStatus = "en_curso" | "proximo" | "pasado" | "borrador" | "sin_fecha"

export type EventRow = {
  id: string
  title: string
  location: string | null
  capacity: number | null
  status: EventStatus
  starts_at: string | null
  ends_at: string | null
  signups: number
  check_ins: number
  /** null cuando no hay inscritos: un 0 % se leería como "no vino nadie". */
  rate: number | null
  /** null si el panel no tiene configurada la URL pública de Formulario. */
  public_url: string | null
}

export type EventsResponse = { as_of: string; timezone: string; total: number; events: EventRow[] }

export type EventAttendee = {
  id: string
  full_name: string
  email: string
  registered_at: string | null
  checked_in: boolean
  checked_in_at: string | null
}

export type EventDetail = { as_of: string; event: EventRow; attendees: EventAttendee[] }

export function fetchEvents() {
  return request<EventsResponse>("/events")
}

export function fetchEventDetail(id: string) {
  return request<EventDetail>(`/events/${id}`)
}
