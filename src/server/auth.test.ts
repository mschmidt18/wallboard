import { describe, test, expect } from 'vitest'
import { hashPassword, verifyPassword, createSessionToken } from './auth.js'

describe('auth utilities', () => {
  test('hash + verify round-trip', async () => {
    const password = 'my-secure-password'
    const hash = await hashPassword(password)
    const result = await verifyPassword(password, hash)
    expect(result).toBe(true)
  })

  test('wrong password fails verify', async () => {
    const hash = await hashPassword('correct-password')
    const result = await verifyPassword('wrong-password', hash)
    expect(result).toBe(false)
  })

  test('session tokens are unique', () => {
    const token1 = createSessionToken()
    const token2 = createSessionToken()
    expect(token1).not.toBe(token2)
  })

  test('session tokens are URL-safe', () => {
    const token = createSessionToken()
    // base64url uses only alphanumeric, hyphen, and underscore
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    // 32 random bytes -> 43 base64url characters
    expect(token.length).toBe(43)
  })
})
