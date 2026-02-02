import { describe, it, expect } from 'vitest';
import {
  isPositiveNumber,
  isNonEmptyString,
  clamp,
  validateFrameDimensions,
} from '../../src/shared/utils/validation';

describe('validation utilities', () => {
  describe('isPositiveNumber', () => {
    it('returns true for positive numbers', () => {
      expect(isPositiveNumber(1)).toBe(true);
      expect(isPositiveNumber(100)).toBe(true);
      expect(isPositiveNumber(0.5)).toBe(true);
    });

    it('returns false for non-positive numbers', () => {
      expect(isPositiveNumber(0)).toBe(false);
      expect(isPositiveNumber(-1)).toBe(false);
      expect(isPositiveNumber(-100)).toBe(false);
    });

    it('returns false for non-numbers', () => {
      expect(isPositiveNumber('1')).toBe(false);
      expect(isPositiveNumber(null)).toBe(false);
      expect(isPositiveNumber(undefined)).toBe(false);
      expect(isPositiveNumber(NaN)).toBe(false);
      expect(isPositiveNumber(Infinity)).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('returns true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('  hello  ')).toBe(true);
    });

    it('returns false for empty or whitespace strings', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString('\t\n')).toBe(false);
    });

    it('returns false for non-strings', () => {
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
    });
  });

  describe('clamp', () => {
    it('clamps values within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('handles edge cases', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe('validateFrameDimensions', () => {
    it('validates correct dimensions', () => {
      const result = validateFrameDimensions(400, 300);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects invalid width', () => {
      const result = validateFrameDimensions(0, 300);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Width');
    });

    it('rejects invalid height', () => {
      const result = validateFrameDimensions(400, -1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Height');
    });

    it('rejects dimensions over 10000', () => {
      const result = validateFrameDimensions(15000, 300);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10000');
    });
  });
});
