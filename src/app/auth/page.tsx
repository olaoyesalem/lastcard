'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveAuth } from '@/store/authStore'

type Step = 'login' | 'signup' | 'verify'

export default function AuthPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function safeJson(res: Response) {
    try { return await res.json() } catch { return {} }
  }

  async function handleLogin() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await safeJson(res)
      if (!res.ok) return setError(data.error || 'Login failed')
      saveAuth(data.token, { ...data.user })
      router.push('/dashboard')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignup() {
    setLoading(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username }),
      })
      const data = await safeJson(res)
      if (!res.ok) return setError(data.error || 'Signup failed')
      setStep('verify')
      if (data.devOtp) {
        setNotice(`Email delivery failed. Your OTP is: ${data.devOtp}`)
      } else if (data.message && data.message !== 'OTP sent to your email') {
        setNotice(data.message)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
      const data = await safeJson(res)
      if (!res.ok) return setError(data.error || 'Verification failed')
      saveAuth(data.token, { ...data.user, walletBalance: 0 })
      router.push('/dashboard')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Background pattern */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(234,88,12,.18) 0%, transparent 70%)',
      }} />

      <div className="panel slide-up" style={{ width: '100%', maxWidth: 420, zIndex: 1, position: 'relative' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 8 }}>🃏</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, background: 'linear-gradient(135deg,#f59e0b,#ea580c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-.5px' }}>
            LastCard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            Nigerian Whot Staking Game
          </p>
        </div>

        {step === 'verify' ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Check your email</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
              We sent a 6-digit code to <strong style={{ color: 'var(--text)' }}>{email}</strong>
            </p>
            {notice && (
              <div className="slide-up" style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.4)',
                color: 'var(--primary)', fontSize: 13, lineHeight: 1.5,
              }}>
                {notice}
              </div>
            )}
            <input
              className="input"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8, marginBottom: 12 }}
            />
            {error && <p style={{ color: 'var(--illegal)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleVerify} disabled={loading || otp.length < 6}>
              {loading ? 'Verifying…' : 'Verify & Play'}
            </button>
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setStep('signup')}>
              Back
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {(['login', 'signup'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => { setStep(s); setError(''); setNotice('') }}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontWeight: 600, fontSize: 14,
                    background: step === s ? 'linear-gradient(135deg,#f59e0b,#ea580c)' : 'rgba(255,255,255,.06)',
                    color: step === s ? '#1a0700' : 'var(--text-muted)',
                    transition: 'all 150ms ease',
                  }}
                >
                  {s === 'login' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
              {step === 'signup' && (
                <input className="input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} maxLength={24} />
              )}
              <input className="input" type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && <p style={{ color: 'var(--illegal)', fontSize: 13, marginTop: 12 }}>{error}</p>}

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 20 }}
              onClick={step === 'login' ? handleLogin : handleSignup}
              disabled={loading || !email || !password || (step === 'signup' && !username)}
            >
              {loading ? 'Please wait…' : step === 'login' ? 'Sign In' : 'Create Account'}
            </button>

            {step === 'login' && (
              <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                New here?{' '}
                <button style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => { setStep('signup'); setError('') }}>
                  Create an account
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
