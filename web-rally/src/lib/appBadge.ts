interface BadgeNavigator extends Navigator {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

function getBadgeNavigator(): BadgeNavigator | null {
  if (typeof navigator === 'undefined') return null
  return navigator as BadgeNavigator
}

export function setAppBadge(count: number): void {
  const nav = getBadgeNavigator()
  if (!nav?.setAppBadge) return

  if (count <= 0) {
    nav.clearAppBadge?.().catch(() => {})
    return
  }

  nav.setAppBadge(count).catch(() => {})
}

export function clearAppBadge(): void {
  const nav = getBadgeNavigator()
  if (!nav) return
  nav.clearAppBadge?.().catch(() => {})
  nav.serviceWorker?.controller?.postMessage({ action: 'clearBadge' })
}
