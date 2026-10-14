import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||""
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")||""

const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
  "X-Content-Type-Options":"nosniff",
}

function reply(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{...CORS,"Cache-Control":"no-store"}})
}
function compact(value:unknown,max=2000){
  const text=String(value??"").trim()
  return text.length>max?text.slice(0,max-1)+"…":text
}
function slugify(value:unknown){
  return String(value??"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,80)
}
async function authUser(req:Request){
  const authorization=req.headers.get("authorization")||""
  if(!authorization||!ANON_KEY) return null
  const client=createClient(SUPABASE_URL,ANON_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:authorization}},
  })
  const {data}=await client.auth.getUser()
  return data?.user||null
}
async function profileState(userId:string|null){
  if(!userId) return {profile:null,systemOwner:false,planId:"free",rank:0,elite:false}
  const [{data:profile},{data:membership}]=await Promise.all([
    admin.from("profiles").select("id,username,display_name,avatar_url,system_owner,role").eq("id",userId).maybeSingle(),
    admin.from("user_memberships").select("plan_id,status,permanent,ends_at").eq("user_id",userId).maybeSingle(),
  ])
  const systemOwner=Boolean(profile?.system_owner)
  let planId="free"
  const active=membership?.status==="active" &&
    (membership?.permanent || !membership?.ends_at || new Date(membership.ends_at).getTime()>Date.now())
  if(active&&membership?.plan_id) planId=String(membership.plan_id)
  const {data:plan}=await admin.from("membership_plans").select("rank,entitlements").eq("id",planId).maybeSingle()
  const rank=systemOwner?99:Number(plan?.rank||0)
  const elite=systemOwner || Boolean(plan?.entitlements?.private_teams) || rank>=2
  return {profile,systemOwner,planId,rank,elite,entitlements:plan?.entitlements||{}}
}
async function teamContext(teamId:string,userId:string|null){
  const {data:team,error}=await admin.from("creative_teams").select("*").eq("id",teamId).maybeSingle()
  if(error) throw error
  if(!team) throw new Error("Equipe não encontrada.")
  let member:any=null
  let systemOwner=false
  if(userId){
    const state=await profileState(userId)
    systemOwner=state.systemOwner
    const {data}=await admin.from("creative_team_members")
      .select("team_id,user_id,role,status,joined_at")
      .eq("team_id",teamId).eq("user_id",userId).eq("status","active").maybeSingle()
    member=data||null
  }
  const owner=Boolean(userId&&(team.owner_id===userId||systemOwner))
  const role=systemOwner?"system_owner":owner?"owner":String(member?.role||"")
  const active=Boolean(member||owner||systemOwner)
  const ownerPlan=await profileState(String(team.owner_id))
  const teamEntitled=Boolean(ownerPlan.elite)
  return {team,member,systemOwner,owner,role,active,teamEntitled,ownerPlan}
}
function permissions(role:string,owner=false,systemOwner=false,writeEnabled=true){
  const effective=systemOwner?"system_owner":owner?"owner":role
  const canWrite=systemOwner||writeEnabled
  return {
    role:effective,
    view_private:Boolean(effective),
    team_entitled:canWrite,
    manage_members:canWrite&&["system_owner","owner"].includes(effective),
    invite_members:canWrite&&["system_owner","owner","lead"].includes(effective),
    remove_members:canWrite&&["system_owner","owner"].includes(effective),
    manage_team:canWrite&&["system_owner","owner"].includes(effective),
    manage_topics:canWrite&&["system_owner","owner","lead","maintainer"].includes(effective),
    create_topics:canWrite&&["system_owner","owner","lead","maintainer","developer","designer","member"].includes(effective),
    reply:canWrite&&["system_owner","owner","lead","maintainer","developer","reviewer","designer","member"].includes(effective),
    review:canWrite&&["system_owner","owner","lead","maintainer","reviewer"].includes(effective),
  }
}
function ensureTeamEntitled(ctx:any){
  if(!ctx.teamEntitled&&!ctx.systemOwner){
    throw new Error("A equipe está em modo somente leitura porque o plano ELITE do dono não está ativo.")
  }
}
async function teamBySlug(slug:string){
  const {data,error}=await admin.from("creative_teams").select("*").eq("slug",slug).maybeSingle()
  if(error) throw error
  return data||null
}
async function uniqueTeamSlug(name:string){
  const base=slugify(name)||"equipe"
  for(let i=0;i<25;i++){
    const candidate=i?base+"-"+(i+1):base
    const {data}=await admin.from("creative_teams").select("id").eq("slug",candidate).maybeSingle()
    if(!data) return candidate
  }
  return base+"-"+Date.now().toString(36)
}
async function uniqueTopicSlug(teamId:string,title:string){
  const base=slugify(title)||"topico"
  for(let i=0;i<25;i++){
    const candidate=i?base+"-"+(i+1):base
    const {data}=await admin.from("creative_team_topics").select("id").eq("team_id",teamId).eq("slug",candidate).maybeSingle()
    if(!data) return candidate
  }
  return base+"-"+Date.now().toString(36)
}
async function notify(userId:string,actorId:string,type:string,data:Record<string,unknown>){
  if(userId===actorId) return
  const {error}=await admin.from("notifications").insert({user_id:userId,actor_id:actorId,type,data})
  if(error) throw error
}
async function listTeams(req:Request){
  const user=await authUser(req)
  const state=await profileState(user?.id||null)
  let memberTeamIds:string[]=[]
  let invites:any[]=[]
  if(user?.id){
    const [{data:members},{data:pendingInvites}]=await Promise.all([
      admin.from("creative_team_members").select("team_id").eq("user_id",user.id).eq("status","active"),
      admin.from("creative_team_invites")
        .select("id,team_id,role,message,status,created_at,team:creative_teams!creative_team_invites_team_id_fkey(id,name,slug,description,avatar_url)")
        .eq("invited_user_id",user.id).eq("status","pending").order("created_at",{ascending:false}),
    ])
    memberTeamIds=(members||[]).map((item:any)=>String(item.team_id))
    invites=pendingInvites||[]
  }

  let query=admin.from("creative_teams")
    .select("id,owner_id,name,slug,description,public_profile,avatar_url,created_at,updated_at,owner:profiles!creative_teams_owner_id_fkey(id,username,display_name,avatar_url)")
    .order("updated_at",{ascending:false})
    .limit(100)
  const {data,error}=await query
  if(error) throw error

  const visible=(data||[]).filter((team:any)=>
    team.public_profile || state.systemOwner || memberTeamIds.includes(String(team.id))
  )
  const teamIds=visible.map((team:any)=>team.id)
  let counts:Record<string,number>={}
  if(teamIds.length){
    const {data:members}=await admin.from("creative_team_members").select("team_id").in("team_id",teamIds).eq("status","active")
    for(const item of members||[]) counts[item.team_id]=(counts[item.team_id]||0)+1
  }

  return {
    plan:{plan_id:state.systemOwner?"owner":state.planId,rank:state.rank,can_create_team:state.elite},
    teams:visible.map((team:any)=>({...team,member_count:counts[team.id]||0,is_member:memberTeamIds.includes(String(team.id)),is_owner:user?.id===team.owner_id||state.systemOwner})),
    invitations:invites,
  }
}
async function createTeam(req:Request,payload:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) throw new Error("Entre na sua conta para criar uma equipe.")
  const state=await profileState(user.id)
  if(!state.elite) throw new Error("Criar equipes privadas é um benefício exclusivo do plano ELITE.")
  const name=compact(payload.name,80)
  const description=compact(payload.description,2000)
  if(name.length<3) throw new Error("O nome da equipe precisa ter pelo menos 3 caracteres.")
  const slug=await uniqueTeamSlug(name)
  const {data:team,error}=await admin.from("creative_teams").insert({
    owner_id:user.id,name,slug,description,
    public_profile:Boolean(payload.public_profile),
  }).select("*").single()
  if(error) throw error
  const {error:memberError}=await admin.from("creative_team_members").insert({
    team_id:team.id,user_id:user.id,role:"owner",status:"active",
  })
  if(memberError) throw memberError
  return {team,permissions:permissions("owner",true,state.systemOwner)}
}
async function getTeam(req:Request,payload:Record<string,unknown>){
  const user=await authUser(req)
  const slug=String(payload.slug||"")
  const team=await teamBySlug(slug)
  if(!team) throw new Error("Equipe não encontrada.")
  const ctx=await teamContext(team.id,user?.id||null)
  if(!team.public_profile&&!ctx.active) throw new Error("Esta equipe é privada.")
  const perms=permissions(ctx.role,ctx.owner,ctx.systemOwner,ctx.teamEntitled)

  let members:any[]=[]
  let invites:any[]=[]
  if(ctx.active){
    const {data}=await admin.from("creative_team_members")
      .select("team_id,user_id,role,status,joined_at,profile:profiles!creative_team_members_user_id_fkey(id,username,display_name,avatar_url)")
      .eq("team_id",team.id).eq("status","active").order("joined_at",{ascending:true})
    members=data||[]
  }
  if(perms.invite_members){
    const {data}=await admin.from("creative_team_invites")
      .select("id,team_id,invited_user_id,invited_by,role,message,status,created_at,profile:profiles!creative_team_invites_invited_user_id_fkey(id,username,display_name,avatar_url)")
      .eq("team_id",team.id).eq("status","pending").order("created_at",{ascending:true})
    invites=data||[]
  }

  const {data:topics,error}=await admin.from("creative_team_topics")
    .select("id,team_id,author_id,title,slug,visibility,public_summary,locked,created_at,updated_at,author:profiles!creative_team_topics_author_id_fkey(id,username,display_name,avatar_url)")
    .eq("team_id",team.id).order("updated_at",{ascending:false})
  if(error) throw error
  const visibleTopics=(topics||[]).filter((topic:any)=>ctx.active||topic.visibility==="public_preview")

  return {
    team,
    owner:await admin.from("profiles").select("id,username,display_name,avatar_url").eq("id",team.owner_id).maybeSingle().then(r=>r.data),
    membership:ctx.member,
    permissions:perms,
    members,
    invitations:invites,
    topics:visibleTopics,
  }
}
async function inviteMember(req:Request,payload:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) throw new Error("Autenticação necessária.")
  const teamId=String(payload.team_id||"")
  const ctx=await teamContext(teamId,user.id)
  ensureTeamEntitled(ctx)
  const perms=permissions(ctx.role,ctx.owner,ctx.systemOwner,ctx.teamEntitled)
  if(!perms.invite_members) throw new Error("Sua função não permite convidar membros.")
  const username=String(payload.username||"").trim().replace(/^@/,"")
  if(!username) throw new Error("Informe o @username do fórum.")
  const role=String(payload.role||"member")
  if(!["lead","maintainer","developer","reviewer","designer","member","viewer"].includes(role)) throw new Error("Função inválida.")
  if(role==="lead"&&!perms.manage_members) throw new Error("Somente o dono pode conceder a função Administrador.")
  const {data:target,error:profileError}=await admin.from("profiles")
    .select("id,username,display_name,avatar_url").ilike("username",username).limit(1).maybeSingle()
  if(profileError) throw profileError
  if(!target) throw new Error("Não encontramos esse usuário no fórum.")
  if(target.id===ctx.team.owner_id) throw new Error("O dono já faz parte da equipe.")
  const {data:existing}=await admin.from("creative_team_members").select("status").eq("team_id",teamId).eq("user_id",target.id).maybeSingle()
  if(existing?.status==="active") throw new Error("Este membro já faz parte da equipe.")
  const {data:pending}=await admin.from("creative_team_invites").select("id").eq("team_id",teamId).eq("invited_user_id",target.id).eq("status","pending").maybeSingle()
  if(pending) throw new Error("Já existe um convite pendente para este membro.")
  const message=compact(payload.message,1000)
  const {data:invite,error}=await admin.from("creative_team_invites").insert({
    team_id:teamId,invited_user_id:target.id,invited_by:user.id,role,message,status:"pending",
  }).select("*").single()
  if(error) throw error
  await notify(target.id,user.id,"team_invite",{
    team_id:teamId,team_slug:ctx.team.slug,team_name:ctx.team.name,invite_id:invite.id,role,message,path:"/equipes/"+ctx.team.slug,
  })
  return {invite,profile:target}
}
async function respondInvite(req:Request,payload:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) throw new Error("Autenticação necessária.")
  const inviteId=String(payload.invite_id||"")
  const accept=Boolean(payload.accept)
  const {data:invite,error}=await admin.from("creative_team_invites").select("*").eq("id",inviteId).eq("invited_user_id",user.id).eq("status","pending").maybeSingle()
  if(error) throw error
  if(!invite) throw new Error("Convite não encontrado ou já respondido.")
  const now=new Date().toISOString()
  if(accept){
    const {error:memberError}=await admin.from("creative_team_members").upsert({
      team_id:invite.team_id,user_id:user.id,role:invite.role,status:"active",joined_at:now,updated_at:now,
    },{onConflict:"team_id,user_id"})
    if(memberError) throw memberError
  }
  const {data:updated,error:updateError}=await admin.from("creative_team_invites").update({
    status:accept?"accepted":"declined",responded_at:now,
  }).eq("id",inviteId).select("*").single()
  if(updateError) throw updateError
  const {data:team}=await admin.from("creative_teams").select("owner_id,name,slug").eq("id",invite.team_id).single()
  await notify(team.owner_id,user.id,accept?"team_invite_accepted":"team_invite_declined",{
    team_id:invite.team_id,team_name:team.name,team_slug:team.slug,path:"/equipes/"+team.slug,
  })
  return {invite:updated}
}
async function setMemberRole(req:Request,payload:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) throw new Error("Autenticação necessária.")
  const teamId=String(payload.team_id||"")
  const targetId=String(payload.user_id||"")
  const role=String(payload.role||"")
  const ctx=await teamContext(teamId,user.id)
  ensureTeamEntitled(ctx)
  const perms=permissions(ctx.role,ctx.owner,ctx.systemOwner,ctx.teamEntitled)
  if(!perms.manage_members) throw new Error("Somente o dono da equipe pode definir permissões.")
  if(targetId===ctx.team.owner_id) throw new Error("A função do dono não pode ser alterada.")
  if(!["lead","maintainer","developer","reviewer","designer","member","viewer"].includes(role)) throw new Error("Função inválida.")
  const {data,error}=await admin.from("creative_team_members").update({role,updated_at:new Date().toISOString()})
    .eq("team_id",teamId).eq("user_id",targetId).eq("status","active").select("*").maybeSingle()
  if(error) throw error
  if(!data) throw new Error("Membro não encontrado.")
  await notify(targetId,user.id,"team_role_updated",{team_id:teamId,team_name:ctx.team.name,team_slug:ctx.team.slug,role,path:"/equipes/"+ctx.team.slug})
  return {member:data}
}
async function removeMember(req:Request,payload:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) throw new Error("Autenticação necessária.")
  const teamId=String(payload.team_id||"")
  const targetId=String(payload.user_id||"")
  const ctx=await teamContext(teamId,user.id)
  ensureTeamEntitled(ctx)
  const perms=permissions(ctx.role,ctx.owner,ctx.systemOwner,ctx.teamEntitled)
  if(!perms.remove_members) throw new Error("Somente o dono da equipe pode remover membros.")
  if(targetId===ctx.team.owner_id) throw new Error("O dono não pode ser removido da própria equipe.")
  const {error}=await admin.from("creative_team_members").update({status:"removed",updated_at:new Date().toISOString()})
    .eq("team_id",teamId).eq("user_id",targetId).eq("status","active")
  if(error) throw error
  await notify(targetId,user.id,"team_member_removed",{team_id:teamId,team_name:ctx.team.name,path:"/equipes"})
  return {ok:true}
}
async function createTopic(req:Request,payload:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) throw new Error("Entre para criar tópicos da equipe.")
  const teamId=String(payload.team_id||"")
  const ctx=await teamContext(teamId,user.id)
  ensureTeamEntitled(ctx)
  const perms=permissions(ctx.role,ctx.owner,ctx.systemOwner,ctx.teamEntitled)
  if(!perms.create_topics) throw new Error("Sua função na equipe não permite criar tópicos.")
  const title=compact(payload.title,160)
  if(title.length<3) throw new Error("Informe um título válido.")
  const visibility=String(payload.visibility||"team_only")
  if(!["team_only","public_preview"].includes(visibility)) throw new Error("Visibilidade inválida.")
  const publicSummary=compact(payload.public_summary,3000)
  if(visibility==="public_preview"&&!publicSummary) throw new Error("Tópicos públicos precisam de um resumo público.")
  const content=compact(payload.content,50000)
  if(!content) throw new Error("Adicione o conteúdo privado do tópico.")
  const slug=await uniqueTopicSlug(teamId,title)
  const {data:topic,error}=await admin.from("creative_team_topics").insert({
    team_id:teamId,author_id:user.id,title,slug,visibility,public_summary:publicSummary,
  }).select("*").single()
  if(error) throw error
  const {error:contentError}=await admin.from("creative_team_topic_private").insert({topic_id:topic.id,content})
  if(contentError) throw contentError
  return {topic}
}
async function getTopic(req:Request,payload:Record<string,unknown>){
  const user=await authUser(req)
  const teamSlug=String(payload.team_slug||"")
  const topicSlug=String(payload.topic_slug||"")
  const team=await teamBySlug(teamSlug)
  if(!team) throw new Error("Equipe não encontrada.")
  const {data:topic,error}=await admin.from("creative_team_topics")
    .select("*,author:profiles!creative_team_topics_author_id_fkey(id,username,display_name,avatar_url)")
    .eq("team_id",team.id).eq("slug",topicSlug).maybeSingle()
  if(error) throw error
  if(!topic) throw new Error("Tópico não encontrado.")
  const ctx=await teamContext(team.id,user?.id||null)
  const publicPreview=topic.visibility==="public_preview"
  if(!ctx.active&&!publicPreview) throw new Error("Este tópico é privado para a equipe.")
  const perms=permissions(ctx.role,ctx.owner,ctx.systemOwner,ctx.teamEntitled)
  if(!ctx.active) return {team:{id:team.id,name:team.name,slug:team.slug,avatar_url:team.avatar_url},topic,private_content:null,posts:[],permissions:{...perms,view_private:false,reply:false}}
  const [{data:privateRow},{data:posts}]=await Promise.all([
    admin.from("creative_team_topic_private").select("content,updated_at").eq("topic_id",topic.id).maybeSingle(),
    admin.from("creative_team_posts")
      .select("id,topic_id,author_id,content,created_at,updated_at,author:profiles!creative_team_posts_author_id_fkey(id,username,display_name,avatar_url)")
      .eq("topic_id",topic.id).order("created_at",{ascending:true}),
  ])
  return {team:{id:team.id,name:team.name,slug:team.slug,avatar_url:team.avatar_url},topic,private_content:privateRow?.content||"",posts:posts||[],permissions:perms}
}
async function replyTopic(req:Request,payload:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) throw new Error("Entre para responder.")
  const topicId=String(payload.topic_id||"")
  const {data:topic,error}=await admin.from("creative_team_topics").select("id,team_id,locked,title,slug").eq("id",topicId).maybeSingle()
  if(error) throw error
  if(!topic) throw new Error("Tópico não encontrado.")
  if(topic.locked) throw new Error("Este tópico está fechado.")
  const ctx=await teamContext(topic.team_id,user.id)
  ensureTeamEntitled(ctx)
  const perms=permissions(ctx.role,ctx.owner,ctx.systemOwner,ctx.teamEntitled)
  if(!perms.reply) throw new Error("Sua função na equipe não permite responder.")
  const content=compact(payload.content,20000)
  if(!content) throw new Error("Resposta vazia.")
  const {data:post,error:postError}=await admin.from("creative_team_posts").insert({topic_id:topicId,author_id:user.id,content}).select("*").single()
  if(postError) throw postError
  return {post}
}
async function updateTopic(req:Request,payload:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) throw new Error("Autenticação necessária.")
  const topicId=String(payload.topic_id||"")
  const {data:topic,error}=await admin.from("creative_team_topics").select("*").eq("id",topicId).maybeSingle()
  if(error) throw error
  if(!topic) throw new Error("Tópico não encontrado.")
  const ctx=await teamContext(topic.team_id,user.id)
  ensureTeamEntitled(ctx)
  const perms=permissions(ctx.role,ctx.owner,ctx.systemOwner,ctx.teamEntitled)
  if(!perms.manage_topics&&topic.author_id!==user.id) throw new Error("Você não pode editar este tópico.")
  const changes:any={updated_at:new Date().toISOString()}
  if(payload.title!==undefined){
    const title=compact(payload.title,160)
    if(title.length<3) throw new Error("Título inválido.")
    changes.title=title
  }
  if(payload.visibility!==undefined){
    const value=String(payload.visibility)
    if(!["team_only","public_preview"].includes(value)) throw new Error("Visibilidade inválida.")
    changes.visibility=value
  }
  if(payload.public_summary!==undefined) changes.public_summary=compact(payload.public_summary,3000)
  if(payload.locked!==undefined&&perms.manage_topics) changes.locked=Boolean(payload.locked)
  const {data:updated,error:updateError}=await admin.from("creative_team_topics").update(changes).eq("id",topicId).select("*").single()
  if(updateError) throw updateError
  if(payload.content!==undefined){
    const content=compact(payload.content,50000)
    const {error:contentError}=await admin.from("creative_team_topic_private").upsert({topic_id:topicId,content,updated_at:new Date().toISOString()},{onConflict:"topic_id"})
    if(contentError) throw contentError
  }
  return {topic:updated}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:CORS})
  if(req.method!=="POST") return reply({error:"method_not_allowed"},405)
  let payload:Record<string,unknown>={}
  try{payload=await req.json()}catch{}
  const action=String(payload.action||"list")
  try{
    if(action==="list") return reply({ok:true,...await listTeams(req)})
    if(action==="create") return reply({ok:true,...await createTeam(req,payload)})
    if(action==="get") return reply({ok:true,...await getTeam(req,payload)})
    if(action==="invite") return reply({ok:true,...await inviteMember(req,payload)})
    if(action==="respond_invite") return reply({ok:true,...await respondInvite(req,payload)})
    if(action==="set_role") return reply({ok:true,...await setMemberRole(req,payload)})
    if(action==="remove_member") return reply({ok:true,...await removeMember(req,payload)})
    if(action==="create_topic") return reply({ok:true,...await createTopic(req,payload)})
    if(action==="get_topic") return reply({ok:true,...await getTopic(req,payload)})
    if(action==="reply_topic") return reply({ok:true,...await replyTopic(req,payload)})
    if(action==="update_topic") return reply({ok:true,...await updateTopic(req,payload)})
    return reply({error:"unsupported_action"},400)
  }catch(error){
    console.error("teams-api:",error)
    const message=error instanceof Error?error.message:"Falha nas equipes CreativeZone."
    const status=/Entre|Autenticação/.test(message)?401:/não permite|Somente|não pode|privad/i.test(message)?403:400
    return reply({error:message},status)
  }
})
