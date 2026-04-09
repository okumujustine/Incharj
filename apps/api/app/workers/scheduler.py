from __future__ import annotations

from app.workers.tasks.sync import dispatch


def dispatch_due_syncs() -> dict:
    result = dispatch.delay()
    return {"task_id": result.id}
