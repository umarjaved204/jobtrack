import uuid

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.resume import ResumeCreate, ResumeRead, ResumeSummary, ResumeUpdate
from app.services import resumes as service

router = APIRouter(prefix="/resumes", tags=["resumes"])


@router.get("", response_model=list[ResumeSummary])
def list_resumes(user: CurrentUser, db: DbSession) -> list[ResumeSummary]:
    return service.list_resumes(db, user)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ResumeRead)
def create_resume(data: ResumeCreate, user: CurrentUser, db: DbSession) -> ResumeRead:
    return service.create_resume(db, user, data)


@router.get("/{resume_id}", response_model=ResumeRead)
def get_resume(resume_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ResumeRead:
    return service.get_resume(db, user, resume_id)


@router.patch(
    "/{resume_id}",
    response_model=ResumeRead,
    responses={409: {"description": "Text of a used version, or archived as default"}},
)
def update_resume(
    resume_id: uuid.UUID, data: ResumeUpdate, user: CurrentUser, db: DbSession
) -> ResumeRead:
    return service.update_resume(db, user, resume_id, data)


@router.delete(
    "/{resume_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={409: {"description": "In use: archive it instead"}},
)
def delete_resume(resume_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_resume(db, user, resume_id)
