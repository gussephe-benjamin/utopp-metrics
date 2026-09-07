from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.dependencies.auth import require_admin
from app.services.auth_service import AdminUser
from app.services.events import event_attendees, list_events

router = APIRouter(prefix="/events", tags=["events"])


@router.get("")
def get_events(
    response: Response,
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """Todos los eventos con sus inscritos y sus check-ins."""
    # Un evento en curso cambia de cifra cada minuto.
    response.headers["Cache-Control"] = "no-store"
    return list_events(db, limit=limit, public_base_url=settings.FORMULARIO_PUBLIC_URL)


@router.get("/{event_id}")
def get_event_attendees(
    event_id: str,
    response: Response,
    db: Session = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    """Un evento con la lista de quienes se inscribieron."""
    response.headers["Cache-Control"] = "no-store"
    try:
        datos = event_attendees(db, event_id, public_base_url=settings.FORMULARIO_PUBLIC_URL)
    except Exception:
        # Un id que no es UUID revienta el CAST: es petición mal formada, no un 500.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado")
    if datos is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado")
    return datos
