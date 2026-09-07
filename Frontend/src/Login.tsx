import { FormEvent, useState } from "react"
import { login, setToken } from "./api"
import { Icon } from "./Sidebar"

export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await login(email, password)
      setToken(res.access_token)
      onDone()
    } catch (err) {
      // `fetch` lanza TypeError sin red: su "Failed to fetch" no sirve al usuario.
      setError(
        err instanceof TypeError
          ? "No se pudo contactar con el servidor. Revisa tu conexión e inténtalo de nuevo."
          : err instanceof Error && err.message
            ? err.message
            : "No se pudo entrar. Inténtalo de nuevo."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <main className="login-card">
        <div className="login-brand">
          <span className="brand-mark login-mark">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M2 12h4l2.5-7 5 14 2.5-7H22"
                stroke="#0b1018"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="login-brand-text">
            <span className="sb-name">Utopp</span>
            <span className="sb-sub">Panel de métricas</span>
          </span>
        </div>

        <h1>Pulso de Asistencia</h1>
        <p className="muted login-lede">
          Estrella norte y métricas de apoyo. Solo administrador o root.
        </p>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="login-email">Correo</label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">Contraseña</label>
            <div className="field-control">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
              />
              <button
                type="button"
                className="field-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Ocultar la contraseña" : "Mostrar la contraseña"}
                title={showPassword ? "Ocultar la contraseña" : "Mostrar la contraseña"}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={17} />
              </button>
            </div>
          </div>

          {error ? (
            <p className="error login-error" id="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="login-submit" disabled={busy} aria-busy={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </main>
    </div>
  )
}
