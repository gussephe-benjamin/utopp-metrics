# Contrato de métricas — estrella norte Utopp

Timezone: `America/Lima`.
Semana: lunes 00:00 → domingo 23:59.
Mes / año: calendario.
Las cuatro métricas son **tasas**. Se muestran como porcentaje.

Las tasas del rango se calculan **pooled**: suma de numeradores / suma de denominadores. Nunca se promedian los ratios de cada barra.

Excluye `formulario.events.is_draft`.

El panel tiene dos lecturas:

- **Tiempo real (lifetime):** desde `MIN(created_at)` de eventos no-draft hasta **ahora**. La fecha del último evento es contexto, no corte. Sin delta.
- **Temporal:** ventanas week / month / year. Delta vs el bloque anterior del mismo largo.

## Estrella norte — asistencia verificada

**Numerador:** pares únicos `(lower(email), event_id)` con `formulario.tickets.checked_in IS TRUE`.
Bucket temporal del numerador: `checked_in_at`.

**Denominador:** pares únicos `(lower(email), event_id)` en `formulario.attendees`.
Bucket temporal del denominador: `registered_at`.

Cifra: pooled. Lifetime: mismos pares en `[primer evento, ahora)`.

## Oferta útil

**Numerador:** eventos no-draft con ≥1 inscripción en los **7 días** posteriores a `created_at`.
**Denominador:** eventos no-draft publicados (`created_at` en el bucket).

Cifra: pooled. Lifetime: todos los no-draft desde el primer evento hasta ahora.

## Match — tasa de inscripción

**Numerador:** inscripciones (`attendees.registered_at`) en el bucket.
**Denominador:** vistas únicas `(user_id, event_id)` de `public.activity_events` con `event_type = 'event_viewed'` en el mismo bucket.

Si aún no hay filas `event_viewed`, la API responde `available: false`.

Cifra: pooled. Lifetime: mismo recorte `[primer evento, ahora)`.

## Hábito

- Semana / mes: estudiantes con ≥2 check-ins en los **30 días** que cierran el bucket / estudiantes con ≥1 check-in **en el bucket**.
- Año: ≥2 asistencias en el año / ≥1 asistencia en el año.
- Lifetime: estudiantes con ≥2 check-ins históricos / estudiantes con ≥1 check-in histórico.

Cifra: pooled.

## Delta (solo temporal)

Mismo número de periodos, inmediatamente anteriores al rango visible.
`delta_pct = (actual - anterior) / anterior * 100`. Si el anterior es 0, `null`.
El bloque lifetime no tiene delta.

## Cómo se calcula (glosario del panel)

**Estrella norte.** Qué fracción de inscripciones terminó en asistencia verificada (QR). Un par persona-evento cuenta una vez.

**Oferta útil.** Qué fracción de eventos publicados consiguió al menos una inscripción en la primera semana.

**Match.** De quienes vieron el detalle de un evento, cuántos se inscribieron. Requiere `event_viewed`.

**Hábito.** De quienes ya asistieron en el periodo, cuántos volvieron a otro evento (regla de 30 días / año / histórico).

**Pooled.** El % de un rango no es el promedio de las barras: se suman numeradores y denominadores y recién ahí se divide.

**Timezone.** Todo en `America/Lima`.
