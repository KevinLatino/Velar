import { Logger } from '@nestjs/common';
import type { Span, Tracer } from '../domain/tracing.interface';

class ConsoleSpan implements Span {
  constructor(
    private readonly name: string,
    private readonly startedAt: number,
    private readonly logger: Logger,
  ) {}

  end(attributes?: Record<string, unknown>): void {
    const durationMs = Date.now() - this.startedAt;
    this.logger.debug(
      JSON.stringify({ span: this.name, durationMs, ...attributes }),
    );
  }
}

/** Local-debug tracer — structured console lines, no external vendor. */
export class ConsoleTracer implements Tracer {
  private readonly logger = new Logger('ConsoleTracer');

  startSpan(name: string, _attributes?: Record<string, unknown>): Span {
    return new ConsoleSpan(name, Date.now(), this.logger);
  }
}
