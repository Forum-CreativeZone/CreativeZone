import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "CreativeZone <onboarding@resend.dev>"
const SITE_URL = "https://assets-forum.gestao-quiroz.workers.dev"
const LOGO_URL = "https://raw.githubusercontent.com/Inosuke-Company/CreativeZone/main/assets/logo.png"

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function compact(value: unknown, max = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

function copyFor(job: any) {
  const actor = job.actor?.display_name || job.actor?.username || "CreativeZone"
  const topic = job.topic?.title || "uma discussão da comunidade"
  const excerpt = compact(job.post?.content || job.notification_data?.message || "", 240)
  const copy: Record<string, any> = {
    new_reply: {
      subject: `${actor} respondeu ao seu tópico — CreativeZone`,
      eyebrow: "NOVA RESPOSTA",
      title: "Sua discussão continua",
      message: `${actor} respondeu em “${topic}”.`,
      excerpt,
      cta: "Ver resposta",
    },
    mention: {
      subject: `${actor} mencionou você — CreativeZone`,
      eyebrow: "VOCÊ FOI MENCIONADO",
      title: "Chamaram você para a conversa",
      message: `${actor} mencionou seu nome em “${topic}”.`,
      excerpt,
      cta: "Abrir menção",
    },
    quote: {
      subject: `${actor} citou sua publicação — CreativeZone`,
      eyebrow: "SUA PUBLICAÇÃO FOI CITADA",
      title: "Sua contribuição virou referência",
      message: `${actor} citou uma publicação sua em “${topic}”.`,
      excerpt,
      cta: "Ver citação",
    },
    reaction: {
      subject: `${actor} reagiu à sua publicação — CreativeZone`,
      eyebrow: "NOVA REAÇÃO",
      title: "Sua publicação recebeu uma reação",
      message: `${actor} reagiu ao seu conteúdo na CreativeZone.`,
      excerpt: "",
      cta: "Ver publicação",
    },
    new_follower: {
      subject: `${actor} começou a seguir você — CreativeZone`,
      eyebrow: "NOVO SEGUIDOR",
      title: "Sua rede está crescendo",
      message: `${actor} começou a seguir seu perfil.`,
      excerpt: "",
      cta: "Ver perfil",
    },
    direct_message: {
      subject: `Nova mensagem de ${actor} — CreativeZone`,
      eyebrow: "MENSAGEM DIRETA",
      title: "Você recebeu uma nova mensagem",
      message: `${actor} enviou uma mensagem privada para você.`,
      excerpt: "",
      cta: "Abrir conversa",
    },
    moderation: {
      subject: "Aviso importante da moderação — CreativeZone",
      eyebrow: "MODERAÇÃO",
      title: "Há um aviso importante para sua conta",
      message: "A equipe de moderação da CreativeZone enviou uma atualização para você.",
      excerpt,
      cta: "Abrir CreativeZone",
    },
  }

  return copy[job.notification_type] || {
    subject: "Nova atividade — CreativeZone",
    eyebrow: "CREATIVEZONE",
    title: "Você tem uma nova atividade",
    message: "Algo novo aconteceu na sua conta.",
    excerpt,
    cta: "Abrir CreativeZone",
  }
}

function targetUrl(job: any) {
  const data = job.notification_data || job.payload || {}
  if (job.notification_type === "direct_message" && job.actor?.username) {
    return `${SITE_URL}/mensagens/${encodeURIComponent(job.actor.username)}`
  }
  if (data.topic_id) return `${SITE_URL}/topico/${encodeURIComponent(data.topic_id)}`
  if (job.actor?.username) return `${SITE_URL}/membro/${encodeURIComponent(job.actor.username)}`
  return SITE_URL + "/"
}

function renderHtml(job: any, copy: any, url: string) {
  const name = esc(job.recipient?.display_name || job.recipient?.username || "membro")
  const actor = esc(job.actor?.display_name || job.actor?.username || "CreativeZone")
  const excerpt = copy.excerpt
    ? `<div style="margin:22px 0 0;padding:16px 18px;border-left:3px solid #ef2b24;border-radius:8px;background:#160d0d;color:#c9d7e5;font-size:14px;line-height:1.65;">${esc(copy.excerpt)}</div>`
    : ""

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(copy.subject)}</title>
</head>
<body style="margin:0;background:#060a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#f4f8fb;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(copy.message)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060a0f;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#0a1018;border:1px solid #1d2a38;border-radius:18px;overflow:hidden;">
<tr><td style="height:4px;background:#ef2b24;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:26px 28px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="64"><img src="${LOGO_URL}" width="52" height="52" alt="CreativeZone" style="display:block;width:52px;height:52px;object-fit:contain;"></td>
<td><div style="font-size:19px;font-weight:800;color:#fff;">Creative<span style="color:#ff3b30;">Zone</span></div><div style="font-size:11px;letter-spacing:2px;color:#6d8297;margin-top:3px;">COMUNIDADE CREATIVE LAB</div></td>
</tr></table>
</td></tr>
<tr><td style="padding:12px 28px 30px;">
<div style="font-size:11px;font-weight:800;letter-spacing:1.7px;color:#ff3b30;margin-bottom:12px;">${esc(copy.eyebrow)}</div>
<h1 style="margin:0 0 14px;font-size:29px;line-height:1.2;color:#fff;font-weight:800;">${esc(copy.title)}</h1>
<p style="margin:0;color:#9fb0c1;font-size:15px;line-height:1.7;">Olá, ${name}. ${esc(copy.message)}</p>
${excerpt}
${job.actor ? `<div style="margin-top:22px;color:#f7fbff;font-size:14px;font-weight:700;">${actor}${job.actor?.username ? ` <span style="color:#73879a;font-weight:400;">@${esc(job.actor.username)}</span>` : ""}</div>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td style="border-radius:10px;background:#d9231b;"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:13px 22px;color:#fff;text-decoration:none;font-size:14px;font-weight:800;border-radius:10px;">${esc(copy.cta)} →</a></td></tr></table>
</td></tr>
<tr><td style="padding:18px 28px;background:#080d13;border-top:1px solid #172230;font-size:11px;line-height:1.6;color:#687b8d;">
Você recebeu este e-mail conforme suas preferências. <a href="${SITE_URL}/conta/alertas" style="color:#ff6159;text-decoration:none;">Gerenciar alertas</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })
  if (!RESEND_API_KEY) return Response.json({ error: "missing_resend_api_key" }, { status: 503 })

  const { data: expectedHook } = await admin.rpc("get_creativezone_email_webhook_token")
  if (!expectedHook || req.headers.get("X-CreativeZone-Email-Hook") !== expectedHook) {
    return new Response("Unauthorized", { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return new Response("Invalid JSON", { status: 400 }) }

  const queueId = body?.queue_id
  if (!queueId) return new Response("Missing queue_id", { status: 400 })

  const { data: job, error: jobError } = await admin.rpc("get_community_email_job", {
    p_queue_id: queueId,
  })
  if (jobError || !job) return new Response("Email job not found", { status: 404 })
  if (job.status === "sent") return Response.json({ ok: true, duplicate: true })

  await admin.rpc("mark_community_email_job", {
    p_queue_id: queueId,
    p_status: "sending",
    p_provider_email_id: null,
    p_error_message: null,
  })

  const copy = copyFor(job)
  const url = targetUrl(job)
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `creativezone-community-${queueId}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [job.recipient_email],
      subject: copy.subject,
      html: renderHtml(job, copy, url),
      text: [
        copy.title,
        "",
        `Olá, ${job.recipient?.display_name || job.recipient?.username || "membro"}.`,
        copy.message,
        copy.excerpt || "",
        "",
        `${copy.cta}: ${url}`,
        "",
        `Gerenciar alertas: ${SITE_URL}/conta/alertas`,
      ].join("\n"),
      tags: [
        { name: "category", value: "community_notification" },
        { name: "event", value: String(job.notification_type || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_") },
      ],
    }),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = typeof result?.message === "string" ? result.message : "Falha ao enviar e-mail pelo Resend."
    await admin.rpc("mark_community_email_job", {
      p_queue_id: queueId,
      p_status: "failed",
      p_provider_email_id: null,
      p_error_message: message.slice(0, 800),
    })
    return Response.json({ error: message }, { status: response.status })
  }

  await admin.rpc("mark_community_email_job", {
    p_queue_id: queueId,
    p_status: "sent",
    p_provider_email_id: result?.id || null,
    p_error_message: null,
  })

  return Response.json({ ok: true, id: result?.id || null })
})
