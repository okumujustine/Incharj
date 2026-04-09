from celery import Celery

from app.core.config import settings


celery_app = Celery(
    "incharj",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks.sync"],
)

# BullMQ to Celery queue mapping:
# - incharj-sync -> sync_orchestration
# - incharj-sync-documents -> sync_documents
celery_app.conf.task_default_queue = "sync_orchestration"
celery_app.conf.task_routes = {
    "app.workers.tasks.sync.dispatch": {"queue": "sync_orchestration"},
    "app.workers.tasks.sync.sync_enumerate": {"queue": "sync_orchestration"},
    "app.workers.tasks.sync.sync_finalize": {"queue": "sync_orchestration"},
    "app.workers.tasks.sync.sync_document": {"queue": "sync_documents"},
}

celery_app.conf.beat_schedule = {
    "dispatch-due-syncs-every-30s": {
        "task": "app.workers.tasks.sync.dispatch",
        "schedule": 30.0,
    }
}
