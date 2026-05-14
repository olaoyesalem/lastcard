'use client'

import { useEffect, useState, use, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, authHeaders } from '@/store/authStore'
import { useSocket, type DealingState } from '@/hooks/useSocket'
import WhotCard, { CardBack } from '@/components/game/WhotCard'
import type { Card } from '@/types/game'
import { cardMatches } from '@/lib/deck'

interface RoomInfo {
  id: string; inviteCode: string; status: string; maxPlayers: number
  stakeAmount: number; pot: number; playerCount: number
  players: { userId: string; username: string; isReady: boolean }[]
}

interface TenderResult {
  userId: string; username: string; handTotal: number; hand: Card[]; rank: number; payout: number
}

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = use(params)
  const router = useRouter()
  // Stable ref so getUser() doesn't cause re-render loops
  const userRef = useRef(getUser())
  const user = userRef.current
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [readyLoading, setReadyLoading] = useState(false)
  const [tenderResults, setTenderResults] = useState<TenderResult[] | null>(null)
  const [revealData, setRevealData] = useState<TenderResult[] | null>(null)
  const [gameReveal, setGameReveal] = useState<TenderResult[] | null>(null)
  const [shake, setShake] = useState(false)
  const [timer, setTimer] = useState<number | null>(null)
  const [handSnap, setHandSnap] = useState<Card[]>([])

  const [hoveredCardIdx, setHoveredCardIdx] = useState<number | null>(null)
  const [draggedCard, setDraggedCard] = useState<Card | null>(null)
  const [announce, setAnnounce] = useState<{ title: string; sub: string } | null>(null)
  const [discardKey, setDiscardKey] = useState(0)
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { snapshot, error, lastEvent, dealing, rejoinRoom, playCard, drawCard } = useSocket(roomId)

  const showAnnounce = useCallback((title: string, sub: string) => {
    if (announceTimer.current) clearTimeout(announceTimer.current)
    setAnnounce({ title, sub })
    announceTimer.current = setTimeout(() => setAnnounce(null), 2800)
  }, [])

  // Fetch room info once for lobby
  useEffect(() => {
    if (!user) { router.push('/auth'); return }
    fetch(`/api/rooms/${roomId}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setRoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // Sync hand from snapshot
  useEffect(() => {
    if (snapshot?.yourHand) setHandSnap(snapshot.yourHand)
  }, [snapshot?.yourHand])

  // Poll room info while in lobby (every 2s to pick up new players + ready status)
  useEffect(() => {
    if (snapshot && snapshot.status !== 'waiting' && snapshot.status !== 'ready_up') return
    const interval = setInterval(() => {
      fetch(`/api/rooms/${roomId}`, { headers: authHeaders() })
        .then((r) => r.json()).then(setRoom)
    }, 2000)
    return () => clearInterval(interval)
  }, [roomId, snapshot?.status])

  // If the room is active but we missed the socket event, try rejoining
  useEffect(() => {
    if (!room || snapshot || room.status !== 'active') return
    rejoinRoom()
    const interval = setInterval(() => {
      if (!snapshot) rejoinRoom()
    }, 2000)
    return () => clearInterval(interval)
  }, [room, snapshot, rejoinRoom])

  useEffect(() => {
    if (!lastEvent || !snapshot) return

    const name = (uid: string) =>
      snapshot.players.find((p) => p.userId === uid)?.username ?? uid.slice(0, 6)

    if (lastEvent.name === 'tender_result') {
      const { rankings } = lastEvent.payload as { rankings: TenderResult[]; potSplit: unknown[] }
      // Step 1: show in-game table reveal for 2.5s
      setGameReveal(rankings)
      setTimeout(() => {
        setGameReveal(null)
        // Step 2: full card-flip reveal screen
        setRevealData(rankings)
        const maxCards = Math.max(...rankings.map((r) => r.hand.length))
        const holdMs = rankings.length * 900 + maxCards * 100 + 2500
        setTimeout(() => { setTenderResults(rankings); setRevealData(null) }, holdMs)
      }, 2500)
    }

    if (lastEvent.name === 'card_played') {
      setDiscardKey((k) => k + 1)
      const { userId } = lastEvent.payload as { userId: string; card: Card }
      if (userId !== user?.id) {
        // opponent played — no extra announce, discard animation is enough
      }
    }

    if (lastEvent.name === 'action_resolved') {
      const { type, affectedPlayerIds } =
        lastEvent.payload as { type: string; affectedPlayerIds?: string[] }
      const affected = (affectedPlayerIds ?? []).map(name).join(' & ')

      if (type === 'hold_on') {
        showAnnounce('Hold On!', `${name(snapshot.currentPlayerId ?? '')} plays again`)
      } else if (type === 'pick_two') {
        showAnnounce('Pick Two!', `${affected} must pick 2 cards`)
      } else if (type === 'suspension') {
        showAnnounce('Suspension!', `${affected} is skipped`)
      } else if (type === 'general_market') {
        showAnnounce('General Market!', 'Everyone picks 1 card')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent])

  // Error shake
  useEffect(() => {
    if (error) { setShake(true); setTimeout(() => setShake(false), 400) }
  }, [error])

  // Countdown timer
  useEffect(() => {
    if (!snapshot?.timerExpires) { setTimer(null); return }
    const update = () => {
      const rem = Math.max(0, Math.ceil((snapshot.timerExpires! - Date.now()) / 1000))
      setTimer(rem)
    }
    update()
    const interval = setInterval(update, 500)
    return () => clearInterval(interval)
  }, [snapshot?.timerExpires])

  async function handleReady() {
    setReadyLoading(true)
    await fetch(`/api/rooms/${roomId}/ready`, { method: 'POST', headers: authHeaders() })
    setReadyLoading(false)
    setRoom((prev) => prev ? {
      ...prev,
      players: prev.players.map((p) => p.userId === user?.id ? { ...p, isReady: true } : p),
    } : prev)
  }

  function handlePlayCard(card: Card) {
    const top = snapshot?.discardTop
    if (!top || !cardMatches(card, top)) return
    playCard(card)
  }

  if (!user || !room) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="pulse-slow" style={{ color: 'var(--primary)', fontSize: 32 }}>Loading…</div>
    </div>
  )

  const isMyTurn = snapshot?.currentPlayerId === user.id
  const top = snapshot?.discardTop

  // REVEAL SCREEN — all hands flipped open before results
  if (revealData) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(5,20,14,.7) 100%), #0F4C3A',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
        gap: 28,
      }}>
        <div className="slide-up" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--gold-lt)', letterSpacing: .5 }}>
            Check Up
          </div>
          <div style={{ fontSize: 13, color: 'var(--cream-60)', marginTop: 4 }}>
            Lowest total wins
          </div>
        </div>

        {revealData.map((player, pi) => {
          // Each player's cards start flipping after pi * 900ms
          const playerDelay = pi * 900
          // Total number appears after all that player's cards have flipped
          const totalDelay = playerDelay + player.hand.length * 100 + 300
          const isMe = player.userId === user?.id

          return (
            <div key={player.userId} style={{
              width: '100%', maxWidth: 440,
              background: 'rgba(5,20,14,.55)',
              border: `1px solid ${isMe ? 'var(--gold)' : 'rgba(245,239,224,.1)'}`,
              borderRadius: 16,
              padding: '14px 16px',
              boxShadow: isMe ? '0 0 20px var(--gold-glow)' : 'none',
            }}>
              {/* Player header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: isMe ? 'var(--gold-lt)' : 'var(--cream)' }}>
                  {player.username}{isMe ? ' (you)' : ''}
                </span>
                {/* Total pops in after cards are revealed */}
                <span
                  className="total-pop"
                  style={{
                    animationDelay: `${totalDelay}ms`,
                    fontSize: 22, fontWeight: 800,
                    fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                    color: player.rank === 1 ? 'var(--gold-lt)' : 'var(--cream)',
                    background: player.rank === 1 ? 'var(--gold-bg)' : 'rgba(245,239,224,.07)',
                    padding: '2px 10px', borderRadius: 8,
                    opacity: 0,  // starts invisible until animation fires
                  }}
                >
                  {player.handTotal}
                </span>
              </div>

              {/* Cards — flip in with stagger */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-end' }}>
                {player.hand.length === 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--gold-lt)', fontWeight: 700 }}>
                    No cards — winner!
                  </span>
                ) : (
                  player.hand.map((card, ci) => (
                    <div
                      key={ci}
                      className="card-reveal"
                      style={{ animationDelay: `${playerDelay + ci * 100}ms`, opacity: 0 }}
                    >
                      <WhotCard card={card} size="sm" />
                    </div>
                  ))
                )}
              </div>

              {/* Total label below cards */}
              {player.hand.length > 0 && (
                <div
                  className="total-pop"
                  style={{
                    animationDelay: `${totalDelay}ms`,
                    opacity: 0,
                    marginTop: 10,
                    fontSize: 13, fontWeight: 700,
                    color: 'var(--cream-60)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  Total:
                  <span style={{
                    fontSize: 20, fontWeight: 800,
                    fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                    color: player.rank === 1 ? 'var(--gold-lt)' : 'var(--cream)',
                  }}>
                    {player.handTotal}
                  </span>
                  {player.rank === 1 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold-lt)', letterSpacing: .5 }}>
                      — LOWEST
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // GAME RESOLVED
  if (tenderResults) {
    const me = tenderResults.find((r) => r.userId === user.id)
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div className="panel slide-up" style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>{me?.rank === 1 ? '🏆' : me?.payout ? '🎉' : '😅'}</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
            {me?.rank === 1 ? 'You won!' : me?.payout ? 'You placed!' : 'Better luck next time'}
          </h2>
          {me?.payout ? (
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', marginBottom: 20 }}>
              +₦{me.payout.toLocaleString()}
            </p>
          ) : (
            <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>No payout this round.</p>
          )}
          <div style={{ marginBottom: 20 }}>
            {tenderResults.map((r) => (
              <div key={r.userId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: r.userId === user.id ? 700 : 400 }}>#{r.rank} {r.username}</span>
                <span style={{ color: r.payout > 0 ? '#4ade80' : 'var(--cream-60)' }}>
                  total: {r.handTotal}
                </span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // LOBBY
  if (!snapshot || snapshot.status === 'waiting' || snapshot.status === 'ready_up') {
    const me = room.players.find((p) => p.userId === user.id)
    const allReady = room.players.length >= 2 && room.players.every((p) => p.isReady)
    const connectingToGame = room.status === 'active' && !snapshot
    return (
      <div style={{ minHeight: '100dvh', padding: 16 }}>
        <button className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 13, marginBottom: 16 }} onClick={() => router.push('/dashboard')}>
          ← Back
        </button>
        <div className="panel" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Invite Code</p>
          <p style={{ fontSize: 32, fontWeight: 800, letterSpacing: 6, color: 'var(--primary)' }}>{room.inviteCode}</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Share this code with friends</p>
        </div>
        <div className="panel" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 12 }}>Players ({room.players.length}/{room.maxPlayers})</p>
          {room.players.map((p) => (
            <div key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: p.userId === user.id ? 700 : 400 }}>
                {p.username} {p.userId === user.id ? '(you)' : ''}
              </span>
              <span className={`badge badge-${p.isReady ? 'green' : 'dim'}`}>{p.isReady ? 'Ready' : 'Waiting'}</span>
            </div>
          ))}
          {room.players.length < room.maxPlayers && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
              Waiting for {room.maxPlayers - room.players.length} more player{room.maxPlayers - room.players.length !== 1 ? 's' : ''}…
            </p>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-primary" style={{ width: '100%' }}
            onClick={handleReady} disabled={readyLoading || me?.isReady || room.players.length < 2}>
            {me?.isReady ? 'Waiting for others…' : 'Ready Up!'}
          </button>
          {allReady && !connectingToGame && (
            <p style={{ textAlign: 'center', color: 'var(--primary)', fontWeight: 600, fontSize: 14 }}>Starting game…</p>
          )}
          {connectingToGame && (
            <p style={{ textAlign: 'center', color: 'var(--primary)', fontWeight: 600, fontSize: 14 }}>
              Connecting to game…
            </p>
          )}
        </div>
      </div>
    )
  }

  // ACTIVE GAME
  const opponents = snapshot?.players.filter((p) => p.userId !== user.id) ?? []
  const validCards = top && !dealing
    ? handSnap.filter((c) => cardMatches(c, top))
    : []
  const drawPileCount = snapshot?.drawPileCount ?? 0
  const deckLayers = drawPileCount >= 30 ? 3 : drawPileCount >= 15 ? 2 : drawPileCount >= 5 ? 1 : 0

  return (
    <div className="game-screen">
      {/* Rotate to landscape prompt — hidden by CSS in landscape */}
      <div className="rotate-prompt">
        <div style={{ fontSize: 56 }}>↻</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-lt)' }}>Rotate your phone</div>
        <div style={{ fontSize: 14, color: 'var(--cream-60)', maxWidth: 240 }}>
          LastCard plays best in landscape mode. Turn your phone sideways to play.
        </div>
      </div>

      <div className="game-inner">

        {/* TOP — Opponents strip */}
        <div className="game-opponents" style={{
          background: 'rgba(5,20,14,.45)',
          borderBottom: '1px solid rgba(245,239,224,.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          padding: '8px 20px',
          overflowX: 'auto',
        }}>
          {opponents.map((opp) => {
            const isOppTurn = opp.userId === snapshot?.currentPlayerId
            return (
              <div key={opp.userId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                {/* Avatar */}
                <div style={{
                  width: 46, height: 46, borderRadius: '50%',
                  background: isOppTurn ? 'var(--gold)' : 'var(--card-back)',
                  border: isOppTurn ? '2.5px solid var(--gold-lt)' : '2px solid rgba(245,239,224,.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800,
                  color: isOppTurn ? '#1a0d00' : 'var(--cream)',
                  boxShadow: isOppTurn ? '0 0 16px var(--gold-glow)' : 'none',
                  transition: 'all 200ms',
                }}>
                  {opp.username[0].toUpperCase()}
                </div>
                {/* Username */}
                <p style={{ fontSize: 11, color: isOppTurn ? 'var(--gold-lt)' : 'var(--cream-60)', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isOppTurn ? 700 : 400 }}>
                  {opp.username}
                </p>
                {/* Card count — big & bold */}
                <div style={{
                  fontSize: 36, fontWeight: 800, lineHeight: 1,
                  color: opp.cardCount <= 2 ? 'var(--illegal)' : opp.cardCount <= 4 ? 'var(--gold-lt)' : 'var(--cream)',
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                }}>
                  {opp.cardCount}
                </div>
                {opp.lastCardShown && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: '#fff',
                    background: 'var(--illegal)', borderRadius: 4,
                    padding: '1px 5px', letterSpacing: .5,
                  }}>LAST!</span>
                )}
              </div>
            )
          })}
        </div>

        {/* CENTER — Game table */}
        <div className="game-center" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: '12px 16px', position: 'relative',
        }}>
          {/* Status pill */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isMyTurn ? (
              <span className="pulse-slow" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 14px', borderRadius: 99,
                background: 'var(--gold-bg)', color: 'var(--gold-lt)',
                fontSize: 13, fontWeight: 700,
              }}>
                Your turn
              </span>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 14px', borderRadius: 99,
                background: 'rgba(245,239,224,.07)', color: 'var(--cream-60)',
                fontSize: 13, fontWeight: 600,
              }}>
                {opponents.find((o) => o.userId === snapshot?.currentPlayerId)?.username ?? 'Opponent'}&apos;s turn
              </span>
            )}
            {timer !== null && (
              <span style={{
                padding: '4px 10px', borderRadius: 99,
                background: timer <= 3 ? 'var(--danger-bg)' : 'rgba(245,239,224,.07)',
                color: timer <= 3 ? 'var(--illegal)' : 'var(--cream-60)',
                fontSize: 12, fontWeight: 700,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                transition: 'background 300ms, color 300ms',
              }}>
                {timer}s
              </span>
            )}
          </div>

          {/* Action announce overlay */}
          {announce && (
            <div className="announce-in" style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              zIndex: 50, textAlign: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                background: 'rgba(10,26,18,.9)',
                border: '1px solid var(--gold)',
                borderRadius: 12,
                padding: '8px 20px',
                backdropFilter: 'blur(6px)',
                boxShadow: '0 4px 24px var(--gold-glow)',
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold-lt)', letterSpacing: .3 }}>
                  {announce.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--cream-60)', marginTop: 2 }}>
                  {announce.sub}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className={`slide-up ${shake ? 'shake' : ''}`} style={{
              padding: '6px 14px', borderRadius: 8,
              background: 'var(--danger-bg)', color: 'var(--illegal)',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Dealing overlay — blocks play, shows cards animating to opponent */}
          {dealing && (
            <div className="announce-in" style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 12, zIndex: 40,
              background: 'rgba(5,20,14,.55)',
              borderRadius: 12,
              backdropFilter: 'blur(2px)',
              pointerEvents: 'all',
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold-lt)' }}>
                {dealing.type === 'pick_two' ? 'Dealing 2 cards…' : 'General Market — dealing 1 each…'}
              </div>
              {/* Animated cards "dealing out" */}
              <div style={{ display: 'flex', gap: 8 }}>
                {Array.from({ length: dealing.count }).map((_, i) => (
                  <div key={i} className="deal-in" style={{ animationDelay: `${i * 280}ms` }}>
                    <CardBack size="sm" />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cream-60)' }}>
                {dealing.affectedIds
                  .map((id) => snapshot?.players.find((p) => p.userId === id)?.username ?? id.slice(0, 6))
                  .join(', ')} {dealing.count > 1 ? 'picks up' : 'pick up'} {dealing.count}
              </div>
            </div>
          )}

          {/* Piles */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
            {/* Draw pile — stacked deck effect */}
            <div style={{ textAlign: 'center' }}>
              <div
                onClick={() => isMyTurn && !dealing && drawCard()}
                style={{ cursor: isMyTurn && !dealing ? 'pointer' : 'default', display: 'inline-block', position: 'relative' }}
              >
                {/* Stack layers behind the top card */}
                {deckLayers >= 3 && (
                  <div style={{ position: 'absolute', top: -9, left: -6, right: 6, bottom: 9, borderRadius: 9, background: 'var(--card-back)', border: '1px solid rgba(245,239,224,.1)' }} />
                )}
                {deckLayers >= 2 && (
                  <div style={{ position: 'absolute', top: -6, left: -4, right: 4, bottom: 6, borderRadius: 9, background: 'var(--card-back)', border: '1px solid rgba(245,239,224,.15)' }} />
                )}
                {deckLayers >= 1 && (
                  <div style={{ position: 'absolute', top: -3, left: -2, right: 2, bottom: 3, borderRadius: 9, background: 'var(--card-back)', border: '1px solid rgba(245,239,224,.2)' }} />
                )}
                <CardBack size="lg" style={{
                  position: 'relative',
                  outline: isMyTurn && !dealing ? '2px solid var(--gold)' : 'none',
                  outlineOffset: 2,
                  boxShadow: isMyTurn && !dealing ? '0 0 14px var(--gold-glow)' : undefined,
                  transition: 'box-shadow 200ms',
                }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--cream-60)', marginTop: 4 }}>
                {drawPileCount} left
              </p>
            </div>

            {/* Discard pile (hero) — drop zone */}
            <div
              style={{ textAlign: 'center' }}
              onDragOver={(e) => { if (isMyTurn && draggedCard) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
              onDrop={(e) => { e.preventDefault(); if (draggedCard) { handlePlayCard(draggedCard); setDraggedCard(null) } }}
            >
              <div style={{
                borderRadius: 12,
                outline: draggedCard && isMyTurn ? '3px dashed var(--gold)' : '3px solid transparent',
                transition: 'outline 120ms ease',
              }}>
                {top
                  ? <WhotCard key={discardKey} card={top} size="xl" className="card-land" />
                  : <CardBack size="xl" />}
              </div>
              <p style={{ fontSize: 11, color: 'var(--cream-60)', marginTop: 4 }}>
                {draggedCard && isMyTurn ? 'Drop to play' : 'Discard pile'}
              </p>
            </div>
          </div>
        </div>

        {/* GAME-TABLE REVEAL — shown at the table before Check Up screen */}
        {gameReveal && (
          <div className="announce-in" style={{
            position: 'absolute', inset: 0, zIndex: 90,
            background: 'rgba(5,20,14,.93)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 16, padding: '20px 16px',
            backdropFilter: 'blur(4px)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-lt)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
              Check Up — Cards Revealed
            </div>
            {gameReveal.map((player) => {
              const isMe = player.userId === user?.id
              return (
                <div key={player.userId} style={{
                  width: '100%', maxWidth: 380,
                  background: isMe ? 'rgba(201,148,42,.1)' : 'rgba(5,20,14,.6)',
                  border: `1px solid ${isMe ? 'var(--gold)' : 'rgba(245,239,224,.1)'}`,
                  borderRadius: 12, padding: '10px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isMe ? 'var(--gold-lt)' : 'var(--cream)' }}>
                      {player.username}{isMe ? ' (you)' : ''}
                    </span>
                    <span style={{
                      fontSize: 18, fontWeight: 800,
                      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                      color: player.rank === 1 ? 'var(--gold-lt)' : 'var(--cream)',
                      background: player.rank === 1 ? 'var(--gold-bg)' : 'rgba(245,239,224,.07)',
                      padding: '1px 10px', borderRadius: 6,
                    }}>
                      {player.hand.length === 0 ? 'Winner!' : `Total: ${player.handTotal}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {player.hand.length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--gold-lt)', fontWeight: 700 }}>No cards — emptied hand</span>
                    ) : (
                      player.hand.map((card, ci) => (
                        <div key={ci} className="card-reveal" style={{ animationDelay: `${ci * 80}ms`, opacity: 0 }}>
                          <WhotCard card={card} size="sm" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* BOTTOM — Player hand */}
        <div className="game-hand" style={{
          background: 'rgba(5,20,14,.5)',
          borderTop: '1px solid rgba(245,239,224,.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '6px 0 0',
          overflow: 'hidden',
        }}>
          {/* Card count — big and visible */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontSize: 28, fontWeight: 800, lineHeight: 1,
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              color: handSnap.length <= 2 ? 'var(--illegal)' : handSnap.length <= 4 ? 'var(--gold-lt)' : 'var(--cream)',
            }}>
              {handSnap.length}
            </span>
            <span style={{ fontSize: 12, color: 'var(--cream-35)', fontWeight: 600 }}>
              card{handSnap.length !== 1 ? 's' : ''}
            </span>
            {isMyTurn && (
              <span className="pulse-slow" style={{ fontSize: 11, color: 'var(--gold-lt)', fontWeight: 700 }}>
                — your turn
              </span>
            )}
          </div>

          {/* Scrollable spread — slight arc, adaptive overlap */}
          <div style={{
            flex: 1,
            width: '100%',
            overflowX: 'auto',
            overflowY: 'visible',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: handSnap.length <= 5 ? 'center' : 'flex-start',
            padding: '20px 20px 8px',
            gap: 0,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}>
            {handSnap.map((card, i) => {
              const total = handSnap.length
              const midIndex = (total - 1) / 2
              const maxDeg = Math.min(10, total * 1.5)
              const rotation = total > 1 ? ((i - midIndex) / (midIndex || 1)) * maxDeg : 0
              const arcY = Math.abs(i - midIndex) * 2.5
              const isHov = hoveredCardIdx === i
              const isPlayable = isMyTurn && validCards.some((c) => c.suit === card.suit && c.number === card.number)
              // Adaptive overlap: spread cards more when few, tighter when many
              const overlap = total <= 4 ? 6 : total <= 7 ? -4 : total <= 10 ? -10 : -16

              return (
                <div
                  key={`${card.suit}-${card.number}-${i}`}
                  className="deal-in"
                  style={{
                    flexShrink: 0,
                    marginLeft: i > 0 ? overlap : 0,
                    transform: `rotate(${rotation}deg) translateY(${isHov ? -40 : arcY}px)`,
                    transformOrigin: 'bottom center',
                    transition: 'transform 180ms cubic-bezier(.22,.68,0,1.2)',
                    zIndex: isHov ? 200 : i + 1,
                    position: 'relative',
                    animationDelay: `${i * 40}ms`,
                    cursor: isPlayable ? 'pointer' : 'default',
                  }}
                  onMouseEnter={() => setHoveredCardIdx(i)}
                  onMouseLeave={() => setHoveredCardIdx(null)}
                  onTouchStart={() => setHoveredCardIdx(i)}
                  onTouchEnd={() => setHoveredCardIdx(null)}
                  draggable={isPlayable}
                  onDragStart={(e) => { setDraggedCard(card); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => setDraggedCard(null)}
                  onClick={() => handlePlayCard(card)}
                >
                  <WhotCard
                    card={card}
                    playable={isPlayable}
                    disabled={isMyTurn && !isPlayable}
                    size="md"
                  />
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
