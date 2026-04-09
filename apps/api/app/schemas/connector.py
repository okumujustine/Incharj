from pydantic import BaseModel, Field


class ConnectorCreateSchema(BaseModel):
    kind: str = "google_drive"
    name: str
    config: dict | None = None
    sync_frequency: str = "1 hour"


class ConnectorUpdateSchema(BaseModel):
    name: str | None = None
    config: dict | None = None
    sync_frequency: str | None = None