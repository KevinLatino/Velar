export interface Span {
  end(attributes?: Record<string, unknown>): void;
}

export interface Tracer {
  startSpan(name: string, attributes?: Record<string, unknown>): Span;
}
