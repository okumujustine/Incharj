from __future__ import annotations

from typing import Literal


SyncStage = Literal["enumeration", "fetch", "normalize", "index", "checkpoint"]


class SyncErrorCode:
    CONNECTOR_NOT_FOUND = "CONNECTOR_NOT_FOUND"
    INVALID_CONFIG = "INVALID_CONFIG"
    UNAUTHORIZED = "UNAUTHORIZED"
    ENUMERATION_FAILED = "ENUMERATION_FAILED"
    FETCH_FAILED = "FETCH_FAILED"
    EMPTY_CONTENT = "EMPTY_CONTENT"
    PARSE_FAILED = "PARSE_FAILED"
    INDEXING_FAILED = "INDEXING_FAILED"
    CHECKPOINT_FAILED = "CHECKPOINT_FAILED"
    UNKNOWN = "UNKNOWN"


class SyncPipelineError(Exception):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        stage: SyncStage,
        retriable: bool = False,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.stage = stage
        self.retriable = retriable
        if cause is not None:
            self.__cause__ = cause


def to_sync_pipeline_error(error: BaseException, fallback_stage: SyncStage) -> SyncPipelineError:
    if isinstance(error, SyncPipelineError):
        return error
    return SyncPipelineError(
        code=SyncErrorCode.UNKNOWN,
        stage=fallback_stage,
        message=str(error),
        retriable=False,
        cause=error,
    )
