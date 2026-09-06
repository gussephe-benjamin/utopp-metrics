# Contrato de métricas — estrella norte Utopp

Timezone: `America/Lima`.
Semana: lunes 00:00 → domingo 23:59.
Mes: calendario. **El mes es la unidad de la métrica**: arranca de cero el día 1.
Las cuatro métricas son **tasas**. Se muestran como porcentaje.

Las tasas de un rango se calculan **pooled**: suma de numeradores / suma de denominadores. Nunca se promedian los ratios de cada barra.

Excluye `formulario.events.is_draft`.

Un bucket en curso se cierra en **ahora**: nada del futuro entra en la cifra. Los datos se leen en vivo (el panel repregunta cada 30 s, la respuesta va con `Cache-Control: no-store`).

El panel tiene dos lecturas:

- **Mes en curso:** el mes calendario actual, acumulándose. Al lado, el último mes ya cerrado, como referencia. Delta de cada uno contra su mes anterior.
- **Historial:** ventanas week / month, `periods` bloques hacia atrás. Delta vs el bloque anterior del mismo largo.

## Estrella norte — asistencia verificada

**El bucket lo fija el evento, no el timestamp de la inscripción ni el del check-in.**

Un evento pertenece al periodo de su `date_time` y aporta ahí **toda** su gente, sin importar cuándo se registró. Así los inscritos de un evento de octubre no mueven la cifra de septiembre.

Un evento entra en cuanto su `date_time` queda atrás (`date_time < ahora`). `formulario.events` no guarda hora de fin, así que "terminado" es "ya empezó". Durante el evento el porcentaje sube con cada check-in.

Por cada evento del bucket:

- **Numerador:** emails únicos (`lower(email)`) con `formulario.tickets.checked_in IS TRUE`.
- **Denominador:** emails únicos en `formulario.attendees`.

Cifra del periodo: pooled sobre sus eventos. Un evento sin inscritos aporta `0/0` y no mueve nada.

## Oferta útil

**Numerador:** eventos no-draft con ≥1 inscripción en los **7 días** posteriores a `created_at`.
**Denominador:** eventos no-draft publicados (`created_at` en el bucket).

Un evento cuya ventana de 7 días **sigue abierta** (`created_at + 7d > ahora`) no entra en ninguno de los dos lados: si no, lo recién publicado castigaría al mes en curso.

Cifra: pooled.

## Match — tasa de inscripción

**Numerador:** inscripciones (`attendees.registered_at`) en el bucket.
**Denominador:** vistas únicas `(user_id, event_id)` de `public.activity_events` con `event_type = 'event_viewed'` en el mismo bucket.

Si aún no hay filas `event_viewed`, la API responde `available: false`.

Cifra: pooled.

## Hábito

Estudiantes con ≥2 check-ins en los **30 días** que cierran el bucket / estudiantes con ≥1 check-in **en el bucket**.

Cifra: pooled.

## Eventos creados (volumen)

No es una tasa: es el conteo de eventos no-draft con `created_at` en el bucket.

A diferencia de Oferta útil, **no** aplica el filtro de madurez de 7 días: aquí la pregunta es cuánto se publicó, no cuánto tuvo tiempo de conseguir tracción. Como todo bucket en curso, no cuenta nada posterior a `ahora`.

Viaja como bloque `kind: "count"`: `value` y `numerator` llevan el conteo y `denominator` va en 0. Su delta se lee en **eventos**, no en pp ni en porcentaje.

## Feed en vivo

No es una métrica: no se agrega ni se bucketea. Son los movimientos más recientes, para leer el pulso operativo.

- `live.active_events` — eventos ocurriendo **ahora mismo**: `date_time <= ahora < fin`. El fin sale de `COALESCE(end_date_time, date_time + 2 h)`; las 2 h son la misma `ASSUMED_EVENT_DURATION_HOURS` de Utopp Formulario. La existencia de `end_date_time` se comprueba en `information_schema`, así que el cálculo mejora solo si la columna aparece o desaparece.
- `live.check_ins` — tickets con `checked_in IS TRUE`, ordenados por `checked_in_at DESC`.
- `live.pending` — inscritos sin check-in (`LEFT JOIN` a tickets, para cubrir al que ni siquiera lo tiene), ordenados por `registered_at DESC`.

10 filas por lado. Cada fila trae `name`, `email`, `event`, `location`, `event_at` y `at`.

El indicador **En vivo** de la cabecera se enciende solo si `active_events` no está vacío: un punto latiendo sin nada ocurriendo miente.

`event_at` viaja para que el panel distinga **pendiente** (el evento aún no ocurre) de **no asistió** (ya pasó y nunca escaneó). Sin esa fecha, ambos casos se verían igual.

Excluye borradores, como todo lo demás.

## Delta

- **Mes en curso / mes cerrado:** contra el mes inmediatamente anterior.
- **Historial:** mismo número de periodos, inmediatamente anteriores al rango visible.

`delta_pct = (actual - anterior) / anterior * 100`. Si el anterior es 0 o `null`, `null`.

El panel **no** muestra ese número: como las cuatro métricas son tasas, el chip compara en **puntos porcentuales** (`(actual - anterior) * 100`), que se lee sin ambigüedad — de 40 % a 45 % son +5 pp, no +12,5 %.

## Forma de la respuesta

```
GET /metrics?granularity=week|month&periods=1..36
```

```jsonc
{
  "timezone": "America/Lima",
  "granularity": "month",
  "periods": 6,
  "as_of": "2026-09-06T15:47:23-05:00",
  "totals": { "events": 150, "signups": 2449 },
  "live": { "active_events": [ ... ], "check_ins": [ ... ], "pending": [ ... ] },
  "headline": {
    "current":  { "start": "...", "end": "...", "closed": false, "as_of": "...",
                  "north_star": Block, "useful_supply": Block, "match": Block,
                  "habit": Block, "events_created": Block },
    "previous": { "...": "igual, con closed: true" }
  },
  "north_star": Block, "useful_supply": Block, "match": Block, "habit": Block,
  "events_created": Block  // kind: "count"
}
```

`Block` = `{ available, kind: "rate", range: { value, delta_pct }, series: [...], trend: [...] }`.

- `series`: `{ start, end, value, numerator, denominator }`. Los bloques de `headline` traen un solo punto (el mes); los de primer nivel, uno por periodo.
- `trend`: acumulado diario, `{ date, as_of, value, numerator, denominator }`, un punto por día transcurrido. **Solo lo trae `headline.current`** — es el único bloque que sigue moviéndose. Cada punto es la misma métrica recalculada moviendo el corte al fin de ese día (el del día en curso corta en `ahora`), así que el último punto es por construcción la cifra del mes.

`totals` trae los acumulados de contexto del pie de página: `{ events, signups }` sobre todo lo no-draft.

## Cómo se calcula (glosario del panel)

**Estrella norte.** De los eventos que ya ocurrieron en el periodo, qué fracción de sus inscritos apareció con QR. Un par persona-evento cuenta una vez, y siempre en el mes del evento.

**Oferta útil.** Qué fracción de eventos publicados consiguió al menos una inscripción en su primera semana.

**Match.** De quienes vieron el detalle de un evento, cuántos se inscribieron. Requiere `event_viewed`.

**Hábito.** De quienes ya asistieron en el periodo, cuántos volvieron a otro evento (regla de 30 días).

**Pooled.** El % de un rango no es el promedio de las barras: se suman numeradores y denominadores y recién ahí se divide.

**Timezone.** Todo en `America/Lima`.
