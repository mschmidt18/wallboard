import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FERNET_VERSION = 0x80;

/**
 * Generate a 32-byte Fernet key (base64url encoded).
 * First 16 bytes = HMAC-SHA256 signing key, last 16 bytes = AES-128-CBC encryption key.
 */
export function generateKey(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Load a Fernet key from file, or create one if it doesn't exist.
 * Sets file permissions to 0o600 (owner read/write only).
 */
export function loadOrCreateKey(keyPath: string): Buffer {
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath);
    // Strip whitespace/newlines, then decode if base64url-encoded,
    // or return raw bytes if already 32 bytes
    const trimmed = raw.toString('utf8').trim();
    if (raw.length === 32 && !trimmed.match(/^[A-Za-z0-9_-]+=*$/)) {
      return raw;
    }
    return Buffer.from(trimmed, 'base64url');
  }

  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const key = generateKey();
  // Write as base64url string for compatibility with Python Fernet keys
  fs.writeFileSync(keyPath, key.toString('base64url'), { mode: 0o600 });
  return key;
}

/**
 * Encrypt plaintext using Fernet format.
 * Token: version(1) + timestamp(8) + IV(16) + AES-CBC ciphertext + HMAC-SHA256(32)
 * Result is base64url-encoded.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const signingKey = key.subarray(0, 16);
  const encryptionKey = key.subarray(16, 32);

  const iv = crypto.randomBytes(16);
  const timestamp = BigInt(Math.floor(Date.now() / 1000));

  // AES-128-CBC with PKCS7 padding (Node's default for CBC)
  const cipher = crypto.createCipheriv('aes-128-cbc', encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Build the token payload (everything except HMAC)
  const versionBuf = Buffer.alloc(1);
  versionBuf[0] = FERNET_VERSION;

  const timestampBuf = Buffer.alloc(8);
  timestampBuf.writeBigUInt64BE(timestamp);

  const payload = Buffer.concat([versionBuf, timestampBuf, iv, ciphertext]);

  // HMAC-SHA256 over the payload
  const hmac = crypto.createHmac('sha256', signingKey).update(payload).digest();

  const token = Buffer.concat([payload, hmac]);
  return token.toString('base64url');
}

/**
 * Decrypt a Fernet token.
 * Verifies HMAC, then decrypts AES-128-CBC ciphertext.
 */
export function decrypt(ciphertext: string, key: Buffer): string {
  const signingKey = key.subarray(0, 16);
  const encryptionKey = key.subarray(16, 32);

  // Fernet tokens from Python use standard base64, but we accept both
  let tokenBytes: Buffer;
  try {
    // Try base64url first
    tokenBytes = Buffer.from(ciphertext, 'base64url');
  } catch {
    tokenBytes = Buffer.from(ciphertext, 'base64');
  }

  if (tokenBytes.length < 57) {
    // Minimum: version(1) + timestamp(8) + IV(16) + 16 bytes ciphertext + HMAC(32)
    throw new Error('Invalid Fernet token: too short');
  }

  const version = tokenBytes[0];
  if (version !== FERNET_VERSION) {
    throw new Error(`Invalid Fernet token: bad version ${version}`);
  }

  // Split into components
  const payload = tokenBytes.subarray(0, tokenBytes.length - 32);
  const receivedHmac = tokenBytes.subarray(tokenBytes.length - 32);

  // Verify HMAC
  const expectedHmac = crypto
    .createHmac('sha256', signingKey)
    .update(payload)
    .digest();

  if (!crypto.timingSafeEqual(receivedHmac, expectedHmac)) {
    throw new Error('Invalid Fernet token: HMAC verification failed');
  }

  // Extract IV and ciphertext
  const iv = payload.subarray(9, 25);
  const encryptedData = payload.subarray(25);

  // Decrypt AES-128-CBC
  const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
