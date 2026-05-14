'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/store/authStore'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    if (getToken()) router.replace('/dashboard')
    else router.replace('/auth')
  }, [router])
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="pulse-slow" style={{ fontSize: 40 }}>🃏</div>
    </div>
  )
}
