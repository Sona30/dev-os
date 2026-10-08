import sharp from 'sharp'

// Cuts the child's handwritten answer out of the page photo so the parent can see exactly what we are unsure
// about ("Is this 12 or 17?"). Coordinates are fractions of the page (0-1). docs/specs/09 §4.1 step 8.

export interface BoundingBox {
  x: number
  y: number
  w: number
  h: number
}

const PADDING = 0.15 // 15% of the box on every side, so a little context is visible
const MIN_PIXELS = 24

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** The region to cut, in pixels, padded and kept inside the image. */
export function cropRegion(box: BoundingBox, imageWidth: number, imageHeight: number) {
  const left = clamp01(box.x - box.w * PADDING)
  const top = clamp01(box.y - box.h * PADDING)
  const right = clamp01(box.x + box.w * (1 + PADDING))
  const bottom = clamp01(box.y + box.h * (1 + PADDING))
  const x = Math.floor(left * imageWidth)
  const y = Math.floor(top * imageHeight)
  return {
    left: x,
    top: y,
    width: Math.max(MIN_PIXELS, Math.min(imageWidth - x, Math.ceil((right - left) * imageWidth))),
    height: Math.max(MIN_PIXELS, Math.min(imageHeight - y, Math.ceil((bottom - top) * imageHeight))),
  }
}

/**
 * When the model could not locate an answer, fall back to the horizontal strip where question N of M
 * would normally sit. The result is less precise, so callers cap the confidence they report for it.
 */
export function fallbackBox(position: number, total: number): BoundingBox {
  const rowHeight = 1 / Math.max(1, total)
  return { x: 0, y: (position - 1) * rowHeight, w: 1, h: Math.min(1, rowHeight * 1.2) }
}

/** Returns a JPEG of the region, or throws if the image cannot be read. */
export async function cropAnswer(image: Buffer, box: BoundingBox): Promise<Buffer> {
  const rotated = sharp(image).rotate()
  const { width, height } = await rotated.metadata()
  if (!width || !height) throw new Error('image has no dimensions')
  const region = cropRegion(box, width, height)
  return sharp(image).rotate().extract(region).jpeg({ quality: 85 }).toBuffer()
}
