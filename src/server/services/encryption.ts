import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Load a 256-bit AES key from file, or create one if it doesn't exist.
 * Sets file permissions to 0o600 (owner read/write only).
 */
export function loadOrCreateKey(keyPath: string): Buffer {
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Token format: iv(12) + ciphertext + authTag(16), base64url-encoded.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString('base64url');
}

/**
 * Decrypt an AES-256-GCM token.
 * Verifies auth tag, then decrypts ciphertext.
 */
export function decrypt(token: string, key: Buffer): string {
  const data = Buffer.from(token, 'base64url');

  // Minimum: iv(12) + authTag(16) = 28 bytes (0 bytes ciphertext is valid)
  if (data.length < 28) {
    throw new Error('Invalid token: too short');
  }

  const iv = data.subarray(0, 12);
  const authTag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(12, data.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
