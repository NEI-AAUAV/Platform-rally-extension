type HapticPattern = 'light' | 'medium' | 'success' | 'error'

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 8,
  medium: 20,
  success: [15, 30, 15],
  error: [20, 40, 20, 40, 20],
}

export function vibrate(pattern: HapticPattern = 'light'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return
  }

  navigator.vibrate(PATTERNS[pattern])
}
