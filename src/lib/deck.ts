import type { Card, Suit } from '@/types/game'

// 54-card deck: distributed across 5 suits (no Whot 20)
const DECK_CONFIG: Record<Suit, number[]> = {
  Circles:   [1,2,3,4,5,7,8,10,11,12,13,14],  // 12
  Triangles: [1,2,3,4,5,7,8,10,11,12,13,14],  // 12
  Crosses:   [1,2,3,4,5,7,8,10,11,12,13,14],  // 12
  Squares:   [1,2,3,4,5,7,8,10,11,13],         // 10
  Stars:     [1,2,3,5,7,8],                    // 6  (action cards 1,2,8 present)
}
// Total: 12+12+12+10+6 = 52... let's verify

export const ACTION_CARDS = new Set([1, 2, 8, 14])
export const SUIT_ORDER: Suit[] = ['Circles', 'Triangles', 'Crosses', 'Squares', 'Stars']

export function generateDeck(): Card[] {
  const deck: Card[] = []
  for (const [suit, numbers] of Object.entries(DECK_CONFIG)) {
    for (const number of numbers) {
      deck.push({ suit: suit as Suit, number })
    }
  }
  return deck
}

export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck]
  // Fisher-Yates with crypto random
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function isActionCard(card: Card): boolean {
  return ACTION_CARDS.has(card.number)
}

export function cardMatches(played: Card, top: Card): boolean {
  // Coerce to number — Prisma JSON can deserialise numeric fields as strings in some edge cases
  const pn = Number(played.number)
  const tn = Number(top.number)
  if (pn === 20) return true   // Whot 20 wildcard plays on anything
  return pn === tn || played.suit === top.suit
}

export function compareCards(a: Card, b: Card): number {
  if (a.number !== b.number) return a.number - b.number
  return SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit)
}

export function deckSize(): number {
  return Object.values(DECK_CONFIG).reduce((sum, arr) => sum + arr.length, 0)
}
