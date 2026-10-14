import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || ""
const APP_ID = Deno.env.get("GITHUB_APP_ID") || ""
const PRIVATE_KEY = Deno.env.get("GITHUB_PRIVATE_KEY") || ""
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
  if (clean.includes("BEGIN PRIVATE KEY")) return base64Bytes(clean.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, ""))
  if (!clean.includes("BEGIN RSA PRIVATE KEY")) throw new Error("Formato da chave privada do GitHub App inválido.")
  const pkcs1 = base64Bytes(clean.replace(/-----BEGIN RSA PRIVATE KEY-----|-----END RSA PRIVATE KEY-----/g, ""))
  const version = new Uint8Array([0x02,0x01,0x00])
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
    appKeyPromise = crypto.subtle.importKey("pkcs8",privateKeyDer(PRIVATE_KEY),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"])
  }
  const now=Math.floor(Date.now()/1000)
  const h=b64url(JSON.stringify({alg:"RS256",typ:"JWT"}))
  const p=b64url(JSON.stringify({iat:now-60,exp:now+540,iss:APP_ID}))
  const input=h+"."+p
  const signature=new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",await appKeyPromise,new TextEncoder().encode(input)))
  return input+"."+b64url(signature)
}
async function appRequest(path: string, init: RequestInit = {}) {
  const response=await fetch("https://api.github.com"+path,{
    ...init,
    headers:{
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"CreativeZone-Community/2.0",
      Authorization:"Bearer "+await appJwt(),
      ...(init.headers||{}),
    },
  })
  const data=await response.json().catch(()=>({}))
  if(!response.ok) throw new Error(compact(data?.message || ("GitHub HTTP "+response.status),400))
  return data
}
async function organizationInstallation() {
  const list=await appRequest("/app/installations?per_page=100")
  return (Array.isArray(list)?list:[]).find((item: any)=>String(item?.account?.login||"").toLowerCase()===ORG.toLowerCase()) || null
}
async function installationToken(id: number) {
  const data=await appRequest("/app/installations/"+id+"/access_tokens",{method:"POST"})
  if(!data?.token) throw new Error("Não foi possível gerar token da instalação da organização.")
  return String(data.token)
}
async function inviteToOrganization(username: string) {
  const installation=await organizationInstallation()
  if(!installation?.id) {
    throw new Error("Instale o CreativeZone DevHub na organização "+ORG+" antes de aprovar membros.")
  }
  const token=await installationToken(Number(installation.id))
  const response=await fetch("https://api.github.com/orgs/"+encodeURIComponent(ORG)+"/memberships/"+encodeURIComponent(username),{
    method:"PUT",
    headers:{
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"CreativeZone-Community/2.0",
      Authorization:"Bearer "+token,
      "Content-Type":"application/json",
    },
    body:JSON.stringify({role:"member"}),
  })
  const data=await response.json().catch(()=>({}))
  if(!response.ok){
    if(response.status===403){
      throw new Error("O GitHub App precisa da permissão Organization members: Read and write para enviar o convite automaticamente.")
    }
    throw new Error(compact(data?.message || ("GitHub HTTP "+response.status),400))
  }
  return data
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
  let appStatus: Record<string, unknown> | null = null

  if (staff.staff) {
    try {
      const installation = await organizationInstallation()
      const permissions = (installation?.permissions || {}) as Record<string, unknown>
      appStatus = {
        installed: Boolean(installation?.id),
        installation_id: installation?.id || null,
        permissions,
        members_write: String(permissions.members || "") === "write",
        contents_write: String(permissions.contents || "") === "write",
        pull_requests_write: String(permissions.pull_requests || "") === "write",
      }
    } catch (error) {
      appStatus = { installed:false, error: error instanceof Error ? error.message : "Não foi possível verificar o GitHub App." }
    }
  }

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
    app_status: appStatus,
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
