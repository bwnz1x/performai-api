export class GameError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode = 500
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export class AuthError extends GameError {
  constructor(message = 'authentication failed') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthError';
  }
}

export class FetchError extends GameError {
  constructor(message: string, statusCode = 500) {
    super(message, 'FETCH_ERROR', statusCode);
    this.name = 'FetchError';
  }
}

export class ParseError extends GameError {
  constructor(message: string) {
    super(message, 'PARSE_ERROR', 500);
    this.name = 'ParseError';
  }
}

export class RateLimitError extends GameError {
  constructor(message = 'upstream rate limited (SEGA error page)') {
    super(message, 'RATE_LIMITED', 429);
    this.name = 'RateLimitError';
  }
}
