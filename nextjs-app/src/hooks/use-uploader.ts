'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_REPORT_PAGES, MAX_SHEET_PAGES } from '@/lib/constants'
import { ImageProcessingError } from '@/lib/client/images/errors'
import { prepareFile, type PreparedImage, type UploadKind } from '@/lib/client/images/prepare'
import type { QualityIssue } from '@/lib/images/metrics'
import { uploadErrorMessage, uploadPrepared } from '@/lib/client/images/upload'

export type UploadItemStatus = 'preparing' | 'ready' | 'attention' | 'uploading' | 'uploaded' | 'error'

export interface UploadItem {
  id: string
  name: string
  status: UploadItemStatus
  previewUrl: string | null
  error: string | null
  /** Photo problems found by the pre-check (blurry, dark, ...). The parent can retake or "use anyway". */
  issues: QualityIssue[]
  /** True when the source PDF was too long and the first pages can be used instead. */
  canTruncate: boolean
  uploadId: string | null
  prepared: PreparedImage | null
  source: File | null
}

interface UseUploaderOptions {
  childId: string
  kind: UploadKind
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())
}

/**
 * Manages the files a parent adds: prepare in the browser (PDF → images, HEIC → JPEG, downscale, pre-check),
 * let them remove / retake / "use anyway", then upload everything and hand back the upload ids.
 */
export function useUploader({ childId, kind }: UseUploaderOptions) {
  const maxFiles = kind === 'report_page' ? MAX_REPORT_PAGES : MAX_SHEET_PAGES
  const [items, setItems] = useState<UploadItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const itemsRef = useRef<UploadItem[]>([])
  itemsRef.current = items

  // Release object URLs when the component goes away.
  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl))
    },
    [],
  )

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  }, [])

  const prepare = useCallback(
    async (placeholderId: string, file: File, truncatePdf: boolean) => {
      try {
        const images = await prepareFile(file, { kind, truncatePdf })
        const prepared: UploadItem[] = images.map((image) => {
          const hasIssues = image.precheck !== null && !image.precheck.ok
          return {
            id: newId(),
            name: image.file.name,
            status: hasIssues ? 'attention' : 'ready',
            previewUrl: URL.createObjectURL(image.file),
            error: null,
            issues: image.precheck?.issues ?? [],
            canTruncate: false,
            uploadId: null,
            prepared: image,
            source: null,
          }
        })
        const others = itemsRef.current.filter((item) => item.id !== placeholderId).length
        const room = Math.max(0, maxFiles - others)
        const accepted = prepared.slice(0, room)
        prepared.slice(accepted.length).forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl))
        if (accepted.length < prepared.length) {
          setNotice(
            `You can add up to ${maxFiles} ${kind === 'report_page' ? 'pages' : 'photos'}. Extra pages were left out.`,
          )
        }
        setItems((current) => current.flatMap((item) => (item.id === placeholderId ? accepted : [item])))
      } catch (error) {
        const known = error instanceof ImageProcessingError
        patch(placeholderId, {
          status: 'error',
          error: known ? error.message : 'We couldn’t read that file. Try a different one.',
          canTruncate: known && error.code === 'TOO_MANY_PAGES',
        })
      }
    },
    [kind, maxFiles, patch],
  )

  const addFiles = useCallback(
    (files: File[]) => {
      setNotice(null)
      const room = maxFiles - itemsRef.current.length
      if (room <= 0) {
        setNotice(`You can add up to ${maxFiles} ${kind === 'report_page' ? 'pages' : 'photos'}. Remove one to add another.`)
        return
      }
      const accepted = files.slice(0, room)
      if (accepted.length < files.length) {
        setNotice(`You can add up to ${maxFiles} ${kind === 'report_page' ? 'pages' : 'photos'}; the rest were left out.`)
      }
      const placeholders: UploadItem[] = accepted.map((file) => ({
        id: newId(),
        name: file.name,
        status: 'preparing',
        previewUrl: null,
        error: null,
        issues: [],
        canTruncate: false,
        uploadId: null,
        prepared: null,
        source: file,
      }))
      setItems((current) => [...current, ...placeholders])
      placeholders.forEach((placeholder, index) => {
        const file = accepted[index]
        if (file) void prepare(placeholder.id, file, false)
      })
    },
    [kind, maxFiles, prepare],
  )

  /** For a too-long PDF: convert just the first pages. */
  const useFirstPages = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((candidate) => candidate.id === id)
      if (!item?.source) return
      patch(id, { status: 'preparing', error: null, canTruncate: false })
      void prepare(id, item.source, true)
    },
    [patch, prepare],
  )

  const remove = useCallback((id: string) => {
    const removed = itemsRef.current.find((item) => item.id === id)
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  /** The parent accepts a photo the pre-check flagged. */
  const useAnyway = useCallback((id: string) => patch(id, { status: 'ready' }), [patch])

  const uploadable = items.filter((item) => item.status === 'ready' || (item.status === 'error' && item.prepared !== null))
  const blocked = items.some((item) => item.status === 'preparing' || item.status === 'attention' || item.status === 'uploading')
  const hasUploaded = items.some((item) => item.status === 'uploaded')

  /**
   * Uploads every ready image. Resolves with the upload ids of all uploaded images (including earlier ones),
   * or null if anything failed — failed images stay in the list so the parent can try again.
   */
  const uploadAll = useCallback(async (): Promise<string[] | null> => {
    const toUpload = itemsRef.current.filter(
      (item) => item.prepared !== null && (item.status === 'ready' || item.status === 'error'),
    )
    if (toUpload.length === 0) {
      const existing = itemsRef.current.map((item) => item.uploadId).filter((id): id is string => id !== null)
      return existing.length > 0 ? existing : null
    }

    setUploading(true)
    toUpload.forEach((item) => patch(item.id, { status: 'uploading', error: null }))
    try {
      const results = await uploadPrepared(
        { childId, kind, images: toUpload.map((item) => item.prepared as PreparedImage) },
        {
          onError: (index, error) => {
            const item = toUpload[index]
            if (item) patch(item.id, { status: 'error', error: uploadErrorMessage(error) })
          },
          onDone: (index, uploaded) => {
            const item = toUpload[index]
            if (item) patch(item.id, { status: 'uploaded', uploadId: uploaded.uploadId })
          },
        },
      )
      if (results.some((result) => result === null)) return null
      const ids = itemsRef.current.map((item) => item.uploadId)
      const fresh = results.map((result) => result?.uploadId ?? null)
      return [...ids, ...fresh].filter((id): id is string => id !== null)
    } catch (error) {
      toUpload.forEach((item) => patch(item.id, { status: 'error', error: uploadErrorMessage(error) }))
      return null
    } finally {
      setUploading(false)
    }
  }, [childId, kind, patch])

  return {
    items,
    notice,
    maxFiles,
    uploading,
    /** True while a file is still being prepared or a flagged photo awaits a decision. */
    blocked,
    canUpload: !blocked && uploadable.length > 0,
    hasUploaded,
    addFiles,
    remove,
    useAnyway,
    useFirstPages,
    uploadAll,
  }
}
