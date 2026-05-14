'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, clearAuth, authHeaders } from '@/store/authStore'

interface WalletData {
  balance: number
  transactions: { id: string; type: string; amount: number; status: string; createdAt: string }[]
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null)
  const [mounted, setMounted] = useState(false)
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [inviteInput, setInviteInput] = useState('')
  const [depositAmt, setDepositAmt] = useState('')
  const [depositRef, setDepositRef] = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [bankName, setBankName] = useState('')
  const [acctNo, setAcctNo] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchWallet = useCallback(async () => {
    const res = await fetch('/api/wallet', { headers: authHeaders() })
    if (res.status === 401) { clearAuth(); router.push('/auth'); return }
    setWallet(await res.json())
  }, [router])

  useEffect(() => {
    setMounted(true)
    const currentUser = getUser()
    if (!currentUser) { router.push('/auth'); return }
    setUser(currentUser)
    fetchWallet()
    // fetchWallet and router are stable — only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createRoom() {
    setLoading(true); setMsg('')
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxPlayers }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setMsg(data.error)
    router.push(`/room/${data.roomId}`)
  }

  async function joinRoom() {
    setLoading(true); setMsg('')
    const code = inviteInput.trim().toUpperCase()
    const res = await fetch(`/api/rooms/${code}/join`, {
      method: 'POST', headers: authHeaders(),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setMsg(data.error)
    router.push(`/room/${data.roomId}`)
  }

  async function requestDeposit() {
    setLoading(true); setMsg('')
    const res = await fetch('/api/wallet/request', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'deposit', amount: Number(depositAmt), reference: depositRef }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setMsg(data.error)
    setMsg('Deposit request sent! Admin will credit your wallet soon.')
    setShowDeposit(false); fetchWallet()
  }

  async function requestWithdraw() {
    setLoading(true); setMsg('')
    const res = await fetch('/api/wallet/request', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'withdrawal', amount: Number(withdrawAmt), bankName, accountNumber: acctNo }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setMsg(data.error)
    setMsg('Withdrawal request submitted!')
    setShowWithdraw(false); fetchWallet()
  }

  if (!mounted || !user) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="pulse-slow" style={{ color: 'var(--primary)', fontSize: 32 }}>🃏</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', padding: '16px 16px 80px' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingTop: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, background: 'linear-gradient(135deg,#f59e0b,#ea580c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            LastCard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>@{user.username || user.email.split('@')[0]}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {user.role === 'admin' && (
            <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => router.push('/admin')}>
              Admin
            </button>
          )}
          <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }}
            onClick={() => { clearAuth(); router.push('/auth') }}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Wallet card */}
      <div className="panel" style={{
        marginBottom: 20,
        background: 'linear-gradient(135deg, #2a1505 0%, #1a0d02 100%)',
        border: '1px solid #5a3010',
      }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 4 }}>Wallet Balance</p>
        <p style={{ fontSize: 38, fontWeight: 800, color: 'var(--primary)', letterSpacing: '-.5px' }}>
          ₦{(wallet?.balance ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-outline" style={{ flex: 1, fontSize: 13, padding: '10px 0' }} onClick={() => { setShowDeposit(true); setShowWithdraw(false) }}>
            Deposit
          </button>
          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: '10px 0' }} onClick={() => { setShowWithdraw(true); setShowDeposit(false) }}>
            Withdraw
          </button>
        </div>
      </div>

      {/* Deposit form */}
      {showDeposit && (
        <div className="panel slide-up" style={{ marginBottom: 16, border: '1px solid var(--primary)' }}>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>Deposit Request</p>
          <div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Transfer your deposit to:</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>Opay &nbsp;·&nbsp; LastCard Ltd</p>
            <p style={{ fontSize: 32, fontWeight: 800, letterSpacing: 3, color: 'var(--primary)', lineHeight: 1.2 }}>9165748926</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="input" type="number" placeholder="Amount (₦)" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
            <input className="input" placeholder="Payment reference (optional)" value={depositRef} onChange={(e) => setDepositRef(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={requestDeposit} disabled={loading || !depositAmt}>
              Submit
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowDeposit(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Withdraw form */}
      {showWithdraw && (
        <div className="panel slide-up" style={{ marginBottom: 16, border: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 700, marginBottom: 16 }}>Withdrawal Request</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="input" type="number" placeholder="Amount (₦)" value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} />
            <input className="input" placeholder="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            <input className="input" placeholder="Account number" value={acctNo} onChange={(e) => setAcctNo(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={requestWithdraw} disabled={loading || !withdrawAmt || !bankName || !acctNo}>
              Submit
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowWithdraw(false)}>Cancel</button>
          </div>
        </div>
      )}

      {msg && (
        <div className="slide-up" style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', color: 'var(--primary)', fontSize: 14, marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {/* Play actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <button
          style={{
            flexDirection: 'column', gap: 4, padding: '20px 12px', height: 'auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600,
            background: 'linear-gradient(135deg, #1a6b4e 0%, #0d4a34 100%)',
            color: 'var(--cream)',
            boxShadow: '0 4px 16px rgba(15,76,58,.5)',
            transition: 'transform 100ms ease, box-shadow 100ms ease',
          }}
          onClick={() => { setShowCreate(true); setShowJoin(false); setMsg('') }}>
          <span style={{ fontSize: 24 }}>🎮</span>
          <span style={{ fontSize: 14 }}>Create Room</span>
          <span style={{ fontSize: 11, opacity: .7 }}>₦200 stake</span>
        </button>
        <button className="btn btn-outline" style={{ flexDirection: 'column', gap: 4, padding: '20px 12px', height: 'auto' }}
          onClick={() => { setShowJoin(true); setShowCreate(false); setMsg('') }}>
          <span style={{ fontSize: 24 }}>🔗</span>
          <span style={{ fontSize: 14 }}>Join Room</span>
          <span style={{ fontSize: 11, opacity: .7 }}>Enter invite code</span>
        </button>
      </div>

      {showCreate && (
        <div className="panel slide-up" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 16 }}>Create a Game Room</p>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
            Max players: <strong style={{ color: 'var(--text)' }}>{maxPlayers}</strong>
          </label>
          <input type="range" min={2} max={16} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--primary)', marginBottom: 16 }} />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Pot size: <strong style={{ color: 'var(--primary)' }}>₦{maxPlayers * 200}</strong> (when full)
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={createRoom} disabled={loading}>
              {loading ? 'Creating…' : 'Create & Stake ₦200'}
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showJoin && (
        <div className="panel slide-up" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 16 }}>Join a Room</p>
          <input className="input" placeholder="Enter invite code (e.g. AB1C2D)" value={inviteInput}
            onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
            style={{ marginBottom: 12, textTransform: 'uppercase', letterSpacing: 3 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={joinRoom} disabled={loading || !inviteInput.trim()}>
              {loading ? 'Joining…' : 'Join & Stake ₦200'}
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowJoin(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Recent transactions */}
      {wallet?.transactions && wallet.transactions.length > 0 && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5 }}>
            Recent Activity
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {wallet.transactions.slice(0, 8).map((tx) => (
              <div key={tx.id} className="panel" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{tx.type.replace('_', ' ')}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 700, color: ['winning', 'deposit'].includes(tx.type) ? '#4ade80' : '#f87171' }}>
                    {['winning', 'deposit'].includes(tx.type) ? '+' : '-'}₦{tx.amount.toLocaleString()}
                  </p>
                  <span className={`badge badge-${tx.status === 'completed' ? 'green' : tx.status === 'rejected' ? 'red' : 'dim'}`} style={{ fontSize: 11 }}>
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
