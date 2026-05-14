import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, signToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  if (!user.isVerified) return NextResponse.json({ error: 'Email not verified' }, { status: 403 })

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

  const token = signToken({ userId: user.id, email: user.email, username: user.username, role: user.role })
  return NextResponse.json({
    token,
    user: { id: user.id, email: user.email, username: user.username, role: user.role, walletBalance: Number(user.walletBalance) },
  })
}
