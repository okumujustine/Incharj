export class HttpError extends Error {
  statusCode: number;
  headers?: Record<string, string>;

  constructor(
    statusCode: number,
    message: string,
    headers?: Record<string, string>
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.headers = headers;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Not authenticated") {
    super(401, message, { "WWW-Authenticate": "Bearer" });
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Insufficient permissions") {
    super(403, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Resource already exists") {
    super(409, message);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad request") {
    super(400, message);
  }
}
