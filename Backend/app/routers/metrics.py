from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import require_admin
from app.services.auth_service import AdminUser
from app.services.north_star import list_metrics

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("")
def get_metrics(
    response: Response,
    granularity: Literal["week", "month"] = Query("month"),
    periods: int = Query(6, ge=1, le=36),
    db: Session = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    # El panel refresca solo; ningún intermediario debe servir una cifra vieja.
    response.headers["Cache-Control"] = "no-store"
    return list_metrics(db, granularity=granularity, periods=periods)
