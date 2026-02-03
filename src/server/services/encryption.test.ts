import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generateKey,
  loadOrCreateKey,
  encrypt,
  decrypt,
} from './encryption.js';

describe('encryption', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'encryption-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('round-trip encrypt/decrypt', () => {
    const key = generateKey();
    const plaintext = JSON.stringify({
      access_token: 'abc123',
      refresh_token: 'def456',
    });
    const encrypted = encrypt(plaintext, key);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  test('decrypt with wrong key fails', () => {
    const key1 = generateKey();
    const key2 = generateKey();
    const encrypted = encrypt('secret', key1);
    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  test('tampered ciphertext fails HMAC', () => {
    const key = generateKey();
    const encrypted = encrypt('secret data', key);
    // Decode the base64url token, flip a byte in the ciphertext portion, re-encode
    const tokenBytes = Buffer.from(encrypted, 'base64url');
    // Tamper with a byte in the middle (after version+timestamp+IV = 1+8+16 = 25 bytes)
    tokenBytes[30] ^= 0xff;
    const tampered = tokenBytes.toString('base64url');
    expect(() => decrypt(tampered, key)).toThrow();
  });

  test('decrypt a known Python-generated Fernet token', () => {
    // Generated with Python cryptography.fernet.Fernet
    const key = Buffer.from('TFy8YJpeheMNwJYCOsiEig6GBKfOAjpJJaYtW-WTJWM=', 'base64url');
    const pythonToken =
      'gAAAAABpgWJJEHqSM8aLxOgWj5cPKkB1P70PuQJMWOEqYNa4gBHnneSsEapC8WZplRK7OcVHck5tKD-rJguDcQrEFORJDDKCniYu6l4ncl5tqVdSi0Q0Xx4=';
    const decrypted = decrypt(pythonToken, key);
    expect(decrypted).toBe('hello from python');
  });

  test('loadOrCreateKey creates file with correct permissions', () => {
    const keyPath = path.join(tmpDir, 'secret.key');
    const key = loadOrCreateKey(keyPath);
    expect(fs.existsSync(keyPath)).toBe(true);
    expect(key.length).toBeGreaterThan(0);
    const stat = fs.statSync(keyPath);
    // 0o600 = owner read/write only
    expect(stat.mode & 0o777).toBe(0o600);
  });

  test('loadOrCreateKey reads existing key', () => {
    const keyPath = path.join(tmpDir, 'secret.key');
    const key1 = loadOrCreateKey(keyPath);
    const key2 = loadOrCreateKey(keyPath);
    expect(Buffer.compare(key1, key2)).toBe(0);
  });

  test('decrypt token that is too short throws', () => {
    const key = generateKey();
    // Create a token that is shorter than the minimum 57 bytes
    const shortToken = Buffer.alloc(30).toString('base64url');
    expect(() => decrypt(shortToken, key)).toThrow('too short');
  });

  test('decrypt token with wrong version byte throws', () => {
    const key = generateKey();
    // Create a token of sufficient length but with version byte 0x00 instead of 0x80
    const tokenBytes = Buffer.alloc(57);
    tokenBytes[0] = 0x00; // wrong version
    const badVersionToken = tokenBytes.toString('base64url');
    expect(() => decrypt(badVersionToken, key)).toThrow('bad version');
  });
});
