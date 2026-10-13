import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const WEBHOOK_SECRET = Deno.env.get("GITHUB_WEBHOOK_SECRET") || ""

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

async function validSignature(raw: Uint8Array, provided: string) {
  if (!WEBHOOK_SECRET || !provided.startsWith("sha256=")) return false
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, raw))
  const expected = "sha256=" + [...signature].map((value) => value.toString(16).padStart(2, "0")).join("")
  if (expected.length !== provided.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  return diff === 0
}

function repoRef(payload: Record<string, unknown>) {
  const repository = payload.repository as Record<string, unknown> | undefined
  if (!repository) return null
  const owner = (repository.owner as Record<string, unknown> | undefined)?.login
  const name = repository.name
  const fullName = repository.full_name
  if (!owner || !name) return null
  return { owner: String(owner), name: String(name), fullName: String(fullName || `${owner}/${name}`) }
}

async function installationSnapshot(payload: Record<string, unknown>) {
  const installation = payload.installation as Record<string, unknown> | undefined
  if (!installation?.id) return
  const account = installation.account as Record<string, unknown> | undefined
  await admin.from("github_installations").upsert({
    installation_id: Number(installation.id),
    account_login: String(account?.login || "unknown"),
    account_id: Number(account?.id || 0) || null,
    account_type: String(account?.type || ""),
    account_avatar_url: String(account?.avatar_url || ""),
    repository_selection: String(installation.repository_selection || ""),
    suspended_at: installation.suspended_at || null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "installation_id" })
}

async function projectIdsForRepo(ref: { owner: string; name: string; fullName: string }) {
  const ids = new Set<string>()
  const { data: linked } = await admin
    .from("project_repositories")
    .select("project_id")
    .ilike("repo_owner", ref.owner)
    .ilike("repo_name", ref.name)
  for (const row of linked || []) if (row.project_id) ids.add(row.project_id)

  if (!ids.size) {
    const { data: projects } = await admin
      .from("projects")
      .select("id,repo_url")
      .not("repo_url", "is", null)
      .limit(200)
    const target = `github.com/${ref.owner}/${ref.name}`.toLowerCase()
    for (const project of projects || []) {
      if (String(project.repo_url || "").toLowerCase().replace(/\.git\/?$/, "").includes(target)) ids.add(project.id)
    }
  }
  return [...ids]
}

async function processProject(projectId: string, event: string) {
  const headers = { "Content-Type": "application/json", "x-creativezone-github": WEBHOOK_SECRET }
  const sync = fetch(`${SUPABASE_URL}/functions/v1/github-api`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "refresh_by_webhook", project_id: projectId }),
  }).catch((error) => console.error("github webhook sync:", error))

  const securityEvents = new Set(["push", "pull_request"])
  if (!securityEvents.has(event)) {
    await sync
    return
  }

  const scan = fetch(`${SUPABASE_URL}/functions/v1/github-security-scan`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "github_internal",
      project_id: projectId,
      trigger_type: event === "pull_request" ? "pull_request" : "push",
      force: true,
    }),
  }).catch((error) => console.error("github webhook scan:", error))

  await Promise.all([sync, scan])
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
  if (!SUPABASE_URL || !SERVICE_KEY || !WEBHOOK_SECRET) return json({ error: "webhook_unavailable" }, 503)

  const raw = new Uint8Array(await req.arrayBuffer())
  const signature = req.headers.get("x-hub-signature-256") || ""
  if (!await validSignature(raw, signature)) {
    console.warn("GitHub webhook rejeitado: assinatura inválida.")
    return json({ error: "invalid_signature" }, 401)
  }

  const event = req.headers.get("x-github-event") || "unknown"
  const delivery = req.headers.get("x-github-delivery") || null

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return json({ error: "invalid_json" }, 400)
  }

  await installationSnapshot(payload).catch((error) => console.error("installation snapshot:", error))

  const ref = repoRef(payload)
  const installationId = Number((payload.installation as Record<string, unknown> | undefined)?.id || 0) || null
  const action = String(payload.action || "")

  const projectIds = ref ? await projectIdsForRepo(ref) : []

  if (delivery) {
    const rows = projectIds.length ? projectIds : [null]
    for (const projectId of rows) {
      const { error } = await admin.from("project_github_events").insert({
        project_id: projectId,
        event_type: event,
        action: action || null,
        delivery_id: projectId ? `${delivery}:${projectId}` : delivery,
        installation_id: installationId,
        repository_full_name: ref?.fullName || null,
        payload,
        received_at: new Date().toISOString(),
      })
      if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
        console.error("event storage:", error)
      }
    }
  }

  const relevant = new Set([
    "push", "pull_request", "pull_request_review", "release",
    "workflow_run", "workflow_job", "repository", "issues",
    "dependabot_alert", "code_scanning_alert", "security_advisory",
  ])

  if (ref && projectIds.length && relevant.has(event)) {
    // @ts-ignore Supabase Edge Runtime global
    EdgeRuntime.waitUntil(Promise.all(projectIds.map((projectId) => processProject(projectId, event))))
  }

  console.log("GitHub webhook validado", {
    event,
    action,
    delivery,
    repository: ref?.fullName || null,
    projects: projectIds.length,
  })

  return json({ ok: true, event, projects: projectIds.length })
})