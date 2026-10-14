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
async function githubTokenRequest(path: string, token: string, init: RequestInit = {}) {
  const response=await fetch("https://api.github.com"+path,{
    ...init,
    headers:{
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"CreativeZone-Community/2.0",
      Authorization:"Bearer "+token,
      ...(init.headers||{}),
    },
  })
  const data=await response.json().catch(()=>({}))
  if(!response.ok){
    const error=new Error(compact(data?.message || ("GitHub HTTP "+response.status),400))
    ;(error as Error & {status?:number}).status=response.status
    throw error
  }
  return data
}

async function userGithubToken(userId: string) {
  const { data, error } = await admin.rpc("get_github_user_credential", { p_user_id:userId })
  if(error) throw error
  const row=Array.isArray(data)?data[0]:data
  return row?.access_token?String(row.access_token):""
}

async function connectedGithubIdentity(userId: string) {
  const token=await userGithubToken(userId)
  if(!token) return {token:"",user:null,membership:null}
  const ghUser=await githubTokenRequest("/user",token).catch(()=>null)
  let membership=null
  try{
    membership=await githubTokenRequest("/user/memberships/orgs/"+encodeURIComponent(ORG),token)
  }catch(error){
    const status=(error as Error & {status?:number})?.status
    if(status!==404) console.warn("github membership check:", error)
  }
  return {token,user:ghUser,membership}
}

async function organizationInvitations(installationId: number) {
  const token=await installationToken(installationId)
  const data=await githubTokenRequest("/orgs/"+encodeURIComponent(ORG)+"/invitations?per_page=100",token)
  return Array.isArray(data)?data:[]
}


async function githubTokenPages(path: string, token: string, maxPages=10) {
  const items:any[]=[]
  for(let page=1;page<=maxPages;page++){
    const separator=path.includes("?")?"&":"?"
    const data=await githubTokenRequest(path+separator+"per_page=100&page="+page,token)
    if(!Array.isArray(data)) break
    items.push(...data)
    if(data.length<100) break
  }
  return items
}

async function syncOrganizationTruth(installation:any, fallbackToken="", source="github_app") {
  const now=new Date().toISOString()
  const installationId=Number(installation?.id||0)
  const permissions=(installation?.permissions||{}) as Record<string,unknown>
  const membersPermission=String(permissions.members||"")
  const appCanRead=membersPermission==="read"||membersPermission==="write"
  if(!appCanRead&&!fallbackToken){
    return {available:false,requires_authorization:true,source:null,members:[],invitations:[],member_count:0,invitation_count:0,synced_at:null}
  }

  try{
    const token=appCanRead&&installationId?await installationToken(installationId):fallbackToken
    const effectiveSource=appCanRead&&installationId?"github_app":source
    const [membersResult,{data:connections},{data:requests}]=await Promise.all([
      githubTokenPages("/orgs/"+encodeURIComponent(ORG)+"/members?filter=all&role=all",token),
      admin.from("github_connections").select("user_id,github_username,github_user_id,avatar_url,profile_url").not("github_username","is",null),
      admin.from("github_org_membership_requests")
        .select("id,user_id,github_username,status,github_membership_role")
        .eq("organization",ORG)
        .in("status",["pending","approved","invited","joined"]),
    ])
    const members=Array.isArray(membersResult)?membersResult:[]
    let invitations:any[]=[]
    let invitationsAvailable=true
    let invitationsError:string|null=null
    try{
      invitations=await githubTokenPages("/orgs/"+encodeURIComponent(ORG)+"/invitations",token)
    }catch(error){
      invitationsAvailable=false
      invitationsError=error instanceof Error?error.message:"Convites da organização não disponíveis."
      console.warn("github invitations truth sync:",invitationsError)
    }

    const activeLogins=new Set(members.map((item:any)=>String(item?.login||"").toLowerCase()).filter(Boolean))
    const inviteByLogin=new Map<string,any>()
    for(const item of invitations){
      const login=String(item?.login||item?.invitee?.login||"").toLowerCase()
      if(login) inviteByLogin.set(login,item)
    }

    const connectedByLogin=new Map<string,any>()
    for(const item of connections||[]){
      const login=String(item.github_username||"").toLowerCase()
      if(login) connectedByLogin.set(login,item)
    }

    const profileIds=[...new Set((connections||[]).map((item:any)=>String(item.user_id||"")).filter(Boolean))]
    let profiles:any[]=[]
    if(profileIds.length){
      const result=await admin.from("profiles").select("id,username,display_name,avatar_url,system_owner").in("id",profileIds)
      profiles=result.data||[]
    }
    const profileById=new Map(profiles.map((item:any)=>[String(item.id),item]))

    const roleTargets=new Set<string>()
    for(const item of connections||[]){
      const login=String(item.github_username||"").toLowerCase()
      if(login&&activeLogins.has(login)) roleTargets.add(login)
    }
    for(const item of requests||[]){
      const login=String(item.github_username||"").toLowerCase()
      if(login&&activeLogins.has(login)) roleTargets.add(login)
    }

    const roleByLogin=new Map<string,string>()
    for(const login of [...roleTargets].slice(0,100)){
      try{
        const membership=await githubTokenRequest("/orgs/"+encodeURIComponent(ORG)+"/memberships/"+encodeURIComponent(login),token)
        if(String(membership?.state||"")==="active") roleByLogin.set(login,String(membership?.role||"member"))
      }catch(error){
        console.warn("github member role sync:",login,error)
      }
    }

    for(const item of requests||[]){
      const login=String(item.github_username||"").toLowerCase()
      if(!login) continue
      if(activeLogins.has(login)){
        await admin.from("github_org_membership_requests").update({
          status:"joined",
          github_membership_state:"active",
          github_membership_role:roleByLogin.get(login)||item.github_membership_role||"member",
          github_invitation_id:null,
          github_invitation_created_at:null,
          membership_verified_at:now,
          last_github_sync_at:now,
          invite_error:null,
          updated_at:now,
        }).eq("id",item.id)
      }else if(inviteByLogin.has(login)){
        const invite=inviteByLogin.get(login)
        await admin.from("github_org_membership_requests").update({
          status:"invited",
          github_membership_state:"pending",
          github_invitation_id:Number(invite?.id||0)||null,
          github_invitation_created_at:invite?.created_at||null,
          membership_verified_at:now,
          last_github_sync_at:now,
          invite_error:null,
          updated_at:now,
        }).eq("id",item.id)
      }else if(item.status==="invited"||item.status==="joined"){
        await admin.from("github_org_membership_requests").update({
          status:"cancelled",
          github_membership_state:null,
          github_invitation_id:null,
          github_invitation_created_at:null,
          membership_verified_at:now,
          last_github_sync_at:now,
          invite_error:item.status==="joined"
            ?"A conta não aparece mais como membro da organização no GitHub."
            :"O convite não está mais pendente no GitHub.",
          updated_at:now,
        }).eq("id",item.id)
      }else{
        await admin.from("github_org_membership_requests").update({
          membership_verified_at:now,
          last_github_sync_at:now,
          updated_at:now,
        }).eq("id",item.id)
      }
    }

    await admin.from("github_org_sync_state").upsert({
      organization:ORG,
      installation_id:installationId,
      members_count:members.length,
      invitations_count:invitations.length,
      sync_status:"ok",
      last_error:invitationsError,
      last_synced_at:now,
      updated_at:now,
    },{onConflict:"organization"})

    return {
      available:true,
      source:effectiveSource,
      requires_authorization:false,
      invitations_available:invitationsAvailable,
      invitations_error:invitationsError,
      members:members.map((item:any)=>{
        const login=String(item?.login||"")
        const key=login.toLowerCase()
        const connection=connectedByLogin.get(key)
        const profile=connection?profileById.get(String(connection.user_id)):null
        return {
          id:item?.id||null,
          login,
          avatar_url:item?.avatar_url||"",
          html_url:item?.html_url||("https://github.com/"+login),
          role:roleByLogin.get(key)||null,
          forum_profile:profile?{
            id:profile.id,
            username:profile.username,
            display_name:profile.display_name,
            avatar_url:profile.avatar_url,
            system_owner:Boolean(profile.system_owner),
          }:null,
        }
      }),
      invitations:invitations.map((item:any)=>({
        id:item?.id||null,
        login:item?.login||item?.invitee?.login||null,
        avatar_url:item?.invitee?.avatar_url||null,
        html_url:item?.invitee?.html_url||null,
        role:item?.role||"direct_member",
        created_at:item?.created_at||null,
        invitation_teams_url:item?.invitation_teams_url||null,
        forum_profile:(()=>{
          const connection=connectedByLogin.get(String(item?.login||item?.invitee?.login||"").toLowerCase())
          const profile=connection?profileById.get(String(connection.user_id)):null
          return profile?{id:profile.id,username:profile.username,display_name:profile.display_name,avatar_url:profile.avatar_url}:null
        })(),
      })),
      member_count:members.length,
      invitation_count:invitations.length,
      synced_at:now,
    }
  }catch(error){
    const message=error instanceof Error?error.message:"Falha ao sincronizar a organização GitHub."
    await admin.from("github_org_sync_state").upsert({
      organization:ORG,
      installation_id:installationId||null,
      sync_status:"error",
      last_error:compact(message,800),
      updated_at:now,
    },{onConflict:"organization"})
    throw error
  }
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

  let request:any = null
  let staffRequests: Record<string, unknown>[] = []
  let appStatus: Record<string, unknown> | null = null
  let viewerMembership: Record<string, unknown> | null = null
  let githubInvitations: Record<string, unknown>[] = []
  let githubMembers: Record<string, unknown>[] = []
  let githubSync:any={available:false,member_count:0,invitation_count:0,synced_at:null}
  let installation:any=null

  if (staff.staff) {
    try {
      installation = await organizationInstallation()
      const permissions = (installation?.permissions || {}) as Record<string, unknown>
      const membersPermission=String(permissions.members || "")
      appStatus = {
        installed: Boolean(installation?.id),
        installation_id: installation?.id || null,
        permissions,
        members_read: membersPermission === "read" || membersPermission === "write",
        members_write: membersPermission === "write",
        contents_write: String(permissions.contents || "") === "write",
        pull_requests_write: String(permissions.pull_requests || "") === "write",
        administration_write: String(permissions.administration || "") === "write",
        settings_url: installation?.id
          ? "https://github.com/organizations/" + ORG + "/settings/installations/" + installation.id
          : "https://github.com/organizations/" + ORG + "/settings/installations",
      }

      if(installation?.id){
        try{
          let fallbackToken=""
          if(!appStatus.members_read&&user?.id){
            fallbackToken=await userGithubToken(user.id).catch(()=>"")
          }
          githubSync=await syncOrganizationTruth(installation,fallbackToken,fallbackToken?"owner_oauth":"github_app")
          githubInvitations=githubSync.invitations||[]
          githubMembers=githubSync.members||[]
          if(!githubSync.available&&!appStatus.members_read){
            appStatus.sync_error="Autorize read:org na conta GitHub do proprietário ou habilite Organization members: Read no GitHub App."
          }
        }catch(error){
          appStatus.sync_error=error instanceof Error?error.message:"Falha ao sincronizar membros e convites."
          githubSync={available:false,requires_authorization:true,source:null,members:[],invitations:[],member_count:0,invitation_count:0,synced_at:null,error:appStatus.sync_error}
          console.warn("github organization truth sync:",error)
        }
      }
    } catch (error) {
      appStatus = { installed:false, error: error instanceof Error ? error.message : "Não foi possível verificar o GitHub App." }
    }
  }

  if (user?.id) {
    try{
      const identity=await connectedGithubIdentity(user.id)
      const membership=identity.membership as Record<string,unknown> | null
      if(membership){
        viewerMembership={
          state:String(membership.state || ""),
          role:String(membership.role || "member"),
          organization:ORG,
          github_username:String((identity.user as any)?.login || ""),
          html_url:String(membership.organization?.html_url || ("https://github.com/"+ORG)),
        }
      }
      if(String(membership?.state || "") === "active"){
        await admin
          .from("github_org_membership_requests")
          .update({
            status:"joined",
            github_membership_state:"active",
            github_membership_role:String(membership?.role || "member"),
            membership_verified_at:new Date().toISOString(),
            invite_error:null,
            updated_at:new Date().toISOString(),
          })
          .eq("user_id",user.id)
          .eq("organization",ORG)
          .in("status",["pending","approved","invited"])
      }
    }catch(error){
      console.warn("viewer github membership sync:",error)
    }

    const { data } = await admin
      .from("github_org_membership_requests")
      .select("id,github_username,message,status,created_at,reviewed_at,updated_at,invite_error,github_membership_state,github_membership_role,membership_verified_at,github_invitation_id,github_invitation_created_at,last_github_sync_at")
      .eq("user_id", user.id)
      .eq("organization", ORG)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    request = data || null
  }

  if (staff.staff) {
    let staffQuery = admin
      .from("github_org_membership_requests")
      .select("id,user_id,organization,github_username,message,status,created_at,reviewed_at,invite_error,github_membership_state,github_membership_role,membership_verified_at,github_invitation_id,github_invitation_created_at,last_github_sync_at,profile:profiles!github_org_membership_requests_user_id_fkey(id,username,display_name,avatar_url)")
      .eq("organization", ORG)
      .in("status", ["pending","approved"])
      .order("created_at", { ascending: true })
      .limit(50)
    if (staff.system_owner && user?.id) staffQuery = staffQuery.neq("user_id", user.id)
    const { data } = await staffQuery
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
    viewer_membership:viewerMembership,
    is_staff: staff.staff,
    is_system_owner: staff.system_owner,
    staff_requests: staffRequests,
    github_members:staff.staff?githubMembers:[],
    github_invitations:staff.staff?githubInvitations:[],
    github_sync:staff.staff?githubSync:null,
    app_status: appStatus,
  }
}

async function requestMembership(req: Request, payload: Record<string, unknown>) {
  const user = await authUser(req)
  if (!user) throw new Error("Entre na sua conta para solicitar participação na organização.")

  const message = compact(payload.message || "", 1000)
  const identity=await connectedGithubIdentity(user.id)
  if(!identity.token || !identity.user){
    throw new Error("Conecte sua conta GitHub ao CreativeZone antes de solicitar participação na organização.")
  }

  const githubUsername=String((identity.user as any)?.login || "").trim()
  if(!githubUsername) throw new Error("Não foi possível identificar sua conta GitHub conectada.")

  if(String((identity.membership as any)?.state || "") === "active"){
    throw new Error("Sua conta GitHub já faz parte da organização CreativeZone.")
  }

  const { data: pending } = await admin
    .from("github_org_membership_requests")
    .select("id,status")
    .eq("user_id", user.id)
    .eq("organization", ORG)
    .in("status",["pending","approved","invited"])
    .maybeSingle()

  if (pending) throw new Error("Você já possui um pedido ou convite em andamento.")

  const { data: requestRow, error } = await admin
    .from("github_org_membership_requests")
    .insert({
      user_id: user.id,
      organization: ORG,
      github_username: githubUsername,
      message,
      status: "pending",
      membership_verified_at:new Date().toISOString(),
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
      owners
        .filter((owner:Record<string,unknown>)=>String(owner.id)!==String(user.id))
        .map((owner: Record<string, unknown>) => ({
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
      login: (identity.user as any)?.login,
      avatar_url: (identity.user as any)?.avatar_url,
      html_url: (identity.user as any)?.html_url,
    },
  }
}

async function reviewMembership(req: Request, payload: Record<string, unknown>) {
  const user = await authUser(req)
  if (!user) throw new Error("Autenticação necessária.")

  const staff = await staffState(user.id)
  if (!staff.staff) throw new Error("Apenas a equipe CreativeZone pode revisar estes pedidos.")

  const requestId = String(payload.request_id || "")
  const requestedStatus = String(payload.status || "")
  if (!requestId || !["invited","declined"].includes(requestedStatus)) throw new Error("Revisão inválida.")

  const { data: pendingRow, error: pendingError } = await admin
    .from("github_org_membership_requests")
    .select("id,user_id,github_username,status")
    .eq("id", requestId)
    .eq("organization", ORG)
    .in("status", ["pending","approved"])
    .maybeSingle()

  if (pendingError) throw pendingError
  if (!pendingRow) throw new Error("Pedido não encontrado ou já revisado.")

  let finalStatus = requestedStatus
  let githubMembership: Record<string, unknown> | null = null
  let inviteError: string | null = null
  const attemptedAt = requestedStatus === "invited" ? new Date().toISOString() : null

  if (requestedStatus === "invited") {
    try {
      githubMembership = await inviteToOrganization(String(pendingRow.github_username))
      finalStatus = "invited"
    } catch (error) {
      inviteError = error instanceof Error ? error.message : "O GitHub não aceitou o convite."
      finalStatus = "approved"
      console.warn("github organization invite deferred:", inviteError)
    }
  }

  const reviewedAt = new Date().toISOString()
  const { data: row, error } = await admin
    .from("github_org_membership_requests")
    .update({
      status: finalStatus,
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
      invite_attempted_at: attemptedAt,
      invite_error: inviteError,
      github_membership_state: githubMembership?.state || null,
    })
    .eq("id", requestId)
    .eq("organization", ORG)
    .in("status", ["pending","approved"])
    .select("id,user_id,github_username,status,invite_error,invite_attempted_at,github_membership_state")
    .maybeSingle()

  if (error) throw error
  if (!row) throw new Error("Pedido foi alterado enquanto era revisado. Atualize a página.")

  await admin.from("notifications").insert({
    user_id: row.user_id,
    actor_id: user.id,
    type: "github_org_join_request_updated",
    data: {
      request_id: row.id,
      organization: ORG,
      github_username: row.github_username,
      status: finalStatus,
      github_membership_state: githubMembership?.state || null,
      invite_pending: finalStatus === "approved",
      invite_error: inviteError,
      path: "/projetos",
    },
  })

  return {
    request: row,
    invite_pending: finalStatus === "approved",
    invite_error: inviteError,
    github_membership: githubMembership ? {
      state: githubMembership.state || null,
      role: githubMembership.role || "member",
    } : null,
  }
}

async function sendMembershipInvite(req: Request, payload: Record<string, unknown>) {
  const user = await authUser(req)
  if (!user) throw new Error("Autenticação necessária.")

  const staff = await staffState(user.id)
  if (!staff.staff) throw new Error("Apenas a equipe CreativeZone pode enviar convites.")

  const requestId = String(payload.request_id || "")
  if (!requestId) throw new Error("Pedido inválido.")

  const { data: row, error } = await admin
    .from("github_org_membership_requests")
    .select("id,user_id,github_username,status")
    .eq("id", requestId)
    .eq("organization", ORG)
    .in("status", ["pending","approved"])
    .maybeSingle()
  if (error) throw error
  if (!row) throw new Error("Pedido não encontrado ou convite já processado.")

  let membership: Record<string, unknown>
  try {
    membership = await inviteToOrganization(String(row.github_username))
  } catch (error) {
    const message = error instanceof Error ? error.message : "O GitHub não aceitou o convite."
    await admin.from("github_org_membership_requests").update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      invite_attempted_at: new Date().toISOString(),
      invite_error: message,
    }).eq("id", requestId)
    return {
      sent: false,
      invite_pending: true,
      invite_error: message,
      request: { ...row, status: "approved" },
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await admin
    .from("github_org_membership_requests")
    .update({
      status: "invited",
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now,
      invite_attempted_at: now,
      invite_error: null,
      github_membership_state: membership?.state || "pending",
    })
    .eq("id", requestId)
    .select("id,user_id,github_username,status,github_membership_state")
    .single()
  if (updateError) throw updateError

  await admin.from("notifications").insert({
    user_id: updated.user_id,
    actor_id: user.id,
    type: "github_org_join_request_updated",
    data: {
      request_id: updated.id,
      organization: ORG,
      github_username: updated.github_username,
      status: "invited",
      github_membership_state: membership?.state || "pending",
      path: "/projetos",
    },
  })

  return {
    sent: true,
    invite_pending: false,
    request: updated,
    github_membership: {
      state: membership?.state || "pending",
      role: membership?.role || "member",
    },
  }
}

async function forceOrganizationSync(req:Request){
  const user=await authUser(req)
  if(!user) throw new Error("Autenticação necessária.")
  const staff=await staffState(user.id)
  if(!staff.staff) throw new Error("Apenas a equipe CreativeZone pode sincronizar a organização.")
  return organizationPayload(req)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405)

  let payload: Record<string, unknown> = {}
  try { payload = await req.json() } catch {}
  const action = String(payload.action || "organization")

  try {
    if (action === "organization") return reply({ ok: true, ...(await organizationPayload(req)) })
    if (action === "sync_organization") return reply({ ok: true, ...(await forceOrganizationSync(req)) })
    if (action === "request_membership") return reply({ ok: true, ...(await requestMembership(req, payload)) })
    if (action === "review_membership") return reply({ ok: true, ...(await reviewMembership(req, payload)) })
    if (action === "send_membership_invite") return reply({ ok: true, ...(await sendMembershipInvite(req, payload)) })
    return reply({ error: "unsupported_action" }, 400)
  } catch (error) {
    console.error("github-community:", error)
    const message = error instanceof Error ? error.message : "Falha ao acessar a comunidade GitHub."
    const status = /Entre|Autenticação/.test(message) ? 401 : /equipe|Apenas/.test(message) ? 403 : 400
    return reply({ error: message }, status)
  }
})
