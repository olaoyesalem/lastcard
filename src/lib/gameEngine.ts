import type { GameState, Card, Player, TenderTrigger, TenderResult } from '@/types/game'
import { isActionCard, cardMatches, shuffleDeck, generateDeck, SUIT_ORDER } from './deck'

const TURN_TIMEOUT_MS = 10_000
const DEAL_COUNT = 3

export function initGameState(
  roomId: string,
  players: { userId: string; username: string }[],
  pot: number,
  houseFeePercent: number,
): GameState {
  const deck = shuffleDeck(generateDeck())
  const playerList: Player[] = players.map((p) => ({ ...p, hand: [], isReady: true, lastCardShown: false }))

  for (const player of playerList) {
    player.hand = deck.splice(0, DEAL_COUNT)
  }

  // First card that is NOT an action card goes to discard pile
  let topCard: Card
  do {
    topCard = deck.splice(0, 1)[0]
  } while (isActionCard(topCard) && deck.length > 0)

  const startIndex = Math.floor(Math.random() * players.length)

  return {
    roomId,
    status: 'active',
    players: playerList,
    currentPlayerIndex: startIndex,
    drawPile: deck,
    discardPile: [topCard],
    extraTurnPending: false,
    skipNextPlayer: false,
    turnTimerExpires: Date.now() + TURN_TIMEOUT_MS,
    tenderTrigger: null,
    pot,
    houseFeePercent,
  }
}

export type PlayResult =
  | { type: 'ok'; state: GameState; events: GameEvent[] }
  | { type: 'error'; message: string }

export type GameEvent =
  | { name: 'card_played'; payload: { userId: string; card: Card; drawPileCount: number } }
  | { name: 'card_drawn'; payload: { userId: string; newHandSize: number; drawPileCount: number } }
  | { name: 'last_card'; payload: { userId: string } }
  | { name: 'action_resolved'; payload: { type: string; affectedPlayerIds?: string[]; drawCount?: number } }
  | { name: 'turn_change'; payload: { currentPlayerId: string; drawPileCount: number; extraTurn: boolean; timerExpires: number } }
  | { name: 'tender_result'; payload: { trigger: TenderTrigger; rankings: TenderResult[]; potSplit: { userId: string; amount: number }[] } }

function topDiscard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1]
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]
}

function playerById(state: GameState, userId: string): Player | undefined {
  return state.players.find((p) => p.userId === userId)
}

function nextPlayerIndex(state: GameState, skip = 0): number {
  return (state.currentPlayerIndex + 1 + skip) % state.players.length
}

// Hand sum — lower is better. Suit tiebreak: Circles < Triangles < Crosses < Squares < Stars.
function handScore(player: Player): number {
  return player.hand.reduce((sum, c) => sum + c.number, 0)
}

function suitTiebreak(player: Player): number {
  return player.hand.reduce((sum, c) => sum + SUIT_ORDER.indexOf(c.suit as never), 0)
}

// Resolve the game immediately — rank all players by hand sum (ascending).
export function finalizeTender(state: GameState, trigger: TenderTrigger): PlayResult {
  const s: GameState = JSON.parse(JSON.stringify(state))
  const events: GameEvent[] = []

  const ranked = [...s.players].sort((a, b) => {
    const diff = handScore(a) - handScore(b)
    return diff !== 0 ? diff : suitTiebreak(a) - suitTiebreak(b)
  })

  const stakeAmount = s.players.length > 0 ? s.pot / s.players.length : 200
  const payouts = getPayouts(ranked.length, stakeAmount)

  const rankings: TenderResult[] = ranked.map((p, i) => ({
    userId: p.userId,
    username: p.username,
    handTotal: handScore(p),
    hand: [...p.hand],
    rank: i + 1,
    payout: payouts[i] ?? 0,
  }))

  const potSplit = rankings.map((r) => ({ userId: r.userId, amount: r.payout }))

  s.status = 'resolved'
  s.tenderTrigger = trigger
  s.turnTimerExpires = null

  events.push({ name: 'tender_result', payload: { trigger, rankings, potSplit } })

  return { type: 'ok', state: s, events }
}

// Trigger point: immediately finalize and emit result.
function triggerTender(
  state: GameState,
  trigger: TenderTrigger,
  events: GameEvent[],
): GameState {
  const result = finalizeTender(state, trigger)
  if (result.type === 'ok') {
    events.push(...result.events)
    return result.state
  }
  return state
}

// Draw cards for a player; emits card_drawn per card so UI card counts update live.
function drawCards(
  state: GameState,
  player: Player,
  count: number,
  events: GameEvent[],
): { triggered: boolean } {
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) {
      Object.assign(state, triggerTender(state, 'market_empty', events))
      return { triggered: true }
    }
    const card = state.drawPile.pop()!
    player.hand.push(card)
    events.push({
      name: 'card_drawn',
      payload: { userId: player.userId, newHandSize: player.hand.length, drawPileCount: state.drawPile.length },
    })
  }
  return { triggered: false }
}

function advanceTurn(state: GameState, events: GameEvent[], skip = 0): void {
  if (state.status !== 'active') return

  if (state.extraTurnPending) {
    state.extraTurnPending = false
  } else {
    state.currentPlayerIndex = nextPlayerIndex(state, skip)
    state.skipNextPlayer = false
  }

  state.turnTimerExpires = Date.now() + TURN_TIMEOUT_MS
  events.push({
    name: 'turn_change',
    payload: {
      currentPlayerId: currentPlayer(state).userId,
      drawPileCount: state.drawPile.length,
      extraTurn: false,
      timerExpires: state.turnTimerExpires,
    },
  })
}

export function playCard(
  state: GameState,
  userId: string,
  card: Card,
): PlayResult {
  const events: GameEvent[] = []
  const s: GameState = JSON.parse(JSON.stringify(state))

  if (s.status !== 'active') return { type: 'error', message: 'Game not active' }

  const player = playerById(s, userId)
  if (!player) return { type: 'error', message: 'Player not in room' }
  if (currentPlayer(s).userId !== userId) return { type: 'error', message: 'Not your turn' }

  // Use Number() coercion so string-typed numbers from JSON survive comparison
  const cardIndex = player.hand.findIndex((c) => c.suit === card.suit && Number(c.number) === Number(card.number))
  if (cardIndex === -1) return { type: 'error', message: 'Card not in hand' }

  const top = topDiscard(s)
  if (!cardMatches(card, top)) return { type: 'error', message: 'Card does not match' }

  player.hand.splice(cardIndex, 1)
  s.discardPile.push(card)

  events.push({
    name: 'card_played',
    payload: { userId, card, drawPileCount: s.drawPile.length },
  })

  // Last card indicator
  if (player.hand.length === 1 && !player.lastCardShown) {
    player.lastCardShown = true
    events.push({ name: 'last_card', payload: { userId } })
  } else if (player.hand.length > 1) {
    player.lastCardShown = false
  }

  // Check-up: only when hand is empty AND the card was NOT an action card.
  // Action cards played as last card resolve their effect first; the player
  // then draws on their next turn (or extra turn) instead of winning outright.
  if (player.hand.length === 0 && !isActionCard(card)) {
    Object.assign(s, triggerTender(s, 'checkup', events))
    return { type: 'ok', state: s, events }
  }

  // Resolve action cards
  let skipCount = 0

  switch (card.number) {
    case 1: // Hold On — extra turn for current player
      s.extraTurnPending = true
      events.push({ name: 'action_resolved', payload: { type: 'hold_on' } })
      break

    case 2: { // Pick Two — next player draws 2 and is skipped
      const nextIdx = nextPlayerIndex(s)
      const nextPl = s.players[nextIdx]
      const { triggered } = drawCards(s, nextPl, 2, events)
      if (!triggered) {
        events.push({
          name: 'action_resolved',
          payload: { type: 'pick_two', affectedPlayerIds: [nextPl.userId], drawCount: 2 },
        })
        skipCount = 1
      } else {
        return { type: 'ok', state: s, events }
      }
      break
    }

    case 8: // Suspension — next player skipped
      events.push({
        name: 'action_resolved',
        payload: { type: 'suspension', affectedPlayerIds: [s.players[nextPlayerIndex(s)].userId] },
      })
      skipCount = 1
      break

    case 14: { // General Market — every other player draws 1; current player gets extra turn
      const others = s.players.filter((p) => p.userId !== userId)
      let marketEmpty = false
      for (const other of others) {
        const { triggered } = drawCards(s, other, 1, events)
        if (triggered) { marketEmpty = true; break }
      }
      if (!marketEmpty) {
        events.push({
          name: 'action_resolved',
          payload: { type: 'general_market', affectedPlayerIds: others.map((p) => p.userId) },
        })
        s.extraTurnPending = true
      } else {
        // Market emptied mid-gen. If player played gen as their last card (0 cards),
        // give them 1 card from discard pile before tender so they can participate.
        if (player.hand.length === 0 && s.discardPile.length > 1) {
          const rescued = s.discardPile.splice(s.discardPile.length - 2, 1)[0]
          player.hand.push(rescued)
          events.push({
            name: 'card_drawn',
            payload: { userId: player.userId, newHandSize: 1, drawPileCount: 0 },
          })
        }
        return { type: 'ok', state: s, events }
      }
      break
    }
  }

  advanceTurn(s, events, skipCount)
  return { type: 'ok', state: s, events }
}

// Draw 1 card and pass turn. If pile empty, resolve immediately.
export function drawCard(state: GameState, userId: string): PlayResult {
  const events: GameEvent[] = []
  const s: GameState = JSON.parse(JSON.stringify(state))

  if (s.status !== 'active') return { type: 'error', message: 'Game not active' }
  if (currentPlayer(s).userId !== userId) return { type: 'error', message: 'Not your turn' }

  if (s.drawPile.length === 0) {
    Object.assign(s, triggerTender(s, 'market_empty', events))
    return { type: 'ok', state: s, events }
  }

  const player = playerById(s, userId)!
  const card = s.drawPile.pop()!
  player.hand.push(card)

  events.push({
    name: 'card_drawn',
    payload: { userId, newHandSize: player.hand.length, drawPileCount: s.drawPile.length },
  })

  advanceTurn(s, events)
  return { type: 'ok', state: s, events }
}

// Auto-play when turn timer expires: play first valid card, else draw.
export function autoPlay(state: GameState): PlayResult {
  const player = currentPlayer(state)
  const top = topDiscard(state)

  const valid = player.hand.find((c) => cardMatches(c, top))

  if (valid) return playCard(state, player.userId, valid)
  return drawCard(state, player.userId)
}

// Returns fixed naira payouts per rank. All amounts are multiples of stakeAmount.
// House earns: pot − sum(payouts).
function getPayouts(count: number, stake: number): number[] {
  const s = stake
  const table: Record<number, number[]> = {
    2: [2 * s],                    // winner takes all
    3: [3 * s],                    // winner takes all
    4: [3 * s, 1 * s],            // 600 / 200
    5: [3 * s, 2 * s],            // 600 / 400
    6: [3 * s, 2 * s, 1 * s],    // 600 / 400 / 200
    7: [4 * s, 2 * s, 1 * s],    // 800 / 400 / 200
    8: [5 * s, 2 * s, 1 * s],     // 1000 / 400 / 200
    9: [5 * s, 3 * s, 1 * s],     // 1000 / 600 / 200
    10: [6 * s, 3 * s, 1 * s],    // 1200 / 600 / 200
    11: [6 * s, 4 * s, 1 * s],    // 1200 / 800 / 200
  }
  return table[count] ?? [count * s]   // fallback: winner takes all
}
