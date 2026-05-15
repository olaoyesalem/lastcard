import type { Server as HTTPServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { verifyToken } from '@/lib/auth'
import type { GameState, Card, TenderResult } from '@/types/game'
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
        // Fetch live balances so the UI shows up-to-date wallet values
        const userRows = await prisma.user.findMany({
          where: { id: { in: state.players.map((p) => p.userId) } },
          select: { id: true, walletBalance: true },
        })
        const balanceMap = new Map(userRows.map((u) => [u.id, Number(u.walletBalance)]))
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
            walletBalance: balanceMap.get(p.userId) ?? 0,
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

  // Build a balance map from the room's already-loaded user data
  const balanceMap = new Map(room.players.map((rp) => [rp.userId, Number(rp.user.walletBalance)]))

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
        walletBalance: balanceMap.get(p.userId) ?? 0,
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
      // game_over emitted inside handleResolution only if no replay
      handleResolution(roomId, event.payload.rankings, event.payload.potSplit)
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
  rankings: TenderResult[],
  potSplit: { userId: string; amount: number }[],
): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { players: true },
  })
  if (!room) return

  const stake = Number(room.stakeAmount)

  // 1. Pay out winnings
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
  })

  // 2. Check if everyone can still afford another round
  const playerIds = room.players.map((p) => p.userId)
  const users = await prisma.user.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, walletBalance: true },
  })
  const allCanAfford = users.every((u) => Number(u.walletBalance) >= stake)

  if (allCanAfford) {
    // 3a. Auto-replay — deduct stakes and reset room
    await prisma.$transaction(async (tx) => {
      for (const u of users) {
        await tx.user.update({
          where: { id: u.id },
          data: { walletBalance: { decrement: stake } },
        })
        await tx.transaction.create({
          data: {
            userId: u.id,
            type: 'stake',
            amount: stake,
            status: 'completed',
            metadata: { roomId, replay: true },
          },
        })
      }
      await tx.room.update({
        where: { id: roomId },
        data: {
          pot: stake * users.length,
          status: 'active',
          drawPile: [],
          discardPile: [],
          currentPlayerIndex: 0,
          extraTurnPending: false,
          skipNextPlayer: false,
          tenderTrigger: null,
          turnTimerExpires: null,
        },
      })
      await tx.roomPlayer.updateMany({
        where: { roomId },
        data: { hand: [], lastCardShown: false },
      })
    })

    // Tell clients a new round is coming (they can show a countdown)
    getIo().to(roomId).emit('round_complete', { rankings })

    // Deal new round after 6 seconds (client reveals take ~5–6s)
    setTimeout(async () => {
      const freshRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: { players: { include: { user: true } } },
      })
      if (!freshRoom) return

      const balanceMap = new Map(freshRoom.players.map((rp) => [rp.userId, Number(rp.user.walletBalance)]))
      const players = freshRoom.players.map((rp) => ({ userId: rp.userId, username: rp.user.username }))

      const newState = initGameState(roomId, players, Number(freshRoom.pot), Number(freshRoom.houseFeePercent))
      gameStates.set(roomId, newState)
      clearTurnTimer(roomId)

      const allSockets = await getIo().in(roomId).fetchSockets()
      for (const player of newState.players) {
        const playerSocket = allSockets.find((s: { data: { userId: string } }) => s.data.userId === player.userId)
        playerSocket?.emit('game_started', {
          status: 'active',
          yourHand: player.hand,
          discardTop: newState.discardPile[newState.discardPile.length - 1],
          currentPlayerId: newState.players[newState.currentPlayerIndex].userId,
          drawPileCount: newState.drawPile.length,
          pot: newState.pot,
          timerExpires: newState.turnTimerExpires,
          players: newState.players.map((p) => ({
            userId: p.userId,
            username: p.username,
            cardCount: p.hand.length,
            lastCardShown: false,
            walletBalance: balanceMap.get(p.userId) ?? 0,
          })),
        })
      }

      getIo().to(roomId).emit('game_ready', {})
      startTurnTimer(roomId, newState)
      persistGameState(roomId, newState)
    }, 6000)

  } else {
    // 3b. Someone can't afford another round — game over
    await prisma.room.update({ where: { id: roomId }, data: { status: 'resolved' } })
    getIo().to(roomId).emit('game_over', { resolved: true })
  }
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
