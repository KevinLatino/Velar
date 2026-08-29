/**
 * Une clases condicionales, ignorando falsy. Ligero, sin dependencias.
 *
 * El tipo sigue la convención de `clsx` (`string | number | bigint | boolean |
 * null | undefined`) porque los patrones `cond && 'clase'` producen el falsy de
 * `cond`, no solo `false` — con `title: ReactNode`, `title && 'x'` puede ser
 * `0` o `''`. `filter(Boolean)` los descarta igual.
 */
export type ClassValue = string | number | bigint | boolean | null | undefined;

export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}
