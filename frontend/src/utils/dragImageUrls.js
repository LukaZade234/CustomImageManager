/**
 * Dragging images from web pages (Pinterest, etc.) provides URLs in text/uri-list or HTML,
 * not always File entries. Call on `drop` only — getData is restricted during dragover in some browsers.
 */

const HTTP_URL_RE = /^https?:\/\//i

function normalizeHttpUrl(s) {
  if (!s || typeof s !== 'string') return null
  const u = s.trim().split(/\s/)[0].split('#')[0]
  if (!HTTP_URL_RE.test(u)) return null
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.href
  } catch {
    return null
  }
}

/**
 * @param {DataTransfer} dt
 * @returns {string[]} unique image URLs
 */
export function extractImageUrlsFromDataTransfer(dt) {
  if (!dt) return []
  const out = new Set()

  try {
    const uriList = dt.getData('text/uri-list') || ''
    for (const line of uriList.split(/\r?\n/)) {
      const u = normalizeHttpUrl(line)
      if (u) out.add(u)
    }
  } catch {
    /* ignore */
  }

  try {
    const plain = dt.getData('text/plain')
    const u = normalizeHttpUrl(plain)
    if (u) out.add(u)
  } catch {
    /* ignore */
  }

  // Firefox / Windows: "URL\nTitle"
  try {
    const moz = dt.getData('text/x-moz-url')
    if (moz) {
      const firstLine = moz.split(/\r?\n/)[0]
      const u = normalizeHttpUrl(firstLine)
      if (u) out.add(u)
    }
  } catch {
    /* ignore */
  }

  try {
    const html = dt.getData('text/html')
    if (html && html.length > 0) {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      doc.querySelectorAll('img[src]').forEach((img) => {
        const u = normalizeHttpUrl(img.getAttribute('src'))
        if (u) out.add(u)
      })
      doc.querySelectorAll('source[src]').forEach((el) => {
        const u = normalizeHttpUrl(el.getAttribute('src'))
        if (u) out.add(u)
      })
      doc.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href')
        if (href && /\.(jpe?g|png|gif|webp|bmp|svg|avif)(\?|$)/i.test(href)) {
          const u = normalizeHttpUrl(href)
          if (u) out.add(u)
        }
      })
    }
  } catch {
    /* ignore */
  }

  return [...out]
}

/** Types present during dragover (cannot rely on getData until drop). */
export function dataTransferHasWebImageDrag(dt) {
  if (!dt) return false
  try {
    const types = dt.types
    if (!types) return false
    if (typeof types.contains === 'function') {
      if (types.contains('text/uri-list') || types.contains('text/html')) return true
    }
    if (typeof types.includes === 'function') {
      if (types.includes('text/uri-list') || types.includes('text/html')) return true
    }
    const arr = Array.from(types)
    return arr.includes('text/uri-list') || arr.includes('text/html')
  } catch {
    return false
  }
}
