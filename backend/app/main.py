from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.auth import router as auth_router
from app.complaints import router as complaint_router
from app.config import get_settings
from app.evidence import router as evidence_router
from app.models import CATEGORY_LABELS
from app.security import Database

settings = get_settings()
app = FastAPI(title="GrievanceGrid API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)
auth_attempts: dict[str, deque] = defaultdict(deque)
auth_lock = Lock()


@app.middleware("http")
async def basic_guards(request: Request, call_next):
    length = request.headers.get("content-length")
    if length:
        try:
            if int(length) > 10 * 1024 * 1024:
                return JSONResponse({"detail": "Request too large"}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Invalid request length"}, status_code=400)
    # Development safeguard only. Production needs a shared gateway/IP rate limiter.
    if request.method == "POST" and request.url.path in (
        "/api/v1/auth/login",
        "/api/v1/auth/register",
    ):
        key = request.client.host if request.client else "unknown"
        with auth_lock:
            now = monotonic()
            while auth_attempts[key] and auth_attempts[key][0] < now - 60:
                auth_attempts[key].popleft()
            if len(auth_attempts[key]) >= 30:
                return JSONResponse(
                    {"detail": "Too many attempts; try again shortly"},
                    status_code=429,
                    headers={"Retry-After": "60"},
                )
            auth_attempts[key].append(now)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/ready")
def ready(db: Database):
    try:
        db.execute(text("SELECT 1 FROM users LIMIT 1"))
    except Exception:
        return JSONResponse({"status": "not_ready"}, status_code=503)
    return {"status": "ready"}


@app.get("/api/v1/config")
def public_config():
    return {
        "jurisdiction_id": settings.jurisdiction_id,
        "jurisdiction_name": settings.jurisdiction_name,
        "categories": [{"id": key, "label": label} for key, label in CATEGORY_LABELS.items()],
        "analysis_state": "disabled",
        "notice": "Academic prototype. Not an official government or emergency service.",
    }


app.include_router(auth_router, prefix="/api/v1")
app.include_router(complaint_router, prefix="/api/v1")
app.include_router(evidence_router, prefix="/api/v1")
