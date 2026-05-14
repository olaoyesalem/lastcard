export type Suit = 'Circles' | 'Triangles' | 'Crosses' | 'Squares' | 'Stars'

export interface Card {
  suit: Suit
  number: number
}

export interface Player {
  userId: string
  username: string
  hand: Card[]
  isReady: boolean
  lastCardShown: boolean
}

export type RoomStatus = 'waiting' | 'ready_up' | 'active' | 'tender' | 'resolved'
export type TenderTrigger = 'checkup' | 'market_empty'

export interface GameState {
  roomId: string
  status: RoomStatus
  players: Player[]
  currentPlayerIndex: number
  drawPile: Card[]
  discardPile: Card[]
  extraTurnPending: boolean
  skipNextPlayer: boolean
  turnTimerExpires: number | null
  tenderTrigger: TenderTrigger | null
  pot: number
  houseFeePercent: number
}

export interface TenderResult {
  userId: string
  username: string
  handTotal: number   // sum of all card numbers in hand at resolution
  hand: Card[]        // actual cards, sent to all players on resolution
  rank: number
  payout: number
}

// Socket event payloads
export interface GameStartedPayload {
  yourHand: Card[]
  topDiscard: Card
  currentPlayerId: string
  pot: number
  players: { userId: string; username: string; cardCount: number }[]
}

export interface TurnChangePayload {
  currentPlayerId: string
  drawPileCount: number
  extraTurn: boolean
  timerExpires: number
}

export interface CardPlayedPayload {
  userId: string
  card: Card
  drawPileCount: number
}

export interface CardDrawnPayload {
  userId: string
  newHandSize: number
  drawPileCount: number
}

export interface TenderStartedPayload {
  reason: TenderTrigger
}

export interface TenderResultPayload {
  rankings: TenderResult[]
  potSplit: { userId: string; amount: number }[]
}

export interface LastCardPayload {
  userId: string
}

export interface ActionResolvedPayload {
  type: 'hold_on' | 'pick_two' | 'suspension' | 'general_market'
  affectedPlayerIds?: string[]
  drawCount?: number
}
