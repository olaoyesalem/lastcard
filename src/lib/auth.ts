import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const SALT_ROUNDS = 12
const jwtSecret = () => process.env.JWT_SECRET || 'change-me-in-production'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signToken(payload: { userId: string; email: string; username: string; role: string }): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): { userId: string; email: string; username: string; role: string } | null {
  try {
    const payload = jwt.verify(token, jwtSecret()) as { userId: string; email: string; username?: string; role: string }
    return {
      ...payload,
      username: payload.username ?? payload.email.split('@')[0],
    }
  } catch {
    return null
  }
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
