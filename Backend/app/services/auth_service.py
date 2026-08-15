from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import verify_password

ADMIN_ROLES = ("administrador", "root")


@dataclass
class AdminUser:
    id: int
    email: str
    full_name: str | None
    role: str


def get_admin_by_email(db: Session, email: str) -> AdminUser | None:
    row = db.execute(
        text(
            """
            SELECT u.id, u.email, u.full_name, r.name AS role
            FROM public.users u
            JOIN public.user_roles ur ON ur.user_id = u.id
            JOIN public.roles r ON r.id = ur.role_id
            WHERE lower(u.email) = lower(:email)
              AND r.name IN ('administrador', 'root')
            ORDER BY CASE r.name WHEN 'root' THEN 0 ELSE 1 END
            LIMIT 1
            """
        ),
        {"email": email.strip()},
    ).first()
    if row is None:
        return None
    return AdminUser(id=row.id, email=row.email, full_name=row.full_name, role=row.role)


def authenticate_admin(db: Session, email: str, password: str) -> AdminUser | None:
    row = db.execute(
        text(
            """
            SELECT u.id, u.email, u.full_name, u.hashed_password, r.name AS role
            FROM public.users u
            JOIN public.user_roles ur ON ur.user_id = u.id
            JOIN public.roles r ON r.id = ur.role_id
            WHERE lower(u.email) = lower(:email)
              AND r.name IN ('administrador', 'root')
            ORDER BY CASE r.name WHEN 'root' THEN 0 ELSE 1 END
            LIMIT 1
            """
        ),
        {"email": email.strip()},
    ).first()
    if row is None or not verify_password(password, row.hashed_password):
        return None
    return AdminUser(id=row.id, email=row.email, full_name=row.full_name, role=row.role)
