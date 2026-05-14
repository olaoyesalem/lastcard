import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, generateOtp } from '@/lib/auth'
import { sendOtp } from '@/lib/mailer'

export async function POST(req: NextRequest) {
  const { email, password, username } = await req.json()

  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }
  if (!username || username.trim().length < 2) {
    return NextResponse.json({ error: 'Username must be at least 2 characters' }, { status: 400 })
  }

  const trimmedUsername = username.trim()

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing?.isVerified) {
    return NextResponse.json({ error: 'Email already registered. Please sign in.' }, { status: 409 })
  }

  // Check if username is taken by any account with a different email
  const usernameTaken = await prisma.user.findFirst({
    where: { username: trimmedUsername, NOT: { email } },
  })
  if (usernameTaken) {
    return NextResponse.json({ error: 'Username already taken. Choose another.' }, { status: 409 })
  }

  let userId: string
  if (existing && !existing.isVerified) {
    const passwordHash = await hashPassword(password)
    await prisma.user.update({ where: { email }, data: { passwordHash, username: trimmedUsername } })
    userId = existing.id
  } else {
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({ data: { email, passwordHash, username: trimmedUsername } })
    userId = user.id
  }

  await prisma.otpCode.updateMany({
    where: { email, used: false },
    data: { used: true },
  })

  const otp = generateOtp()
  await prisma.otpCode.create({
    data: {
      email,
      code: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      userId,
    },
  })

  // Fire-and-forget — never block the response on email delivery
  sendOtp(email, otp).catch((err) => {
    console.error(`[OTP] Email failed for ${email}:`, err)
    console.log(`[OTP] CODE for ${email}: ${otp}`)
  })

  return NextResponse.json({ message: 'OTP sent to your email', devOtp: otp })
}
