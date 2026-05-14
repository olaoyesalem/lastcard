import type { Server as HTTPServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { verifyToken } from '@/lib/auth'
import type { GameState, Card } from '@/types/game'
import {
  initGameState,
  playCard,
  drawCard,
  autoPlay,
  type GameEvent,
} from '@/lib/gameEngine'
import { prisma } from '@/lib/prisma'

const g = globalThis as unknown as {
  _lcIo: SocketServer
  _lcGameStates: Map<string, GameState>
  _lcTurnTimers: Map<string, NodeJS.Timeout>
  _lcInitLocks: Map<string, Promise<GameState | null>>
}

if (!g._lcGameStates) g._lcGameStates = new Map()
if (!g._lcTurnTimers) g._lcTurnTimers = new Map()
if (!g._lcInitLocks) g._lcInitLocks = new Map()

const gameStates = g._lcGameStates
const turnTimers = g._lcTurnTimers
const initLocks = g._lcInitLocks

function getIo(): SocketServer {
  if (!g._lcIo) throw new Error('Socket.IO not initialised yet')
  return g._lcIo
}

async function ensureGameState(roomId: string): Promise<GameState | null> {
  const existing = gameStates.get(roomId)
  if (existing) return existing

  const inFlight = initLocks.get(roomId)
  if (inFlight) return inFlight

  const initPromise = (async () => {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { players: { include: { user: true } } },
    })

    if (!room || room.status !== 'active') return null

    const players = room.players.map((rp) => ({
      userId: rp.userId,
      username: rp.user.username,
      hand: Array.isArray(rp.hand) ? (rp.hand as unknown as Card[]) : [],
      isReady: rp.isReady,
      lastCardShown: rp.lastCardShown,
    }))

    const drawPile = Array.isArray(room.drawPile) ? (room.drawPile as unknown as Card[]) : []
    const discardPile = Array.isArray(room.discardPile) ? (room.discardPile as unknown as Card[]) : []

    if (drawPile.length === 0 || discardPile.length === 0) {
      const fresh = initGameState(
        roomId,
        players.map((p) => ({ userId: p.userId, username: p.username })),
        Number(room.pot),
        Number(room.houseFeePercent),
      )
      await persistGameState(roomId, fresh)
      return fresh
    }

    return {
      roomId,
      status: 'active',
      players,
      currentPlayerIndex: room.currentPlayerIndex,
      drawPile,
      discardPile,
      extraTurnPending: room.extraTurnPending,
      skipNextPlayer: room.skipNextPlayer,
      turnTimerExpires: room.turnTimerExpires ? new Date(room.turnTimerExpires).getTime() : Date.now() + 10_000,
      tenderTrigger: room.tenderTrigger ?? null,
      pot: Number(room.pot),
      houseFeePercent: Number(room.houseFeePercent),
    } as GameState
  })()

  initLocks.set(roomId, initPromise)
  const state = await initPromise
  initLocks.delete(roomId)
  return state
}

export function initSocketServer(server: HTTPServer): SocketServer {
  const io = new SocketServer(server, {
    cors: { origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', credentials: true },
    transports: ['polling'],
  })
  g._lcIo = io

  io.use((socket, next) => {
    const rawToken = socket.handshake.auth.token ?? socket.handshake.query.token
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken
    const user = typeof token === 'string' ? verifyToken(token) : null
    if (!user) return next(new Error('Unauthorized'))
    socket.data.userId = user.userId
    socket.data.email = user.email
    socket.data.username = user.username
    socket.data.role = user.role
    next()
  })

  io.on('connection', (socket) => {
    const { userId } = socket.data
    // Private room so we can push hand_update to a specific player from any handler
    socket.join(`user:${userId}`)

    socket.on('join_room', async (roomId: string) => {
      socket.join(roomId)

      let state = gameStates.get(roomId)
      if (!state) {
        state = await ensureGameState(roomId) ?? undefined
        if (state) {
          gameStates.set(roomId, state)
          if (state.status === 'active') startTurnTimer(roomId, state)
        }
      }

      if (state) {
        const player = state.players.find((p) => p.userId === userId)
        socket.emit('game_state', {
          status: state.status,
          discardTop: state.discardPile[state.discardPile.length - 1],
          currentPlayerId: state.players[state.currentPlayerIndex]?.userId,
          drawPileCount: state.drawPile.length,
          players: state.players.map((p) => ({
            userId: p.userId,
            username: p.username,
            cardCount: p.hand.length,
            lastCardShown: p.lastCardShown,
          })),
          yourHand: player?.hand ?? [],
          pot: state.pot,
          timerExpires: state.turnTimerExpires,
        })
      }
    })

    socket.on('play_card', (data: { roomId: string; card: Card }) => {
      const state = gameStates.get(data.roomId)
      if (!state) return socket.emit('error', { message: 'Room not found' })

      const result = playCard(state, userId, data.card)
      if (result.type === 'error') return socket.emit('error', { message: result.message })

      gameStates.set(data.roomId, result.state)
      broadcastEvents(data.roomId, result.state, result.events)
      manageTurnTimer(data.roomId, result.state)
      persistGameState(data.roomId, result.state)
      pushHandUpdates(state, result.state)
    })

    socket.on('draw_card', (data: { roomId: string }) => {
      const state = gameStates.get(data.roomId)
      if (!state) return socket.emit('error', { message: 'Room not found' })

      const result = drawCard(state, userId)
      if (result.type === 'error') return socket.emit('error', { message: result.message })

      gameStates.set(data.roomId, result.state)
      broadcastEvents(data.roomId, result.state, result.events)
      manageTurnTimer(data.roomId, result.state)
      persistGameState(data.roomId, result.state)
      pushHandUpdates(state, result.state)
    })

    socket.on('disconnect', () => { })
  })

  return io
}

export async function startGame(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { players: { include: { user: true } } },
  })
  if (!room) return

  const players = room.players.map((rp) => ({
    userId: rp.userId,
    username: rp.user.username,
  }))

  const state = initGameState(roomId, players, Number(room.pot), Number(room.houseFeePercent))
  gameStates.set(roomId, state)

  const allSockets = await getIo().in(roomId).fetchSockets()

  for (const player of state.players) {
    const playerSocket = allSockets.find((s: { data: { userId: string } }) => s.data.userId === player.userId)
    playerSocket?.emit('game_started', {
      status: 'active',
      yourHand: player.hand,
      discardTop: state.discardPile[state.discardPile.length - 1],
      currentPlayerId: state.players[state.currentPlayerIndex].userId,
      drawPileCount: state.drawPile.length,
      pot: state.pot,
      timerExpires: state.turnTimerExpires,
      players: state.players.map((p) => ({
        userId: p.userId,
        username: p.username,
        cardCount: p.hand.length,
        lastCardShown: false,
      })),
    })
  }

  getIo().to(roomId).emit('game_ready', {})

  startTurnTimer(roomId, state)
  persistGameState(roomId, state)
}

// Push private hand_update to every player whose hand changed between two states.
function pushHandUpdates(prev: GameState, next: GameState): void {
  const io = getIo()
  for (const player of next.players) {
    const before = prev.players.find((p) => p.userId === player.userId)
    if (!before || before.hand.length !== player.hand.length) {
      io.to(`user:${player.userId}`).emit('hand_update', { yourHand: player.hand })
    }
  }
}

function broadcastEvents(roomId: string, state: GameState, events: GameEvent[]): void {
  const io = getIo()
  for (const event of events) {
    if (event.name === 'card_played' || event.name === 'card_drawn') {
      io.to(roomId).emit(event.name, event.payload)
    } else if (event.name === 'last_card') {
      io.to(roomId).emit('last_card', event.payload)
    } else if (event.name === 'action_resolved') {
      io.to(roomId).emit('action_resolved', event.payload)
    } else if (event.name === 'turn_change') {
      io.to(roomId).emit('turn_change', event.payload)
    } else if (event.name === 'tender_result') {
      io.to(roomId).emit('tender_result', event.payload)
      io.to(roomId).emit('game_over', { resolved: true })
      handleResolution(roomId, event.payload.potSplit)
    }
  }
}

function manageTurnTimer(roomId: string, state: GameState): void {
  clearTurnTimer(roomId)
  if (state.status === 'active') {
    startTurnTimer(roomId, state)
  }
}

function startTurnTimer(roomId: string, _state: GameState): void {
  clearTurnTimer(roomId)
  const timer = setTimeout(async () => {
    const current = gameStates.get(roomId)
    if (!current || current.status !== 'active') return

    const result = autoPlay(current)
    if (result.type === 'ok') {
      gameStates.set(roomId, result.state)
      broadcastEvents(roomId, result.state, result.events)
      manageTurnTimer(roomId, result.state)
      persistGameState(roomId, result.state)
      pushHandUpdates(current, result.state)
    }
  }, 10_000)
  turnTimers.set(roomId, timer)
}

function clearTurnTimer(roomId: string): void {
  const t = turnTimers.get(roomId)
  if (t) { clearTimeout(t); turnTimers.delete(roomId) }
}

async function handleResolution(
  roomId: string,
  potSplit: { userId: string; amount: number }[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const payout of potSplit) {
      if (payout.amount <= 0) continue
      await tx.user.update({
        where: { id: payout.userId },
        data: { walletBalance: { increment: payout.amount } },
      })
      await tx.transaction.create({
        data: {
          userId: payout.userId,
          type: 'winning',
          amount: payout.amount,
          status: 'completed',
          metadata: { roomId },
        },
      })
    }
    await tx.room.update({ where: { id: roomId }, data: { status: 'resolved' } })
  })
}

async function persistGameState(roomId: string, state: GameState): Promise<void> {
  try {
    await prisma.room.update({
      where: { id: roomId },
      data: {
        status: state.status as never,
        drawPile: state.drawPile as never,
        discardPile: state.discardPile as never,
        currentPlayerIndex: state.currentPlayerIndex,
        extraTurnPending: state.extraTurnPending,
        skipNextPlayer: state.skipNextPlayer,
        turnTimerExpires: state.turnTimerExpires ? new Date(state.turnTimerExpires) : null,
        tenderTrigger: state.tenderTrigger as never,
      },
    })
    for (const player of state.players) {
      await prisma.roomPlayer.updateMany({
        where: { roomId, userId: player.userId },
        data: { hand: player.hand as never, lastCardShown: player.lastCardShown },
      })
    }
  } catch {
    // Non-critical — in-memory state is authoritative
  }
}
