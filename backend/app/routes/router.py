from fastapi import APIRouter

from app.routes.auth import router as auth_router
from app.routes.connectors import router as connectors_router
from app.routes.documents import router as documents_router
from app.routes.oauth import router as oauth_router
from app.routes.orgs import router as orgs_router
from app.routes.search import router as search_router
from app.routes.sync import router as sync_router
from app.routes.users import router as users_router

router = APIRouter()
router.include_router(auth_router, tags=["auth"])
router.include_router(users_router, tags=["users"])
router.include_router(orgs_router, tags=["orgs"])
router.include_router(connectors_router, tags=["connectors"])
router.include_router(oauth_router, tags=["oauth"])
router.include_router(sync_router, tags=["sync"])
router.include_router(documents_router, tags=["documents"])
router.include_router(search_router, tags=["search"])
