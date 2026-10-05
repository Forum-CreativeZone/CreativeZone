import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const directory = resolve('supabase/migrations')
const names = (await readdir(directory))
  .filter((name) => name.endsWith('.sql'))
  .sort()

if (names.length < 24) {
  throw new Error(`Expected at least 24 migrations, found ${names.length}`)
}

const pattern = /^(\d{14})_([a-z0-9_]+)\.sql$/
const versions = new Set()

for (const name of names) {
  const match = name.match(pattern)
  if (!match) throw new Error(`Invalid migration filename: ${name}`)
  if (versions.has(match[1])) throw new Error(`Duplicate migration version: ${match[1]}`)
  versions.add(match[1])

  const sql = await readFile(resolve(directory, name), 'utf8')
  if (sql.trim().length < 20) throw new Error(`Migration is empty: ${name}`)
}

const required = [
  '20261004233011_secure_push_webhook.sql',
  '20261005013246_resend_email_delivery_pipeline.sql',
  '20261005013315_resend_email_queue_rpc.sql',
  '20261005035044_community_projects.sql',
  '20261005035114_forum_moderation_reports.sql',
  '20261005035146_forum_media_search_push_diagnostics.sql',
]

for (const name of required) {
  if (!names.includes(name)) throw new Error(`Required migration missing: ${name}`)
}

console.log(`Migration check passed: ${names.length} files, ${versions.size} unique versions.`)
