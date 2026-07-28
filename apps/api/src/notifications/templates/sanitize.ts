import * as sanitizeHtmlModule from 'sanitize-html';

type SanitizeFn = (
  dirty: string,
  options?: sanitizeHtmlModule.IOptions,
) => string;

const sanitize: SanitizeFn =
  typeof (sanitizeHtmlModule as unknown) === 'function'
    ? (sanitizeHtmlModule as unknown as SanitizeFn)
    : (sanitizeHtmlModule as unknown as { default: SanitizeFn }).default;

/**
 * Conservative allowlist for notification HTML bodies.
 * This is the single choke-point where XSS-unsafe interpolated data is
 * neutralized before it becomes a RenderedNotification.body string.
 */
export function sanitizeHtml(input: string): string {
  return sanitize(input, {
    allowedTags: ['b', 'strong', 'em', 'i', 'a', 'br', 'p', 'span'],
    allowedAttributes: {
      a: ['href'],
    },
    // Strip everything else: <script>, <style>, on* handlers, etc.
    disallowedTagsMode: 'discard',
  });
}
