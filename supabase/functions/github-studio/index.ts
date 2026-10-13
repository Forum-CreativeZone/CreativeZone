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
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    admin.from("project_members").select("role,status").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
  ])
  const manager = project.owner_id === user.id ||
    ["admin", "moderator"].includes(String(profile?.role || "")) ||
    (member?.status === "active" && member?.role === "maintainer")
  if (!manager) throw new Error("Você não possui permissão para editar este projeto.")
  const plan = await planFor(project.owner_id)
  return { user, project, plan }
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
  if (!installationId) throw new Error("Instale o CreativeZone DevHub na conta proprietária do repositório.")
  if (!repository) repository = { project_id: projectId, repo_url: repoUrl, default_branch: "main", installation_id: installationId }
  return { ...ctx, enabled: true, repository, ref, token: await installationToken(installationId) }
}

async function status(req: Request, payload: Record<string, unknown>) {
  const access = await repositoryAccess(req, payload)
  return {
    enabled: access.enabled,
    plan: access.plan,
    repository: access.repository ? {
      repo_url: access.repository.repo_url,
      default_branch: access.repository.default_branch || "main",
      is_private: Boolean(access.repository.is_private),
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
    if (action === "pull_request") return reply({ ok: true, ...(await createPullRequest(req, payload)) })
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