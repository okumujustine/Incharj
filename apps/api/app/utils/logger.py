import structlog


def create_logger(name: str):
    return structlog.get_logger(name)