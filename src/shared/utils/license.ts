/**
 * License key generation and validation for Flaude Pro
 *
 * Algorithm: Deterministic hash of (email + secret) -> FC-XXXX-XXXX format
 * This means: same email = same key (no database needed)
 */

// IMPORTANT: This secret should match across plugin and generate-license script
// In production, consider environment variable or secure storage
const LICENSE_SECRET = 'flaude-2024-ux-analysis-secret';

/**
 * Generate a license key from an email address
 * Uses a simple but effective hashing algorithm compatible with browser/plugin
 */
export function generateLicenseKey(email: string): string {
  const normalized = email.toLowerCase().trim();
  const str = normalized + LICENSE_SECRET;

  // Simple hash function (djb2 variant)
  let hash1 = 5381;
  let hash2 = 52711;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = ((hash2 << 5) + hash2) ^ char;
  }

  // Combine hashes and convert to hex
  const combined = Math.abs(hash1 * 33 + hash2);
  const hex = combined.toString(16).toUpperCase().padStart(8, '0').slice(0, 8);

  return `FC-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/**
 * Validate a license key against an email
 * Returns true if the key matches what would be generated for this email
 */
export function validateLicenseKey(email: string, key: string): boolean {
  if (!email || !key) return false;

  const expectedKey = generateLicenseKey(email);
  return key.toUpperCase().trim() === expectedKey;
}

/**
 * Check if a license key format is valid (without checking against email)
 */
export function isValidKeyFormat(key: string): boolean {
  if (!key) return false;
  const normalized = key.toUpperCase().trim();
  return /^FC-[A-F0-9]{4}-[A-F0-9]{4}$/.test(normalized);
}
