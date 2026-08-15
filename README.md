# Utopp Metrics

Panel admin de la métrica estrella norte (asistencias verificadas) y tres métricas de apoyo.

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
