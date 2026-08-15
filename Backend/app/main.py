from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.database.session import ping
from app.routers.auth import router as auth_router
from app.routers.metrics import router as metrics_router

app = FastAPI(title="Utopp Metrics", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(metrics_router)


@app.get("/health")
def health():
    ok = False
    try:
        ok = ping()
    except Exception:
        ok = False
    return {"ok": ok}
