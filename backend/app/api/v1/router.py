from fastapi import APIRouter

from app.api.v1 import (
    analytics,
    applications,
    auth,
    calendar,
    contacts,
    export,
    health,
    match,
    reminders,
    resumes,
    tags,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(applications.router)
api_router.include_router(tags.router)
api_router.include_router(contacts.router)
api_router.include_router(analytics.router)
api_router.include_router(resumes.router)
api_router.include_router(reminders.router)
api_router.include_router(calendar.router)
api_router.include_router(match.router)
api_router.include_router(export.router)
