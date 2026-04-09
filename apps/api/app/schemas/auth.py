from pydantic import BaseModel, EmailStr, Field


class RegisterSchema(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = None


class LoginSchema(BaseModel):
    email: EmailStr
    password: str