import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, generateInviteCode } from '@/lib/auth'

const STAKE = 200

function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return verifyToken(auth.slice(7))
}

export async function POST(req: NextRequest) {
  const user = getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { maxPlayers } = await req.json()
  if (!maxPlayers || maxPlayers < 2 || maxPlayers > 16) {
    return NextResponse.json({ error: 'maxPlayers must be 2-16' }, { status: 400 })
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.userId } })
  if (!dbUser || Number(dbUser.walletBalance) < STAKE) {
    return NextResponse.json({ error: 'Insufficient balance. Please deposit ₦200.' }, { status: 402 })
  }

  const houseFee = await prisma.setting.findUnique({ where: { key: 'house_fee_percent' } })
  const houseFeePercent = parseFloat(houseFee?.value || '5')

  let inviteCode: string
  let attempts = 0
  do {
    inviteCode = generateInviteCode()
    attempts++
    const exists = await prisma.room.findUnique({ where: { inviteCode } })
    if (!exists) break
  } while (attempts < 10)

  const result = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.userId },
      data: { walletBalance: { decrement: STAKE } },
    })
    await tx.transaction.create({
      data: { userId: user.userId, type: 'stake', amount: STAKE, status: 'completed' },
    })
    const room = await tx.room.create({
      data: {
        inviteCode,
        creatorId: user.userId,
        maxPlayers,
        pot: STAKE,
        houseFeePercent,
        players: { create: { userId: user.userId, stakeLocked: STAKE } },
      },
    })
    return room
  })

  return NextResponse.json({ roomId: result.id, inviteCode: result.inviteCode })
}
