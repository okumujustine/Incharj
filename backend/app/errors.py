class HttpError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class NotFoundError(HttpError):
    def __init__(self, detail: str = "Not found"):
        super().__init__(404, detail)


class BadRequestError(HttpError):
    def __init__(self, detail: str = "Bad request"):
        super().__init__(400, detail)


class UnauthorizedError(HttpError):
    def __init__(self, detail: str = "Unauthorized"):
        super().__init__(401, detail)


class ForbiddenError(HttpError):
    def __init__(self, detail: str = "Forbidden"):
        super().__init__(403, detail)


class ConflictError(HttpError):
    def __init__(self, detail: str = "Conflict"):
        super().__init__(409, detail)