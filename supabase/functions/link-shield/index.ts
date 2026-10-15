import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const URLHAUS_AUTH_KEY = Deno.env.get("URLHAUS_AUTH_KEY") || Deno.env.get("ABUSECH_AUTH_KEY") || ""

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

const MAX_URL_LENGTH = 4096
const PROVIDER_TIMEOUT_MS = 6000
const CLEAR_TTL_MS = 12 * 60 * 60 * 1000
const MALICIOUS_TTL_MS = 6 * 60 * 60 * 1000
const UNKNOWN_TTL_MS = 15 * 60 * 1000
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000
const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_MISS_LIMIT = 40

const buckets = new Map<string, { count:number; resetAt:number }>()

type Safety = {
  normalized_url: string
  domain: string
  verdict: "no_known_threat" | "malicious" | "local_network" | "sensitive_url" | "unknown"
  decision: "allow" | "warn" | "block"
  risk_score: number
  threat_type: string | null
  providers: Record<string, unknown>
  checked_at: string
  expires_at: string
  protected: boolean
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  })
}

function compact(value: unknown, max = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}

function normalizeUrl(value: unknown) {
  const raw = String(value ?? "").trim()
  if (!raw || raw.length > MAX_URL_LENGTH) throw new Error("invalid_url")
  let url: URL
  try { url = new URL(raw) } catch { throw new Error("invalid_url") }
  if (!["http:","https:"].includes(url.protocol)) throw new Error("invalid_protocol")
  url.username = ""
  url.password = ""
  url.hash = ""
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = ""
  return url
}

function clientKey(req: Request) {
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown"
}

function internalRequest(req: Request) {
  return Boolean(SERVICE_KEY) && req.headers.get("authorization") === "Bearer " + SERVICE_KEY
}

function consumeBudget(req: Request) {
  if (internalRequest(req)) return true
  const key = clientKey(req)
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key,{count:1,resetAt:now+RATE_WINDOW_MS})
    return true
  }
  if (current.count >= RATE_MISS_LIMIT) return false
  current.count += 1
  return true
}

function parseIpv4(value: string) {
  const parts=value.split(".")
  if(parts.length!==4) return null
  const nums=parts.map(Number)
  return nums.some((n)=>!Number.isInteger(n)||n<0||n>255) ? null : nums
}

function privateOrReservedIp(value:string) {
  const ip=value.replace(/^\[|\]$/g,"").toLowerCase()
  if(ip.startsWith("::ffff:")) return privateOrReservedIp(ip.slice(7))
  const v4=parseIpv4(ip)
  if(v4){
    const [a,b]=v4
    return a===0 || a===10 || a===127 || (a===100&&b>=64&&b<=127) ||
      (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===0) ||
      (a===192&&b===168) || (a===198&&(b===18||b===19)) || a>=224
  }
  if(!ip.includes(":")) return false
  return ip==="::" || ip==="::1" || ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip) || ip.startsWith("2001:db8:")
}

function localNetworkTarget(url:URL) {
  const host=url.hostname.replace(/^\[|\]$/g,"").toLowerCase()
  if(!host || host==="localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true
  return Boolean(parseIpv4(host) || host.includes(":")) && privateOrReservedIp(host)
}

const SENSITIVE_QUERY_NAMES = new Set([
  "token","access_token","auth","authorization","key","apikey","api_key",
  "signature","sig","x-amz-signature","x-goog-signature","x-ms-signature",
])

function containsSensitiveQuery(url:URL) {
  return [...url.searchParams.keys()].some((key)=>SENSITIVE_QUERY_NAMES.has(key.toLowerCase()))
}

async function readCache(normalizedUrl:string) {
  const {data,error}=await admin.from("link_shield_cache").select("*")
    .eq("normalized_url",normalizedUrl).gt("expires_at",new Date().toISOString()).maybeSingle()
  if(error) throw error
  return data
}

async function writeCache(safety:Safety) {
  const {error}=await admin.from("link_shield_cache").upsert({
    normalized_url:safety.normalized_url,
    domain:safety.domain,
    verdict:safety.verdict,
    decision:safety.decision,
    risk_score:safety.risk_score,
    threat_type:safety.threat_type,
    providers:safety.providers,
    checked_at:safety.checked_at,
    expires_at:safety.expires_at,
    last_seen_at:new Date().toISOString(),
  },{onConflict:"normalized_url"})
  if(error) throw error
}

async function optionalUser(req:Request) {
  const authorization=req.headers.get("authorization")||""
  if(!authorization.toLowerCase().startsWith("bearer ") || internalRequest(req)) return null
  const token=authorization.slice(7).trim()
  const {data}=await admin.auth.getUser(token)
  return data?.user||null
}

async function recordEvent(req:Request,safety:Safety,context:string,metadata:Record<string,unknown>={}) {
  if(safety.decision==="allow" && context!=="manual") return
  const user=await optionalUser(req).catch(()=>null)
  await admin.from("link_shield_events").insert({
    normalized_url:safety.normalized_url,
    domain:safety.domain,
    context:compact(context,80)||"unknown",
    verdict:safety.verdict,
    decision:safety.decision,
    risk_score:safety.risk_score,
    user_id:user?.id||null,
    metadata,
  }).then(()=>null).catch(()=>null)
}

async function urlhausLookup(url:string) {
  if(!URLHAUS_AUTH_KEY) return {configured:false,matched:false,status:"not_configured"}
  const controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),PROVIDER_TIMEOUT_MS)
  try{
    const form=new URLSearchParams({url})
    const response=await fetch("https://urlhaus-api.abuse.ch/v1/url/",{
      method:"POST",
      headers:{
        "Auth-Key":URLHAUS_AUTH_KEY,
        "Content-Type":"application/x-www-form-urlencoded",
        "User-Agent":"CreativeZone-LinkShield/1.0 (+https://forum.creativezone.pro/)",
      },
      body:form.toString(),
      signal:controller.signal,
    })
    const data=await response.json().catch(()=>({}))
    if(!response.ok) throw new Error("urlhaus_http_"+response.status)
    const queryStatus=String(data?.query_status||"")
    if(queryStatus==="ok"){
      return {
        configured:true,
        matched:true,
        status:"match",
        url_status:data?.url_status||null,
        threat:data?.threat||null,
        tags:Array.isArray(data?.tags)?data.tags.slice(0,20):[],
        urlhaus_reference:data?.urlhaus_reference||null,
        date_added:data?.date_added||null,
        last_online:data?.last_online||null,
      }
    }
    if(queryStatus==="no_results") return {configured:true,matched:false,status:"clear"}
    return {configured:true,matched:false,status:"provider_rejected",raw_status:queryStatus||"unknown"}
  }finally{
    clearTimeout(timeout)
  }
}

async function evaluate(url:URL):Promise<Safety>{
  const checkedAt=new Date()
  const normalized=url.href
  const domain=url.hostname.replace(/^www\./,"").slice(0,255)
  let safety:Safety

  if(localNetworkTarget(url)){
    safety={
      normalized_url:normalized,domain,verdict:"local_network",decision:"warn",risk_score:55,
      threat_type:"private_or_local_network",
      providers:{creativezone:{status:"local_network_guard"}},
      checked_at:checkedAt.toISOString(),expires_at:new Date(checkedAt.getTime()+LOCAL_TTL_MS).toISOString(),protected:true,
    }
  }else if(containsSensitiveQuery(url)){
    safety={
      normalized_url:normalized,domain,verdict:"sensitive_url",decision:"warn",risk_score:45,
      threat_type:"credential_or_signed_url",
      providers:{creativezone:{status:"sensitive_query_not_shared"}},
      checked_at:checkedAt.toISOString(),expires_at:new Date(checkedAt.getTime()+UNKNOWN_TTL_MS).toISOString(),protected:true,
    }
  }else{
    try{
      const result=await urlhausLookup(normalized)
      const matched=Boolean(result.matched)
      safety={
        normalized_url:normalized,
        domain,
        verdict:matched?"malicious":result.status==="clear"?"no_known_threat":"unknown",
        decision:matched?"block":"allow",
        risk_score:matched?100:0,
        threat_type:matched?String(result.threat||"malware_distribution"):null,
        providers:{urlhaus:result},
        checked_at:checkedAt.toISOString(),
        expires_at:new Date(checkedAt.getTime()+(matched?MALICIOUS_TTL_MS:result.status==="clear"?CLEAR_TTL_MS:UNKNOWN_TTL_MS)).toISOString(),
        protected:Boolean(result.configured),
      }
    }catch(error){
      safety={
        normalized_url:normalized,domain,verdict:"unknown",decision:"allow",risk_score:0,threat_type:null,
        providers:{urlhaus:{configured:Boolean(URLHAUS_AUTH_KEY),status:"error",error:compact(error instanceof Error?error.message:error,180)}},
        checked_at:checkedAt.toISOString(),expires_at:new Date(checkedAt.getTime()+UNKNOWN_TTL_MS).toISOString(),protected:false,
      }
    }
  }
  return safety
}

async function checkAction(req:Request,body:Record<string,unknown>){
  let url:URL
  try{url=normalizeUrl(body.url)}catch(error){return json({error:error instanceof Error?error.message:"invalid_url"},400)}
  const context=compact(body.context,80)||"unknown"
  const force=Boolean(body.force)

  if(!force){
    try{
      const cached=await readCache(url.href)
      if(cached){
        const safety={...cached,protected:Boolean(URLHAUS_AUTH_KEY)||cached.decision!=="allow"}
        await recordEvent(req,safety as Safety,context,{cached:true})
        return json({ok:true,cached:true,safety})
      }
    }catch(error){console.error("link-shield cache read:",error)}
  }

  if(!consumeBudget(req)) return json({error:"link_shield_rate_limited",retry_after_seconds:300},429)

  const safety=await evaluate(url)
  await writeCache(safety).catch((error)=>console.error("link-shield cache write:",error))
  await recordEvent(req,safety,context,{cached:false})
  return json({ok:true,cached:false,safety})
}

async function reportAction(req:Request,body:Record<string,unknown>){
  const user=await optionalUser(req)
  if(!user) return json({error:"authentication_required"},401)
  let url:URL
  try{url=normalizeUrl(body.url)}catch(error){return json({error:error instanceof Error?error.message:"invalid_url"},400)}
  const safety=await evaluate(url)
  const {error}=await admin.from("link_shield_reports").insert({
    normalized_url:url.href,
    domain:url.hostname.replace(/^www\./,""),
    reporter_id:user.id,
    reason:compact(body.reason,80)||"suspected_malicious",
    details:compact(body.details,2000)||"",
    safety_snapshot:safety,
  })
  if(error && !String(error.message||"").toLowerCase().includes("duplicate")) throw error
  await recordEvent(req,safety,"report",{})
  return json({ok:true,safety})
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:CORS})
  if(req.method!=="POST") return json({error:"method_not_allowed"},405)
  if(!SUPABASE_URL||!SERVICE_KEY) return json({error:"link_shield_unavailable"},503)

  let body:Record<string,unknown>
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const action=String(body.action||"check")

  try{
    if(action==="status") return json({
      ok:true,
      service:"creativezone-link-shield",
      providers:{urlhaus:{configured:Boolean(URLHAUS_AUTH_KEY)}},
      core_protection:"free",
    })
    if(action==="check") return await checkAction(req,body)
    if(action==="report") return await reportAction(req,body)
    return json({error:"unsupported_action"},400)
  }catch(error){
    console.error("link-shield:",error)
    return json({error:compact(error instanceof Error?error.message:error,500)||"link_shield_failed"},500)
  }
})
