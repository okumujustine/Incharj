from app.workers.celery_app import celery_app

sync_queue_name = "sync_orchestration"
document_queue_name = "sync_documents"

__all__ = ["celery_app", "sync_queue_name", "document_queue_name"]