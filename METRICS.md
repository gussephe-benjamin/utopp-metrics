# Contrato de métricas — estrella norte Utopp

Timezone: `America/Lima`.
Semana: lunes 00:00 → domingo 23:59.
Mes / año: calendario.

Las tasas del rango se calculan **pooled**: suma de numeradores / suma de denominadores. Nunca se promedian los ratios de cada barra.

## Estrella norte — asistencias verificadas

Pares únicos `(lower(email), event_id)` con `formulario.tickets.checked_in IS TRUE`.
El bucket es `checked_in_at`, no `registered_at`.
Excluye `formulario.events.is_draft`.

Cifra del rango: suma de las barras.

**Puente:** si hay casi 0 QR, mostrar inscripciones (ticket creado) al lado. No sustituye la estrella norte.

## Oferta útil

Eventos `is_draft IS FALSE` cuyo `created_at` cae en el bucket y que recibieron ≥1 inscripción en los **7 días** posteriores a publicar.

Cifra del rango: suma de las barras.

## Match — tasa de inscripción

`inscripciones (attendees.registered_at)` / vistas únicas `(user_id, event_id)` de `public.activity_events` con `event_type = 'event_viewed'` en el mismo bucket.

Si aún no hay filas `event_viewed`, la API responde `available: false`.

Cifra del rango: pooled.

## Hábito

- Semana / mes: estudiantes con ≥2 check-ins en los **30 días** que cierran el bucket / estudiantes con ≥1 check-in **en el bucket**.
- Año: ≥2 asistencias en el año / ≥1 asistencia en el año.

Cifra del rango: pooled.

## Delta

Mismo número de periodos, inmediatamente anteriores al rango visible.
`delta_pct = (actual - anterior) / anterior * 100`. Si el anterior es 0, `null`.
