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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { status } = await req.json()
  if (!['completed', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const tx = await prisma.transaction.findUnique({ where: { id } })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (tx.status !== 'pending') {
    return NextResponse.json({ error: 'Transaction already processed' }, { status: 409 })
  }

  await prisma.$transaction(async (db) => {
    await db.transaction.update({ where: { id }, data: { status } })

    if (status === 'completed' && tx.type === 'deposit') {
      await db.user.update({
        where: { id: tx.userId },
        data: { walletBalance: { increment: Number(tx.amount) } },
      })
    } else if (status === 'rejected' && tx.type === 'withdrawal') {
      // Refund the deducted amount
      await db.user.update({
        where: { id: tx.userId },
        data: { walletBalance: { increment: Number(tx.amount) } },
      })
    }
  })

  return NextResponse.json({ message: `Transaction ${status}` })
}
