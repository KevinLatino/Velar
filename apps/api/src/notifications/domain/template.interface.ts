export interface TemplateRenderInput {
  templateId: string;
  locale: string;
  variant?: string;
  data: Record<string, unknown>;
}

export interface TemplateRenderOutput {
  subject: string;
  body: string;
}

/**
 * Synchronous, pure/deterministic: same input → byte-identical output.
 * Required for snapshot testing and idempotent render replay.
 */
export interface TemplateEngine {
  render(input: TemplateRenderInput): TemplateRenderOutput;
}
