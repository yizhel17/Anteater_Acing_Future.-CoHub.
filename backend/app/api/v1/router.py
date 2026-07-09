from fastapi import APIRouter

from app.api.v1.routes import courses, guide

api_router = APIRouter()
api_router.include_router(guide.router, prefix="/guide", tags=["guide"])
api_router.include_router(courses.router, prefix="/courses", tags=["courses"])
