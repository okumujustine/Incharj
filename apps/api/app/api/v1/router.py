from fastapi import APIRouter

from app.api.v1.routes.health import router as health_router
from app.routes.router import router as backend_router


api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(backend_router)
