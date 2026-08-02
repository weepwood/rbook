const PUBLIC_SUPABASE_IMAGE = /^https:\/\/cnrpcabxrurvhdzohsxz\.supabase\.co\/storage\/v1\/object\/public\//

function canUseImageCdn(source?: string | null) {
  if (!source || !PUBLIC_SUPABASE_IMAGE.test(source)) return false
  if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return false
  return true
}

export function optimizedImageUrl(source?: string | null, width = 480, quality = 74) {
  if (!source || !canUseImageCdn(source)) return source ?? undefined
  const params = new URLSearchParams({
    url: source,
    w: String(Math.max(1, Math.round(width))),
    q: String(Math.max(20, Math.min(100, Math.round(quality)))),
    fm: 'webp',
  })
  return `/.netlify/images?${params.toString()}`
}

export function optimizedImageSrcSet(source?: string | null, widths: number[] = [320, 480, 640], quality = 74) {
  if (!source || !canUseImageCdn(source)) return undefined
  return widths
    .map((width) => `${optimizedImageUrl(source, width, quality)} ${width}w`)
    .join(', ')
}
