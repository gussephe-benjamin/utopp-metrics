const TOKEN_KEY = "utopp_metrics_token"
const API = (import.meta.env.VITE_API_URL || "http://localhost:8002").replace(/\/$/, "")

export type SeriesPoint = {
  start: string
  end: string
  value: number | null
  numerator: number
  denominator: number
}

export type MetricBlock = {
  available: boolean
  kind: "count" | "rate"
  range: { value: number | null; delta_pct: number | null }
  series: SeriesPoint[]
}

export type LifetimeBlock = {
  first_event_at: string | null
  last_event_at: string | null
  as_of: string
  north_star: MetricBlock
  useful_supply: MetricBlock
  match: MetricBlock
  habit: MetricBlock
}

export type MetricsResponse = {
  timezone: string
  granularity: "week" | "month" | "year"
  periods: number
  lifetime: LifetimeBlock
  north_star: MetricBlock
  useful_supply: MetricBlock
  match: MetricBlock
  habit: MetricBlock
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

export function fetchMetrics(granularity: string, periods: number) {
  const q = new URLSearchParams({ granularity, periods: String(periods) })
  return request<MetricsResponse>(`/metrics?${q}`)
}
