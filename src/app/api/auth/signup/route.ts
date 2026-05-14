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

  // Check if username is taken by a different (verified) account
  const usernameTaken = await prisma.user.findFirst({
    where: { username: trimmedUsername, isVerified: true },
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

  try {
    await sendOtp(email, otp)
  } catch (err) {
    console.error('Failed to send OTP email:', err)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n📬 DEV OTP for ${email}: ${otp}\n`)
    }
    return NextResponse.json({
      message: 'Account created but email delivery failed. Check server logs for OTP.',
      devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    })
  }

  return NextResponse.json({ message: 'OTP sent to your email' })
}
