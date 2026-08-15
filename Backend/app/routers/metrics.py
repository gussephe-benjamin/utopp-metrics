from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import require_admin
from app.services.auth_service import AdminUser
from app.services.north_star import list_metrics

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("")
def get_metrics(
    granularity: Literal["week", "month", "year"] = Query("week"),
    periods: int = Query(8, ge=1, le=36),
    db: Session = Depends(get_db),
    _: AdminUser = Depends(require_admin),
):
    return list_metrics(db, granularity=granularity, periods=periods)
