import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadOrCreateKey, encrypt, decrypt } from './encryption.js';

describe('encryption', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'encryption-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('round-trip encrypt/decrypt', () => {
    const keyPath = path.join(tmpDir, 'test.key');
    const key = loadOrCreateKey(keyPath);
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
    const key1 = loadOrCreateKey(path.join(tmpDir, 'key1.key'));
    const key2 = loadOrCreateKey(path.join(tmpDir, 'key2.key'));
    const encrypted = encrypt('secret', key1);
    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  test('tampered ciphertext fails authentication', () => {
    const key = loadOrCreateKey(path.join(tmpDir, 'test.key'));
    const encrypted = encrypt('secret data', key);
    // Decode the base64url token, flip a byte in the ciphertext portion, re-encode
    const tokenBytes = Buffer.from(encrypted, 'base64url');
    // Tamper with a byte in the middle (after IV = 12 bytes)
    tokenBytes[15] ^= 0xff;
    const tampered = tokenBytes.toString('base64url');
    expect(() => decrypt(tampered, key)).toThrow();
  });

  test('loadOrCreateKey creates file with correct permissions', () => {
    const keyPath = path.join(tmpDir, 'secret.key');
    const key = loadOrCreateKey(keyPath);
    expect(fs.existsSync(keyPath)).toBe(true);
    expect(key.length).toBe(32); // 256-bit key
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
    const key = loadOrCreateKey(path.join(tmpDir, 'test.key'));
    // Create a token that is shorter than the minimum 28 bytes (12 IV + 0 data + 16 tag)
    const shortToken = Buffer.alloc(20).toString('base64url');
    expect(() => decrypt(shortToken, key)).toThrow('too short');
  });

  test('key is stored as raw 32 bytes', () => {
    const keyPath = path.join(tmpDir, 'test.key');
    loadOrCreateKey(keyPath);
    const rawContent = fs.readFileSync(keyPath);
    expect(rawContent.length).toBe(32);
  });
});
