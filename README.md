# Utopp Metrics

Panel admin de la métrica estrella norte (asistencia verificada / inscripciones) y tres métricas de apoyo, todas como porcentaje.

Definiciones: [METRICS.md](./METRICS.md).

## Local

Requiere el network `utopp_default` y Postgres de Utopp Plataforma.

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:8002/docs
- Panel: http://localhost:5175

Login: email/password de un usuario Utopp con rol `administrador` o `root`.

## Deploy (Render)

El MCP no puede clonar `utopp-metrics` hasta que la GitHub App de Render tenga **acceso a este repo** (hoy solo ve repos ya autorizados como Utopp).

1. En GitHub: Settings del usuario → Applications → Render → Configure → marca `utopp-metrics`.
2. En cada cuenta donde quieras el panel (Redes o UTEC), abre:
   [Apply Blueprint](https://dashboard.render.com/blueprint/new?repo=https://github.com/gussephe-benjamin/utopp-metrics)
3. Completa:
   - **DATABASE_URL**: connection string de la Postgres de Utopp (interna si el API está en el mismo workspace; externa + `sslmode=require` si está en Redes).
   - **CORS_ORIGINS**: orígenes del panel, separados por coma (`https://www.metrics.utopp.app`, `https://metrics.utopp.app`, y el `onrender.com` de respaldo).
   - **VITE_API_URL** (build del static): URL pública del API, sin slash final.

El API escucha `0.0.0.0:$PORT` y `/health`. El panel es un static site con `publish path` `Frontend/dist`.
