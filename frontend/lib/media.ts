// Resolve a media reference to a loadable URL.
//
// Images stored by the backend (uploaded covers, step photos, demo seed covers)
// are root-relative paths like "/images/foo.jpg" and are served from the API
// origin, NOT the frontend origin — so they must be prefixed with the API base.
// Cover images can also be absolute URLs (e.g. scraped from a recipe site); those
// are returned unchanged. data:/blob: previews are likewise passed through.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export function mediaUrl(src?: string | null): string | undefined {
  if (!src) return undefined
  if (/^(https?:|data:|blob:)/i.test(src)) return src
  return `${API_BASE}${src.startsWith('/') ? '' : '/'}${src}`
}
