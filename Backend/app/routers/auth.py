from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.database.session import get_db
from app.dependencies.auth import require_admin
from app.schemas.auth import LoginIn, MeOut, TokenOut
from app.services.auth_service import AdminUser, authenticate_admin

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = authenticate_admin(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas o sin rol admin",
        )
    return TokenOut(access_token=create_access_token(user.email))


@router.get("/me", response_model=MeOut)
def me(user: AdminUser = Depends(require_admin)):
    return MeOut(email=user.email, full_name=user.full_name, role=user.role)
