import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

function getAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const user = verifyToken(auth.slice(7))
  if (user?.role !== 'admin') return null
  return user
}

export async function GET(req: NextRequest) {
  if (!getAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const users = await prisma.user.findMany({
    select: { id: true, email: true, walletBalance: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(users.map((u) => ({ ...u, walletBalance: Number(u.walletBalance) })))
}

// Admin adjust wallet
export async function POST(req: NextRequest) {
  if (!getAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, amount, reason } = await req.json()

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: amount } },
    })
    await tx.transaction.create({
      data: {
        userId,
        type: 'admin_adjustment',
        amount: Math.abs(amount),
        status: 'completed',
        metadata: { reason, adjustment: amount },
      },
    })
  })

  return NextResponse.json({ message: 'Wallet updated' })
}
