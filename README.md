# Utopp Metrics

Panel admin de la métrica estrella norte (asistencia verificada / inscripciones) y tres métricas de apoyo, todas como porcentaje y **todas mensuales**.

La estrella norte pertenece al mes del evento: cada evento aporta sus inscritos y sus asistentes al mes en que ocurre, así que un evento de octubre no altera la cifra de septiembre. El mes en curso se actualiza en vivo y arranca de cero el día 1.

Definiciones: [METRICS.md](./METRICS.md).

## Panel

Tema oscuro con **sidebar de administrador** pegado al borde izquierdo, a lo alto de la ventana; el contenido se centra en el espacio restante.

En escritorio funciona como rail: 68 px de solo iconos, que se abre a 260 px **al pasar el cursor** (o al recibir foco de teclado) montándose sobre el contenido, sin moverlo. El chevrón del encabezado lo **fija abierto**; ahí sí empuja el contenido, para que nada quede tapado de forma permanente. El estado fijado se guarda en `localStorage`.

La navegación agrupa en `Principal` (Resumen), `Métricas` — un ítem por métrica, cada uno mostrando su cifra del mes — y `Otro` (glosario). Abajo, el usuario y cerrar sesión.

La vista vive en el hash (`#/resumen`, `#/north_star`, `#/useful_supply`, `#/match`, `#/habit`, `#/glossary`), así que se puede compartir el link de una métrica y recargar sin perder el sitio. Bajo 1100 px el rail desaparece y el sidebar pasa a cajón con botón de menú y scrim.

`Resumen` apila las cuatro secciones; cada ítem de `Métricas` muestra esa sola, en tamaño grande.

Una sección por métrica. Cada sección trae la cifra del mes en curso, el delta en puntos porcentuales contra el mes cerrado, el desglose numerador / denominador y dos gráficas (Chart.js):

- **Cómo se armó el mes** — línea del acumulado diario; su último punto es la cifra grande.
- **Histórico** — barras de numerador y denominador más la línea de la tasa, en ventanas de semana o mes.

Van una debajo de otra, cada una en su tarjeta: lado a lado quedaban demasiado estrechas y sus ejes competían.

`Resumen` abre con una fila de dos columnas por encima de las métricas: **Eventos creados** (volumen — conteo, no tasa, con la barra del periodo en curso destacada) y, a la derecha, **Quién se está sumando**, el feed en vivo. Las dos listas —últimos check-in y últimos pendientes— comparten un solo espacio y se alternan con un selector: apiladas, el panel crecía hasta el doble que la columna de al lado. Cada fila lleva solo nombre, correo, estado y hace cuánto; el evento y el aula van en el `title`.

El indicador **En vivo** de la cabecera se enciende únicamente cuando hay algún evento ocurriendo en ese momento; si no, el punto queda apagado y dice "Nada en curso".

Código de color constante en las cuatro secciones: **azul** = denominador, **naranja** = numerador, **turquesa** = la tasa. Responsive de 390 px en adelante; el panel repregunta al API cada 30 s.

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
