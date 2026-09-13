/** Domain error that maps 1:1 to an HTTP response. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  notFound: (msg = "Resource not found") => new AppError(404, msg, "NOT_FOUND"),
  conflict: (msg = "Conflict") => new AppError(409, msg, "CONFLICT"),
  badRequest: (msg = "Bad request") => new AppError(400, msg, "BAD_REQUEST"),
  unauthorized: (msg = "Unauthorized") => new AppError(401, msg, "UNAUTHORIZED"),
  forbidden: (msg = "Forbidden") => new AppError(403, msg, "FORBIDDEN"),
  gone: (msg = "Lock expired") => new AppError(410, msg, "LOCK_EXPIRED"),
};