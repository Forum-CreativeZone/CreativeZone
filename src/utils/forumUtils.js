export const MAX_FORUM_ATTACHMENT_BYTES = 10 * 1024 * 1024

export const ALLOWED_FORUM_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
])

export function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function getPageCount(total, pageSize) {
  const safeTotal = Math.max(0, Number(total) || 0)
  const safeSize = Math.max(1, Number(pageSize) || 1)
  return Math.max(1, Math.ceil(safeTotal / safeSize))
}

export function isAllowedForumAttachment(file) {
  if (!file) return false
  return (
    Number(file.size || 0) <= MAX_FORUM_ATTACHMENT_BYTES &&
    ALLOWED_FORUM_ATTACHMENT_TYPES.has(String(file.type || ''))
  )
}
