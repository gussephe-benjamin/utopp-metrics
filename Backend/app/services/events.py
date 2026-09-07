"""El catálogo de eventos, con sus dos cifras y su lista de inscritos.

Las cuatro métricas del panel responden «cómo va todo». Esto responde la
pregunta de al lado, que hasta ahora no tenía sitio: «¿y este evento en
concreto?». Sirve para mirar un evento mientras está ocurriendo —cuántos
apuntados, cuántos ya entraron— y para revisar uno pasado sin abrir el panel
del organizador.

Los datos salen del mismo schema `formulario` que las métricas. No se escribe
nada: este panel solo lee.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

LIMA = ZoneInfo("America/Lima")

# `formulario.events` no siempre trae hora de fin: es una columna opcional
# (migración 0014). Sin ella se asume esta duración, igual que hace el resto
# del panel, para poder decidir si un evento está en curso.
ASSUMED_DURATION = timedelta(hours=3)


def _ends_sql(db: Session) -> str:
    """Expresión de fin de evento, tolerante a que la columna no exista aún.

    El panel de métricas y el de formulario despliegan por separado, así que
    puede haber una ventana en la que la migración no esté aplicada. Antes de
    componer el SQL se comprueba la columna en vez de confiar en que esté.
    """
    existe = db.execute(
        text(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'formulario'
              AND table_name = 'events'
              AND column_name = 'end_date_time'
            """
        )
    ).first()
    if existe:
        return "COALESCE(e.end_date_time, e.date_time + :duracion)"
    return "(e.date_time + :duracion)"


def _estado(inicio: datetime | None, fin: datetime | None, ahora: datetime, borrador: bool) -> str:
    if borrador:
        return "borrador"
    if inicio is None:
        return "sin_fecha"
    if fin is not None and inicio <= ahora < fin:
        return "en_curso"
    if inicio > ahora:
        return "proximo"
    return "pasado"


def _iso(dt: datetime | None) -> str | None:
    return dt.astimezone(LIMA).isoformat() if dt else None


def list_events(db: Session, *, limit: int = 200, public_base_url: str = "") -> dict:
    """Todos los eventos, del más reciente al más antiguo, con sus dos cifras.

    Las cifras se calculan con subconsultas agregadas y no con un JOIN a
    `attendees`: con el JOIN, un evento con 300 inscritos multiplicaba las
    filas antes de agrupar y la consulta crecía sin necesidad.
    """
    ahora = datetime.now(LIMA)
    ends = _ends_sql(db)
    base = public_base_url.rstrip("/")

    filas = db.execute(
        text(
            f"""
            SELECT e.id::text                AS id,
                   e.title                   AS title,
                   e.location                AS location,
                   e.capacity                AS capacity,
                   COALESCE(e.is_draft, false) AS is_draft,
                   e.date_time               AS starts_at,
                   {ends}                    AS ends_at,
                   COALESCE(s.inscritos, 0)  AS signups,
                   COALESCE(s.asistieron, 0) AS check_ins
            FROM formulario.events e
            LEFT JOIN (
                SELECT a.event_id,
                       COUNT(*)                                          AS inscritos,
                       COUNT(*) FILTER (WHERE t.checked_in IS TRUE)      AS asistieron
                FROM formulario.attendees a
                LEFT JOIN formulario.tickets t ON t.attendee_id = a.id
                GROUP BY a.event_id
            ) s ON s.event_id = e.id
            ORDER BY e.date_time DESC NULLS LAST
            LIMIT :limite
            """
        ),
        {"duracion": ASSUMED_DURATION, "limite": limit},
    ).all()

    eventos = []
    for f in filas:
        estado = _estado(f.starts_at, f.ends_at, ahora, bool(f.is_draft))
        inscritos = int(f.signups)
        asistieron = int(f.check_ins)
        eventos.append(
            {
                "id": f.id,
                "title": f.title,
                "location": f.location,
                "capacity": f.capacity,
                "status": estado,
                "starts_at": _iso(f.starts_at),
                "ends_at": _iso(f.ends_at),
                "signups": inscritos,
                "check_ins": asistieron,
                # None y no 0: sin inscritos no hay tasa que enseñar, y un 0 %
                # se leería como «vino nadie» en vez de «no se apuntó nadie».
                "rate": round(asistieron / inscritos, 4) if inscritos else None,
                "public_url": f"{base}/e/{f.id}" if base else None,
            }
        )

    return {
        "as_of": ahora.isoformat(),
        "timezone": str(LIMA),
        "total": len(eventos),
        "events": eventos,
    }


def event_attendees(db: Session, event_id: str, *, public_base_url: str = "") -> dict | None:
    """Un evento con su lista de inscritos. `None` si no existe.

    Devuelve a todos, con o sin ticket: quien se inscribió cuenta aunque su
    boleto no se haya llegado a emitir. El `LEFT JOIN` es lo que lo garantiza.
    """
    ahora = datetime.now(LIMA)
    ends = _ends_sql(db)
    base = public_base_url.rstrip("/")

    cab = db.execute(
        text(
            f"""
            SELECT e.id::text AS id, e.title, e.location, e.capacity,
                   COALESCE(e.is_draft, false) AS is_draft,
                   e.date_time AS starts_at, {ends} AS ends_at
            FROM formulario.events e
            WHERE e.id = CAST(:id AS uuid)
            """
        ),
        {"id": event_id, "duracion": ASSUMED_DURATION},
    ).first()
    if cab is None:
        return None

    filas = db.execute(
        text(
            """
            SELECT a.id::text        AS id,
                   a.full_name       AS full_name,
                   a.email           AS email,
                   a.registered_at   AS registered_at,
                   COALESCE(t.checked_in, false) AS checked_in,
                   t.checked_in_at   AS checked_in_at
            FROM formulario.attendees a
            LEFT JOIN formulario.tickets t ON t.attendee_id = a.id
            WHERE a.event_id = CAST(:id AS uuid)
            ORDER BY a.registered_at DESC NULLS LAST
            """
        ),
        {"id": event_id},
    ).all()

    inscritos = [
        {
            "id": f.id,
            "full_name": f.full_name,
            "email": f.email,
            "registered_at": _iso(f.registered_at),
            "checked_in": bool(f.checked_in),
            "checked_in_at": _iso(f.checked_in_at),
        }
        for f in filas
    ]
    asistieron = sum(1 for i in inscritos if i["checked_in"])

    return {
        "as_of": ahora.isoformat(),
        "event": {
            "id": cab.id,
            "title": cab.title,
            "location": cab.location,
            "capacity": cab.capacity,
            "status": _estado(cab.starts_at, cab.ends_at, ahora, bool(cab.is_draft)),
            "starts_at": _iso(cab.starts_at),
            "ends_at": _iso(cab.ends_at),
            "signups": len(inscritos),
            "check_ins": asistieron,
            "rate": round(asistieron / len(inscritos), 4) if inscritos else None,
            "public_url": f"{base}/e/{cab.id}" if base else None,
        },
        "attendees": inscritos,
    }
