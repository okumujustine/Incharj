from pydantic import BaseModel, EmailStr


class OrgCreateSchema(BaseModel):
    slug: str
    name: str


class OrgUpdateSchema(BaseModel):
    name: str | None = None
    settings: dict | None = None


class InviteSchema(BaseModel):
    email: EmailStr
    role: str = "member"


class OrgSummarySchema(BaseModel):
    id: str
    slug: str
    name: str
    plan: str | None
    role: str