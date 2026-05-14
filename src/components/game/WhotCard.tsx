'use client'

import type { Card } from '@/types/game'

// All suit symbols rendered in --card-ink (deep burgundy). Shape = identity, not color.
const SUIT_SYMBOL: Record<string, string> = {
  Circles:   '●',
  Triangles: '▲',
  Crosses:   '✚',
  Squares:   '■',
  Stars:     '★',
  Whot:      '★',
}

// Gold corner badge label for action cards
const ACTION_BADGE: Record<number, string> = {
  1:  '⏸',
  2:  '+2',
  5:  '+3',
  8:  '⊘',
  14: 'MKT',
}

const ACTION_NUMBERS = new Set([1, 2, 5, 8, 14])

interface WhotCardProps {
  card: Card
  playable?: boolean
  disabled?: boolean
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  style?: React.CSSProperties
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}

// Width in px for each size; height = width * 7/5 (5:7 ratio)
const SIZE_W = { sm: 52, md: 72, lg: 96, xl: 128 }

export default function WhotCard({
  card,
  playable,
  disabled,
  onClick,
  size = 'md',
  className = '',
  style,
  draggable,
  onDragStart,
  onDragEnd,
}: WhotCardProps) {
  const w = SIZE_W[size]
  const h = Math.round(w * 1.4)   // 5:7
  const isWhot   = card.number === 20
  const isAction = ACTION_NUMBERS.has(card.number)
  const symbol   = SUIT_SYMBOL[card.suit] ?? '●'
  const ink      = 'var(--card-ink)'
  const gold     = 'var(--gold)'

  const cornerNum  = isWhot ? '20' : String(card.number)
  const cornerSym  = isWhot ? '★' : symbol

  // Font scaling relative to card width
  const f = (base: number) => Math.round(w * base)

  const classes = [
    'card',
    playable  ? 'playable'  : '',
    disabled  ? 'disabled'  : '',
    className,
  ].filter(Boolean).join(' ')

  if (isWhot) {
    // Whot 20: burgundy face, cream text
    return (
      <div
        className={classes}
        onClick={playable && onClick ? onClick : undefined}
        role={playable ? 'button' : undefined}
        aria-label={`Whot 20${playable ? ', playable' : ''}`}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={{
          width: w, height: h,
          background: 'var(--card-back)',
          borderColor: 'rgba(245,239,224,.25)',
          color: 'var(--cream)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: Math.round(w * 0.07),
          overflow: 'hidden',
          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
          ...style,
        }}
      >
        {/* Top corner */}
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontSize: f(0.18), fontWeight: 800 }}>20</div>
          <div style={{ fontSize: f(0.13), opacity: .7 }}>★</div>
        </div>

        {/* Center wordmark */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: f(0.03) }}>
          <span style={{
            fontSize: f(0.28), fontWeight: 800, letterSpacing: f(0.02),
            textShadow: '0 1px 6px rgba(0,0,0,.4)',
          }}>
            WHOT
          </span>
          {/* Mini suit cluster */}
          <div style={{ display: 'flex', gap: f(0.04), fontSize: f(0.11), opacity: .65 }}>
            <span>●</span><span>▲</span><span>✚</span><span>■</span><span>★</span>
          </div>
        </div>

        {/* Bottom corner (rotated) */}
        <div style={{ lineHeight: 1.1, transform: 'rotate(180deg)', alignSelf: 'flex-end' }}>
          <div style={{ fontSize: f(0.18), fontWeight: 800 }}>20</div>
          <div style={{ fontSize: f(0.13), opacity: .7 }}>★</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={classes}
      onClick={playable && onClick ? onClick : undefined}
      role={playable ? 'button' : undefined}
      aria-label={`${card.suit} ${card.number}${playable ? ', playable' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        width: w, height: h,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: Math.round(w * 0.07),
        overflow: 'hidden',
        fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
        color: ink,
        position: 'relative',
        ...style,
      }}
    >
      {/* Gold action badge — top-right corner */}
      {isAction && (
        <div style={{
          position: 'absolute',
          top: Math.round(w * 0.05),
          right: Math.round(w * 0.05),
          background: gold,
          color: '#1A0D00',
          fontSize: f(0.1),
          fontWeight: 800,
          lineHeight: 1,
          padding: `${f(0.03)}px ${f(0.06)}px`,
          borderRadius: 99,
          letterSpacing: .3,
        }}>
          {ACTION_BADGE[card.number]}
        </div>
      )}

      {/* Top-left corner index */}
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: f(0.2), fontWeight: 800, color: ink }}>{cornerNum}</div>
        <div style={{ fontSize: f(0.14), color: ink }}>{cornerSym}</div>
      </div>

      {/* Center pip */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: f(0.45), lineHeight: 1, color: ink }}>{symbol}</span>
      </div>

      {/* Bottom-right corner index (rotated 180°) */}
      <div style={{
        lineHeight: 1.1,
        transform: 'rotate(180deg)',
        alignSelf: 'flex-end',
      }}>
        <div style={{ fontSize: f(0.2), fontWeight: 800, color: ink }}>{cornerNum}</div>
        <div style={{ fontSize: f(0.14), color: ink }}>{cornerSym}</div>
      </div>
    </div>
  )
}

// ── Card back ────────────────────────────────────────────────────────────────

export function CardBack({
  size = 'md',
  style,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  style?: React.CSSProperties
}) {
  const w = SIZE_W[size]
  const h = Math.round(w * 1.4)
  const f = (base: number) => Math.round(w * base)
  const pad = Math.round(w * 0.08)

  return (
    <div
      style={{
        width: w, height: h,
        borderRadius: 9,
        background: 'var(--card-back)',
        border: '1.5px solid rgba(245,239,224,.22)',
        boxShadow: '0 2px 8px rgba(0,0,0,.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
        color: 'var(--cream)',
        ...style,
      }}
    >
      {/* Inner border frame */}
      <div style={{
        position: 'absolute',
        inset: pad,
        border: '1px solid rgba(245,239,224,.2)',
        borderRadius: 5,
        pointerEvents: 'none',
      }} />

      {/* Tiled suit pattern — low opacity */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexWrap: 'wrap',
        alignContent: 'flex-start',
        gap: f(0.04),
        padding: f(0.12),
        opacity: .12,
        fontSize: f(0.18),
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i}>{['●','▲','✚','■','★'][i % 5]}</span>
        ))}
      </div>

      {/* WHOT wordmark */}
      <div style={{
        position: 'relative',
        fontSize: f(0.22),
        fontWeight: 800,
        letterSpacing: f(0.02),
        textShadow: '0 1px 6px rgba(0,0,0,.5)',
        opacity: .85,
      }}>
        WHOT
      </div>
    </div>
  )
}
