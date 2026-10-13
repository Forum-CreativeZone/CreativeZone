import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || ""
const ORG = "Creatiive-Zone"

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
}

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  })
}

function compact(value: unknown, max = 1000) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

async function github(path: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CreativeZone-Community/1.0 (+https://forum.creativezone.pro/)",
    },
  })
  if (!response.ok) throw new Error(`github_http_${response.status}`)
  return response.json()
}

async function authUser(req: Request) {
  const authorization = req.headers.get("authorization") || ""
  if (!authorization || !ANON_KEY) return null
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data } = await client.auth.getUser()
  return data?.user || null
}

async function staffState(userId: string | null) {
  if (!userId) return { staff: false, system_owner: false, role: "" }
  const { data } = await admin
    .from("profiles")
    .select("role,system_owner")
    .eq("id", userId)
    .maybeSingle()
  const role = String(data?.role || "")
  const systemOwner = Boolean(data?.system_owner)
  return { staff: systemOwner || ["admin","moderator"].includes(role), system_owner: systemOwner, role }
}

async function organizationPayload(req: Request) {
  const user = await authUser(req)
  const staff = await staffState(user?.id || null)
  const [org, repos] = await Promise.all([
    github(`/orgs/${encodeURIComponent(ORG)}`),
    github(`/orgs/${encodeURIComponent(ORG)}/repos?type=public&sort=updated&per_page=12`),
  ])

  let request = null
  let staffRequests: Record<string, unknown>[] = []

  if (user?.id) {
    const { data } = await admin
      .from("github_org_membership_requests")
      .select("id,github_username,message,status,created_at,reviewed_at,updated_at")
      .eq("user_id", user.id)
      .eq("organization", ORG)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    request = data || null
  }

  if (staff.staff) {
    const { data } = await admin
      .from("github_org_membership_requests")
      .select("id,user_id,organization,github_username,message,status,created_at,reviewed_at,profile:profiles!github_org_membership_requests_user_id_fkey(id,username,display_name,avatar_url)")
      .eq("organization", ORG)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50)
    staffRequests = data || []
  }

  return {
    organization: {
      login: org.login || ORG,
      name: org.name || "CreativeZone",
      html_url: org.html_url || `https://github.com/${ORG}`,
      avatar_url: org.avatar_url || "",
      description: org.description || "Organização oficial da comunidade CreativeZone no GitHub.",
      public_repos: Number(org.public_repos || 0),
      followers: Number(org.followers || 0),
    },
    repositories: (Array.isArray(repos) ? repos : []).map((repo: Record<string, unknown>) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      html_url: repo.html_url,
      description: repo.description,
      language: repo.language,
      stargazers_count: repo.stargazers_count,
      forks_count: repo.forks_count,
      updated_at: repo.updated_at,
    })),
    request,
    is_staff: staff.staff,
    staff_requests: staffRequests,
  }
}

async function requestMembership(req: Request, payload: Record<string, unknown>) {
  const user = await authUser(req)
  if (!user) throw new Error("Entre na sua conta para solicitar participação na organização.")

  const githubUsername = String(payload.github_username || "").trim().replace(/^@/, "")
  const message = compact(payload.message || "", 1000)

  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUsername)) {
    throw new Error("Informe um usuário válido do GitHub.")
  }

  let githubUser: Record<string, unknown>
  try {
    githubUser = await github(`/users/${encodeURIComponent(githubUsername)}`)
  } catch {
    throw new Error("Não encontramos esse usuário no GitHub.")
  }

  if (String(githubUser.type || "").toLowerCase() !== "user") {
    throw new Error("Use uma conta pessoal do GitHub para solicitar participação.")
  }

  const { data: pending } = await admin
    .from("github_org_membership_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization", ORG)
    .eq("status", "pending")
    .maybeSingle()

  if (pending) throw new Error("Você já possui um pedido aguardando análise.")

  const { data: requestRow, error } = await admin
    .from("github_org_membership_requests")
    .insert({
      user_id: user.id,
      organization: ORG,
      github_username: githubUsername,
      message,
      status: "pending",
    })
    .select("id,github_username,message,status,created_at")
    .single()

  if (error) throw error

  const { data: owners } = await admin
    .from("profiles")
    .select("id")
    .eq("system_owner", true)

  if (owners?.length) {
    const { error: notifyError } = await admin.from("notifications").insert(
      owners.map((owner: Record<string, unknown>) => ({
        user_id: owner.id,
        actor_id: user.id,
        type: "github_org_join_request",
        data: {
          request_id: requestRow.id,
          organization: ORG,
          github_username: githubUsername,
          message,
          path: "/projetos",
        },
      })),
    )
    if (notifyError) throw notifyError
  }

  return {
    request: requestRow,
    github_user: {
      login: githubUser.login,
      avatar_url: githubUser.avatar_url,
      html_url: githubUser.html_url,
    },
  }
}

async function reviewMembership(req: Request, payload: Record<string, unknown>) {
  const user = await authUser(req)
  if (!user) throw new Error("Autenticação necessária.")

  const staff = await staffState(user.id)
  if (!staff.staff) throw new Error("Apenas a equipe CreativeZone pode revisar estes pedidos.")

  const requestId = String(payload.request_id || "")
  const status = String(payload.status || "")
  if (!requestId || !["invited","declined"].includes(status)) throw new Error("Revisão inválida.")

  const { data: row, error } = await admin
    .from("github_org_membership_requests")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("organization", ORG)
    .eq("status", "pending")
    .select("id,user_id,github_username,status")
    .maybeSingle()

  if (error) throw error
  if (!row) throw new Error("Pedido não encontrado ou já revisado.")

  await admin.from("notifications").insert({
    user_id: row.user_id,
    actor_id: user.id,
    type: "github_org_join_request_updated",
    data: {
      request_id: row.id,
      organization: ORG,
      github_username: row.github_username,
      status,
      path: "/projetos",
    },
  })

  return { request: row }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405)

  let payload: Record<string, unknown> = {}
  try { payload = await req.json() } catch {}
  const action = String(payload.action || "organization")

  try {
    if (action === "organization") return reply({ ok: true, ...(await organizationPayload(req)) })
    if (action === "request_membership") return reply({ ok: true, ...(await requestMembership(req, payload)) })
    if (action === "review_membership") return reply({ ok: true, ...(await reviewMembership(req, payload)) })
    return reply({ error: "unsupported_action" }, 400)
  } catch (error) {
    console.error("github-community:", error)
    const message = error instanceof Error ? error.message : "Falha ao acessar a comunidade GitHub."
    const status = /Entre|Autenticação/.test(message) ? 401 : /equipe|Apenas/.test(message) ? 403 : 400
    return reply({ error: message }, status)
  }
})
