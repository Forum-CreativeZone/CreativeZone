import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.117.2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || ""
const APP_ID = Deno.env.get("GITHUB_APP_ID") || ""
const PRIVATE_KEY = Deno.env.get("GITHUB_PRIVATE_KEY") || ""
const COMMUNITY_ORG = "Creatiive-Zone"

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

function compact(value: unknown, max = 300) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

function validRepoName(value: unknown) {
  const name = String(value || "").trim()
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new Error("Nome de repositório inválido.")
  return name
}


function concatBytes(...arrays: Uint8Array[]) {
  const size=arrays.reduce((sum,item)=>sum+item.length,0)
  const out=new Uint8Array(size);let offset=0
  for(const item of arrays){out.set(item,offset);offset+=item.length}
  return out
}
function derLength(length:number){if(length<128)return new Uint8Array([length]);const bytes:number[]=[];let value=length;while(value>0){bytes.unshift(value&255);value>>>=8}return new Uint8Array([0x80|bytes.length,...bytes])}
function derWrap(tag:number,content:Uint8Array){return concatBytes(new Uint8Array([tag]),derLength(content.length),content)}
function base64Bytes(value:string){const binary=atob(value.replace(/\s+/g,""));return Uint8Array.from(binary,(char)=>char.charCodeAt(0))}
function privateKeyDer(pem:string){
  const clean=pem.trim()
  if(clean.includes("BEGIN PRIVATE KEY")) return base64Bytes(clean.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g,""))
  if(!clean.includes("BEGIN RSA PRIVATE KEY")) throw new Error("Formato da chave privada do GitHub App inválido.")
  const pkcs1=base64Bytes(clean.replace(/-----BEGIN RSA PRIVATE KEY-----|-----END RSA PRIVATE KEY-----/g,""))
  const version=new Uint8Array([0x02,0x01,0x00])
  const rsaOid=new Uint8Array([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00])
  return derWrap(0x30,concatBytes(version,rsaOid,derWrap(0x04,pkcs1)))
}
function b64url(value:Uint8Array|string){const bytes=typeof value==="string"?new TextEncoder().encode(value):value;let binary="";bytes.forEach((item)=>{binary+=String.fromCharCode(item)});return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
let appKeyPromise:Promise<CryptoKey>|null=null
async function appJwt(){
  if(!APP_ID||!PRIVATE_KEY) throw new Error("GitHub App não configurado.")
  if(!appKeyPromise) appKeyPromise=crypto.subtle.importKey("pkcs8",privateKeyDer(PRIVATE_KEY),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"])
  const now=Math.floor(Date.now()/1000)
  const h=b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));const p=b64url(JSON.stringify({iat:now-60,exp:now+540,iss:APP_ID}));const input=h+"."+p
  const signature=new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",await appKeyPromise,new TextEncoder().encode(input)))
  return input+"."+b64url(signature)
}
async function appRequest(path:string,init:RequestInit={}){
  const response=await fetch("https://api.github.com"+path,{...init,headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"CreativeZone-DevHub/2.0",Authorization:"Bearer "+await appJwt(),...(init.headers||{})}})
  const data=await response.json().catch(()=>({}))
  if(!response.ok){const error=new Error(compact(data?.message||("GitHub HTTP "+response.status),400));(error as any).status=response.status;throw error}
  return data
}
async function organizationInstallation(){
  const list=await appRequest("/app/installations?per_page=100")
  return (Array.isArray(list)?list:[]).find((item:any)=>String(item?.account?.login||"").toLowerCase()===COMMUNITY_ORG.toLowerCase())||null
}
async function organizationInstallationToken(){
  const installation=await organizationInstallation()
  if(!installation?.id) throw new Error("Instale o CreativeZone DevHub na organização "+COMMUNITY_ORG+".")
  const data=await appRequest("/app/installations/"+installation.id+"/access_tokens",{method:"POST"})
  if(!data?.token) throw new Error("Não foi possível gerar token da instalação da organização.")
  return String(data.token)
}

async function authUser(req: Request) {
  const authorization = req.headers.get("authorization") || ""
  if (!authorization || !ANON_KEY) return null
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const token = authorization.replace(/^Bearer\s+/i, "")
  const { data, error } = await client.auth.getUser(token)
  if (error) return null
  return data?.user || null
}

async function github(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CreativeZone-DevHub/2.0 (+https://forum.creativezone.pro/)",
      Authorization: "Bearer " + token,
      ...(init.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(compact(data?.message || ("GitHub HTTP " + response.status), 400))
    ;(error as any).status = response.status
    ;(error as any).github = data
    throw error
  }
  return data
}

async function credentialFor(userId: string) {
  const { data, error } = await admin.rpc("get_github_user_credential", { p_user_id: userId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.access_token) throw new Error("Conecte sua conta GitHub ao CreativeZone.")
  return { token: String(row.access_token), scopes: row.scopes || [] }
}

async function isStaff(userId: string) {
  const { data } = await admin.from("profiles").select("role,system_owner").eq("id", userId).maybeSingle()
  return Boolean(data?.system_owner || ["admin","moderator"].includes(String(data?.role || "")))
}


async function devHubPlanForUser(userId: string) {
  const [{data:profile},{data:membership}]=await Promise.all([
    admin.from("profiles").select("system_owner").eq("id",userId).maybeSingle(),
    admin.from("user_memberships").select("plan_id,status,permanent,ends_at").eq("user_id",userId).maybeSingle(),
  ])
  if(profile?.system_owner){
    const {data:elite}=await admin.from("membership_plans").select("entitlements").eq("id","elite").maybeSingle()
    return {plan_id:"owner",rank:99,capabilities:{...(elite?.entitlements?.github_devhub||{}),repository_limit:-1,private_repository:true}}
  }
  let planId="free"
  const active=membership?.status==="active" && (membership?.permanent || !membership?.ends_at || new Date(membership.ends_at).getTime()>Date.now())
  if(active && membership?.plan_id) planId=String(membership.plan_id)
  const {data:plan}=await admin.from("membership_plans").select("id,rank,entitlements").eq("id",planId).maybeSingle()
  return {plan_id:plan?.id||"free",rank:Number(plan?.rank||0),capabilities:plan?.entitlements?.github_devhub||{}}
}

async function enforceRepositoryEntitlement(userId: string, projectId: string, isPrivate: boolean) {
  const plan=await devHubPlanForUser(userId)
  if(isPrivate && !plan.capabilities?.private_repository){
    throw new Error("Repositórios privados fazem parte do plano CreativeZone ELITE.")
  }
  const limit=Number(plan.capabilities?.repository_limit ?? 1)
  const {data:existing}=await admin.from("github_devhub_repositories").select("id").eq("project_id",projectId).maybeSingle()
  if(!existing && limit>=0){
    const {count,error}=await admin.from("github_devhub_repositories")
      .select("id",{count:"exact",head:true})
      .eq("user_id",userId)
      .eq("status","active")
    if(error) throw error
    if(Number(count||0)>=limit){
      throw new Error("Seu plano "+String(plan.plan_id).toUpperCase()+" permite até "+limit+" repositório(s) no DevHub.")
    }
  }
  return plan
}

async function projectForUser(userId: string, projectId: string) {
  const { data: project } = await admin.from("projects")
    .select("id,owner_id,title,repo_url")
    .eq("id", projectId)
    .maybeSingle()
  if (!project) throw new Error("Projeto não encontrado.")
  if (project.owner_id !== userId && !(await isStaff(userId))) {
    throw new Error("Apenas o proprietário do projeto pode definir o repositório principal.")
  }
  return project
}

async function connectionStatus(user: any) {
  const [{ data: connection }, plan, usage] = await Promise.all([
    admin.from("github_connections")
      .select("github_username,github_user_id,avatar_url,profile_url,account_type,scopes,connected_at,last_verified_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    devHubPlanForUser(user.id),
    admin.from("github_devhub_repositories")
      .select("id",{count:"exact",head:true})
      .eq("user_id",user.id)
      .eq("status","active"),
  ])

  const githubIdentity = (user.identities || []).find((identity: any) => identity.provider === "github")
  return {
    connected: Boolean(connection?.github_username),
    connection: connection || null,
    organization_access:{
      scope_authorized:Boolean(connection?.scopes?.includes?.("read:org")||connection?.scopes?.includes?.("admin:org")),
      required_scope:"read:org",
    },
    plan,
    repository_usage: Number(usage.count || 0),
    identity_linked: Boolean(githubIdentity),
    identity: githubIdentity ? {
      id: githubIdentity.id,
      provider: githubIdentity.provider,
      username: githubIdentity.identity_data?.user_name || githubIdentity.identity_data?.preferred_username || null,
      avatar_url: githubIdentity.identity_data?.avatar_url || null,
    } : null,
  }
}

async function capture(req: Request, payload: Record<string, unknown>) {
  const user = await authUser(req)
  if (!user) throw new Error("Entre na sua conta para conectar o GitHub.")
  const accessToken = String(payload.access_token || "").trim()
  if (!accessToken) throw new Error("O GitHub não retornou um token para esta sessão.")

  const profileResponse=await fetch("https://api.github.com/user",{
    headers:{
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2026-03-10",
      "User-Agent":"CreativeZone-DevHub/2.0 (+https://forum.creativezone.pro/)",
      Authorization:"Bearer "+accessToken,
    },
  })
  const profile=await profileResponse.json().catch(()=>({}))
  if(!profileResponse.ok) throw new Error(compact(profile?.message || ("GitHub HTTP "+profileResponse.status),400))
  const actualScopeHeader=String(profileResponse.headers.get("x-oauth-scopes")||"")
  const requestedScopeHeader=String(payload.scopes||"")
  const scopeHeader=actualScopeHeader || requestedScopeHeader
  const scopes=scopeHeader.split(/[ ,]+/).map((value)=>value.trim()).filter(Boolean)

  const { error: tokenError } = await admin.rpc("store_github_user_credential", {
    p_user_id: user.id,
    p_access_token: accessToken,
    p_scopes: scopes,
  })
  if (tokenError) throw tokenError

  const connection = {
    user_id: user.id,
    github_username: String(profile.login || ""),
    github_user_id: Number(profile.id || 0) || null,
    avatar_url: profile.avatar_url || null,
    profile_url: profile.html_url || null,
    account_type: profile.type || "User",
    scopes,
    connected_via: "supabase_oauth",
    connected_at: new Date().toISOString(),
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin.from("github_connections").upsert(connection, { onConflict: "user_id" })
  if (error) throw error

  let orgMembership:any=null
  let orgMembershipError:string|null=null
  try{
    orgMembership=await github("/user/memberships/orgs/"+encodeURIComponent(COMMUNITY_ORG),accessToken)
  }catch(error){
    const status=(error as any)?.status
    if(status!==404){
      orgMembershipError=(error as Error).message
      console.warn("membership_check_failed",orgMembershipError)
    }
  }
  const orgScopeAuthorized=scopes.includes("read:org")||scopes.includes("admin:org")

  return {
    connected:true,
    connection: {
      github_username: connection.github_username,
      github_user_id: connection.github_user_id,
      avatar_url: connection.avatar_url,
      profile_url: connection.profile_url,
      account_type: connection.account_type,
      scopes,
      connected_at: connection.connected_at,
      last_verified_at: connection.last_verified_at,
    },
    organization_membership:orgMembership?{
      state:orgMembership.state||null,
      role:orgMembership.role||null,
      organization:COMMUNITY_ORG,
    }:null,
    organization_access:{
      authorized:orgScopeAuthorized&&!orgMembershipError,
      scope_authorized:orgScopeAuthorized,
      error:orgMembershipError,
      required_scope:"read:org",
    },
  }
}

async function disconnect(req: Request) {
  const user = await authUser(req)
  if (!user) throw new Error("Autenticação necessária.")
  await admin.rpc("delete_github_user_credential", { p_user_id: user.id })
  await admin.from("github_connections").delete().eq("user_id", user.id)
  return { disconnected: true }
}

async function listRepositories(req: Request) {
  const user = await authUser(req)
  if (!user) throw new Error("Entre na sua conta para listar repositórios.")
  const { token } = await credentialFor(user.id)
  const repos = await github("/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", token)
  return {
    repositories: (Array.isArray(repos) ? repos : []).map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      html_url: repo.html_url,
      owner: repo.owner?.login,
      owner_type: repo.owner?.type,
      private: Boolean(repo.private),
      visibility: repo.visibility,
      default_branch: repo.default_branch,
      description: repo.description,
      permissions: repo.permissions || {},
      updated_at: repo.updated_at,
    })),
  }
}

async function organizationMembership(req: Request) {
  const user = await authUser(req)
  if (!user) throw new Error("Entre na sua conta para verificar a organização.")
  const { token, scopes } = await credentialFor(user.id)
  try {
    const membership = await github("/user/memberships/orgs/" + encodeURIComponent(COMMUNITY_ORG), token)
    return {
      organization: COMMUNITY_ORG,
      member: membership?.state === "active",
      state: membership?.state || null,
      role: membership?.role || null,
      authorized: true,
      error: null,
    }
  } catch (error) {
    const status=(error as any)?.status
    if (status === 404) {
      return { organization: COMMUNITY_ORG, member: false, state: null, role: null, authorized:true, error:null }
    }
    if (status === 403) {
      const message=(error as Error).message || "A organização bloqueou o acesso do OAuth App."
      const scopeAuthorized=Array.isArray(scopes)&&(scopes.includes("read:org")||scopes.includes("admin:org"))
      return {
        organization: COMMUNITY_ORG,
        member: null,
        state: null,
        role: null,
        authorized: false,
        scope_authorized: scopeAuthorized,
        restriction_type: scopeAuthorized ? "oauth_app_access_restriction" : "organization_access_denied",
        authorization_url: scopeAuthorized ? "https://github.com/organizations/"+COMMUNITY_ORG+"/settings/oauth_application_policy" : null,
        error: message,
      }
    }
    throw error
  }
}

async function recordAction(userId: string, repositoryId: string | null, actionType: string, payload: any, status: string, result: any = {}, error: string | null = null) {
  await admin.from("github_devhub_actions").insert({
    user_id: userId,
    repository_id: repositoryId,
    action_type: actionType,
    payload,
    status,
    result,
    error,
    completed_at: status === "completed" || status === "failed" ? new Date().toISOString() : null,
  })
}

async function linkRepository(project: any, userId: string, repo: any, ownerType: string) {
  const row = {
    user_id: userId,
    project_id: project.id,
    github_repository_id: Number(repo.id || 0) || null,
    owner_type: ownerType,
    owner_login: repo.owner?.login || null,
    repository_name: repo.name,
    repository_url: repo.html_url,
    private: Boolean(repo.private),
    default_branch: repo.default_branch || "main",
    status: "active",
    metadata: {
      visibility: repo.visibility,
      description: repo.description,
      created_at: repo.created_at,
      updated_at: repo.updated_at,
    },
    updated_at: new Date().toISOString(),
  }

  const { data: devhubRepo, error: devhubError } = await admin.from("github_devhub_repositories")
    .upsert(row, { onConflict: "project_id" })
    .select("*")
    .single()
  if (devhubError) throw devhubError

  await admin.from("projects").update({
    repo_url: repo.html_url,
    updated_at: new Date().toISOString(),
  }).eq("id", project.id)

  const existing = {
    project_id: project.id,
    repository_provider: "github",
    repo_owner: repo.owner?.login,
    repo_name: repo.name,
    repo_url: repo.html_url,
    default_branch: repo.default_branch || "main",
    github_repository_id: Number(repo.id || 0) || null,
    is_private: Boolean(repo.private),
    visibility: repo.visibility,
    description: repo.description,
    owner_avatar_url: repo.owner?.avatar_url || null,
    sync_status: "pending",
    updated_at: new Date().toISOString(),
  }
  await admin.from("project_repositories").upsert(existing, {
    onConflict: "project_id,repository_provider,repo_owner,repo_name",
  })

  return devhubRepo
}

async function createRepository(req: Request, payload: Record<string, unknown>) {
  const user = await authUser(req)
  if (!user) throw new Error("Entre na sua conta para criar um repositório.")
  const projectId = String(payload.project_id || "")
  if (!projectId) throw new Error("Projeto não informado.")
  const project = await projectForUser(user.id, projectId)
  const { token } = await credentialFor(user.id)

  const target = String(payload.target || "personal")
  if (!["personal","organization"].includes(target)) throw new Error("Destino do repositório inválido.")
  const name = validRepoName(payload.name)
  const description = compact(payload.description || project.title || "", 350)
  const isPrivate = Boolean(payload.private)
  const plan = await enforceRepositoryEntitlement(user.id, projectId, isPrivate)

  let ownerLogin = ""
  let endpoint = "/user/repos"

  if (target === "organization") {
    const membership = await organizationMembership(req)
    if (!membership.member) {
      return {
        created: false,
        needs_organization_membership: true,
        organization: COMMUNITY_ORG,
        membership,
      }
    }
    ownerLogin = COMMUNITY_ORG
    endpoint = "/orgs/" + encodeURIComponent(COMMUNITY_ORG) + "/repos"
  }

  const body: Record<string, unknown> = {
    name,
    description,
    private: isPrivate,
    auto_init: payload.auto_init !== false,
    has_issues: true,
    has_projects: true,
    has_wiki: false,
  }
  const gitignore = String(payload.gitignore_template || "").trim()
  const license = String(payload.license_template || "").trim()
  if (gitignore) body.gitignore_template = gitignore
  if (license && !isPrivate) body.license_template = license

  try {
    let repo
    try {
      repo = await github(endpoint, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } catch (userCreateError) {
      if (target !== "organization" || (userCreateError as any)?.status !== 403) throw userCreateError
      let appToken = ""
      try {
        appToken = await organizationInstallationToken()
      } catch {
        throw new Error("Sua participação está ativa, mas a organização não permite que sua conta crie repositórios. Instale o CreativeZone DevHub na organização e habilite Repository administration: Read and write para criação centralizada pelo fórum.")
      }
      try {
        repo = await github(endpoint, appToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } catch (appCreateError) {
        if ((appCreateError as any)?.status === 403) {
          throw new Error("O GitHub App precisa de Repository administration: Read and write para criar repositórios da organização pelo fórum.")
        }
        throw appCreateError
      }
    }
    ownerLogin = ownerLogin || repo.owner?.login || ""
    const devhubRepo = await linkRepository(project, user.id, repo, target)
    await recordAction(user.id, devhubRepo.id, "create_repo", {
      target, name, private: isPrivate,
    }, "completed", { full_name: repo.full_name, html_url: repo.html_url })

    return {
      created: true,
      plan,
      repository: {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: ownerLogin,
        html_url: repo.html_url,
        private: Boolean(repo.private),
        default_branch: repo.default_branch || "main",
      },
    }
  } catch (error) {
    await recordAction(user.id, null, "create_repo", {
      target, name, private: isPrivate,
    }, "failed", {}, (error as Error).message)
    throw error
  }
}

async function connectExisting(req: Request, payload: Record<string, unknown>) {
  const user = await authUser(req)
  if (!user) throw new Error("Entre na sua conta para conectar um repositório.")
  const projectId = String(payload.project_id || "")
  const fullName = String(payload.full_name || "").trim()
  if (!projectId || !/^[^/\s]+\/[^/\s]+$/.test(fullName)) throw new Error("Repositório inválido.")
  const project = await projectForUser(user.id, projectId)
  const { token } = await credentialFor(user.id)
  const repo = await github("/repos/" + fullName.split("/").map(encodeURIComponent).join("/"), token)
  const plan = await enforceRepositoryEntitlement(user.id, projectId, Boolean(repo.private))
  const canPush = Boolean(repo.permissions?.push || repo.permissions?.admin || repo.permissions?.maintain)
  if (!canPush) throw new Error("Sua conta GitHub não possui permissão de escrita neste repositório.")
  const ownerType = String(repo.owner?.type || "").toLowerCase() === "organization" ? "organization" : "personal"
  const devhubRepo = await linkRepository(project, user.id, repo, ownerType)
  await recordAction(user.id, devhubRepo.id, "sync", { full_name: fullName }, "completed", { connected: true })
  return { connected: true, plan, repository: { full_name: repo.full_name, html_url: repo.html_url, private: Boolean(repo.private) } }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405)
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return reply({ error: "github_auth_unavailable" }, 503)

  let payload: Record<string, unknown> = {}
  try { payload = await req.json() } catch {}
  const action = String(payload.action || "status")

  try {
    const user = await authUser(req)
    if (!user) return reply({ error: "Autenticação necessária." }, 401)

    if (action === "status") return reply({ ok: true, ...(await connectionStatus(user)) })
    if (action === "capture") return reply({ ok: true, ...(await capture(req, payload)) })
    if (action === "disconnect") return reply({ ok: true, ...(await disconnect(req)) })
    if (action === "repositories") return reply({ ok: true, ...(await listRepositories(req)) })
    if (action === "organization_membership") return reply({ ok: true, ...(await organizationMembership(req)) })
    if (action === "create_repository") return reply({ ok: true, ...(await createRepository(req, payload)) })
    if (action === "connect_existing") return reply({ ok: true, ...(await connectExisting(req, payload)) })
    return reply({ error: "unsupported_action" }, 400)
  } catch (error) {
    console.error("github-auth:", (error as Error).message)
    const message = error instanceof Error ? error.message : "Falha na integração GitHub."
    const status = /Autenticação|Entre na sua conta/i.test(message) ? 401 :
      /Apenas|permissão/i.test(message) ? 403 : 400
    return reply({ error: message }, status)
  }
})
