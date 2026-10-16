import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || ""
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || Deno.env.get("GITHUB_PAT") || ""
const GITHUB_APP_ID = Deno.env.get("GITHUB_APP_ID") || ""
const GITHUB_PRIVATE_KEY = Deno.env.get("GITHUB_PRIVATE_KEY") || ""
const GITHUB_WEBHOOK_SECRET = Deno.env.get("GITHUB_WEBHOOK_SECRET") || ""

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

const PACKAGE_CACHE_MS = 6 * 60 * 60 * 1000
const PROJECT_SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000
const PROJECT_FAILURE_RETRY_MS = 2 * 60 * 60 * 1000
const BATCH_LIMIT = 3
const MANIFEST_LIMIT = 50
const DEPENDENCY_LIMIT = 2500
const FINDING_LIMIT = 300
const PUBLIC_MISS_WINDOW_MS = 5 * 60 * 1000
const PUBLIC_MISS_LIMIT = 24

const publicBuckets = new Map<string, { count: number; resetAt: number }>()

type Severity = "none" | "low" | "medium" | "high" | "critical" | "unknown"
type Dependency = {
  ecosystem?: string
  name?: string
  version?: string
  purl?: string
  source?: string
}
type RepoRef = {
  owner: string
  repo: string
  url: string
}

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  })
}

function compact(value: unknown, max = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  if (!text) return ""
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}

function errorMessage(error: unknown, fallback = "Falha na auditoria.", max = 1000) {
  if (error instanceof Error) return compact(error.message || fallback, max) || fallback
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    const details = [record.message, record.details, record.hint, record.code]
      .map((value) => compact(value, 400))
      .filter(Boolean)
    if (details.length) return compact(details.join(" | "), max)
    try {
      const serialized = JSON.stringify(record)
      if (serialized) return compact(serialized, max)
    } catch {}
  }
  return compact(error, max) || fallback
}

function clientKey(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

function consumePublicMiss(req: Request) {
  const key = clientKey(req)
  const now = Date.now()
  const current = publicBuckets.get(key)
  if (!current || current.resetAt <= now) {
    publicBuckets.set(key, { count: 1, resetAt: now + PUBLIC_MISS_WINDOW_MS })
    return true
  }
  if (current.count >= PUBLIC_MISS_LIMIT) return false
  current.count += 1
  return true
}

function normalizeEcosystem(value: unknown) {
  const key = String(value || "").trim().toLowerCase()
  const aliases: Record<string, string> = {
    npm: "npm",
    node: "npm",
    nodejs: "npm",
    pypi: "PyPI",
    python: "PyPI",
    pip: "PyPI",
    go: "Go",
    golang: "Go",
    cargo: "crates.io",
    rust: "crates.io",
    "crates.io": "crates.io",
    maven: "Maven",
    java: "Maven",
    nuget: "NuGet",
    dotnet: "NuGet",
    ".net": "NuGet",
    rubygems: "RubyGems",
    ruby: "RubyGems",
    gem: "RubyGems",
    packagist: "Packagist",
    composer: "Packagist",
    php: "Packagist",
    pub: "Pub",
    dart: "Pub",
    "github actions": "GitHub Actions",
    githubactions: "GitHub Actions",
    actions: "GitHub Actions",
  }
  return aliases[key] || String(value || "").trim()
}

function parseGitHubRepo(value: unknown): RepoRef {
  const raw = String(value || "").trim()
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("Informe uma URL válida de repositório GitHub.")
  }
  if (!/(^|\.)github\.com$/i.test(url.hostname)) {
    throw new Error("A auditoria automática aceita repositórios hospedados no GitHub.")
  }
  const parts = url.pathname.split("/").filter(Boolean)
  if (parts.length < 2) throw new Error("URL de repositório GitHub incompleta.")
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/i, "")
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error("Repositório GitHub inválido.")
  }
  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  }
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
  if (!clean.includes("BEGIN RSA PRIVATE KEY")) throw new Error("Formato da chave privada GitHub App inválido.")
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

let githubAppKeyPromise: Promise<CryptoKey> | null = null
async function githubAppJwt() {
  if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY) throw new Error("GitHub App não configurado.")
  if (!githubAppKeyPromise) {
    githubAppKeyPromise = crypto.subtle.importKey(
      "pkcs8",
      privateKeyDer(GITHUB_PRIVATE_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    )
  }
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: GITHUB_APP_ID }))
  const input = `${header}.${payload}`
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await githubAppKeyPromise,
    new TextEncoder().encode(input),
  ))
  return `${input}.${b64url(signature)}`
}

async function githubAppRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "CreativeZone-Security/2.0 (+https://forum.creativezone.pro/)",
      Authorization: `Bearer ${await githubAppJwt()}`,
      ...(init.headers || {}),
    },
  })
  if (!response.ok) throw new Error(`github_app_http_${response.status}: ${compact(await response.text().catch(() => ""), 220)}`)
  return response.json()
}

const installationTokenCache = new Map<number, { token: string; expires: number }>()
async function githubInstallationToken(installationId: number) {
  const cached = installationTokenCache.get(installationId)
  if (cached && cached.expires > Date.now() + 60_000) return cached.token
  const data = await githubAppRequest(`/app/installations/${installationId}/access_tokens`, { method: "POST" })
  const token = String(data?.token || "")
  if (!token) throw new Error("Não foi possível autenticar a instalação do GitHub App.")
  const expires = data?.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 50 * 60 * 1000
  installationTokenCache.set(installationId, { token, expires })
  return token
}

async function installationForOwner(owner: string) {
  if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY) return null
  const installs = await githubAppRequest("/app/installations?per_page=100")
  return (Array.isArray(installs) ? installs : []).find((item: Record<string, unknown>) =>
    String((item.account as Record<string, unknown> | undefined)?.login || "").toLowerCase() === owner.toLowerCase()
  ) || null
}

function githubHeaders(token = GITHUB_TOKEN) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10",
    "User-Agent": "CreativeZone-Security/2.0 (+https://forum.creativezone.pro/)",
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function githubJson(pathOrUrl: string, options: RequestInit = {}, token = GITHUB_TOKEN) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `https://api.github.com${pathOrUrl}`
  const response = await fetch(url, {
    ...options,
    headers: { ...githubHeaders(token), ...(options.headers || {}) },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    const error = new Error(`github_http_${response.status}: ${compact(body, 220)}`)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }
  return response.json()
}

async function githubRepoInfo(ref: RepoRef, token = GITHUB_TOKEN) {
  return githubJson(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`, {}, token)
}

const MANIFEST_BASENAMES = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "requirements.txt",
  "pipfile.lock",
  "poetry.lock",
  "pyproject.toml",
  "go.mod",
  "go.sum",
  "cargo.toml",
  "cargo.lock",
  "composer.json",
  "composer.lock",
  "gemfile",
  "gemfile.lock",
  "packages.lock.json",
  "packages.config",
  "pom.xml",
  "gradle.lockfile",
  "pubspec.yaml",
  "pubspec.lock",
])

function looksLikeManifest(path: string) {
  const lower = path.toLowerCase()
  const base = lower.split("/").pop() || ""
  if (MANIFEST_BASENAMES.has(base)) return true
  if (/requirements[^/]*\.txt$/.test(base)) return true
  if (/\.csproj$/.test(base)) return true
  if (/\.fsproj$/.test(base)) return true
  if (/\.vbproj$/.test(base)) return true
  if (/^\.github\/workflows\/.*\.ya?ml$/.test(lower)) return true
  return false
}

async function repoTree(ref: RepoRef, branch: string, token = GITHUB_TOKEN) {
  try {
    const data = await githubJson(
      `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      {},
      token,
    )
    const paths = Array.isArray(data?.tree)
      ? data.tree
          .filter((item: { type?: string; path?: string }) => item?.type === "blob" && item.path && looksLikeManifest(item.path))
          .map((item: { path: string }) => item.path)
          .slice(0, MANIFEST_LIMIT)
      : []
    return { paths, truncated: Boolean(data?.truncated), sha: String(data?.sha || "") }
  } catch {
    return { paths: [], truncated: false, sha: "" }
  }
}

function parsePurl(locator: string, fallbackName = "", fallbackVersion = ""): Dependency | null {
  const raw = String(locator || "").trim()
  if (!raw.startsWith("pkg:")) return null
  const at = raw.lastIndexOf("@")
  const withoutQualifiers = raw.split("?")[0].split("#")[0]
  const versionAt = withoutQualifiers.lastIndexOf("@")
  const version = versionAt > 4
    ? decodeURIComponent(withoutQualifiers.slice(versionAt + 1))
    : fallbackVersion
  const body = withoutQualifiers.slice(4, versionAt > 4 ? versionAt : undefined)
  const slash = body.indexOf("/")
  const type = slash >= 0 ? body.slice(0, slash) : body
  const namePart = slash >= 0 ? body.slice(slash + 1) : fallbackName
  const name = decodeURIComponent(namePart)
  const map: Record<string, string> = {
    npm: "npm",
    pypi: "PyPI",
    golang: "Go",
    cargo: "crates.io",
    maven: "Maven",
    nuget: "NuGet",
    gem: "RubyGems",
    composer: "Packagist",
    pub: "Pub",
    github: "GitHub Actions",
  }
  if (!name || !version) return null
  return {
    ecosystem: map[type] || "",
    name,
    version,
    purl: raw,
    source: "github-sbom",
  }
}

async function requestGitHubSbom(ref: RepoRef, token = GITHUB_TOKEN) {
  const base = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/dependency-graph/sbom`
  try {
    const generated = await githubJson(base + "/generate-report", {}, token)
    const fetchUrl = String(generated?.sbom_url || "")
    if (fetchUrl) {
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const response = await fetch(fetchUrl, { redirect: "follow", headers: githubHeaders(token) })
        if (response.status === 202) {
          await new Promise((resolve) => setTimeout(resolve, 450 + attempt * 120))
          continue
        }
        if (response.ok) {
          const data = await response.json()
          if (data?.sbom) return data.sbom
        }
        break
      }
    }
  } catch {}
  try {
    const legacy = await githubJson(base, {}, token)
    return legacy?.sbom || null
  } catch {
    return null
  }
}

function dependenciesFromSbom(sbom: Record<string, unknown> | null) {
  if (!sbom || !Array.isArray(sbom.packages)) return [] as Dependency[]
  const result: Dependency[] = []
  for (const pkg of sbom.packages as Array<Record<string, unknown>>) {
    if (String(pkg.SPDXID || "") === "SPDXRef-Repository") continue
    const refs = Array.isArray(pkg.externalRefs)
      ? pkg.externalRefs as Array<Record<string, unknown>>
      : []
    const purl = refs
      .map((item) => String(item.referenceLocator || ""))
      .find((item) => item.startsWith("pkg:"))
    const parsed = purl
      ? parsePurl(purl, String(pkg.name || ""), String(pkg.versionInfo || ""))
      : null
    if (parsed) result.push(parsed)
  }
  return dedupeDependencies(result)
}

function rawGitHubUrl(ref: RepoRef, branch: string, path: string) {
  return `https://raw.githubusercontent.com/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`
}

async function readManifest(ref: RepoRef, branch: string, path: string, token = GITHUB_TOKEN) {
  if (token) {
    try {
      const data = await githubJson(
        `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
        {},
        token,
      )
      if (data?.content && String(data.encoding || "").toLowerCase() === "base64") {
        const binary = atob(String(data.content).replace(/\s+/g, ""))
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
        const text = new TextDecoder().decode(bytes)
        return text.length > 2_000_000 ? "" : text
      }
    } catch {}
  }
  const response = await fetch(rawGitHubUrl(ref, branch, path), {
    headers: { "User-Agent": "CreativeZone-Security/2.0 (+https://forum.creativezone.pro/)" },
  })
  if (!response.ok) return ""
  const length = Number(response.headers.get("content-length") || 0)
  if (length > 2_000_000) return ""
  const text = await response.text()
  return text.length > 2_000_000 ? "" : text
}

function cleanVersion(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^v(?=\d)/, "")
}

function exactSemver(value: unknown) {
  const raw = cleanVersion(value)
  if (!raw || /[<>=~^*|\s]/.test(raw)) return ""
  return raw
}

function parsePackageLock(text: string, source: string) {
  const deps: Dependency[] = []
  try {
    const data = JSON.parse(text)
    if (data?.packages && typeof data.packages === "object") {
      for (const [path, item] of Object.entries(data.packages as Record<string, Record<string, unknown>>)) {
        if (!path || !item?.version) continue
        const marker = "node_modules/"
        const idx = path.lastIndexOf(marker)
        const name = String(item.name || (idx >= 0 ? path.slice(idx + marker.length) : ""))
        if (name && item.version) deps.push({ ecosystem: "npm", name, version: String(item.version), source })
      }
    } else if (data?.dependencies) {
      for (const [name, item] of Object.entries(data.dependencies as Record<string, Record<string, unknown>>)) {
        if (item?.version) deps.push({ ecosystem: "npm", name, version: String(item.version), source })
      }
    }
  } catch {}
  return deps
}

function parsePackageJson(text: string, source: string) {
  const deps: Dependency[] = []
  try {
    const data = JSON.parse(text)
    for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [name, version] of Object.entries(data?.[section] || {})) {
        const exact = exactSemver(version)
        if (exact) deps.push({ ecosystem: "npm", name, version: exact, source })
      }
    }
  } catch {}
  return deps
}

function parseRequirements(text: string, source: string) {
  const deps: Dependency[] = []
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/\s+#.*$/, "").trim()
    const match = clean.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?==([^;\s]+)(?:\s*;.*)?$/)
    if (match) deps.push({ ecosystem: "PyPI", name: match[1], version: cleanVersion(match[2]), source })
  }
  return deps
}

function parsePipfileLock(text: string, source: string) {
  const deps: Dependency[] = []
  try {
    const data = JSON.parse(text)
    for (const section of ["default", "develop"]) {
      for (const [name, item] of Object.entries(data?.[section] || {}) as Array<[string, Record<string, unknown>]>) {
        const version = String(item?.version || "").replace(/^==/, "")
        if (version) deps.push({ ecosystem: "PyPI", name, version, source })
      }
    }
  } catch {}
  return deps
}

function parseTomlPackageBlocks(text: string, ecosystem: string, source: string) {
  const deps: Dependency[] = []
  const blocks = text.split(/\[\[package\]\]/g).slice(1)
  for (const block of blocks) {
    const name = block.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1]
    const version = block.match(/^\s*version\s*=\s*["']([^"']+)["']/m)?.[1]
    if (name && version) deps.push({ ecosystem, name, version, source })
  }
  return deps
}

function parseGoSum(text: string, source: string) {
  const deps: Dependency[] = []
  for (const line of text.split(/\r?\n/)) {
    const [name, rawVersion] = line.trim().split(/\s+/)
    if (!name || !rawVersion) continue
    const version = rawVersion.replace(/\/go\.mod$/, "").replace(/\+incompatible$/, "")
    if (/^v\d/.test(version)) deps.push({ ecosystem: "Go", name, version, source })
  }
  return deps
}

function parseComposerLock(text: string, source: string) {
  const deps: Dependency[] = []
  try {
    const data = JSON.parse(text)
    for (const section of ["packages", "packages-dev"]) {
      for (const item of data?.[section] || []) {
        if (item?.name && item?.version) {
          deps.push({ ecosystem: "Packagist", name: item.name, version: String(item.version).replace(/^v/, ""), source })
        }
      }
    }
  } catch {}
  return deps
}

function parseNugetLock(text: string, source: string) {
  const deps: Dependency[] = []
  try {
    const data = JSON.parse(text)
    const walk = (value: unknown) => {
      if (!value || typeof value !== "object") return
      for (const [name, item] of Object.entries(value as Record<string, unknown>)) {
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>
          if (typeof obj.resolved === "string") {
            deps.push({ ecosystem: "NuGet", name, version: obj.resolved, source })
          }
          walk(obj.dependencies)
        }
      }
    }
    walk(data?.dependencies)
  } catch {}
  return deps
}

function parseGemfileLock(text: string, source: string) {
  const deps: Dependency[] = []
  let inSpecs = false
  for (const line of text.split(/\r?\n/)) {
    if (/^GEM\s*$/.test(line)) { inSpecs = false; continue }
    if (/^\s{2}specs:\s*$/.test(line)) { inSpecs = true; continue }
    if (inSpecs) {
      const match = line.match(/^\s{4}([^\s(]+)\s+\(([^)]+)\)/)
      if (match) deps.push({ ecosystem: "RubyGems", name: match[1], version: match[2].split(",")[0].trim(), source })
      else if (/^[A-Z]/.test(line)) inSpecs = false
    }
  }
  return deps
}

function parseGradleLock(text: string, source: string) {
  const deps: Dependency[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([^:#\s]+):([^:#\s]+):([^=\s]+)=/)
    if (match) deps.push({ ecosystem: "Maven", name: `${match[1]}:${match[2]}`, version: match[3], source })
  }
  return deps
}

function parsePom(text: string, source: string) {
  const deps: Dependency[] = []
  const blocks = text.match(/<dependency>[\s\S]*?<\/dependency>/g) || []
  for (const block of blocks) {
    const group = block.match(/<groupId>\s*([^<]+)\s*<\/groupId>/)?.[1]?.trim()
    const artifact = block.match(/<artifactId>\s*([^<]+)\s*<\/artifactId>/)?.[1]?.trim()
    const version = block.match(/<version>\s*([^<]+)\s*<\/version>/)?.[1]?.trim()
    if (group && artifact && version && !version.includes("$")) {
      deps.push({ ecosystem: "Maven", name: `${group}:${artifact}`, version, source })
    }
  }
  return deps
}

function parseGithubActions(text: string, source: string) {
  const deps: Dependency[] = []
  const regex = /\buses:\s*["']?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s"'#]+)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    if (!match[1].startsWith("./")) {
      deps.push({ ecosystem: "GitHub Actions", name: match[1], version: match[2], source })
    }
  }
  return deps
}

function parseYarnLock(text: string, source: string) {
  const deps: Dependency[] = []
  const lines = text.split(/\r?\n/)
  let names: string[] = []
  for (const line of lines) {
    if (line && !/^\s/.test(line) && line.endsWith(":")) {
      names = line.slice(0, -1).split(",").map((part) => {
        const key = part.trim().replace(/^["']|["']$/g, "")
        if (key.startsWith("@")) {
          const slash = key.indexOf("/")
          const at = key.indexOf("@", slash + 1)
          return at > 0 ? key.slice(0, at) : key
        }
        const at = key.lastIndexOf("@")
        return at > 0 ? key.slice(0, at) : key
      })
      continue
    }
    const version = line.match(/^\s+version\s+["']([^"']+)["']/)?.[1]
    if (version && names.length) {
      for (const name of new Set(names)) {
        if (name) deps.push({ ecosystem: "npm", name, version, source })
      }
      names = []
    }
  }
  return deps
}

function parsePnpmLock(text: string, source: string) {
  const deps: Dependency[] = []
  const regex = /^\s{2,}['"]?\/?(@?[^\s:'"]+(?:\/[^\s:'"]+)?)@([^:\s'"]+):?['"]?\s*$/gm
  let match
  while ((match = regex.exec(text)) !== null) {
    const version = match[2].split("(")[0]
    if (match[1] && version) deps.push({ ecosystem: "npm", name: match[1], version, source })
  }
  return deps
}

function parsePubspecLock(text: string, source: string) {
  const deps: Dependency[] = []
  const lines = text.split(/\r?\n/)
  let name = ""
  for (const line of lines) {
    const packageMatch = line.match(/^\s{2}([^\s:]+):\s*$/)
    if (packageMatch) { name = packageMatch[1]; continue }
    const version = line.match(/^\s{4}version:\s*["']?([^"'\s]+)["']?\s*$/)?.[1]
    if (name && version) {
      deps.push({ ecosystem: "Pub", name, version, source })
      name = ""
    }
  }
  return deps
}

async function dependenciesFromManifests(ref: RepoRef, branch: string, paths: string[], token = GITHUB_TOKEN) {
  const output: Dependency[] = []
  for (const path of paths.slice(0, MANIFEST_LIMIT)) {
    const text = await readManifest(ref, branch, path, token)
    if (!text) continue
    const base = path.toLowerCase().split("/").pop() || ""
    if (["package-lock.json", "npm-shrinkwrap.json"].includes(base)) output.push(...parsePackageLock(text, path))
    else if (base === "package.json") output.push(...parsePackageJson(text, path))
    else if (/^requirements.*\.txt$/.test(base)) output.push(...parseRequirements(text, path))
    else if (base === "pipfile.lock") output.push(...parsePipfileLock(text, path))
    else if (base === "poetry.lock") output.push(...parseTomlPackageBlocks(text, "PyPI", path))
    else if (base === "cargo.lock") output.push(...parseTomlPackageBlocks(text, "crates.io", path))
    else if (base === "go.sum") output.push(...parseGoSum(text, path))
    else if (base === "composer.lock") output.push(...parseComposerLock(text, path))
    else if (base === "packages.lock.json") output.push(...parseNugetLock(text, path))
    else if (base === "gemfile.lock") output.push(...parseGemfileLock(text, path))
    else if (base === "gradle.lockfile") output.push(...parseGradleLock(text, path))
    else if (base === "pom.xml") output.push(...parsePom(text, path))
    else if (base === "yarn.lock") output.push(...parseYarnLock(text, path))
    else if (base === "pnpm-lock.yaml") output.push(...parsePnpmLock(text, path))
    else if (base === "pubspec.lock") output.push(...parsePubspecLock(text, path))
    else if (/^\.github\/workflows\/.*\.ya?ml$/.test(path.toLowerCase())) output.push(...parseGithubActions(text, path))
  }
  return dedupeDependencies(output)
}

function dedupeDependencies(items: Dependency[]) {
  const map = new Map<string, Dependency>()
  for (const item of items) {
    const version = cleanVersion(item.version)
    const name = String(item.name || "").trim()
    const purl = String(item.purl || "").trim()
    if (!version || (!name && !purl)) continue
    const key = purl
      ? `purl:${purl.toLowerCase()}`
      : `${String(item.ecosystem || "").toLowerCase()}|${name.toLowerCase()}|${version}`
    if (!map.has(key)) map.set(key, { ...item, name, version, purl })
    if (map.size >= DEPENDENCY_LIMIT) break
  }
  return [...map.values()]
}

async function osvQueryBatch(dependencies: Dependency[]) {
  const results: Array<{ dependency: Dependency; ids: string[] }> = []
  const chunks: Dependency[][] = []
  for (let i = 0; i < dependencies.length; i += 400) chunks.push(dependencies.slice(i, i + 400))

  for (const chunk of chunks) {
    const queries = chunk.map((dep) => (
      dep.purl
        ? { package: { purl: dep.purl } }
        : { package: { ecosystem: dep.ecosystem, name: dep.name }, version: dep.version }
    ))
    const response = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "CreativeZone-Security/1.0 (+https://forum.creativezone.pro/)" },
      body: JSON.stringify({ queries }),
    })
    if (!response.ok) throw new Error(`osv_querybatch_http_${response.status}`)
    const body = await response.json()
    const batchResults = Array.isArray(body?.results) ? body.results : []
    chunk.forEach((dependency, index) => {
      const ids = Array.isArray(batchResults[index]?.vulns)
        ? batchResults[index].vulns.map((item: { id?: string }) => String(item?.id || "")).filter(Boolean)
        : []
      results.push({ dependency, ids })
    })
  }
  return results
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const result = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      result[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return result
}

async function osvDetails(ids: string[]) {
  const unique = [...new Set(ids)].slice(0, 1200)
  const rows = await mapLimit(unique, 8, async (id) => {
    const response = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json", "User-Agent": "CreativeZone-Security/1.0 (+https://forum.creativezone.pro/)" },
    })
    if (!response.ok) return null
    return response.json()
  })
  return new Map(rows.filter(Boolean).map((item) => [String(item.id), item]))
}

function normalizeSeverityValue(value: unknown): Severity {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return "unknown"
  if (raw.includes("critical")) return "critical"
  if (raw.includes("high")) return "high"
  if (raw.includes("moderate") || raw.includes("medium")) return "medium"
  if (raw.includes("low")) return "low"
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) {
    if (numeric >= 9) return "critical"
    if (numeric >= 7) return "high"
    if (numeric >= 4) return "medium"
    if (numeric > 0) return "low"
  }
  return "unknown"
}

function vulnerabilitySeverity(vuln: Record<string, unknown>): Severity {
  const candidates: unknown[] = [
    (vuln.database_specific as Record<string, unknown> | undefined)?.severity,
  ]
  for (const affected of (Array.isArray(vuln.affected) ? vuln.affected : []) as Array<Record<string, unknown>>) {
    candidates.push((affected.database_specific as Record<string, unknown> | undefined)?.severity)
    candidates.push((affected.ecosystem_specific as Record<string, unknown> | undefined)?.severity)
  }
  for (const item of (Array.isArray(vuln.severity) ? vuln.severity : []) as Array<Record<string, unknown>>) {
    const score = item?.score
    if (typeof score === "number") candidates.push(score)
    if (typeof score === "string" && /^\d+(?:\.\d+)?$/.test(score)) candidates.push(score)
  }
  const severities = candidates.map(normalizeSeverityValue)
  const order: Severity[] = ["critical", "high", "medium", "low", "unknown", "none"]
  return order.find((item) => severities.includes(item)) || "unknown"
}

function vulnerabilityCanonicalKey(vuln: Record<string, unknown>) {
  const values = [
    String(vuln.id || ""),
    ...(Array.isArray(vuln.aliases) ? vuln.aliases.map(String) : []),
  ].filter(Boolean)
  return (
    values.find((value) => /^CVE-/i.test(value)) ||
    values.find((value) => /^GHSA-/i.test(value)) ||
    values[0] ||
    crypto.randomUUID()
  ).toUpperCase()
}

function dedupeVulnerabilityDetails(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, Record<string, unknown>>()
  for (const vuln of rows) {
    const key = vulnerabilityCanonicalKey(vuln)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, vuln)
      continue
    }
    const preferred = /^GHSA-/i.test(String(vuln.id || "")) && !/^GHSA-/i.test(String(existing.id || ""))
      ? vuln
      : existing
    const aliases = [...new Set([
      ...(Array.isArray(existing.aliases) ? existing.aliases.map(String) : []),
      ...(Array.isArray(vuln.aliases) ? vuln.aliases.map(String) : []),
      String(existing.id || ""),
      String(vuln.id || ""),
    ].filter(Boolean))]
    map.set(key, { ...preferred, aliases })
  }
  return [...map.values()]
}

function fixedVersions(vuln: Record<string, unknown>, dep: Dependency) {
  const found = new Set<string>()
  for (const affected of (Array.isArray(vuln.affected) ? vuln.affected : []) as Array<Record<string, unknown>>) {
    const pkg = affected.package as Record<string, unknown> | undefined
    const sameName = !dep.name || !pkg?.name || String(pkg.name).toLowerCase() === dep.name.toLowerCase()
    if (!sameName) continue
    for (const range of (Array.isArray(affected.ranges) ? affected.ranges : []) as Array<Record<string, unknown>>) {
      for (const event of (Array.isArray(range.events) ? range.events : []) as Array<Record<string, unknown>>) {
        if (event.fixed) found.add(String(event.fixed))
      }
    }
  }
  return [...found].slice(0, 8)
}

function severitySummary(findings: Array<Record<string, unknown>>) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
  const uniqueVulns = new Set<string>()
  let vulnerableDependencies = 0
  for (const finding of findings) {
    const vulns = Array.isArray(finding.vulnerabilities) ? finding.vulnerabilities as Array<Record<string, unknown>> : []
    if (vulns.length) vulnerableDependencies += 1
    for (const vuln of vulns) {
      const id = String(vuln.canonical_key || vuln.id || "")
      if (id && uniqueVulns.has(id)) continue
      if (id) uniqueVulns.add(id)
      const sev = normalizeSeverityValue(vuln.severity)
      if (sev === "critical") counts.critical += 1
      else if (sev === "high") counts.high += 1
      else if (sev === "medium") counts.medium += 1
      else if (sev === "low") counts.low += 1
      else counts.unknown += 1
    }
  }
  const highest: Severity = counts.critical ? "critical"
    : counts.high ? "high"
      : counts.medium ? "medium"
        : counts.low ? "low"
          : counts.unknown ? "unknown"
            : "none"
  const penalty =
    counts.critical * 30 +
    counts.high * 18 +
    counts.medium * 8 +
    counts.low * 3 +
    counts.unknown * 5
  return {
    ...counts,
    vulnerabilityCount: uniqueVulns.size,
    vulnerableDependencies,
    highest,
    score: Math.max(0, Math.min(100, 100 - penalty)),
  }
}

async function analyzeDependencies(dependencies: Dependency[]) {
  if (!dependencies.length) {
    return { findings: [], ...severitySummary([]) }
  }
  const queried = await osvQueryBatch(dependencies)
  const allIds = queried.flatMap((item) => item.ids)
  const details = await osvDetails(allIds)
  const findings: Array<Record<string, unknown>> = []

  for (const item of queried) {
    if (!item.ids.length) continue
    const vulnerabilities = dedupeVulnerabilityDetails(
      item.ids
        .map((id) => details.get(id))
        .filter(Boolean) as Array<Record<string, unknown>>
    ).map((vuln: Record<string, unknown>) => ({
      id: vuln.id,
      aliases: Array.isArray(vuln.aliases) ? vuln.aliases.slice(0, 12) : [],
      canonical_key: vulnerabilityCanonicalKey(vuln),
      summary: compact(vuln.summary || vuln.details || "Vulnerabilidade conhecida.", 500),
      severity: vulnerabilitySeverity(vuln),
      fixed_versions: fixedVersions(vuln, item.dependency),
      references: (Array.isArray(vuln.references) ? vuln.references : [])
        .map((ref: Record<string, unknown>) => String(ref?.url || ""))
        .filter((url: string) => /^https?:\/\//.test(url))
        .slice(0, 5),
      modified: vuln.modified || null,
      published: vuln.published || null,
    }))

    findings.push({
      ecosystem: item.dependency.ecosystem || "",
      package_name: item.dependency.name || "",
      version: item.dependency.version || "",
      purl: item.dependency.purl || "",
      source: item.dependency.source || "",
      vulnerabilities,
      highest_severity: vulnerabilities.reduce<Severity>((highest, vuln) => {
        const order: Severity[] = ["none", "unknown", "low", "medium", "high", "critical"]
        return order.indexOf(vuln.severity as Severity) > order.indexOf(highest)
          ? vuln.severity as Severity
          : highest
      }, "none"),
    })
  }

  const summary = severitySummary(findings)
  return {
    findings: findings.slice(0, FINDING_LIMIT),
    findingsTruncated: findings.length > FINDING_LIMIT,
    ...summary,
  }
}

async function packageSecurity(req: Request, payload: Record<string, unknown>) {
  const ecosystem = normalizeEcosystem(payload.ecosystem)
  const name = compact(payload.package_name || payload.name, 300)
  const version = compact(payload.version, 120)
  if (!ecosystem || !name || !version) {
    return reply({ error: "Informe ecossistema, pacote e versão." }, 400)
  }
  const cacheKey = `${ecosystem.toLowerCase()}|${name.toLowerCase()}|${version}`
  const nowIso = new Date().toISOString()

  const { data: cached } = await admin
    .from("security_package_cache")
    .select("*")
    .eq("cache_key", cacheKey)
    .gt("expires_at", nowIso)
    .maybeSingle()

  if (cached) return reply({ ok: true, cached: true, result: cached.result })

  if (!consumePublicMiss(req)) {
    return reply({ error: "Muitas análises novas em pouco tempo. Tente novamente em alguns minutos." }, 429)
  }

  const dependencies: Dependency[] = [{ ecosystem, name, version, source: "manual" }]
  const analysis = await analyzeDependencies(dependencies)
  const result = {
    ecosystem,
    package_name: name,
    version,
    dependency_count: 1,
    vulnerable_dependency_count: analysis.vulnerableDependencies,
    vulnerability_count: analysis.vulnerabilityCount,
    critical_count: analysis.critical,
    high_count: analysis.high,
    medium_count: analysis.medium,
    low_count: analysis.low,
    unknown_count: analysis.unknown,
    highest_severity: analysis.highest,
    security_score: analysis.score,
    findings: analysis.findings,
    checked_at: new Date().toISOString(),
  }

  await admin.from("security_package_cache").upsert({
    cache_key: cacheKey,
    ecosystem,
    package_name: name,
    version,
    query: { ecosystem, name, version },
    result,
    vulnerability_count: analysis.vulnerabilityCount,
    critical_count: analysis.critical,
    high_count: analysis.high,
    medium_count: analysis.medium,
    low_count: analysis.low,
    highest_severity: analysis.highest,
    checked_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + PACKAGE_CACHE_MS).toISOString(),
  }, { onConflict: "cache_key" })

  return reply({ ok: true, cached: false, result })
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

async function canManageProject(userId: string, projectId: string) {
  const [{ data: project }, { data: profile }, { data: membership }] = await Promise.all([
    admin.from("projects").select("owner_id").eq("id", projectId).maybeSingle(),
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    admin.from("project_members")
      .select("role,status")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle(),
  ])
  return Boolean(
    project?.owner_id === userId ||
    ["admin", "moderator"].includes(profile?.role) ||
    (membership?.status === "active" && membership?.role === "maintainer")
  )
}

async function devHubPlan(userId: string) {
  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin.from("profiles").select("system_owner").eq("id", userId).maybeSingle(),
    admin.from("user_memberships").select("plan_id,status,permanent,ends_at").eq("user_id", userId).maybeSingle(),
  ])
  let planId = "free"
  const active = membership?.status === "active" &&
    (membership?.permanent || !membership?.ends_at || new Date(membership.ends_at).getTime() > Date.now())
  if (active && membership?.plan_id) planId = membership.plan_id
  const { data: plan } = await admin.from("membership_plans").select("id,rank,entitlements").eq("id", planId).maybeSingle()
  if (profile?.system_owner) {
    const { data: elite } = await admin.from("membership_plans").select("entitlements").eq("id", "elite").maybeSingle()
    return { plan_id: "owner", rank: 99, capabilities: { ...(elite?.entitlements?.github_devhub || {}), repository_limit: -1 } }
  }
  return { plan_id: plan?.id || "free", rank: Number(plan?.rank || 0), capabilities: plan?.entitlements?.github_devhub || {} }
}

async function tokenForRepository(ref: RepoRef, projectId: string) {
  const { data: linked } = await admin
    .from("project_repositories")
    .select("installation_id")
    .eq("project_id", projectId)
    .ilike("repo_owner", ref.owner)
    .ilike("repo_name", ref.repo)
    .limit(1)
    .maybeSingle()
  let installationId = Number(linked?.installation_id || 0)
  if (!installationId) {
    const installation = await installationForOwner(ref.owner).catch(() => null)
    installationId = Number(installation?.id || 0)
  }
  return {
    installationId: installationId || null,
    token: installationId ? await githubInstallationToken(installationId) : GITHUB_TOKEN,
  }
}

async function writeRows(table: string, rows: Record<string, unknown>[], chunkSize = 400) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await admin.from(table).insert(chunk)
      if (!error) {
        lastError = null
        break
      }
      lastError = error
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (lastError) {
      throw new Error(`Falha ao persistir ${table}: ${errorMessage(lastError, "erro de banco", 800)}`)
    }
  }
}

async function persistNormalizedSecurity(projectId: string, repositoryId: string | null, auditId: string, dependencies: Dependency[], findings: Array<Record<string, unknown>>, capabilities: Record<string, unknown>) {
  const deleteResults = await Promise.all([
    admin.from("github_dependencies").delete().eq("audit_id", auditId),
    admin.from("github_vulnerabilities").delete().eq("audit_id", auditId),
  ])
  for (const result of deleteResults) {
    if (result.error) throw new Error(errorMessage(result.error, "Falha ao limpar dados normalizados.", 800))
  }

  if (capabilities.dependency_graph) {
    const vulnerable = new Set(findings.map((item) =>
      `${String(item.ecosystem || "").toLowerCase()}|${String(item.package_name || "").toLowerCase()}|${String(item.version || "")}`
    ))
    const depRows = dependencies.map((dep) => ({
      project_id: projectId,
      repository_id: repositoryId,
      audit_id: auditId,
      ecosystem: dep.ecosystem || "unknown",
      package_name: dep.name || dep.purl || "unknown",
      version: dep.version || "unknown",
      purl: dep.purl || null,
      source: dep.source || null,
      vulnerable: vulnerable.has(`${String(dep.ecosystem || "").toLowerCase()}|${String(dep.name || "").toLowerCase()}|${String(dep.version || "")}`),
      metadata: {},
    }))
    await writeRows("github_dependencies", depRows)
  }

  if (capabilities.osv_full) {
    const vulnRows: Record<string, unknown>[] = []
    for (const finding of findings) {
      for (const vuln of (Array.isArray(finding.vulnerabilities) ? finding.vulnerabilities : []) as Array<Record<string, unknown>>) {
        vulnRows.push({
          project_id: projectId,
          repository_id: repositoryId,
          audit_id: auditId,
          osv_id: String(vuln.id || vuln.canonical_key || "unknown"),
          aliases: Array.isArray(vuln.aliases) ? vuln.aliases : [],
          ecosystem: String(finding.ecosystem || "unknown"),
          package_name: String(finding.package_name || "unknown"),
          version: String(finding.version || "unknown"),
          severity: String(vuln.severity || "unknown"),
          summary: compact(vuln.summary || "", 1000) || null,
          fixed_versions: Array.isArray(vuln.fixed_versions) ? vuln.fixed_versions : [],
          reference_urls: Array.isArray(vuln.references) ? vuln.references : [],
          metadata: { canonical_key: vuln.canonical_key || null },
        })
      }
    }
    await writeRows("github_vulnerabilities", vulnRows)
  }
}

async function auditProject(projectId: string, options: {
  triggerType: "automatic" | "manual" | "scheduled" | "push" | "pull_request"
  requestedBy?: string | null
  force?: boolean
  pullRequestNumber?: number | null
}): Promise<Record<string, unknown>> {
  const { data: project, error } = await admin
    .from("projects")
    .select("id,owner_id,title,slug,repo_url,visibility,security_audit_enabled")
    .eq("id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!project) throw new Error("Projeto não encontrado.")
  if (!project.repo_url) throw new Error("Adicione um repositório GitHub ao projeto para habilitar a auditoria.")
  if (!project.security_audit_enabled) throw new Error("A auditoria automática está desativada neste projeto.")

  const plan = await devHubPlan(project.owner_id)
  const caps = plan.capabilities as Record<string, unknown>
  if (!caps.osv_basic_check) throw new Error("Seu plano não possui verificação OSV.")
  if (options.triggerType === "scheduled" && !caps.scheduled_rescan) return { skipped: true, reason: "plan_no_scheduled_rescan" }
  if (options.triggerType === "push" && !caps.push_scan) return { skipped: true, reason: "plan_no_push_scan" }
  if (options.triggerType === "pull_request" && !caps.pull_request_scan) return { skipped: true, reason: "plan_no_pull_request_scan" }

  const ref = parseGitHubRepo(project.repo_url)
  const auth = await tokenForRepository(ref, projectId)
  const repoInfo = await githubRepoInfo(ref, auth.token)
  const isPrivate = Boolean(repoInfo?.private)
  if (isPrivate && !caps.private_repository) {
    throw new Error("Repositórios privados são um benefício do plano CreativeZone ELITE.")
  }

  const { data: existing } = await admin.from("project_security_state").select("*").eq("project_id", projectId).maybeSingle()
  const sameRepository = String(existing?.summary?.repository || "").toLowerCase() === ref.url.toLowerCase()
  if (!options.force && sameRepository && existing?.next_scan_at && new Date(existing.next_scan_at).getTime() > Date.now()) {
    return { skipped: true, state: existing }
  }

  const nextDelay = caps.scheduled_rescan ? PROJECT_SCAN_INTERVAL_MS : 365 * 24 * 60 * 60 * 1000
  await admin.from("project_security_state").upsert({
    project_id: projectId,
    status: "scanning",
    next_scan_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id" })

  const startedAt = new Date().toISOString()
  const { data: audit, error: auditError } = await admin.from("project_security_audits").insert({
    project_id: projectId,
    trigger_type: options.triggerType,
    requested_by: options.requestedBy || null,
    status: "running",
    repo_url: ref.url,
    repo_owner: ref.owner,
    repo_name: ref.repo,
    started_at: startedAt,
  }).select("*").single()
  if (auditError) throw auditError

  try {
    const defaultBranch = String(repoInfo?.default_branch || "main")
    const tree = await repoTree(ref, defaultBranch, auth.token)
    const commitSha = tree.sha || String(repoInfo?.pushed_at || repoInfo?.updated_at || "")

    let sbom: Record<string, unknown> | null = null
    let dependencies: Dependency[] = []
    let source = "manifest-basic"

    if (caps.sbom) {
      sbom = await requestGitHubSbom(ref, auth.token)
      dependencies = dependenciesFromSbom(sbom)
      source = dependencies.length ? "github-sbom" : "manifest-fallback"
    }

    if (!dependencies.length) {
      dependencies = await dependenciesFromManifests(ref, defaultBranch, tree.paths, auth.token)
      source = caps.sbom ? "manifest-fallback" : "manifest-basic"
    }

    if (!caps.dependency_graph && dependencies.length > 120) dependencies = dependencies.slice(0, 120)

    const analysis = await analyzeDependencies(dependencies)
    const status = analysis.vulnerabilityCount === 0
      ? "secure"
      : (analysis.critical > 0 || analysis.high > 0 || analysis.score < 60) ? "danger" : "attention"
    const completedAt = new Date().toISOString()
    const tier = plan.rank >= 2 ? "elite" : plan.rank >= 1 ? "pro" : "basic"
    const fullFindings = caps.osv_full ? analysis.findings : []
    const auditStatus = dependencies.length ? "completed" : "partial"

    const { data: repository } = await admin
      .from("project_repositories")
      .select("id")
      .eq("project_id", projectId)
      .ilike("repo_owner", ref.owner)
      .ilike("repo_name", ref.repo)
      .limit(1)
      .maybeSingle()

    let securityGate: Record<string, unknown> | null = null
    if (options.triggerType === "pull_request" && caps.security_gate && options.pullRequestNumber && auth.token) {
      const blocked = analysis.critical > 0 || analysis.high > 0
      try {
        await githubJson(
          `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${options.pullRequestNumber}/reviews`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: blocked ? "REQUEST_CHANGES" : "APPROVE",
              body: blocked
                ? `CreativeZone Security Gate: merge bloqueado — ${analysis.critical} crítica(s) e ${analysis.high} alta(s) detectadas.`
                : "CreativeZone Security Gate: análise OSV aprovada, sem vulnerabilidades críticas/altas.",
            }),
          },
          auth.token,
        )
        securityGate = { status: blocked ? "blocked" : "approved", pull_request: options.pullRequestNumber }
      } catch (gateError) {
        securityGate = { status: "review_unavailable", pull_request: options.pullRequestNumber, error: compact(gateError instanceof Error ? gateError.message : gateError, 260) }
      }
    }

    const summary = {
      project_title: project.title,
      repository: ref.url,
      private_repository: isPrivate,
      installation_id: auth.installationId,
      plan_id: plan.plan_id,
      security_tier: tier,
      source,
      coverage: dependencies.length ? (caps.dependency_graph ? "full-dependency-graph" : "basic-dependency-check") : "repository-only",
      manifests_detected: tree.paths.length,
      tree_truncated: tree.truncated,
      sbom_available: Boolean(sbom),
      findings_truncated: analysis.findingsTruncated,
      osv_basic_check: true,
      osv_full: Boolean(caps.osv_full),
      security_gate: securityGate,
    }

    await admin.from("project_security_audits").update({
      status: auditStatus,
      source,
      default_branch: defaultBranch,
      commit_sha: commitSha,
      manifest_files: tree.paths,
      dependency_count: dependencies.length,
      vulnerable_dependency_count: analysis.vulnerableDependencies,
      vulnerability_count: analysis.vulnerabilityCount,
      critical_count: analysis.critical,
      high_count: analysis.high,
      medium_count: analysis.medium,
      low_count: analysis.low,
      unknown_count: analysis.unknown,
      highest_severity: analysis.highest,
      security_score: analysis.score,
      summary,
      findings: fullFindings,
      completed_at: completedAt,
    }).eq("id", audit.id)

    await persistNormalizedSecurity(projectId, repository?.id || null, audit.id, dependencies, analysis.findings, caps)

    await admin.from("project_security_reports").insert({
      project_id: projectId,
      repository_id: repository?.id || null,
      plan_feature: tier === "basic" ? "osv_basic_check" : "security_scan",
      scan_type: options.triggerType,
      status: auditStatus,
      dependency_count: dependencies.length,
      vulnerability_count: analysis.vulnerabilityCount,
      critical_count: analysis.critical,
      high_count: analysis.high,
      medium_count: analysis.medium,
      low_count: analysis.low,
      sbom: caps.sbom && sbom ? sbom : {},
      findings: fullFindings,
      completed_at: completedAt,
    })

    const state = {
      project_id: projectId,
      audit_id: audit.id,
      status,
      security_score: analysis.score,
      dependency_count: dependencies.length,
      vulnerable_dependency_count: analysis.vulnerableDependencies,
      vulnerability_count: analysis.vulnerabilityCount,
      critical_count: analysis.critical,
      high_count: analysis.high,
      medium_count: analysis.medium,
      low_count: analysis.low,
      unknown_count: analysis.unknown,
      highest_severity: analysis.highest,
      manifest_count: tree.paths.length,
      repo_commit_sha: commitSha,
      summary,
      last_audited_at: completedAt,
      next_scan_at: new Date(Date.now() + nextDelay).toISOString(),
      updated_at: completedAt,
    }
    await admin.from("project_security_state").upsert(state, { onConflict: "project_id" })

    if (caps.real_time_alerts && ["push", "pull_request"].includes(options.triggerType) && analysis.vulnerabilityCount > 0) {
      const alertData = {
        project_id: projectId,
        project_slug: project.slug,
        project_title: project.title,
        repository: ref.url,
        trigger_type: options.triggerType,
        vulnerability_count: analysis.vulnerabilityCount,
        critical_count: analysis.critical,
        high_count: analysis.high,
        highest_severity: analysis.highest,
        path: `/projetos/${project.slug}?section=security`,
      }
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const { data: recentAlert } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", project.owner_id)
        .eq("type", "github_security_alert")
        .contains("data", {
          project_id: projectId,
          trigger_type: options.triggerType,
          vulnerability_count: analysis.vulnerabilityCount,
          critical_count: analysis.critical,
          high_count: analysis.high,
          highest_severity: analysis.highest,
        })
        .gte("created_at", since)
        .limit(1)
        .maybeSingle()

      if (!recentAlert) {
        await admin.from("notifications").insert({
          user_id: project.owner_id,
          type: "github_security_alert",
          data: {
            ...alertData,
            message: `${analysis.vulnerabilityCount} vulnerabilidade(s) detectada(s); ${analysis.critical} crítica(s), ${analysis.high} alta(s).`,
          },
        }).then(()=>null).catch(()=>null)
      }
    }

    return { skipped: false, state, findings: fullFindings, plan_id: plan.plan_id, security_gate: securityGate }
  } catch (error) {
    const message = errorMessage(error, "Falha na auditoria.", 1000)
    const completedAt = new Date().toISOString()
    await admin.from("project_security_audits").update({ status: "failed", error_text: message, completed_at: completedAt }).eq("id", audit.id)
    await admin.from("project_security_state").upsert({
      project_id: projectId,
      audit_id: audit.id,
      status: "error",
      summary: { error: message, plan_id: plan.plan_id },
      next_scan_at: new Date(Date.now() + PROJECT_FAILURE_RETRY_MS).toISOString(),
      updated_at: completedAt,
    }, { onConflict: "project_id" })
    throw error
  }
}

async function projectAction(req: Request, payload: Record<string, unknown>) {
  const user = await authenticatedUser(req)
  if (!user) return reply({ error: "Entre na sua conta para auditar este projeto." }, 401)
  const projectId = String(payload.project_id || "")
  if (!projectId) return reply({ error: "Projeto não informado." }, 400)
  if (!await canManageProject(user.id, projectId)) return reply({ error: "Você não possui permissão para auditar este projeto." }, 403)
  try {
    const result = await auditProject(projectId, {
      triggerType: payload.trigger_type === "automatic" ? "automatic" : "manual",
      requestedBy: user.id,
      force: Boolean(payload.force),
    })
    return reply({ ok: true, ...result })
  } catch (error) {
    const message = errorMessage(error, "Falha na auditoria.", 1000)
    console.warn("github-security-scan project:", { projectId, error: message })
    return reply({ error: message }, 400)
  }
}

async function internalGithubAction(req: Request, payload: Record<string, unknown>) {
  if (!GITHUB_WEBHOOK_SECRET || req.headers.get("x-creativezone-github") !== GITHUB_WEBHOOK_SECRET) {
    return reply({ error: "forbidden" }, 403)
  }
  const projectId = String(payload.project_id || "")
  if (!projectId) return reply({ error: "Projeto não informado." }, 400)
  const requested = String(payload.trigger_type || "automatic")
  const triggerType = requested === "push" ? "push"
    : requested === "pull_request" ? "pull_request"
      : "automatic"
  try {
    const result = await auditProject(projectId, {
      triggerType,
      force: Boolean(payload.force),
      pullRequestNumber: Number(payload.pull_request_number || 0) || null,
    })
    return reply({ ok: true, ...result })
  } catch (error) {
    const message = errorMessage(error, "Falha na auditoria GitHub.", 1000)
    console.warn("github-security-scan internal:", { projectId, triggerType, error: message })
    return reply({ error: message }, 400)
  }
}

async function repoConnectedAction(req: Request, payload: Record<string, unknown>) {
  const provided = req.headers.get("x-creativezone-scheduler") || ""
  const { data: credential, error: credentialError } = await admin
    .from("security_scheduler_credentials")
    .select("scheduler_secret")
    .eq("id", true)
    .maybeSingle()
  if (credentialError) throw credentialError
  if (!provided || !credential?.scheduler_secret || provided !== credential.scheduler_secret) {
    return reply({ error: "repo_connect_forbidden" }, 403)
  }
  const projectId = String(payload.project_id || "")
  if (!projectId) return reply({ error: "Projeto não informado." }, 400)
  try {
    const result = await auditProject(projectId, { triggerType: "automatic", force: true })
    return reply({ ok: true, ...result })
  } catch (error) {
    const message = errorMessage(error, "Falha no scan ao conectar repositório.", 1000)
    console.warn("github-security-scan repo-connected:", { projectId, error: message })
    return reply({ error: message }, 400)
  }
}

async function batchAction(req: Request) {
  const provided = req.headers.get("x-creativezone-scheduler") || ""
  const { data: credential, error: credentialError } = await admin
    .from("security_scheduler_credentials")
    .select("scheduler_secret")
    .eq("id", true)
    .maybeSingle()
  if (credentialError) throw credentialError
  if (!provided || !credential?.scheduler_secret || provided !== credential.scheduler_secret) return reply({ error: "scheduler_forbidden" }, 403)

  const now = new Date().toISOString()
  const { data: projects, error } = await admin
    .from("projects")
    .select("id,project_security_state(next_scan_at,status)")
    .eq("security_audit_enabled", true)
    .not("repo_url", "is", null)
    .limit(50)
  if (error) throw error

  const due = (projects || []).filter((project) => {
    const state = Array.isArray(project.project_security_state) ? project.project_security_state[0] : project.project_security_state
    return !state?.next_scan_at || state.next_scan_at <= now
  }).slice(0, BATCH_LIMIT)

  const results = []
  for (const project of due) {
    try {
      results.push({ project_id: project.id, ...(await auditProject(project.id, { triggerType: "scheduled", force: false })) })
    } catch (error) {
      results.push({ project_id: project.id, error: errorMessage(error, "Falha na auditoria.", 1000) })
    }
  }
  return reply({ ok: true, processed: results.length, results })
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405)
  if (!SUPABASE_URL || !SERVICE_KEY) return reply({ error: "security_service_unavailable" }, 503)
  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return reply({ error: "invalid_json" }, 400) }
  const action = String(payload.action || "project")
  try {
    if (action === "project") return await projectAction(req, payload)
    if (action === "github_internal") return await internalGithubAction(req, payload)
    if (action === "repo_connected") return await repoConnectedAction(req, payload)
    if (action === "batch") return await batchAction(req)
    return reply({ error: "unsupported_action" }, 400)
  } catch (error) {
    console.error("github-security-scan:", error)
    return reply({ error: errorMessage(error, "security_audit_failed", 1000) }, 500)
  }
})
