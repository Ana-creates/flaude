/**
 * Validation utilities that can be used in both plugin and UI
 */

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function validateFrameDimensions(
  width: number,
  height: number
): { valid: boolean; error?: string } {
  if (!isPositiveNumber(width)) {
    return { valid: false, error: 'Width must be a positive number' };
  }
  if (!isPositiveNumber(height)) {
    return { valid: false, error: 'Height must be a positive number' };
  }
  if (width > 10000 || height > 10000) {
    return { valid: false, error: 'Dimensions cannot exceed 10000px' };
  }
  return { valid: true };
}
