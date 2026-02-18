import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request & { correlationId?: string }, res: Response, next: NextFunction) {
    const id = (req.headers['x-correlation-id'] as string) || randomUUID();
    req.correlationId = id;
    res.setHeader('x-correlation-id', id);
    next();
  }
}
