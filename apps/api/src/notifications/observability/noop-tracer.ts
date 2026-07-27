import type { Span, Tracer } from '../domain/tracing.interface';

class NoopSpan implements Span {
  end(_attributes?: Record<string, unknown>): void {
    // no-op — default when no tracing backend is configured
  }
}

export class NoopTracer implements Tracer {
  startSpan(_name: string, _attributes?: Record<string, unknown>): Span {
    return new NoopSpan();
  }
}
