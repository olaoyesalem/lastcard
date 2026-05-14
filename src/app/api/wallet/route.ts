import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return verifyToken(auth.slice(7))
}

export async function GET(req: NextRequest) {
  const user = getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { walletBalance: true },
  })

  const transactions = await prisma.transaction.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json({
    balance: Number(dbUser?.walletBalance ?? 0),
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      status: t.status,
      createdAt: t.createdAt,
    })),
  })
}
