import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt()
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}
