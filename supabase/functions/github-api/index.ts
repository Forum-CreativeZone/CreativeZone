import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || ""
const APP_ID = Deno.env.get("GITHUB_APP_ID") || ""
const PRIVATE_KEY = Deno.env.get("GITHUB_PRIVATE_KEY") || ""
const WEBHOOK_SECRET = Deno.env.get("GITHUB_WEBHOOK_SECRET") || ""

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-creativezone-github",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
}

type RepoRef = { owner: string; repo: string; url: string }
type Capabilities = Record<string, unknown>

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  })
}

function compact(value: unknown, max = 4000) {
  const valueText = String(value ?? "").replace(/\s+/g, " ").trim()
  return valueText.length > max ? valueText.slice(0, max - 1).trimEnd() + "…" : valueText
}

function parseRepo(value: unknown): RepoRef {
  const raw = String(value || "").trim()
  let url: URL
  try { url = new URL(raw) } catch { throw new Error("Informe uma URL válida de repositório GitHub.") }
  if (!/(^|\.)github\.com$/i.test(url.hostname)) throw new Error("O repositório precisa estar hospedado no GitHub.")
  const parts = url.pathname.split("/").filter(Boolean)
  if (parts.length < 2) throw new Error("URL de repositório GitHub incompleta.")
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/i, "")
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Repositório GitHub inválido.")
  return { owner, repo, url: `https://github.com/${owner}/${repo}` }
}

function concat(...arrays: Uint8Array[]) {
  const size = arrays.reduce((sum, item) => sum + item.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const item of arrays) { out.set(item, offset); offset += item.length }
  return out
}

function derLength(length: number) {
  if (length < 128) return new Uint8Array([length])
  const bytes: number[] = []
  let value = length
  while (value > 0) { bytes.unshift(value & 255); value >>>= 8 }
  return new Uint8Array([0x80 | bytes.length, ...bytes])
}

function der(tag: number, content: Uint8Array) {
  return concat(new Uint8Array([tag]), derLength(content.length), content)
}

function base64Bytes(value: string) {
  const binary = atob(value.replace(/\s+/g, ""))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function privateKeyDer(pem: string) {
  const clean = pem.trim()
  if (clean.includes("BEGIN PRIVATE KEY")) {
    return base64Bytes(clean.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, ""))
  }
  if (!clean.includes("BEGIN RSA PRIVATE KEY")) throw new Error("Formato da chave privada do GitHub App não reconhecido.")
  const pkcs1 = base64Bytes(clean.replace(/-----BEGIN RSA PRIVATE KEY-----|-----END RSA PRIVATE KEY-----/g, ""))
  const version = new Uint8Array([0x02, 0x01, 0x00])
  const rsaOid = new Uint8Array([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00])
  return der(0x30, concat(version, rsaOid, der(0x04, pkcs1)))
}

function b64url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value
  let binary = ""
  bytes.forEach((item) => { binary += String.fromCharCode(item) })
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

let appKeyPromise: Promise<CryptoKey> | null = null
function appPrivateKey() {
  if (!appKeyPromise) {
    appKeyPromise = crypto.subtle.importKey(
      "pkcs8",
      privateKeyDer(PRIVATE_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    )
  }
  return appKeyPromise
}

async function appJwt() {
  if (!APP_ID || !PRIVATE_KEY) throw new Error("GitHub App ainda não está configurado no servidor.")
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: APP_ID }))
  const input = `${header}.${payload}`
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await appPrivateKey(),
    new TextEncoder().encode(input),
  ))
  return `${input}.${b64url(signature)}`
}

async function appRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "CreativeZone-DevHub/1.0 (+https://forum.creativezone.pro/)",
      Authorization: `Bearer ${await appJwt()}`,
      ...(init.headers || {}),
    },
  })
  if (!response.ok) throw new Error(`github_app_http_${response.status}: ${compact(await response.text().catch(() => ""), 240)}`)
  return response.json()
}

const installationCache = new Map<number, { token: string; expires: number }>()

async function listInstallations() {
  const result = await appRequest("/app/installations?per_page=100")
  return Array.isArray(result) ? result : []
}

async function installationForOwner(owner: string) {
  const installs = await listInstallations()
  return installs.find((item: Record<string, unknown>) =>
    String((item.account as Record<string, unknown> | undefined)?.login || "").toLowerCase() === owner.toLowerCase()
  ) || null
}

async function installationToken(installationId: number) {
  const cached = installationCache.get(installationId)
  if (cached && cached.expires > Date.now() + 60_000) return cached.token
  const data = await appRequest(`/app/installations/${installationId}/access_tokens`, { method: "POST" })
  const token = String(data?.token || "")
  if (!token) throw new Error("Não foi possível gerar o token da instalação GitHub.")
  const expires = data?.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 50 * 60 * 1000
  installationCache.set(installationId, { token, expires })
  return token
}

async function githubRest(path: string, token = "", accept = "application/vnd.github+json") {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: accept,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "CreativeZone-DevHub/1.0 (+https://forum.creativezone.pro/)",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    const error = new Error(`github_http_${response.status}: ${compact(body, 240)}`)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }
  return response.json()
}

async function githubGraphql(query: string, variables: Record<string, unknown>, token: string) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "CreativeZone-DevHub/1.0 (+https://forum.creativezone.pro/)",
    },
    body: JSON.stringify({ query, variables }),
  })
  const data = await response.json()
  if (!response.ok || data?.errors?.length) throw new Error(compact(data?.errors?.[0]?.message || "Falha no GitHub GraphQL.", 300))
  return data?.data || {}
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get("authorization") || ""
  if (!authorization || !ANON_KEY) return null
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data } = await client.auth.getUser()
  return data?.user || null
}

async function devHubPlan(userId: string | null) {
  if (!userId) return { plan_id: "free", rank: 0, capabilities: {} as Capabilities, system_owner: false }
  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin.from("profiles").select("system_owner").eq("id", userId).maybeSingle(),
    admin.from("user_memberships").select("plan_id,status,permanent,ends_at").eq("user_id", userId).maybeSingle(),
  ])
  let planId = "free"
  const active = membership?.status === "active" &&
    (membership?.permanent || !membership?.ends_at || new Date(membership.ends_at).getTime() > Date.now())
  if (active && membership?.plan_id) planId = membership.plan_id
  const { data: plan } = await admin.from("membership_plans").select("id,rank,entitlements").eq("id", planId).maybeSingle()
  let capabilities = (plan?.entitlements?.github_devhub || {}) as Capabilities
  if (profile?.system_owner) {
    const { data: elite } = await admin.from("membership_plans").select("entitlements").eq("id", "elite").maybeSingle()
    capabilities = { ...(elite?.entitlements?.github_devhub || {}), repository_limit: -1 }
    return { plan_id: "owner", rank: 99, capabilities, system_owner: true }
  }
  return { plan_id: plan?.id || "free", rank: Number(plan?.rank || 0), capabilities, system_owner: false }
}

async function projectContext(projectId: string, userId: string | null) {
  const { data: project, error } = await admin
    .from("projects")
    .select("id,owner_id,title,slug,repo_url,visibility")
    .eq("id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!project) throw new Error("Projeto não encontrado.")

  let participant = false
  let manager = false
  if (userId) {
    const [{ data: profile }, { data: membership }] = await Promise.all([
      admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
      admin.from("project_members").select("status,role").eq("project_id", projectId).eq("user_id", userId).maybeSingle(),
    ])
    participant = project.owner_id === userId || membership?.status === "active"
    manager = project.owner_id === userId ||
      ["admin", "moderator"].includes(profile?.role) ||
      (membership?.status === "active" && membership?.role === "maintainer")
  }

  const canView = project.visibility === "public" || participant
  return { project, participant, manager, canView }
}

async function readme(owner: string, repo: string, token: string) {
  try {
    const data = await githubRest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, token)
    if (!data?.content) return ""
    const binary = atob(String(data.content).replace(/\s+/g, ""))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes).slice(0, 8000)
  } catch { return "" }
}

async function optionalRest(path: string, token: string) {
  try { return await githubRest(path, token) } catch { return null }
}

function publicRow(row: Record<string, unknown>, capabilities: Capabilities, allowPrivate = false) {
  const advanced = Boolean(capabilities.commits_recent || capabilities.issues || capabilities.pull_requests || capabilities.actions_status)
  if (row.is_private && !allowPrivate) {
    return {
      id: row.id,
      project_id: row.project_id,
      repo_owner: row.repo_owner,
      repo_name: row.repo_name,
      repo_url: row.repo_url,
      is_private: true,
      visibility: row.visibility,
      sync_status: row.sync_status,
      metadata: { private_repository: true },
    }
  }
  return {
    ...row,
    actions_summary: capabilities.actions_status ? row.actions_summary : {},
    issues_summary: capabilities.issues ? row.issues_summary : {},
    pull_requests_summary: capabilities.pull_requests ? row.pull_requests_summary : {},
    last_commit: capabilities.commits_recent ? row.last_commit : {},
    languages: capabilities.languages_detailed ? row.languages : {},
    metadata: advanced ? row.metadata : { scorecard: row.metadata && (row.metadata as Record<string, unknown>).scorecard_summary },
  }
}

async function syncProject(projectId: string, actorId: string | null, internal = false) {
  const context = await projectContext(projectId, actorId)
  if (!internal && !context.manager) throw new Error("Você não possui permissão para sincronizar este projeto.")
  if (!context.project.repo_url) throw new Error("Adicione um repositório GitHub ao projeto.")
  const ref = parseRepo(context.project.repo_url)
  const plan = await devHubPlan(context.project.owner_id)
  const caps = plan.capabilities
  if (!caps.repository_recognition) throw new Error("Seu plano não possui integração GitHub.")

  const installation = await installationForOwner(ref.owner).catch(() => null)
  const installationId = Number(installation?.id || 0) || null
  const token = installationId ? await installationToken(installationId) : ""

  let repoData: Record<string, unknown>
  try {
    repoData = await githubRest(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`, token)
  } catch (error) {
    if (!token) throw new Error("Repositório não encontrado ou privado. Instale o CreativeZone DevHub na conta proprietária do repositório.")
    throw error
  }

  const isPrivate = Boolean(repoData.private)
  if (isPrivate && !caps.private_repository) throw new Error("Repositórios privados são um recurso do plano ELITE.")

  const { data: currentRows } = await admin
    .from("project_repositories")
    .select("id,repo_owner,repo_name")
    .eq("project_id", projectId)
  const existing = (currentRows || []).find((item) =>
    item.repo_owner?.toLowerCase() === ref.owner.toLowerCase() &&
    item.repo_name?.toLowerCase() === ref.repo.toLowerCase()
  )
  const limit = Number(caps.repository_limit ?? 1)
  if (!existing && limit >= 0 && (currentRows || []).length >= limit) {
    throw new Error(`Seu plano permite ${limit} repositório(s) por projeto.`)
  }

  let graphqlRepo: Record<string, unknown> = {}
  if (token && (caps.languages_detailed || caps.release_history || caps.commits_recent)) {
    try {
      const graph = await githubGraphql(`
        query CreativeZoneRepo($owner:String!,$name:String!){
          repository(owner:$owner,name:$name){
            id nameWithOwner isPrivate visibility description url homepageUrl
            stargazerCount forkCount watchers{totalCount}
            issues(states:OPEN){totalCount}
            pullRequests(states:OPEN){totalCount}
            primaryLanguage{name color}
            languages(first:8,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}
            latestRelease{name tagName publishedAt url}
            releases(first:5,orderBy:{field:CREATED_AT,direction:DESC}){nodes{name tagName publishedAt url}}
            defaultBranchRef{name target{... on Commit{oid committedDate messageHeadline url}}}
          }
        }
      `, { owner: ref.owner, name: ref.repo }, token)
      graphqlRepo = graph?.repository || {}
    } catch {}
  }

  const readmeText = caps.readme_summary ? await readme(ref.owner, ref.repo, token) : ""
  const languages = caps.languages_detailed
    ? await optionalRest(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/languages`, token)
    : null
  const releases = caps.release_history
    ? await optionalRest(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/releases?per_page=5`, token)
    : null
  const issues = caps.issues
    ? await optionalRest(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/issues?state=open&sort=updated&per_page=6`, token)
    : null
  const pulls = caps.pull_requests
    ? await optionalRest(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls?state=open&sort=updated&direction=desc&per_page=6`, token)
    : null
  const actions = caps.actions_status && token
    ? await optionalRest(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/actions/runs?per_page=5`, token)
    : null

  let scorecard: Record<string, unknown> | null = null
  if (caps.project_health && !isPrivate) {
    try {
      const response = await fetch(`https://api.securityscorecards.dev/projects/github.com/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`)
      if (response.ok) scorecard = await response.json()
    } catch {}
  }

  const latestRelease = (graphqlRepo.latestRelease as Record<string, unknown> | undefined) ||
    (Array.isArray(releases) && releases[0] ? {
      name: releases[0].name,
      tagName: releases[0].tag_name,
      publishedAt: releases[0].published_at,
      url: releases[0].html_url,
    } : {})

  const gqlDefault = graphqlRepo.defaultBranchRef as Record<string, unknown> | undefined
  const lastCommit = (gqlDefault?.target as Record<string, unknown> | undefined) || {}

  const payload: Record<string, unknown> = {
    project_id: projectId,
    repository_provider: "github",
    repo_owner: ref.owner,
    repo_name: ref.repo,
    repo_url: ref.url,
    installation_id: installationId,
    github_repository_id: Number(repoData.id || 0) || null,
    node_id: repoData.node_id || graphqlRepo.id || null,
    is_private: isPrivate,
    visibility: String(repoData.visibility || graphqlRepo.visibility || (isPrivate ? "private" : "public")).toLowerCase(),
    description: repoData.description || graphqlRepo.description || null,
    homepage_url: repoData.homepage || graphqlRepo.homepageUrl || null,
    owner_avatar_url: (repoData.owner as Record<string, unknown> | undefined)?.avatar_url || null,
    default_branch: repoData.default_branch || gqlDefault?.name || "main",
    primary_language: repoData.language || (graphqlRepo.primaryLanguage as Record<string, unknown> | undefined)?.name || null,
    stargazers_count: Number(repoData.stargazers_count || graphqlRepo.stargazerCount || 0),
    forks_count: Number(repoData.forks_count || graphqlRepo.forkCount || 0),
    watchers_count: Number(repoData.subscribers_count || (graphqlRepo.watchers as Record<string, unknown> | undefined)?.totalCount || 0),
    open_issues_count: Number(repoData.open_issues_count || (graphqlRepo.issues as Record<string, unknown> | undefined)?.totalCount || 0),
    license_spdx: (repoData.license as Record<string, unknown> | undefined)?.spdx_id || null,
    topics: Array.isArray(repoData.topics) ? repoData.topics : [],
    pushed_at: repoData.pushed_at || null,
    github_created_at: repoData.created_at || null,
    github_updated_at: repoData.updated_at || null,
    latest_release: latestRelease || {},
    languages: languages || {},
    readme_excerpt: readmeText.slice(0, 8000) || null,
    last_commit: lastCommit || {},
    actions_summary: actions ? {
      total_count: actions.total_count || 0,
      runs: (actions.workflow_runs || []).slice(0, 5).map((run: Record<string, unknown>) => ({
        id: run.id, name: run.name, event: run.event, status: run.status, conclusion: run.conclusion,
        html_url: run.html_url, created_at: run.created_at, updated_at: run.updated_at,
      })),
    } : {},
    issues_summary: Array.isArray(issues) ? {
      total_open: Number((graphqlRepo.issues as Record<string, unknown> | undefined)?.totalCount || repoData.open_issues_count || 0),
      items: issues.filter((item: Record<string, unknown>) => !item.pull_request).slice(0, 5).map((item: Record<string, unknown>) => ({
        number: item.number, title: item.title, html_url: item.html_url, updated_at: item.updated_at,
      })),
    } : {},
    pull_requests_summary: Array.isArray(pulls) ? {
      total_open: Number((graphqlRepo.pullRequests as Record<string, unknown> | undefined)?.totalCount || pulls.length),
      items: pulls.slice(0, 5).map((item: Record<string, unknown>) => ({
        number: item.number, title: item.title, html_url: item.html_url, updated_at: item.updated_at,
      })),
    } : {},
    last_sync_at: new Date().toISOString(),
    sync_status: "ok",
    sync_error: null,
    metadata: {
      plan_id: plan.plan_id,
      releases: Array.isArray(releases) ? releases.slice(0, 5).map((item: Record<string, unknown>) => ({
        name: item.name, tag_name: item.tag_name, published_at: item.published_at, html_url: item.html_url,
      })) : [],
      graphql_languages: (graphqlRepo.languages as Record<string, unknown> | undefined)?.edges || [],
      scorecard_summary: scorecard ? { score: scorecard.score, date: scorecard.date, repo: scorecard.repo } : null,
    },
    updated_at: new Date().toISOString(),
  }

  let row
  if (existing?.id) {
    const { data, error } = await admin.from("project_repositories").update(payload).eq("id", existing.id).select("*").single()
    if (error) throw error
    row = data
  } else {
    const { data, error } = await admin.from("project_repositories").insert(payload).select("*").single()
    if (error) throw error
    row = data
  }

  if (installation) {
    await admin.from("github_installations").upsert({
      installation_id: installationId,
      account_login: String(installation.account?.login || ref.owner),
      account_id: Number(installation.account?.id || 0) || null,
      account_type: String(installation.account?.type || ""),
      account_avatar_url: String(installation.account?.avatar_url || ""),
      repository_selection: String(installation.repository_selection || ""),
      suspended_at: installation.suspended_at || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "installation_id" })
  }

  if (caps.scan_on_connect) {
    const task = fetch(`${SUPABASE_URL}/functions/v1/github-security-scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-creativezone-github": WEBHOOK_SECRET,
      },
      body: JSON.stringify({ action: "github_internal", project_id: projectId, trigger_type: "automatic", force: false }),
    }).catch(() => null)
    // @ts-ignore Supabase Edge Runtime global
    EdgeRuntime.waitUntil(task)
  }

  return { row, plan, installed: Boolean(installationId) }
}

async function repoCard(req: Request, projectId: string) {
  const user = await authenticatedUser(req)
  const context = await projectContext(projectId, user?.id || null)
  if (!context.canView) throw new Error("Você não possui acesso a este projeto.")
  const plan = await devHubPlan(context.project.owner_id)
  let { data: row } = await admin.from("project_repositories").select("*").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1).maybeSingle()

  if (!row && context.project.repo_url && context.manager) {
    row = (await syncProject(projectId, user?.id || null)).row
  }
  if (!row) return { repository: null, plan, can_manage: context.manager }

  const allowPrivate = Boolean(context.participant)
  return { repository: publicRow(row, plan.capabilities, allowPrivate), plan, can_manage: context.manager }
}

async function depsDev(req: Request, payload: Record<string, unknown>) {
  const user = await authenticatedUser(req)
  if (!user) throw new Error("Entre na sua conta para consultar inteligência de dependências.")
  const projectId = String(payload.project_id || "")
  const context = await projectContext(projectId, user.id)
  if (!context.canView) throw new Error("Projeto indisponível.")
  const plan = await devHubPlan(context.project.owner_id)
  if (!plan.capabilities.deps_dev) throw new Error("deps.dev completo está disponível nos planos PRO e ELITE.")

  const ecosystemMap: Record<string, string> = {
    npm: "NPM", pypi: "PYPI", go: "GO", "crates.io": "CARGO", maven: "MAVEN",
    nuget: "NUGET", rubygems: "RUBYGEMS",
  }
  const system = ecosystemMap[String(payload.ecosystem || "").toLowerCase()]
  const name = String(payload.package_name || "")
  const version = String(payload.version || "")
  if (!system || !name || !version) throw new Error("Informe ecossistema, pacote e versão.")
  const url = `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error("deps.dev não encontrou esta versão.")
  return { result: await response.json(), plan }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405)
  if (!SUPABASE_URL || !SERVICE_KEY) return reply({ error: "github_service_unavailable" }, 503)

  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return reply({ error: "invalid_json" }, 400) }
  const action = String(payload.action || "repo_card")
  const projectId = String(payload.project_id || "")

  try {
    if (action === "repo_card") {
      if (!projectId) return reply({ error: "project_id_required" }, 400)
      return reply({ ok: true, ...(await repoCard(req, projectId)) })
    }
    if (action === "sync_project") {
      const user = await authenticatedUser(req)
      if (!user) return reply({ error: "authentication_required" }, 401)
      if (!projectId) return reply({ error: "project_id_required" }, 400)
      const result = await syncProject(projectId, user.id, false)
      return reply({ ok: true, repository: publicRow(result.row, result.plan.capabilities, true), plan: result.plan })
    }
    if (action === "refresh_by_webhook") {
      if (!WEBHOOK_SECRET || req.headers.get("x-creativezone-github") !== WEBHOOK_SECRET) return reply({ error: "forbidden" }, 403)
      if (!projectId) return reply({ error: "project_id_required" }, 400)
      const result = await syncProject(projectId, null, true)
      return reply({ ok: true, repository_id: result.row?.id || null })
    }
    if (action === "dependency_intelligence") {
      return reply({ ok: true, ...(await depsDev(req, payload)) })
    }
    return reply({ error: "unsupported_action" }, 400)
  } catch (error) {
    console.error("github-api:", error)
    const message = error instanceof Error ? error.message : "Falha na integração GitHub."
    const status = /permissão|acesso|indisponível|plano/i.test(message) ? 403 : 400
    return reply({ error: message }, status)
  }
})