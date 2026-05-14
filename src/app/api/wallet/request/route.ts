import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return verifyToken(auth.slice(7))
}

// Deposit request
export async function POST(req: NextRequest) {
  const user = getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, amount, reference, bankName, accountNumber } = await req.json()

  if (!['deposit', 'withdrawal'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
  if (!amount || amount < 200) {
    return NextResponse.json({ error: 'Minimum amount is ₦200' }, { status: 400 })
  }

  if (type === 'withdrawal') {
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } })
    if (Number(dbUser?.walletBalance ?? 0) < amount) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 402 })
    }
    await prisma.user.update({
      where: { id: user.userId },
      data: { walletBalance: { decrement: amount } },
    })
  }

  const tx = await prisma.transaction.create({
    data: {
      userId: user.userId,
      type,
      amount,
      status: 'pending',
      reference,
      metadata: bankName ? { bankName, accountNumber } : undefined,
    },
  })

  return NextResponse.json({ transactionId: tx.id, message: 'Request submitted. Admin will process shortly.' })
}
