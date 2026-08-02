import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildDisplacementMap, supportsBackdropRefraction } from '@/lib/liquidGlass'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildDisplacementMap', () => {
  it('returns null when the 2D context is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(buildDisplacementMap({ radius: 0.14, bezel: 0.1 })).toBeNull()
  })

  it('encodes a neutral centre and displaced edges', () => {
    const size = 32
    let captured: ImageData | null = null

    const ctx = {
      createImageData: (w: number, h: number) =>
        ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) as ImageData,
      putImageData: (image: ImageData) => {
        captured = image
      },
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,x')

    const url = buildDisplacementMap({ size, radius: 0.14, bezel: 0.12 })
    expect(url).toBe('data:image/png;base64,x')
    expect(captured).not.toBeNull()

    const data = captured!.data
    const at = (x: number, y: number) => {
      const i = (y * size + x) * 4
      return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! }
    }

    // Centre: no displacement, so both channels sit on the 128 midpoint.
    const centre = at(size / 2, size / 2)
    expect(centre.r).toBe(128)
    expect(centre.g).toBe(128)
    expect(centre.a).toBe(255)

    // Just inside the top edge: pushed along the vertical axis only.
    const top = at(size / 2, 0)
    expect(top.g).toBeLessThan(120)
    expect(Math.abs(top.r - 128)).toBeLessThan(4)

    // Just inside the left edge: pushed along the horizontal axis only.
    const left = at(0, size / 2)
    expect(left.r).toBeLessThan(120)
    expect(Math.abs(left.g - 128)).toBeLessThan(4)

    // The specular channel is lit towards the light, dark away from it.
    expect(top.b).toBeGreaterThan(at(size / 2, size - 1).b)
  })
})

describe('supportsBackdropRefraction', () => {
  // jsdom ships no CSS.supports at all, which is itself the "unsupported" case.
  function stubSupports(value: boolean | undefined) {
    Object.defineProperty(globalThis.CSS, 'supports', {
      value: value === undefined ? undefined : () => value,
      configurable: true,
    })
  }

  it('is false when the browser has no CSS.supports', () => {
    stubSupports(undefined)
    expect(supportsBackdropRefraction()).toBe(false)
  })

  it('is false when CSS.supports rejects an SVG backdrop-filter', () => {
    stubSupports(false)
    expect(supportsBackdropRefraction()).toBe(false)
  })

  it('is true when CSS.supports accepts it', () => {
    stubSupports(true)
    expect(supportsBackdropRefraction()).toBe(true)
    stubSupports(undefined)
  })
})
