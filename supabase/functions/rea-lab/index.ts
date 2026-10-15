import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||""
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||""
const SERVICE_KEY=(()=>{
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if(legacy) return legacy
  const raw=Deno.env.get("SUPABASE_SECRET_KEYS")
  if(raw){
    try{
      const keys=JSON.parse(raw)
      if(keys?.default) return String(keys.default)
    }catch{}
  }
  return ""
})()

const WORKER_URL=(Deno.env.get("REA_WORKER_URL")||"").replace(/\/+$/,"")
const WORKER_TOKEN=Deno.env.get("REA_WORKER_TOKEN")||""

const admin=createClient(SUPABASE_URL,SERVICE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false},
})

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-rea-worker-token",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
  "X-Content-Type-Options":"nosniff",
}

const TARGET_TYPES=[
  "website","javascript","electron","dotnet","apk","native","wasm","sqlite",
  "har","firmware","pcap","evm","flutter","other",
]
const MODES=["analyze","behavior_spec","rebuild"]
const SOURCES=["url","github","upload"]

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...CORS,"Cache-Control":"no-store"},
  })
}

function compact(value:unknown,max=1000){
  const text=String(value??"").replace(/\s+/g," ").trim()
  if(!text) return ""
  return text.length>max?text.slice(0,max-1).trimEnd()+"…":text
}

async function authUser(req:Request){
  const authorization=req.headers.get("authorization")||""
  if(!authorization||!ANON_KEY) return null
  const client=createClient(SUPABASE_URL,ANON_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:authorization}},
  })
  const token=authorization.replace(/^Bearer\s+/i,"")
  const {data,error}=await client.auth.getUser(token)
  if(error) return null
  return data?.user||null
}

async function reaPlanForUser(userId:string){
  const [{data:profile},{data:membership}]=await Promise.all([
    admin.from("profiles").select("system_owner").eq("id",userId).maybeSingle(),
    admin.from("user_memberships").select("plan_id,status,permanent,ends_at").eq("user_id",userId).maybeSingle(),
  ])

  if(profile?.system_owner){
    return {
      plan_id:"owner",
      rank:99,
      capabilities:{
        enabled:true,
        monthly_runs:-1,
        max_upload_mb:2048,
        modes:[...MODES],
        target_types:[...TARGET_TYPES],
        behavior_spec:true,
        rebuild:true,
        priority_queue:true,
        project_integration:true,
        advanced_providers:true,
      },
    }
  }

  let planId="free"
  const active=membership?.status==="active"
    && (membership?.permanent || !membership?.ends_at || new Date(membership.ends_at).getTime()>Date.now())
  if(active&&membership?.plan_id) planId=String(membership.plan_id)

  const {data:plan}=await admin.from("membership_plans")
    .select("id,rank,entitlements")
    .eq("id",planId)
    .maybeSingle()

  return {
    plan_id:plan?.id||"free",
    rank:Number(plan?.rank||0),
    capabilities:plan?.entitlements?.rea_lab||{},
  }
}

function normalizeUrl(value:unknown){
  const raw=String(value||"").trim()
  if(!raw||raw.length>4096) throw new Error("URL inválida.")
  let url:URL
  try{url=new URL(raw)}catch{throw new Error("URL inválida.")}
  if(!["http:","https:"].includes(url.protocol)) throw new Error("Apenas URLs HTTP/HTTPS são aceitas.")
  url.username=""
  url.password=""
  url.hash=""
  return url.href
}

async function checkLinkShield(url:string){
  const controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),5000)
  try{
    const response=await fetch(SUPABASE_URL+"/functions/v1/link-shield",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer "+SERVICE_KEY,
      },
      body:JSON.stringify({action:"check",url,context:"rea_lab"}),
      signal:controller.signal,
    })
    if(!response.ok) return null
    const body=await response.json().catch(()=>null)
    return body?.safety||null
  }catch{
    return null
  }finally{
    clearTimeout(timeout)
  }
}

async function currentMonthUsage(userId:string){
  const now=new Date()
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString()
  const {count,error}=await admin.from("rea_lab_jobs")
    .select("id",{count:"exact",head:true})
    .eq("user_id",userId)
    .gte("created_at",start)
    .not("status","eq","draft")
  if(error) throw error
  return Number(count||0)
}

async function enqueueWorker(job:any){
  if(!WORKER_URL||!WORKER_TOKEN) return {queued:false,status:"waiting_worker"}
  const controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),8000)
  try{
    const response=await fetch(WORKER_URL+"/jobs",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer "+WORKER_TOKEN,
      },
      body:JSON.stringify({
        job_id:job.id,
        mode:job.mode,
        target_type:job.target_type,
        source_type:job.source_type,
        target_reference:job.target_reference,
        question:job.question,
        objective:job.objective,
        options:job.options||{},
        callback_url:SUPABASE_URL+"/functions/v1/rea-lab",
      }),
      signal:controller.signal,
    })
    if(!response.ok){
      const body=await response.text().catch(()=>"")
      throw new Error("REA worker HTTP "+response.status+": "+compact(body,300))
    }
    return {queued:true,status:"queued"}
  }catch(error){
    console.error("rea worker enqueue:",error)
    return {queued:false,status:"waiting_worker"}
  }finally{
    clearTimeout(timeout)
  }
}

async function createJob(req:Request,body:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) return json({error:"authentication_required"},401)

  const plan=await reaPlanForUser(user.id)
  const caps=plan.capabilities||{}
  if(!caps.enabled) return json({error:"rea_lab_not_available"},403)

  const mode=String(body.mode||"analyze")
  const targetType=String(body.target_type||"website")
  const sourceType=String(body.source_type||"url")
  if(!MODES.includes(mode)) return json({error:"invalid_mode"},400)
  if(!TARGET_TYPES.includes(targetType)) return json({error:"invalid_target_type"},400)
  if(!SOURCES.includes(sourceType)) return json({error:"invalid_source_type"},400)

  if(!Array.isArray(caps.modes)||!caps.modes.includes(mode)){
    return json({error:"mode_not_in_plan",plan:plan.plan_id},403)
  }
  if(!Array.isArray(caps.target_types)||!caps.target_types.includes(targetType)){
    return json({error:"target_type_not_in_plan",plan:plan.plan_id},403)
  }
  if(body.acknowledge_lawful_use!==true){
    return json({error:"lawful_use_acknowledgement_required"},400)
  }

  const usage=await currentMonthUsage(user.id)
  const limit=Number(caps.monthly_runs??0)
  if(limit>=0&&usage>=limit){
    return json({error:"rea_monthly_limit_reached",plan:plan.plan_id,usage,limit},403)
  }

  let reference=compact(body.target_reference,4096)
  if(sourceType==="url"){
    reference=normalizeUrl(reference)
    const safety=await checkLinkShield(reference)
    if(safety?.decision==="block"){
      return json({
        error:"target_blocked_by_link_shield",
        safety:{
          verdict:safety.verdict,
          risk_score:safety.risk_score,
          threat_type:safety.threat_type,
        },
      },400)
    }
  }else if(sourceType==="github"){
    reference=normalizeUrl(reference)
    const host=new URL(reference).hostname.toLowerCase()
    if(host!=="github.com"&&!host.endsWith(".github.com")){
      return json({error:"github_source_required"},400)
    }
  }else{
    return json({error:"upload_source_not_enabled_yet"},409)
  }

  const question=compact(body.question,4000)
  const objective=compact(body.objective,4000)
  if(!question&&!objective) return json({error:"question_or_objective_required"},400)

  let projectId=body.project_id?String(body.project_id):null
  if(projectId){
    if(!caps.project_integration) return json({error:"project_integration_not_in_plan"},403)
    const {data:project}=await admin.from("projects")
      .select("id,owner_id")
      .eq("id",projectId)
      .maybeSingle()
    if(!project) return json({error:"project_not_found"},404)
    if(project.owner_id!==user.id){
      const {data:member}=await admin.from("project_members")
        .select("status")
        .eq("project_id",projectId)
        .eq("user_id",user.id)
        .eq("status","accepted")
        .maybeSingle()
      if(!member) return json({error:"project_access_required"},403)
    }
  }

  const priority=caps.priority_queue?10:0
  const {data:job,error}=await admin.from("rea_lab_jobs").insert({
    user_id:user.id,
    project_id:projectId,
    mode,
    target_type:targetType,
    source_type:sourceType,
    target_reference:reference,
    question,
    objective,
    visibility:"private",
    status:"queued",
    plan_id:plan.plan_id,
    priority,
    options:{
      requested_provider:compact(body.provider,80)||null,
      clean_room:true,
      lawful_use_acknowledged:true,
    },
  }).select("*").single()
  if(error) throw error

  await admin.from("rea_lab_events").insert({
    job_id:job.id,
    event_type:"created",
    message:"Análise criada na CreativeZone.",
    metadata:{plan_id:plan.plan_id,mode,target_type:targetType},
  })

  const worker=await enqueueWorker(job)
  if(!worker.queued){
    await admin.from("rea_lab_jobs").update({
      status:"waiting_worker",
      updated_at:new Date().toISOString(),
    }).eq("id",job.id)
    await admin.from("rea_lab_events").insert({
      job_id:job.id,
      event_type:"waiting_worker",
      message:"Job aguardando worker REA isolado.",
    })
  }

  return json({
    ok:true,
    job:{...job,status:worker.status},
    plan:{plan_id:plan.plan_id,usage:usage+1,limit},
    worker_configured:Boolean(WORKER_URL&&WORKER_TOKEN),
  })
}

async function listJobs(req:Request){
  const user=await authUser(req)
  if(!user) return json({error:"authentication_required"},401)
  const {data,error}=await admin.from("rea_lab_jobs")
    .select("id,project_id,mode,target_type,source_type,target_reference,status,plan_id,result_summary,worker_version,rea_version,error_text,started_at,completed_at,created_at,updated_at")
    .eq("user_id",user.id)
    .order("created_at",{ascending:false})
    .limit(100)
  if(error) throw error
  return json({ok:true,jobs:data||[]})
}

async function getJob(req:Request,body:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) return json({error:"authentication_required"},401)
  const id=String(body.job_id||"")
  const {data:job,error}=await admin.from("rea_lab_jobs")
    .select("*").eq("id",id).eq("user_id",user.id).maybeSingle()
  if(error) throw error
  if(!job) return json({error:"job_not_found"},404)
  const [{data:events},{data:spec}]=await Promise.all([
    admin.from("rea_lab_events").select("*").eq("job_id",id).order("created_at",{ascending:true}),
    admin.from("rea_lab_specs").select("*").eq("job_id",id).maybeSingle(),
  ])
  return json({ok:true,job,events:events||[],spec:spec||null})
}

async function cancelJob(req:Request,body:Record<string,unknown>){
  const user=await authUser(req)
  if(!user) return json({error:"authentication_required"},401)
  const id=String(body.job_id||"")
  const {data:job}=await admin.from("rea_lab_jobs")
    .select("id,status").eq("id",id).eq("user_id",user.id).maybeSingle()
  if(!job) return json({error:"job_not_found"},404)
  if(["completed","failed","cancelled"].includes(job.status)) return json({ok:true,status:job.status})
  await admin.from("rea_lab_jobs").update({
    status:"cancelled",
    updated_at:new Date().toISOString(),
  }).eq("id",id)
  await admin.from("rea_lab_events").insert({
    job_id:id,event_type:"cancelled",message:"Análise cancelada pelo usuário.",
  })
  return json({ok:true,status:"cancelled"})
}

async function workerCallback(req:Request,body:Record<string,unknown>){
  if(!WORKER_TOKEN||req.headers.get("x-rea-worker-token")!==WORKER_TOKEN){
    return json({error:"worker_auth_required"},401)
  }
  const id=String(body.job_id||"")
  const status=String(body.status||"")
  if(!["running","completed","failed"].includes(status)) return json({error:"invalid_worker_status"},400)

  const patch:any={
    status,
    updated_at:new Date().toISOString(),
    worker_id:compact(body.worker_id,160)||null,
    worker_version:compact(body.worker_version,160)||null,
    rea_version:compact(body.rea_version,160)||null,
  }
  if(status==="running") patch.started_at=new Date().toISOString()
  if(status==="completed"){
    patch.completed_at=new Date().toISOString()
    patch.result_summary=compact(body.result_summary,12000)
    patch.result=body.result&&typeof body.result==="object"?body.result:{}
    patch.evidence=Array.isArray(body.evidence)?body.evidence:[]
    patch.limitations=Array.isArray(body.limitations)?body.limitations:[]
    patch.error_text=""
  }
  if(status==="failed"){
    patch.completed_at=new Date().toISOString()
    patch.error_text=compact(body.error_text,4000)||"REA worker failed"
  }

  const {data:job,error}=await admin.from("rea_lab_jobs").update(patch).eq("id",id).select("id,mode").maybeSingle()
  if(error) throw error
  if(!job) return json({error:"job_not_found"},404)

  if(body.spec&&typeof body.spec==="object"){
    await admin.from("rea_lab_specs").upsert({
      job_id:id,
      behavior_spec:(body.spec as any).behavior_spec||{},
      implementation_plan:(body.spec as any).implementation_plan||{},
      compatibility_tests:Array.isArray((body.spec as any).compatibility_tests)?(body.spec as any).compatibility_tests:[],
      provenance:(body.spec as any).provenance||{},
      updated_at:new Date().toISOString(),
    },{onConflict:"job_id"})
  }

  await admin.from("rea_lab_events").insert({
    job_id:id,
    event_type:status,
    message:status==="completed"?"Análise REA concluída.":status==="failed"?"Análise REA falhou.":"Worker REA iniciou a análise.",
  })
  return json({ok:true})
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:CORS})
  if(!SUPABASE_URL||!SERVICE_KEY) return json({error:"rea_lab_unavailable"},503)

  if(req.method==="GET"){
    return json({
      ok:true,
      service:"creativezone-rea-lab",
      worker_configured:Boolean(WORKER_URL&&WORKER_TOKEN),
      rea_upstream:"morluto/rea",
      architecture:"isolated-worker",
    })
  }

  if(req.method!=="POST") return json({error:"method_not_allowed"},405)
  let body:Record<string,unknown>
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const action=String(body.action||"status")

  try{
    if(action==="status"){
      const user=await authUser(req)
      const plan=user?await reaPlanForUser(user.id):null
      const usage=user?await currentMonthUsage(user.id):0
      return json({
        ok:true,
        worker_configured:Boolean(WORKER_URL&&WORKER_TOKEN),
        plan,
        usage,
      })
    }
    if(action==="create_job") return await createJob(req,body)
    if(action==="list_jobs") return await listJobs(req)
    if(action==="get_job") return await getJob(req,body)
    if(action==="cancel_job") return await cancelJob(req,body)
    if(action==="worker_callback") return await workerCallback(req,body)
    return json({error:"unsupported_action"},400)
  }catch(error){
    console.error("rea-lab:",error)
    return json({error:compact(error instanceof Error?error.message:error,1000)||"rea_lab_failed"},500)
  }
})
