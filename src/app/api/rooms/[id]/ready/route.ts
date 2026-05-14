import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { startGame } from '@/server/socketServer'

function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return verifyToken(auth.slice(7))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: roomId } = await params

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { players: true },
  })

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (!['waiting', 'ready_up'].includes(room.status)) {
    return NextResponse.json({ error: 'Room not in ready phase' }, { status: 409 })
  }

  const player = room.players.find((p) => p.userId === user.userId)
  if (!player) return NextResponse.json({ error: 'Not in this room' }, { status: 403 })

  await prisma.roomPlayer.update({ where: { id: player.id }, data: { isReady: true } })

  const updatedPlayers = await prisma.roomPlayer.findMany({ where: { roomId } })
  const allReady = updatedPlayers.every((p) => p.isReady)

  if (allReady && updatedPlayers.length >= 2) {
    await prisma.room.update({ where: { id: roomId }, data: { status: 'active' } })
    await startGame(roomId)
    return NextResponse.json({ message: 'Game starting!' })
  }

  return NextResponse.json({ message: 'Ready! Waiting for others.' })
}
