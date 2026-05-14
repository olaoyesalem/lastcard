import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, otp } = await req.json()

  const record = await prisma.otpCode.findFirst({
    where: { email, code: otp, used: false, expiresAt: { gt: new Date() } },
  })

  if (!record) {
    return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
  }

  await prisma.otpCode.update({ where: { id: record.id }, data: { used: true } })
  const user = await prisma.user.update({
    where: { email },
    data: { isVerified: true },
  })

  const token = signToken({ userId: user.id, email: user.email, username: user.username, role: user.role })
  return NextResponse.json({
    token,
    user: { id: user.id, email: user.email, username: user.username, role: user.role },
  })
}
