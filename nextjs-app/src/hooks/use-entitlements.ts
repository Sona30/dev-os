'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/client/api'

export interface EntitlementsDto {
  plan: 'free' | 'season' | 'family' | 'tutor'
  status: 'none' | 'active' | 'past_due' | 'canceled'
  canStartCycle: boolean
  reason?: 'PAYWALL' | 'DAILY_CAP'
  cyclesRemainingToday: number
  freeCycleUsed: boolean
  childLimit: number
  waitlistOptIn: boolean
}

export const entitlementsKey = ['entitlements'] as const

export function useEntitlements() {
  return useQuery({
    queryKey: entitlementsKey,
    queryFn: () => apiFetch<EntitlementsDto>('/api/me/entitlements'),
    refetchOnWindowFocus: true,
  })
}
