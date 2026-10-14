import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || ""
const APP_ID = Deno.env.get("GITHUB_APP_ID") || ""
const PRIVATE_KEY = Deno.env.get("GITHUB_PRIVATE_KEY") || ""

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
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Cache-Control": "no-store" } })
}

function compact(value: unknown, max = 5000) {
  const text = String(value ?? "").trim()
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

function concatBytes(...arrays: Uint8Array[]) {
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

function derWrap(tag: number, content: Uint8Array) {
  return concatBytes(new Uint8Array([tag]), derLength(content.length), content)
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
  if (!clean.includes("BEGIN RSA PRIVATE KEY")) throw new Error("Formato da chave privada do GitHub App inválido.")
  const pkcs1 = base64Bytes(clean.replace(/-----BEGIN RSA PRIVATE KEY-----|-----END RSA PRIVATE KEY-----/g, ""))
  const version = new Uint8Array([0x02, 0x01, 0x00])
  const rsaOid = new Uint8Array([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00])
  return derWrap(0x30, concatBytes(version, rsaOid, derWrap(0x04, pkcs1)))
}

function b64url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value
  let binary = ""
  bytes.forEach((item) => { binary += String.fromCharCode(item) })
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

let appKeyPromise: Promise<CryptoKey> | null = null
async function appJwt() {
  if (!APP_ID || !PRIVATE_KEY) throw new Error("GitHub App não configurado.")
  if (!appKeyPromise) {
    appKeyPromise = crypto.subtle.importKey(
      "pkcs8",
      privateKeyDer(PRIVATE_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    )
  }
  const now = Math.floor(Date.now() / 1000)
  const h = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const p = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: APP_ID }))
  const input = h + "." + p
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await appKeyPromise,
    new TextEncoder().encode(input),
  ))
  return input + "." + b64url(signature)
}

async function appRequest(path: string, init: RequestInit = {}) {
  const response = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CreativeZone-Project-Studio/1.0",
      Authorization: "Bearer " + await appJwt(),
      ...(init.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(compact(data?.message || ("GitHub HTTP " + response.status), 300))
  return data
}

const tokenCache = new Map<number, { token: string; expires: number }>()
async function installationToken(id: number) {
  const cached = tokenCache.get(id)
  if (cached && cached.expires > Date.now() + 60_000) return cached.token
  const data = await appRequest("/app/installations/" + id + "/access_tokens", { method: "POST" })
  const token = String(data?.token || "")
  if (!token) throw new Error("Não foi possível gerar token da instalação GitHub.")
  const expires = data?.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 50 * 60 * 1000
  tokenCache.set(id, { token, expires })
  return token
}

async function installationForOwner(owner: string) {
  const list = await appRequest("/app/installations?per_page=100")
  return (Array.isArray(list) ? list : []).find((item: Record<string, unknown>) =>
    String((item.account as Record<string, unknown> | undefined)?.login || "").toLowerCase() === owner.toLowerCase()
  ) || null
}

async function github(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CreativeZone-Project-Studio/1.0",
      Authorization: "Bearer " + token,
      ...(init.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(compact(data?.message || ("GitHub HTTP " + response.status), 400))
  return data
}

async function userFromRequest(req: Request) {
  const authorization = req.headers.get("authorization") || ""
  if (!authorization || !ANON_KEY) return null
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data } = await client.auth.getUser()
  return data?.user || null
}

function parseRepo(urlValue: unknown) {
  let url: URL
  try { url = new URL(String(urlValue || "")) } catch { throw new Error("URL GitHub inválida.") }
  const parts = url.pathname.split("/").filter(Boolean)
  if (!/(^|\.)github\.com$/i.test(url.hostname) || parts.length < 2) throw new Error("Repositório GitHub inválido.")
  return { owner: parts[0], repo: parts[1].replace(/\.git$/i, "") }
}

function safePath(value: unknown) {
  const path = String(value || "").trim().replace(/^\/+/, "")
  if (!path || path.includes("..") || path.includes("\\") || path.length > 500) throw new Error("Caminho inválido.")
  return path
}

function decodeText(content: string) {
  const binary = atob(String(content || "").replace(/\s+/g, ""))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

function encodeText(content: string) {
  const bytes = new TextEncoder().encode(content)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

async function planFor(ownerId: string) {
  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin.from("profiles").select("system_owner").eq("id", ownerId).maybeSingle(),
    admin.from("user_memberships").select("plan_id,status,permanent,ends_at").eq("user_id", ownerId).maybeSingle(),
  ])
  let planId = "free"
  const active = membership?.status === "active" &&
    (membership?.permanent || !membership?.ends_at || new Date(membership.ends_at).getTime() > Date.now())
  if (active && membership?.plan_id) planId = membership.plan_id
  const { data: plan } = await admin.from("membership_plans").select("id,rank,entitlements").eq("id", planId).maybeSingle()
  if (profile?.system_owner) {
    const { data: elite } = await admin.from("membership_plans").select("entitlements").eq("id", "elite").maybeSingle()
    return { plan_id: "owner", rank: 99, capabilities: elite?.entitlements?.github_devhub || {} }
  }
  return { plan_id: plan?.id || "free", rank: Number(plan?.rank || 0), capabilities: plan?.entitlements?.github_devhub || {} }
}

async function context(req: Request, projectId: string) {
  const user = await userFromRequest(req)
  if (!user) throw new Error("Entre na sua conta para usar o Project Studio.")
  const { data: project } = await admin
    .from("projects")
    .select("id,owner_id,title,repo_url")
    .eq("id", projectId)
    .maybeSingle()
  if (!project) throw new Error("Projeto não encontrado.")
  const [{ data: profile }, { data: member }] = await Promise.all([
    admin.from("profiles").select("role,system_owner").eq("id", user.id).maybeSingle(),
    admin.from("project_members").select("role,status").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
  ])
  const staff = Boolean(profile?.system_owner || ["admin", "moderator"].includes(String(profile?.role || "")))
  const memberRole = member?.status === "active" ? String(member?.role || "") : ""
  const projectRole = project.owner_id === user.id ? "owner" : staff ? "maintainer" : memberRole
  const participant = ["owner","maintainer","contributor"].includes(projectRole)
  if (!participant) throw new Error("Você não possui permissão para trabalhar neste projeto.")
  const canManage = projectRole === "owner" || projectRole === "maintainer"
  const plan = await planFor(project.owner_id)
  return { user, project, plan, projectRole, canManage, staff }
}

async function repositoryAccess(req: Request, payload: Record<string, unknown>, capability = "project_studio") {
  const projectId = String(payload.project_id || "")
  if (!projectId) throw new Error("Projeto não informado.")
  const ctx = await context(req, projectId)
  if (!ctx.plan.capabilities?.[capability]) {
    return { ...ctx, enabled: false, repository: null, ref: null, token: "" }
  }
  let { data: repository } = await admin
    .from("project_repositories")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const repoUrl = repository?.repo_url || ctx.project.repo_url
  if (!repoUrl) throw new Error("Adicione um repositório GitHub ao projeto.")
  const ref = parseRepo(repoUrl)
  let installationId = Number(repository?.installation_id || 0)
  if (!installationId) {
    const installation = await installationForOwner(ref.owner)
    installationId = Number(installation?.id || 0)
  }

  let token = ""
  let authMode = "github_app"
  if (installationId) {
    token = await installationToken(installationId)
  } else {
    authMode = "user_oauth"
    token = await userGithubToken(ctx.user.id)
    if (!token) {
      throw new Error("Conecte sua conta GitHub ao CreativeZone ou instale o CreativeZone DevHub na conta proprietária do repositório.")
    }
    const repoCheck = await github("/repos/" + encodeURIComponent(ref.owner) + "/" + encodeURIComponent(ref.repo), token)
    const permissions = repoCheck?.permissions || {}
    if (!(permissions.push || permissions.maintain || permissions.admin)) {
      throw new Error("Sua conta GitHub ainda não possui permissão de escrita neste repositório. Solicite participação/acesso pelo CreativeZone.")
    }
  }

  if (!repository) repository = { project_id: projectId, repo_url: repoUrl, default_branch: "main", installation_id: installationId || null }
  return { ...ctx, enabled: true, repository, ref, token, authMode }
}

async function status(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  return {
    enabled: access.enabled,
    plan: access.plan,
    role: access.projectRole,
    can_manage: access.canManage,
    auth_mode: access.authMode || null,
    repository: access.repository ? {
      repo_url: access.repository.repo_url,
      default_branch: access.repository.default_branch || "main",
      is_private: Boolean(access.repository.is_private),
      repo_owner: access.repository.repo_owner || access.ref?.owner || null,
      repo_name: access.repository.repo_name || access.ref?.repo || null,
    } : null,
  }
}

async function tree(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  if (!access.enabled || !access.ref) return status(req, payload)
  const branch = String(payload.branch || access.repository?.default_branch || "main")
  const data = await github(
    "/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/git/trees/" + encodeURIComponent(branch) + "?recursive=1",
    access.token,
  )
  const binary = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|7z|woff2?|ttf|otf|mp[34]|mov|avi|exe|dll|so|dylib)$/i
  const files = (Array.isArray(data?.tree) ? data.tree : [])
    .filter((item: Record<string, unknown>) =>
      item.type === "blob" &&
      Number(item.size || 0) <= 750000 &&
      !binary.test(String(item.path || "")) &&
      !String(item.path || "").includes("node_modules/")
    )
    .slice(0, 1200)
    .map((item: Record<string, unknown>) => ({ path: item.path, size: item.size, sha: item.sha }))
  return { enabled: true, files, branch, truncated: Boolean(data?.truncated), plan: access.plan }
}

async function readFile(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  if (!access.enabled || !access.ref) return status(req, payload)
  const path = safePath(payload.path)
  const branch = String(payload.branch || access.repository?.default_branch || "main")
  const data = await github(
    "/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(branch),
    access.token,
  )
  if (!data?.content || String(data.encoding || "").toLowerCase() !== "base64") throw new Error("Arquivo não editável.")
  const content = decodeText(data.content)
  if (content.length > 750000) throw new Error("Arquivo grande demais para o Project Studio.")
  return { enabled: true, path, branch, content, sha: data.sha, plan: access.plan }
}

async function ensureBranch(access: Awaited<ReturnType<typeof repositoryAccess>>, branch: string, base: string) {
  if (!access.ref) throw new Error("Repositório indisponível.")
  try {
    await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
      "/git/ref/heads/" + encodeURIComponent(branch), access.token)
    return
  } catch {}
  const baseRef = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/git/ref/heads/" + encodeURIComponent(base), access.token)
  await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) + "/git/refs", access.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "refs/heads/" + branch, sha: baseRef?.object?.sha }),
  })
}

async function commitFileWithAccess(
  access: Awaited<ReturnType<typeof repositoryAccess>>,
  path: string,
  content: string,
  message: string,
  requestedBranch?: string,
) {
  if (!access.ref) throw new Error("Repositório indisponível.")
  if (content.length > 750000) throw new Error("Arquivo grande demais para commit.")
  const base = String(access.repository?.default_branch || "main")
  const branch = String(requestedBranch || ("creativezone/" + String(access.user.id).slice(0,8) + "/" + Date.now()))
    .replace(/[^A-Za-z0-9._/-]/g, "-").slice(0,150)
  await ensureBranch(access, branch, base)
  let currentSha: string | null = null
  try {
    const current = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
      "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(branch), access.token)
    currentSha = current?.sha || null
  } catch {}
  const body: Record<string, unknown> = {
    message: compact(message || ("Update " + path + " via CreativeZone Project Studio"), 200),
    content: encodeText(content),
    branch,
  }
  if (currentSha) body.sha = currentSha
  const result = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/contents/" + path.split("/").map(encodeURIComponent).join("/"), access.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { branch, base_branch: base, commit: result?.commit || {}, file: result?.content || {} }
}

async function commitFile(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload, "forum_commits")
  if (!access.enabled) return status(req, payload)
  const path = safePath(payload.path)
  return { enabled: true, ...(await commitFileWithAccess(access, path, String(payload.content ?? ""), String(payload.message || ""), payload.branch ? String(payload.branch) : undefined)), plan: access.plan }
}

async function createPullRequest(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload, "branch_pr_workflow")
  if (!access.enabled || !access.ref) return status(req, payload)
  const head = String(payload.branch || "")
  if (!head) throw new Error("Branch não informada.")
  const base = String(payload.base_branch || access.repository?.default_branch || "main")
  const pr = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) + "/pulls", access.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: compact(payload.title || "CreativeZone Project Studio changes", 200),
      body: compact(payload.body || "Alterações criadas diretamente pelo CreativeZone Project Studio.", 5000),
      head,
      base,
    }),
  })
  return { enabled: true, pull_request: { number: pr.number, title: pr.title, html_url: pr.html_url, state: pr.state }, plan: access.plan }
}

async function ciCockpit(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload, "ci_cockpit")
  if (!access.enabled || !access.ref) return status(req, payload)
  const branch = String(payload.branch || access.repository?.default_branch || "main")
  const data = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/actions/runs?branch=" + encodeURIComponent(branch) + "&per_page=10", access.token)
  return {
    enabled: true,
    branch,
    runs: (data.workflow_runs || []).map((run: Record<string, unknown>) => ({
      id: run.id, name: run.name, event: run.event, status: run.status, conclusion: run.conclusion,
      html_url: run.html_url, head_sha: run.head_sha, created_at: run.created_at,
    })),
    plan: access.plan,
  }
}


async function logAction(access: Awaited<ReturnType<typeof repositoryAccess>>, actionType: string, payload: Record<string, unknown>, statusValue = "completed", result: Record<string, unknown> = {}, errorText: string | null = null) {
  const projectId = String(access.project?.id || "")
  let repositoryId: string | null = null
  if (projectId) {
    const { data } = await admin.from("github_devhub_repositories").select("id").eq("project_id", projectId).maybeSingle()
    repositoryId = data?.id || null
  }
  await admin.from("github_devhub_actions").insert({
    user_id: access.user.id,
    repository_id: repositoryId,
    action_type: actionType,
    payload,
    status: statusValue,
    result,
    error: errorText,
    completed_at: statusValue === "completed" || statusValue === "failed" ? new Date().toISOString() : null,
  })
}

async function userGithubToken(userId: string) {
  const { data, error } = await admin.rpc("get_github_user_credential", { p_user_id: userId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row?.access_token ? String(row.access_token) : ""
}

async function listBranches(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  if (!access.enabled || !access.ref) return status(req, payload)
  const data = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) + "/branches?per_page=100", access.token)
  return {
    enabled: true,
    branches: (Array.isArray(data) ? data : []).map((item: Record<string, unknown>) => ({
      name: item.name,
      protected: Boolean(item.protected),
      sha: (item.commit as Record<string, unknown> | undefined)?.sha || null,
    })),
    default_branch: access.repository?.default_branch || "main",
    role: access.projectRole,
    can_manage: access.canManage,
    plan: access.plan,
  }
}

async function createBranch(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload, "branch_pr_workflow")
  if (!access.enabled || !access.ref) return status(req, payload)
  const base = String(payload.base_branch || access.repository?.default_branch || "main")
  const raw = String(payload.branch || "").trim()
  if (!raw) throw new Error("Nome da branch não informado.")
  const branch = raw.replace(/[^A-Za-z0-9._/-]/g, "-").replace(/^[-/]+|[-/]+$/g, "").slice(0,150)
  if (!branch) throw new Error("Nome da branch inválido.")
  await ensureBranch(access, branch, base)
  await logAction(access, "branch", { branch, base }, "completed", { branch })
  return { enabled: true, branch, base_branch: base, plan: access.plan }
}

async function listCommits(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  if (!access.enabled || !access.ref) return status(req, payload)
  const branch = String(payload.branch || access.repository?.default_branch || "main")
  const data = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/commits?sha=" + encodeURIComponent(branch) + "&per_page=40", access.token)
  return {
    enabled: true,
    branch,
    commits: (Array.isArray(data) ? data : []).map((item: any) => ({
      sha: item.sha,
      message: item.commit?.message || "",
      author: item.commit?.author?.name || item.author?.login || "GitHub",
      date: item.commit?.author?.date || null,
      avatar_url: item.author?.avatar_url || null,
    })),
    plan: access.plan,
  }
}

async function uploadFile(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload, "forum_commits")
  if (!access.enabled || !access.ref) return status(req, payload)
  const path = safePath(payload.path)
  const content = String(payload.content_base64 || "").replace(/\s+/g, "")
  if (!content) throw new Error("Arquivo vazio ou inválido.")
  if (content.length > 8_000_000) throw new Error("Upload limitado a aproximadamente 6 MB por arquivo.")
  const base = String(access.repository?.default_branch || "main")
  const branch = String(payload.branch || ("creativezone/" + String(access.user.id).slice(0,8) + "/" + Date.now()))
    .replace(/[^A-Za-z0-9._/-]/g, "-").slice(0,150)
  await ensureBranch(access, branch, base)
  let currentSha: string | null = null
  try {
    const current = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
      "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(branch), access.token)
    currentSha = String(current?.sha || "") || null
  } catch {}
  const body: Record<string, unknown> = {
    message: compact(payload.message || ("Upload " + path + " via CreativeZone"), 200),
    content,
    branch,
  }
  if (currentSha) body.sha = currentSha
  const result = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/contents/" + path.split("/").map(encodeURIComponent).join("/"), access.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  await logAction(access, "upload_file", { path, branch }, "completed", { sha: result?.commit?.sha || null })
  return { enabled: true, branch, base_branch: base, commit: result?.commit || {}, file: result?.content || {}, plan: access.plan }
}

async function deleteFile(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload, "forum_commits")
  if (!access.enabled || !access.ref) return status(req, payload)
  const path = safePath(payload.path)
  const branch = String(payload.branch || access.repository?.default_branch || "main")
  const current = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(branch), access.token)
  if (!current?.sha) throw new Error("Arquivo não encontrado.")
  const result = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/contents/" + path.split("/").map(encodeURIComponent).join("/"), access.token, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: compact(payload.message || ("Delete " + path + " via CreativeZone"), 200),
      sha: current.sha,
      branch,
    }),
  })
  await logAction(access, "delete_file", { path, branch }, "completed", { sha: result?.commit?.sha || null })
  return { enabled: true, branch, commit: result?.commit || {}, plan: access.plan }
}

async function listIssues(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  if (!access.enabled || !access.ref) return status(req, payload)
  const stateValue = ["open","closed","all"].includes(String(payload.state || "")) ? String(payload.state) : "open"
  const data = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/issues?state=" + encodeURIComponent(stateValue) + "&per_page=50", access.token)
  return {
    enabled: true,
    issues: (Array.isArray(data) ? data : []).filter((item: any) => !item.pull_request).map((item: any) => ({
      number: item.number,
      title: item.title,
      body: item.body || "",
      state: item.state,
      labels: (item.labels || []).map((label: any) => typeof label === "string" ? label : label.name),
      user: item.user?.login || null,
      created_at: item.created_at,
      updated_at: item.updated_at,
      comments: item.comments || 0,
    })),
    role: access.projectRole,
    plan: access.plan,
  }
}

async function createIssue(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  if (!access.enabled || !access.ref) return status(req, payload)
  const userToken = await userGithubToken(access.user.id)
  if (!userToken) throw new Error("Conecte sua conta GitHub ao CreativeZone para criar Issues.")
  const issue = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) + "/issues", userToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: compact(payload.title || "", 250),
      body: compact(payload.body || "", 60000),
      labels: Array.isArray(payload.labels) ? payload.labels : undefined,
    }),
  })
  await logAction(access, "issue", { number: issue.number, title: issue.title }, "completed", { number: issue.number })
  return { enabled: true, issue: { number: issue.number, title: issue.title, body: issue.body || "", state: issue.state }, plan: access.plan }
}


async function updateIssue(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  if (!access.enabled || !access.ref) return status(req, payload)
  const number = Number(payload.number || 0)
  if (!number) throw new Error("Issue inválida.")
  const userToken = await userGithubToken(access.user.id)
  if (!userToken) throw new Error("Conecte sua conta GitHub ao CreativeZone para alterar Issues.")
  const body: Record<string, unknown> = {}
  if (payload.title !== undefined) body.title = compact(payload.title,250)
  if (payload.body !== undefined) body.body = compact(payload.body,60000)
  if (["open","closed"].includes(String(payload.state || ""))) body.state = String(payload.state)
  const issue = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) + "/issues/" + number, userToken, {
    method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
  })
  await logAction(access,"issue",{number,state:issue.state},"completed",{number:issue.number,state:issue.state})
  return { enabled:true, issue:{number:issue.number,title:issue.title,body:issue.body||"",state:issue.state}, plan:access.plan }
}

async function issueComments(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req,payload)
  if(!access.enabled || !access.ref) return status(req,payload)
  const number=Number(payload.number||0)
  if(!number) throw new Error("Issue inválida.")
  const data=await github("/repos/"+encodeURIComponent(access.ref.owner)+"/"+encodeURIComponent(access.ref.repo)+"/issues/"+number+"/comments?per_page=100",access.token)
  return {enabled:true,comments:(Array.isArray(data)?data:[]).map((item:any)=>({
    id:item.id,body:item.body||"",user:item.user?.login||"GitHub",avatar_url:item.user?.avatar_url||null,created_at:item.created_at,updated_at:item.updated_at
  })),plan:access.plan}
}

async function addIssueComment(req: Request, payload: Record<string, unknown>) {
  const access=await repositoryAccess(req,payload)
  if(!access.enabled || !access.ref) return status(req,payload)
  const number=Number(payload.number||0)
  const body=String(payload.body||"").trim()
  if(!number || !body) throw new Error("Comentário inválido.")
  const userToken=await userGithubToken(access.user.id)
  if(!userToken) throw new Error("Conecte sua conta GitHub ao CreativeZone para comentar em Issues.")
  const comment=await github("/repos/"+encodeURIComponent(access.ref.owner)+"/"+encodeURIComponent(access.ref.repo)+"/issues/"+number+"/comments",userToken,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:compact(body,60000)})
  })
  await logAction(access,"issue_comment",{number},"completed",{comment_id:comment.id})
  return {enabled:true,comment:{id:comment.id,body:comment.body||"",user:comment.user?.login||null,created_at:comment.created_at},plan:access.plan}
}

async function listPullRequests(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  if (!access.enabled || !access.ref) return status(req, payload)
  const stateValue = ["open","closed","all"].includes(String(payload.state || "")) ? String(payload.state) : "open"
  const data = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/pulls?state=" + encodeURIComponent(stateValue) + "&per_page=50", access.token)
  return {
    enabled: true,
    pull_requests: (Array.isArray(data) ? data : []).map((item: any) => ({
      number: item.number,
      title: item.title,
      body: item.body || "",
      state: item.state,
      draft: Boolean(item.draft),
      head: item.head?.ref || null,
      base: item.base?.ref || null,
      user: item.user?.login || null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
    role: access.projectRole,
    can_manage: access.canManage,
    plan: access.plan,
  }
}


async function reviewPullRequest(req: Request, payload: Record<string, unknown>) {
  const access=await repositoryAccess(req,payload,"branch_pr_workflow")
  if(!access.enabled || !access.ref) return status(req,payload)
  const number=Number(payload.number||0)
  const event=String(payload.event||"COMMENT").toUpperCase()
  if(!number || !["APPROVE","REQUEST_CHANGES","COMMENT"].includes(event)) throw new Error("Review inválida.")
  const body=String(payload.body||"").trim()
  if((event==="REQUEST_CHANGES" || event==="COMMENT") && !body) throw new Error("Escreva um comentário para esta review.")
  const review=await github("/repos/"+encodeURIComponent(access.ref.owner)+"/"+encodeURIComponent(access.ref.repo)+"/pulls/"+number+"/reviews",access.token,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,body:compact(body,60000)})
  })
  await logAction(access,"review",{number,event},"completed",{review_id:review.id,state:review.state})
  return {enabled:true,review:{id:review.id,state:review.state,body:review.body||"",user:review.user?.login||null},plan:access.plan}
}

async function pullRequestReviews(req: Request, payload: Record<string, unknown>) {
  const access=await repositoryAccess(req,payload)
  if(!access.enabled || !access.ref) return status(req,payload)
  const number=Number(payload.number||0)
  if(!number) throw new Error("Pull Request inválida.")
  const data=await github("/repos/"+encodeURIComponent(access.ref.owner)+"/"+encodeURIComponent(access.ref.repo)+"/pulls/"+number+"/reviews?per_page=100",access.token)
  return {enabled:true,reviews:(Array.isArray(data)?data:[]).map((item:any)=>({
    id:item.id,state:item.state,body:item.body||"",user:item.user?.login||"GitHub",submitted_at:item.submitted_at
  })),plan:access.plan}
}

async function repositorySettings(req: Request, payload: Record<string, unknown>) {
  const access=await repositoryAccess(req,payload)
  if(!access.enabled || !access.ref) return status(req,payload)
  const repo=await github("/repos/"+encodeURIComponent(access.ref.owner)+"/"+encodeURIComponent(access.ref.repo),access.token)
  return {enabled:true,settings:{
    name:repo.name,full_name:repo.full_name,description:repo.description||"",homepage:repo.homepage||"",
    private:Boolean(repo.private),visibility:repo.visibility,default_branch:repo.default_branch||"main",
    has_issues:Boolean(repo.has_issues),has_projects:Boolean(repo.has_projects),has_wiki:Boolean(repo.has_wiki),
    archived:Boolean(repo.archived)
  },can_manage:access.canManage,role:access.projectRole,plan:access.plan}
}

async function updateRepositorySettings(req: Request, payload: Record<string, unknown>) {
  const access=await repositoryAccess(req,payload)
  if(!access.enabled || !access.ref) return status(req,payload)
  if(!access.canManage) throw new Error("Apenas proprietário ou mantenedor pode alterar configurações do repositório.")
  const userToken=await userGithubToken(access.user.id)
  if(!userToken) throw new Error("Conecte uma conta GitHub administradora do repositório para alterar configurações.")
  const body:Record<string,unknown>={}
  if(payload.description!==undefined) body.description=compact(payload.description,350)
  if(payload.homepage!==undefined) body.homepage=String(payload.homepage||"").trim()
  if(payload.has_issues!==undefined) body.has_issues=Boolean(payload.has_issues)
  if(payload.has_projects!==undefined) body.has_projects=Boolean(payload.has_projects)
  if(payload.has_wiki!==undefined) body.has_wiki=Boolean(payload.has_wiki)
  const repo=await github("/repos/"+encodeURIComponent(access.ref.owner)+"/"+encodeURIComponent(access.ref.repo),userToken,{
    method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
  })
  await admin.from("project_repositories").update({description:repo.description||null,homepage_url:repo.homepage||null,updated_at:new Date().toISOString()}).eq("project_id",access.project.id)
  await logAction(access,"update_repository",body,"completed",{full_name:repo.full_name})
  return {enabled:true,settings:{description:repo.description||"",homepage:repo.homepage||"",has_issues:Boolean(repo.has_issues),has_projects:Boolean(repo.has_projects),has_wiki:Boolean(repo.has_wiki)},plan:access.plan}
}

async function mergePullRequest(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload, "branch_pr_workflow")
  if (!access.enabled || !access.ref) return status(req, payload)
  if (!access.canManage) throw new Error("Apenas proprietário ou mantenedor pode fazer merge.")
  const number = Number(payload.number || 0)
  if (!number) throw new Error("Pull Request inválida.")
  const result = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/pulls/" + number + "/merge", access.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merge_method: String(payload.merge_method || "squash") }),
  })
  await logAction(access, "merge_pull_request", { number }, "completed", { merged: Boolean(result?.merged), sha: result?.sha || null })
  return { enabled: true, merged: Boolean(result?.merged), sha: result?.sha || null, message: result?.message || "", plan: access.plan }
}

async function terminal(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  if (!access.enabled || !access.ref) return status(req, payload)
  const command = String(payload.command || "").trim()
  const branch = String(payload.branch || access.repository?.default_branch || "main")
  if (!command) return { enabled: true, output: "", branch, plan: access.plan }
  if (command === "help") {
    return { enabled: true, branch, output: ["Comandos Git seguros do CreativeZone:","git status","git branch","git log","git pull","git diff","git checkout -b <branch>","git switch -c <branch>","pwd","ls"].join("\n"), plan: access.plan }
  }
  if (command === "pwd") return { enabled: true, branch, output: "/" + access.ref.owner + "/" + access.ref.repo, plan: access.plan }
  if (command === "git status") {
    const ref = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) + "/git/ref/heads/" + encodeURIComponent(branch), access.token)
    return { enabled: true, branch, output: "On branch " + branch + "\nHEAD " + String(ref?.object?.sha || "").slice(0,12) + "\nworking tree clean (GitHub-backed workspace)", plan: access.plan }
  }
  if (command === "git branch") {
    const result = await listBranches(req, { ...payload, branch })
    return { enabled: true, branch, output: (result.branches || []).map((item: any) => (item.name === branch ? "* " : "  ") + item.name).join("\n"), plan: access.plan }
  }
  if (command === "git log") {
    const result = await listCommits(req, { ...payload, branch })
    return { enabled: true, branch, output: (result.commits || []).slice(0,20).map((item: any) => item.sha.slice(0,7) + " " + item.message.split("\n")[0] + " — " + item.author).join("\n"), plan: access.plan }
  }
  if (command === "git pull") {
    const ref = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) + "/git/ref/heads/" + encodeURIComponent(branch), access.token)
    return { enabled: true, branch, output: "Already synchronized with GitHub.\nHEAD " + String(ref?.object?.sha || "").slice(0,12), plan: access.plan }
  }
  if (command === "ls") {
    const result = await tree(req, { ...payload, branch })
    const top = Array.from(new Set((result.files || []).map((item: any) => String(item.path).split("/")[0]))).slice(0,100)
    return { enabled: true, branch, output: top.join("\n"), plan: access.plan }
  }
  const createMatch = command.match(/^git\s+(?:checkout\s+-b|switch\s+-c)\s+(.+)$/)
  if (createMatch) {
    const result = await createBranch(req, { ...payload, branch: createMatch[1].trim(), base_branch: branch })
    return { enabled: true, branch: result.branch, output: "Switched to a new branch '" + result.branch + "'", plan: access.plan }
  }
  if (command === "git diff") {
    if (branch === String(access.repository?.default_branch || "main")) {
      return { enabled: true, branch, output: "Branch padrão selecionada. Escolha uma branch de trabalho para comparar.", plan: access.plan }
    }
    const base = String(access.repository?.default_branch || "main")
    const compare = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) + "/compare/" + encodeURIComponent(base) + "..." + encodeURIComponent(branch), access.token)
    const lines = (compare.files || []).map((file: any) => file.status + " " + file.filename + " (+" + file.additions + " -" + file.deletions + ")")
    return { enabled: true, branch, output: lines.length ? lines.join("\n") : "No differences.", plan: access.plan }
  }
  throw new Error("Comando não permitido neste terminal seguro. Digite help.")
}

async function fixes(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload, "auto_fix")
  if (!access.enabled) return status(req, payload)
  const projectId = String(payload.project_id || "")
  const { data } = await admin.from("github_vulnerabilities")
    .select("id,audit_id,osv_id,ecosystem,package_name,version,severity,summary,fixed_versions")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100)
  return { enabled: true, fixes: (data || []).filter((item) => Array.isArray(item.fixed_versions) && item.fixed_versions.length), plan: access.plan }
}

async function autoFix(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload, "auto_fix")
  if (!access.enabled || !access.ref) return status(req, payload)
  const projectId = String(payload.project_id || "")
  const vulnerabilityId = String(payload.vulnerability_id || "")
  const { data: vuln } = await admin.from("github_vulnerabilities").select("*")
    .eq("id", vulnerabilityId).eq("project_id", projectId).maybeSingle()
  if (!vuln) throw new Error("Vulnerabilidade não encontrada.")
  const fixed = Array.isArray(vuln.fixed_versions) ? String(vuln.fixed_versions[0] || "") : ""
  if (!fixed) throw new Error("OSV não informou versão corrigida.")

  const { data: dep } = await admin.from("github_dependencies").select("source")
    .eq("audit_id", vuln.audit_id).eq("ecosystem", vuln.ecosystem)
    .eq("package_name", vuln.package_name).eq("version", vuln.version).limit(1).maybeSingle()
  const path = safePath(dep?.source)
  const base = String(access.repository?.default_branch || "main")
  const file = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) +
    "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(base), access.token)
  if (!file?.content) throw new Error("Manifest não pôde ser lido.")
  const original = decodeText(file.content)
  let updated = original

  if (path.endsWith("package.json")) {
    const parsed = JSON.parse(original)
    let changed = false
    for (const group of ["dependencies","devDependencies","peerDependencies","optionalDependencies"]) {
      const current = parsed?.[group]?.[vuln.package_name]
      if (!current) continue
      const prefix = String(current).startsWith("^") ? "^" : String(current).startsWith("~") ? "~" : ""
      parsed[group][vuln.package_name] = prefix + fixed
      changed = true
    }
    if (!changed) throw new Error("Dependência não encontrada como dependência direta no package.json.")
    updated = JSON.stringify(parsed, null, 2) + "\n"
  } else if (/requirements[^/]*\.txt$/i.test(path)) {
    const lines = original.split(/\r?\n/)
    let changed = false
    updated = lines.map((line) => {
      const match = line.match(/^\s*([^#=<>!~\s]+)\s*==\s*([^\s;#]+)/)
      if (!match || match[1].toLowerCase() !== String(vuln.package_name).toLowerCase()) return line
      changed = true
      return line.replace(match[2], fixed)
    }).join("\n")
    if (!changed) throw new Error("Dependência não possui versão exata atualizável no requirements.")
  } else {
    throw new Error("AutoFix assistido suporta package.json e requirements*.txt nesta versão.")
  }

  const branch = ("creativezone/security/" + String(vuln.osv_id).replace(/[^A-Za-z0-9._-]/g, "-") + "-" + Date.now()).slice(0,150)
  const commit = await commitFileWithAccess(access, path, updated, "security: update " + vuln.package_name + " to " + fixed, branch)
  const pr = await github("/repos/" + encodeURIComponent(access.ref.owner) + "/" + encodeURIComponent(access.ref.repo) + "/pulls", access.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Security: " + vuln.package_name + " → " + fixed,
      body: "CreativeZone AutoFix assistido para " + vuln.osv_id + ". Atualiza " + vuln.package_name + " de " + vuln.version + " para " + fixed + ". Revise CI, testes e lockfiles antes do merge.",
      head: commit.branch,
      base: commit.base_branch,
    }),
  })
  return { enabled: true, branch: commit.branch, pull_request: { number: pr.number, html_url: pr.html_url, title: pr.title }, plan: access.plan }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405)
  if (!SUPABASE_URL || !SERVICE_KEY) return reply({ error: "studio_unavailable" }, 503)
  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return reply({ error: "invalid_json" }, 400) }

  try {
    const action = String(payload.action || "status")
    if (action === "status") return reply({ ok: true, ...(await status(req, payload)) })
    if (action === "tree") return reply({ ok: true, ...(await tree(req, payload)) })
    if (action === "read") return reply({ ok: true, ...(await readFile(req, payload)) })
    if (action === "commit") return reply({ ok: true, ...(await commitFile(req, payload)) })
    if (action === "upload") return reply({ ok: true, ...(await uploadFile(req, payload)) })
    if (action === "delete_file") return reply({ ok: true, ...(await deleteFile(req, payload)) })
    if (action === "branches") return reply({ ok: true, ...(await listBranches(req, payload)) })
    if (action === "create_branch") return reply({ ok: true, ...(await createBranch(req, payload)) })
    if (action === "commits") return reply({ ok: true, ...(await listCommits(req, payload)) })
    if (action === "issues") return reply({ ok: true, ...(await listIssues(req, payload)) })
    if (action === "create_issue") return reply({ ok: true, ...(await createIssue(req, payload)) })
    if (action === "update_issue") return reply({ ok: true, ...(await updateIssue(req, payload)) })
    if (action === "issue_comments") return reply({ ok: true, ...(await issueComments(req, payload)) })
    if (action === "issue_comment") return reply({ ok: true, ...(await addIssueComment(req, payload)) })
    if (action === "pull_requests") return reply({ ok: true, ...(await listPullRequests(req, payload)) })
    if (action === "pull_request") return reply({ ok: true, ...(await createPullRequest(req, payload)) })
    if (action === "pr_reviews") return reply({ ok: true, ...(await pullRequestReviews(req, payload)) })
    if (action === "review_pr") return reply({ ok: true, ...(await reviewPullRequest(req, payload)) })
    if (action === "merge_pull_request") return reply({ ok: true, ...(await mergePullRequest(req, payload)) })
    if (action === "repository_settings") return reply({ ok: true, ...(await repositorySettings(req, payload)) })
    if (action === "update_repository_settings") return reply({ ok: true, ...(await updateRepositorySettings(req, payload)) })
    if (action === "terminal") return reply({ ok: true, ...(await terminal(req, payload)) })
    if (action === "ci") return reply({ ok: true, ...(await ciCockpit(req, payload)) })
    if (action === "fixes") return reply({ ok: true, ...(await fixes(req, payload)) })
    if (action === "autofix") return reply({ ok: true, ...(await autoFix(req, payload)) })
    return reply({ error: "unsupported_action" }, 400)
  } catch (error) {
    console.error("github-studio:", error)
    const message = error instanceof Error ? error.message : "Falha no Project Studio."
    const statusCode = /plano|permissão|Entre na sua conta/i.test(message) ? 403 : 400
    return reply({ error: message }, statusCode)
  }
})