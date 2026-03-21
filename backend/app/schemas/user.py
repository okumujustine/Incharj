from pydantic import BaseModel


class UserUpdateSchema(BaseModel):
    full_name: str | None = None
    avatar_url: str | None = None