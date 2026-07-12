from fastapi import APIRouter

from app.api.v1.routes import auth, calendar, contributions, courses, guide, ratings

api_router = APIRouter()
api_router.include_router(guide.router, prefix="/guide", tags=["guide"])
api_router.include_router(courses.router, prefix="/courses", tags=["courses"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(ratings.router, prefix="/ratings", tags=["ratings"])
api_router.include_router(
    contributions.router, prefix="/contributions", tags=["contributions"]
)
api_router.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
