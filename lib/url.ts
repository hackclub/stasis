const ALLOWED_URL_SCHEMES = ["https:", "http:"]

export function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_URL_SCHEMES.includes(parsed.protocol)
  } catch {
    return false
  }
}

export function validateUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return isValidUrl(url) ? url : null
}
