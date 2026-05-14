import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return verifyToken(auth.slice(7))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const room = await prisma.room.findFirst({
    where: { OR: [{ id }, { inviteCode: id }] },
    include: { players: { include: { user: { select: { email: true } } } } },
  })

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  return NextResponse.json({
    id: room.id,
    inviteCode: room.inviteCode,
    status: room.status,
    maxPlayers: room.maxPlayers,
    stakeAmount: Number(room.stakeAmount),
    pot: Number(room.pot),
    playerCount: room.players.length,
    players: room.players.map((p) => ({
      userId: p.userId,
      username: p.user.email.split('@')[0],
      isReady: p.isReady,
    })),
  })
}
