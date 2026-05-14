'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { getToken } from '@/store/authStore'
import type { Card } from '@/types/game'

export interface GameSnapshot {
  status: string
  discardTop: Card | null
  currentPlayerId: string | null
  drawPileCount: number
  players: { userId: string; username: string; cardCount: number; lastCardShown: boolean }[]
  yourHand: Card[]
  pot: number
  timerExpires: number | null
}

export interface DealingState {
  type: string        // 'pick_two' | 'general_market'
  affectedIds: string[]
  count: number       // cards being dealt to each affected player
}

// How long (ms) to hold the dealing animation before advancing the turn
const DEAL_DURATION = 1800

export function useSocket(roomId: string) {
  const socketRef    = useRef<Socket | null>(null)
  const dealingRef   = useRef(false)
  const pendingTurnRef = useRef<unknown>(null)

  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [lastEvent, setLastEvent] = useState<{ name: string; payload: unknown } | null>(null)
  const [dealing,  setDealing]  = useState<DealingState | null>(null)

  function applyTurnChange(payload: { currentPlayerId: string; drawPileCount: number; timerExpires: number }) {
    setSnapshot((prev) =>
      prev ? { ...prev, currentPlayerId: payload.currentPlayerId, drawPileCount: payload.drawPileCount, timerExpires: payload.timerExpires } : prev
    )
    setLastEvent({ name: 'turn_change', payload })
  }

  useEffect(() => {
    const token = getToken()
    if (!token) { setError('Not authenticated. Please sign in again.'); return }

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL
      ?? (process.env.NODE_ENV === 'development'
        ? `http://${window.location.hostname}:3001`
        : window.location.origin)

    const socket = io(socketUrl, {
      auth: { token },
      query: { token },
      transports: ['polling'],
      reconnectionAttempts: 10,
      timeout: 10_000,
    })
    socketRef.current = socket

    const pushError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 3000) }

    socket.on('connect', () => socket.emit('join_room', roomId))
    socket.on('connect_error', (err) => pushError(err?.message || 'Socket connection failed'))
    socket.on('game_state',   (data: GameSnapshot) => setSnapshot(data))
    socket.on('game_started', (data: GameSnapshot) => setSnapshot(data))
    socket.on('game_ready',   () => socket.emit('join_room', roomId))

    socket.on('turn_change', (payload) => {
      if (dealingRef.current) {
        // Buffer — apply after the dealing animation finishes
        pendingTurnRef.current = payload
      } else {
        applyTurnChange(payload)
      }
    })

    socket.on('card_played', (payload: { userId: string; card: Card; drawPileCount: number }) => {
      setSnapshot((prev) => {
        if (!prev) return prev
        const players = prev.players.map((p) =>
          p.userId === payload.userId ? { ...p, cardCount: p.cardCount - 1 } : p
        )
        return { ...prev, discardTop: payload.card, drawPileCount: payload.drawPileCount, players }
      })
      setLastEvent({ name: 'card_played', payload })
    })

    socket.on('card_drawn', (payload: { userId: string; newHandSize: number; drawPileCount: number }) => {
      setSnapshot((prev) => {
        if (!prev) return prev
        const players = prev.players.map((p) =>
          p.userId === payload.userId ? { ...p, cardCount: payload.newHandSize } : p
        )
        return { ...prev, drawPileCount: payload.drawPileCount, players }
      })
      setLastEvent({ name: 'card_drawn', payload })
    })

    socket.on('last_card', (payload: { userId: string }) => {
      setSnapshot((prev) => {
        if (!prev) return prev
        const players = prev.players.map((p) =>
          p.userId === payload.userId ? { ...p, lastCardShown: true } : p
        )
        return { ...prev, players }
      })
    })

    socket.on('action_resolved', (payload: { type: string; affectedPlayerIds?: string[]; drawCount?: number }) => {
      setLastEvent({ name: 'action_resolved', payload })

      if (payload.type === 'pick_two' || payload.type === 'general_market') {
        const count = payload.type === 'pick_two' ? 2 : 1
        dealingRef.current = true
        setDealing({ type: payload.type, affectedIds: payload.affectedPlayerIds ?? [], count })

        setTimeout(() => {
          dealingRef.current = false
          setDealing(null)
          if (pendingTurnRef.current) {
            applyTurnChange(pendingTurnRef.current as { currentPlayerId: string; drawPileCount: number; timerExpires: number })
            pendingTurnRef.current = null
          }
        }, DEAL_DURATION)
      }
    })

    socket.on('tender_result', (payload) => {
      setSnapshot((prev) => prev ? { ...prev, status: 'resolved' } : prev)
      setLastEvent({ name: 'tender_result', payload })
    })

    socket.on('hand_update', ({ yourHand }: { yourHand: Card[] }) => {
      setSnapshot((prev) => prev ? { ...prev, yourHand } : prev)
    })

    socket.on('error', (data: { message: string }) => pushError(data.message))

    return () => { socket.disconnect() }
  }, [roomId])

  const rejoinRoom = useCallback(() => { socketRef.current?.emit('join_room', roomId) }, [roomId])
  const playCard   = useCallback((card: Card) => { socketRef.current?.emit('play_card', { roomId, card }) }, [roomId])
  const drawCard   = useCallback(() => { socketRef.current?.emit('draw_card', { roomId }) }, [roomId])

  return { snapshot, error, lastEvent, dealing, rejoinRoom, playCard, drawCard }
}
