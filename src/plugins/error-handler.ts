import { Elysia } from 'elysia';

import { GameError } from '@/lib/errors';

export const errorHandler = new Elysia({ name: 'error-handler' }).onError(
  { as: 'global' },
  ({ code, error, set, request }) => {
    const url = new URL(request.url);
    console.error(
      `[ERROR] ${request.method} ${url.pathname} -> ${code}:`,
      error instanceof Error ? error.message : error
    );
    if (code === 'VALIDATION') {
      set.status = 422;
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
        },
      };
    }

    if (error instanceof GameError) {
      set.status = error.statusCode;
      return {
        error: { code: error.code, message: error.message },
      };
    }

    const message = error instanceof Error ? error.message : 'internal error';
    set.status = 500;
    return {
      error: { code: 'INTERNAL_ERROR', message },
    };
  }
);
