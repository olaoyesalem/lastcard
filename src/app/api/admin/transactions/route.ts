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

  const transactions = await prisma.transaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(transactions.map((t) => ({
    id: t.id,
    userId: t.userId,
    type: t.type,
    amount: Number(t.amount),
    status: t.status,
    reference: t.reference,
    createdAt: t.createdAt,
  })))
}
