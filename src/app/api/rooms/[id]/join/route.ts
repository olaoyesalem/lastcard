import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const STAKE = 200

function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return verifyToken(auth.slice(7))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const room = await prisma.room.findFirst({
    where: { OR: [{ id }, { inviteCode: id }] },
    include: { players: true },
  })

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (room.status !== 'waiting') return NextResponse.json({ error: 'Room not accepting players' }, { status: 409 })
  if (room.players.length >= room.maxPlayers) return NextResponse.json({ error: 'Room is full' }, { status: 409 })
  if (room.players.some((p) => p.userId === user.userId)) {
    return NextResponse.json({ error: 'Already in room' }, { status: 409 })
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.userId } })
  if (!dbUser || Number(dbUser.walletBalance) < STAKE) {
    return NextResponse.json({ error: 'Insufficient balance' }, { status: 402 })
  }

  const newCount = room.players.length + 1

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.userId },
      data: { walletBalance: { decrement: STAKE } },
    })
    await tx.transaction.create({
      data: { userId: user.userId, type: 'stake', amount: STAKE, status: 'completed' },
    })
    await tx.room.update({
      where: { id: room.id },
      data: {
        pot: { increment: STAKE },
        status: newCount === room.maxPlayers ? 'ready_up' : 'waiting',
        players: { create: { userId: user.userId, stakeLocked: STAKE } },
      },
    })
  })

  return NextResponse.json({ roomId: room.id, inviteCode: room.inviteCode, playerCount: newCount })
}
