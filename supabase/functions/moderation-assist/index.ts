import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_KEY = (() => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (legacy) return legacy
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS")
  if (raw) {
    try {
      const keys = JSON.parse(raw)
      if (keys?.default) return String(keys.default)
    } catch {}
  }
  return ""
})()

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
}

const VERSION = "creativezone-local-v1"
const MAX_TEXT = 12000
const MAX_URLS = 5
const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_LIMIT = 80
const buckets = new Map<string,{count:number;resetAt:number}>()

type TargetType = "topic" | "post" | "chat_message"

type Target = {
  target_type: TargetType
  target_id: string
  author_id: string | null
  title: string
  content: string
  created_at: string | null
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  })
}

function compact(value: unknown, max = 1000) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  if (!text) return ""
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}

function clientKey(req:Request){
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown"
}

function consumeBudget(req:Request){
  const key=clientKey(req)
  const now=Date.now()
  const current=buckets.get(key)
  if(!current || current.resetAt<=now){
    buckets.set(key,{count:1,resetAt:now+RATE_WINDOW_MS})
    return true
  }
  if(current.count>=RATE_LIMIT) return false
  current.count+=1
  return true
}

function internalRequest(req:Request){
  return Boolean(SERVICE_KEY) && req.headers.get("authorization")==="Bearer "+SERVICE_KEY
}

async function requester(req:Request){
  if(internalRequest(req)) return {id:null,role:"service_role",staff:true}
  const auth=req.headers.get("authorization")||""
  if(!auth.toLowerCase().startsWith("bearer ")) return {id:null,role:null,staff:false}
  const token=auth.slice(7).trim()
  if(!token) return {id:null,role:null,staff:false}
  const {data}=await admin.auth.getUser(token)
  const id=data?.user?.id||null
  if(!id) return {id:null,role:null,staff:false}
  const {data:profile}=await admin.from("profiles").select("role").eq("id",id).maybeSingle()
  const role=profile?.role||null
  return {id,role,staff:role==="admin"||role==="moderator"}
}

function stripMarkup(value:string){
  return String(value||"")
    .replace(/\[attachment:[^\]]+\]/gi," ")
    .replace(/\[\/?(?:quote|code|spoiler|url|img|b|i|u|s|color|size|font|align)(?:=[^\]]+)?\]/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/[*_~>#]+/g," ")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,MAX_TEXT)
}

function extractUrls(text:string){
  const found=String(text||"").match(/https?:\/\/[^\s<>"')\]]+/gi)||[]
  return [...new Set(found.map((url)=>url.replace(/[),.;!?]+$/,"")))].slice(0,MAX_URLS)
}

function ratioUppercase(text:string){
  const letters=[...text].filter((char)=>/\p{L}/u.test(char))
  if(letters.length<12) return 0
  const upper=letters.filter((char)=>char===char.toUpperCase() && char!==char.toLowerCase()).length
  return upper/letters.length
}

function normalizeComparable(text:string){
  return stripMarkup(text)
    .toLocaleLowerCase("pt-BR")
    .replace(/https?:\/\/\S+/g,"<url>")
    .replace(/[^\p{L}\p{N}<>' ]+/gu," ")
    .replace(/\s+/g," ")
    .trim()
}

async function sha256(value:string){
  const data=new TextEncoder().encode(value)
  const hash=await crypto.subtle.digest("SHA-256",data)
  return [...new Uint8Array(hash)].map((b)=>b.toString(16).padStart(2,"0")).join("")
}

async function fetchTarget(type:TargetType,id:string):Promise<Target|null>{
  if(type==="topic"){
    const {data,error}=await admin.from("topics")
      .select("id,author_id,title,content,created_at")
      .eq("id",id).maybeSingle()
    if(error) throw error
    if(!data) return null
    return {target_type:type,target_id:data.id,author_id:data.author_id||null,title:data.title||"",content:data.content||"",created_at:data.created_at||null}
  }
  if(type==="post"){
    const {data,error}=await admin.from("posts")
      .select("id,author_id,content,created_at")
      .eq("id",id).maybeSingle()
    if(error) throw error
    if(!data) return null
    return {target_type:type,target_id:data.id,author_id:data.author_id||null,title:"",content:data.content||"",created_at:data.created_at||null}
  }
  const {data,error}=await admin.from("chat_messages")
    .select("id,user_id,content,created_at,deleted_at")
    .eq("id",id).maybeSingle()
  if(error) throw error
  if(!data || data.deleted_at) return null
  return {target_type:type,target_id:data.id,author_id:data.user_id||null,title:"",content:data.content||"",created_at:data.created_at||null}
}

async function recentDuplicate(target:Target,comparable:string){
  if(!target.author_id || comparable.length<12) return false
  const table=target.target_type==="topic"?"topics":target.target_type==="post"?"posts":"chat_messages"
  const authorColumn=target.target_type==="chat_message"?"user_id":"author_id"
  const columns=target.target_type==="topic"?"id,title,content":"id,content"
  let query=admin.from(table).select(columns).eq(authorColumn,target.author_id).neq("id",target.target_id).order("created_at",{ascending:false}).limit(12)
  if(target.target_type==="chat_message") query=query.is("deleted_at",null)
  const {data,error}=await query
  if(error) return false
  return (data||[]).some((item:any)=>{
    const source=target.target_type==="topic"
      ? String(item.title||"")+"\n"+String(item.content||"")
      : String(item.content||"")
    return normalizeComparable(source)===comparable
  })
}

async function profileContext(authorId:string|null){
  if(!authorId) return {new_account:false,role:null}
  const {data}=await admin.from("profiles").select("created_at,role").eq("id",authorId).maybeSingle()
  const created=data?.created_at?new Date(data.created_at).getTime():0
  return {
    new_account:Boolean(created && Date.now()-created<24*60*60*1000),
    role:data?.role||null,
  }
}

async function checkUrls(urls:string[]){
  const results=[]
  for(const url of urls.slice(0,3)){
    const controller=new AbortController()
    const timeout=setTimeout(()=>controller.abort(),4500)
    try{
      const response=await fetch(SUPABASE_URL+"/functions/v1/link-shield",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          Authorization:"Bearer "+SERVICE_KEY,
        },
        body:JSON.stringify({action:"check",url,context:"moderation_assist"}),
        signal:controller.signal,
      })
      const body=await response.json().catch(()=>null)
      if(body?.safety){
        results.push({
          url,
          verdict:body.safety.verdict,
          decision:body.safety.decision,
          risk_score:Number(body.safety.risk_score||0),
          threat_type:body.safety.threat_type||null,
        })
      }
    }catch{
      results.push({url,verdict:"unknown",decision:"allow",risk_score:0})
    }finally{
      clearTimeout(timeout)
    }
  }
  return results
}

function spamCueCount(text:string){
  const patterns=[
    /\b(?:ganhe|lucro|renda)\b.{0,30}\b(?:garantid|rápid|fácil)\w*/giu,
    /\b(?:clique|acesse)\s+(?:aqui|agora)\b/giu,
    /\b(?:free money|guaranteed profit|click here|limited offer)\b/giu,
    /\b(?:whatsapp|telegram)\b.{0,20}\b(?:grupo|canal|contato|promo)\w*/giu,
  ]
  return patterns.reduce((sum,pattern)=>sum+(text.match(pattern)?.length||0),0)
}

function threatCueCount(text:string){
  const patterns=[
    /\b(?:vou|vamos|iremos)\s+(?:te|lhe)\s+(?:matar|machucar|agredir)\b/giu,
    /\b(?:i(?:'|’)ll|we(?:'|’)ll)\s+(?:kill|hurt)\s+you\b/giu,
    /\b(?:se\s+mata|kill\s+yourself)\b/giu,
  ]
  return patterns.reduce((sum,pattern)=>sum+(text.match(pattern)?.length||0),0)
}

async function analyze(target:Target,force=false){
  const source=(target.title?target.title+"\n":"")+target.content
  const clean=stripMarkup(source)
  const comparable=normalizeComparable(source)
  const contentHash=await sha256(source)

  const {data:existing}=await admin.from("moderation_assessments")
    .select("*").eq("target_type",target.target_type).eq("target_id",target.target_id).maybeSingle()

  if(existing && existing.content_hash===contentHash && !force){
    await admin.from("moderation_analysis_queue").update({
      status:"done",updated_at:new Date().toISOString(),last_error:""
    }).eq("target_type",target.target_type).eq("target_id",target.target_id)
    return existing
  }

  const urls=extractUrls(source)
  const [duplicate,profile,linkResults]=await Promise.all([
    recentDuplicate(target,comparable),
    profileContext(target.author_id),
    checkUrls(urls),
  ])

  const upperRatio=ratioUppercase(clean)
  const mentions=(clean.match(/@[A-Za-z0-9_.-]{3,50}/g)||[]).length
  const repeatedChars=/(.)\1{7,}/u.test(clean)
  const repeatedPunctuation=/[!?]{8,}/.test(clean)
  const spamCues=spamCueCount(clean)
  const threatCues=threatCueCount(clean)

  let spamScore=0
  let behaviorScore=0
  let threatScore=0
  let linkScore=0

  if(urls.length>=7) spamScore+=30
  else if(urls.length>=4) spamScore+=20
  else if(urls.length>=2) spamScore+=8

  if(mentions>=8) spamScore+=18
  else if(mentions>=5) spamScore+=10

  if(spamCues) spamScore+=Math.min(35,spamCues*18)
  if(duplicate) spamScore+=45
  if(profile.new_account && urls.length>=2) spamScore+=15

  if(upperRatio>=0.8) behaviorScore+=12
  else if(upperRatio>=0.65) behaviorScore+=7
  if(repeatedChars) behaviorScore+=8
  if(repeatedPunctuation) behaviorScore+=6
  if(clean.length>0 && clean.length<4) behaviorScore+=2

  if(threatCues) threatScore=Math.min(100,70+Math.min(20,(threatCues-1)*10))

  for(const result of linkResults){
    if(result.decision==="block") linkScore=Math.max(linkScore,100)
    else if(result.decision==="warn") linkScore=Math.max(linkScore,45)
  }

  spamScore=Math.min(100,spamScore)
  behaviorScore=Math.min(100,behaviorScore)

  const risk=Math.min(100,Math.max(
    linkScore,
    threatScore,
    spamScore,
    Math.round(spamScore*0.7+behaviorScore*0.3),
  ))

  const recommendation=risk>=75?"urgent":risk>=35?"review":"allow"

  const categories={
    spam:spamScore,
    behavioral_noise:behaviorScore,
    threat_or_harassment:threatScore,
    link_risk:linkScore,
  }

  const signals={
    text_length:clean.length,
    url_count:urls.length,
    mention_count:mentions,
    uppercase_ratio:Number(upperRatio.toFixed(3)),
    repeated_characters:repeatedChars,
    repeated_punctuation:repeatedPunctuation,
    duplicate_recent:duplicate,
    new_account:profile.new_account,
    spam_cues:spamCues,
    threat_cues:threatCues,
    link_results:linkResults,
  }

  const payload={
    target_type:target.target_type,
    target_id:target.target_id,
    author_id:target.author_id,
    content_hash:contentHash,
    analyzer_version:VERSION,
    provider:"creativezone-local",
    risk_score:risk,
    recommendation,
    categories,
    signals,
    provider_result:{mode:"deterministic",external_semantic_provider:false},
    review_status:"pending",
    reviewed_by:null,
    review_note:"",
    reviewed_at:null,
    analyzed_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }

  const {data,error}=await admin.from("moderation_assessments")
    .upsert(payload,{onConflict:"target_type,target_id"})
    .select("*").single()
  if(error) throw error

  await admin.from("moderation_analysis_queue").update({
    status:"done",updated_at:new Date().toISOString(),last_error:""
  }).eq("target_type",target.target_type).eq("target_id",target.target_id)

  return data
}

async function analyzeTarget(type:TargetType,id:string,force=false){
  await admin.from("moderation_analysis_queue").update({
    status:"processing",
    attempts:1,
    updated_at:new Date().toISOString(),
  }).eq("target_type",type).eq("target_id",id)

  try{
    const target=await fetchTarget(type,id)
    if(!target){
      await admin.from("moderation_analysis_queue").update({
        status:"done",updated_at:new Date().toISOString(),last_error:"target_not_found"
      }).eq("target_type",type).eq("target_id",id)
      return null
    }
    return await analyze(target,force)
  }catch(error){
    const message=compact(error instanceof Error?error.message:error,900)||"analysis_failed"
    await admin.from("moderation_analysis_queue").update({
      status:"error",
      last_error:message,
      updated_at:new Date().toISOString(),
    }).eq("target_type",type).eq("target_id",id)
    throw error
  }
}

async function processBatch(limit:number){
  const safeLimit=Math.max(1,Math.min(30,Number(limit)||10))
  const {data,error}=await admin.from("moderation_analysis_queue")
    .select("target_type,target_id")
    .in("status",["pending","error"])
    .order("priority",{ascending:false})
    .order("queued_at",{ascending:true})
    .limit(safeLimit)
  if(error) throw error

  let completed=0
  let failed=0
  for(const item of data||[]){
    try{
      await analyzeTarget(item.target_type as TargetType,item.target_id,false)
      completed+=1
    }catch{
      failed+=1
    }
  }
  return {requested:(data||[]).length,completed,failed}
}

function minimalAssessment(item:any){
  if(!item) return null
  return {
    id:item.id,
    target_type:item.target_type,
    target_id:item.target_id,
    risk_score:Number(item.risk_score||0),
    recommendation:item.recommendation,
    analyzer_version:item.analyzer_version,
    analyzed_at:item.analyzed_at,
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:CORS})
  if(!SUPABASE_URL||!SERVICE_KEY) return json({error:"moderation_service_unavailable"},503)

  const actor=await requester(req)

  if(req.method==="GET"){
    const {count:pending}=await admin.from("moderation_analysis_queue")
      .select("*",{count:"exact",head:true}).eq("status","pending")
    return json({
      ok:true,
      service:"creativezone-moderation-assist",
      version:VERSION,
      pending:Number(pending||0),
      semantic_provider:false,
      mode:"assistive",
    })
  }

  if(req.method!=="POST") return json({error:"method_not_allowed"},405)
  if(!consumeBudget(req)) return json({error:"moderation_rate_limited"},429)

  let body:Record<string,unknown>
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const action=String(body.action||"analyze_target")

  try{
    if(action==="status"){
      const {count:pending}=await admin.from("moderation_analysis_queue")
        .select("*",{count:"exact",head:true}).eq("status","pending")
      return json({ok:true,version:VERSION,pending:Number(pending||0),mode:"assistive"})
    }

    if(action==="batch"){
      if(!actor.staff && !internalRequest(req)) return json({error:"staff_access_required"},403)
      const result=await processBatch(Number(body.limit||10))
      return json({ok:true,...result})
    }

    if(action==="analyze_target"){
      const type=String(body.target_type||"") as TargetType
      const id=String(body.target_id||"")
      if(!["topic","post","chat_message"].includes(type) || !/^[0-9a-f-]{36}$/i.test(id)){
        return json({error:"invalid_target"},400)
      }
      const force=Boolean(body.force) && actor.staff
      const assessment=await analyzeTarget(type,id,force)
      return json({
        ok:true,
        assessment:actor.staff||internalRequest(req)?assessment:minimalAssessment(assessment),
      })
    }

    return json({error:"unsupported_action"},400)
  }catch(error){
    console.error("moderation-assist:",error)
    return json({error:compact(error instanceof Error?error.message:error,500)||"moderation_failed"},500)
  }
})
