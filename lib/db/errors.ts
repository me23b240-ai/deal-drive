export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Not allowed") {
    super(403, message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends HttpError {
  constructor(message = "Invalid input") {
    super(400, message);
    this.name = "ValidationError";
  }
}

export function errorStatus(error: unknown): number {
  return error instanceof HttpError ? error.status : 500;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown error";
}