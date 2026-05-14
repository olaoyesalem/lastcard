'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, authHeaders } from '@/store/authStore'

interface UserRow { id: string; email: string; walletBalance: number; role: string }
interface TxRow { id: string; userId: string; type: string; amount: number; status: string; createdAt: string }

export default function AdminPage() {
  const router = useRouter()
  const userRef = useRef(typeof window !== 'undefined' ? getUser() : null)
  const user = userRef.current
  const [mounted, setMounted] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [pendingTx, setPendingTx] = useState<TxRow[]>([])
  const [adjustUserId, setAdjustUserId] = useState('')
  const [adjustAmt, setAdjustAmt] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<'wallets' | 'transactions'>('wallets')

  const fetchData = useCallback(async () => {
    const [uRes, tRes] = await Promise.all([
      fetch('/api/admin/wallet', { headers: authHeaders() }),
      fetch('/api/admin/transactions', { headers: authHeaders() }),
    ])
    if (uRes.ok) setUsers(await uRes.json())
    if (tRes.ok) setPendingTx(await tRes.json())
  }, [])

  useEffect(() => {
    setMounted(true)
    if (!userRef.current || userRef.current.role !== 'admin') { router.push('/dashboard'); return }
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function adjustWallet() {
    const res = await fetch('/api/admin/wallet', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: adjustUserId, amount: Number(adjustAmt), reason: adjustReason }),
    })
    const data = await res.json()
    setMsg(data.message || data.error)
    fetchData()
  }

  async function processTransaction(id: string, status: 'completed' | 'rejected') {
    const res = await fetch(`/api/admin/transactions/${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json()
    setMsg(data.message || data.error)
    fetchData()
  }

  if (!mounted || !user || user.role !== 'admin') return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="pulse-slow" style={{ color: 'var(--primary)', fontSize: 32 }}>🃏</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>Admin Panel</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>LastCard</p>
        </div>
        <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => router.push('/dashboard')}>
          ← Dashboard
        </button>
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', color: 'var(--primary)', fontSize: 14, marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['wallets', 'transactions'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
              background: tab === t ? 'linear-gradient(135deg,#f59e0b,#ea580c)' : 'rgba(255,255,255,.06)',
              color: tab === t ? '#1a0700' : 'var(--text-muted)',
            }}>
            {t === 'wallets' ? 'Wallets' : 'Transactions'}
          </button>
        ))}
      </div>

      {tab === 'wallets' && (
        <>
          {/* Adjust wallet */}
          <div className="panel" style={{ marginBottom: 20 }}>
            <p style={{ fontWeight: 700, marginBottom: 12 }}>Adjust Wallet</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select className="input" value={adjustUserId} onChange={(e) => setAdjustUserId(e.target.value)}
                style={{ background: 'var(--bg-surface)', color: 'var(--text)' }}>
                <option value="">Select user</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.email} (₦{u.walletBalance})</option>)}
              </select>
              <input className="input" type="number" placeholder="Amount (negative to deduct)" value={adjustAmt} onChange={(e) => setAdjustAmt(e.target.value)} />
              <input className="input" placeholder="Reason" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }}
              onClick={adjustWallet} disabled={!adjustUserId || !adjustAmt}>
              Apply
            </button>
          </div>

          {/* User wallets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map((u) => (
              <div key={u.id} className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{u.email.split('@')[0]}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</p>
                  {u.role === 'admin' && <span className="badge badge-gold" style={{ fontSize: 10, marginTop: 2 }}>Admin</span>}
                </div>
                <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>₦{u.walletBalance.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'transactions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pendingTx.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>No pending transactions</p>}
          {pendingTx.map((tx) => (
            <div key={tx.id} className="panel" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{tx.type}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                <p style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary)' }}>₦{tx.amount.toLocaleString()}</p>
              </div>
              {tx.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, padding: '8px 0', fontSize: 13 }}
                    onClick={() => processTransaction(tx.id, 'completed')}>
                    Approve
                  </button>
                  <button className="btn btn-ghost" style={{ flex: 1, padding: '8px 0', fontSize: 13, color: '#f87171' }}
                    onClick={() => processTransaction(tx.id, 'rejected')}>
                    Reject
                  </button>
                </div>
              )}
              {tx.status !== 'pending' && <span className={`badge badge-${tx.status === 'completed' ? 'green' : 'red'}`}>{tx.status}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
