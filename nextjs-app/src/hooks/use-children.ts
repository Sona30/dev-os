'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/client/api'
import type { ChildDto, ChildResponse } from '@/lib/children/types'
import type { CreateChildInput, UpdateChildInput } from '@/lib/schemas/children'

export const childrenKey = ['children'] as const
export const childKey = (childId: string) => ['child', childId] as const

export function useChildren(initialData?: ChildDto[]) {
  return useQuery({
    queryKey: childrenKey,
    queryFn: async () => (await apiFetch<{ children: ChildDto[] }>('/api/children')).children,
    initialData,
  })
}

export function useCreateChild() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateChildInput) => apiFetch<ChildResponse>('/api/children', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: childrenKey }),
  })
}

export function useUpdateChild(childId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateChildInput) =>
      apiFetch<ChildResponse>(`/api/children/${childId}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: childrenKey })
      queryClient.invalidateQueries({ queryKey: childKey(childId) })
    },
  })
}

/** Starts the deletion job; follow its progress with useJob(jobId). */
export function useDeleteChild(childId: string) {
  return useMutation({
    mutationFn: (confirm: string) =>
      apiFetch<{ jobId: string }>(`/api/children/${childId}`, { method: 'DELETE', body: { confirm } }),
  })
}
