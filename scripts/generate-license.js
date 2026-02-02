#!/usr/bin/env node

/**
 * Flaude License Key Generator
 *
 * Usage:
 *   node generate-license.js user@email.com
 *   node generate-license.js --batch emails.txt
 *
 * The license key is deterministic - same email always produces same key.
 * This means you can regenerate a customer's key anytime without a database.
 */

// IMPORTANT: Keep this secret safe and matching with the plugin
const LICENSE_SECRET = 'flaude-2024-ux-analysis-secret';

function generateLicenseKey(email) {
  const normalized = email.toLowerCase().trim();
  const str = normalized + LICENSE_SECRET;

  // Simple hash function (djb2 variant) - matches the plugin implementation
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

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Flaude License Key Generator
============================

Usage:
  node generate-license.js <email>           Generate key for single email
  node generate-license.js --batch <file>    Generate keys for emails in file

Examples:
  node generate-license.js user@example.com
  node generate-license.js --batch customers.txt
`);
    process.exit(0);
  }

  if (args[0] === '--batch' && args[1]) {
    // Batch mode - read emails from file
    const fs = require('fs');
    const filePath = args[1];

    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const emails = fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && line.includes('@'));

    console.log('Email,License Key');
    console.log('=================');
    emails.forEach(email => {
      console.log(`${email},${generateLicenseKey(email)}`);
    });
  } else {
    // Single email mode
    const email = args[0];

    if (!email.includes('@')) {
      console.error('Error: Please provide a valid email address');
      process.exit(1);
    }

    const key = generateLicenseKey(email);

    console.log(`
================================
  Flaude Pro License Key
================================

  Email: ${email}
  Key:   ${key}

================================

Send this to the customer:

---
Thank you for purchasing Flaude Pro!

Your license key: ${key}

To activate:
1. Open the Flaude plugin in Figma
2. Go to Settings
3. Enter your email: ${email}
4. Enter your license key: ${key}
5. Click "Activate License"

Questions? Reply to this email.
---
`);
  }
}

main();
