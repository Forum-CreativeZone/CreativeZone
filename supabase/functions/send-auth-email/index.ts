import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "CreativeZone <onboarding@resend.dev>"
const SEND_EMAIL_HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || ""
const SITE_URL = "https://assets-forum.gestao-quiroz.workers.dev"
const LOGO_URL = "https://raw.githubusercontent.com/Inosuke-Company/CreativeZone/main/assets/logo.png"

type AuthUser = {
  email?: string
  new_email?: string
  user_metadata?: Record<string, unknown>
}

type EmailData = {
  token?: string
  token_hash?: string
  token_new?: string
  token_hash_new?: string
  redirect_to?: string
  email_action_type?: string
  site_url?: string
  old_email?: string
  old_phone?: string
  provider?: string
  factor_type?: string
}

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function copyFor(type: string) {
  const copy: Record<string, any> = {
    signup: {
      subject: "Confirme sua conta na CreativeZone",
      eyebrow: "BEM-VINDO À CREATIVEZONE",
      title: "Confirme seu e-mail",
      message: "Use o botão abaixo para confirmar este endereço e concluir sua conta.",
      cta: "Confirmar e-mail",
    },
    invite: {
      subject: "Você foi convidado para a CreativeZone",
      eyebrow: "CONVITE",
      title: "Seu lugar na comunidade está reservado",
      message: "Aceite o convite abaixo para entrar na CreativeZone.",
      cta: "Aceitar convite",
    },
    magiclink: {
      subject: "Seu acesso à CreativeZone",
      eyebrow: "LINK DE ACESSO",
      title: "Entre com segurança",
      message: "Use este link único para entrar na sua conta.",
      cta: "Entrar na CreativeZone",
    },
    recovery: {
      subject: "Redefina sua senha da CreativeZone",
      eyebrow: "SEGURANÇA DA CONTA",
      title: "Crie uma nova senha",
      message: "Recebemos uma solicitação para redefinir sua senha.",
      cta: "Redefinir senha",
    },
    email_change: {
      subject: "Confirme a alteração de e-mail — CreativeZone",
      eyebrow: "ALTERAÇÃO DE E-MAIL",
      title: "Confirme este endereço",
      message: "Esta confirmação protege sua conta contra alterações não autorizadas.",
      cta: "Confirmar alteração",
    },
    reauthentication: {
      subject: "Código de segurança da CreativeZone",
      eyebrow: "VERIFICAÇÃO DE SEGURANÇA",
      title: "Confirme que é você",
      message: "Use o código abaixo para autorizar uma alteração sensível na sua conta.",
      cta: "",
    },
    email: {
      subject: "Confirme seu e-mail — CreativeZone",
      eyebrow: "CONFIRMAÇÃO DE E-MAIL",
      title: "Confirme seu endereço",
      message: "Use o botão abaixo para confirmar este endereço de e-mail.",
      cta: "Confirmar e-mail",
    },
    password_changed_notification: {
      subject: "Sua senha foi alterada — CreativeZone",
      eyebrow: "SEGURANÇA DA CONTA",
      title: "Sua senha foi alterada",
      message: "A senha da sua conta CreativeZone foi alterada recentemente. Se não foi você, redefina sua senha imediatamente.",
      cta: "",
    },
    email_changed_notification: {
      subject: "Seu e-mail foi alterado — CreativeZone",
      eyebrow: "SEGURANÇA DA CONTA",
      title: "Seu endereço de e-mail mudou",
      message: "O endereço de e-mail associado à sua conta CreativeZone foi alterado.",
      cta: "",
    },
    phone_changed_notification: {
      subject: "Seu telefone foi alterado — CreativeZone",
      eyebrow: "SEGURANÇA DA CONTA",
      title: "Seu telefone foi alterado",
      message: "O número de telefone associado à sua conta CreativeZone foi alterado.",
      cta: "",
    },
    identity_linked_notification: {
      subject: "Novo método de acesso conectado — CreativeZone",
      eyebrow: "SEGURANÇA DA CONTA",
      title: "Um novo método de acesso foi conectado",
      message: "Uma nova identidade ou provedor de login foi conectado à sua conta.",
      cta: "",
    },
    identity_unlinked_notification: {
      subject: "Método de acesso removido — CreativeZone",
      eyebrow: "SEGURANÇA DA CONTA",
      title: "Um método de acesso foi removido",
      message: "Uma identidade ou provedor de login foi removido da sua conta.",
      cta: "",
    },
    mfa_factor_enrolled_notification: {
      subject: "Nova verificação de segurança adicionada — CreativeZone",
      eyebrow: "SEGURANÇA DA CONTA",
      title: "Novo método de verificação adicionado",
      message: "Um novo fator de autenticação foi adicionado à sua conta CreativeZone.",
      cta: "",
    },
    mfa_factor_unenrolled_notification: {
      subject: "Verificação de segurança removida — CreativeZone",
      eyebrow: "SEGURANÇA DA CONTA",
      title: "Método de verificação removido",
      message: "Um fator de autenticação foi removido da sua conta CreativeZone.",
      cta: "",
    },
  }
  return copy[type] || {
    subject: "Ação de segurança — CreativeZone",
    eyebrow: "CREATIVEZONE",
    title: "Confirme esta ação",
    message: "Use os dados abaixo para continuar com segurança.",
    cta: "Continuar",
  }
}

function verificationUrl(type: string, hash: string, redirectTo?: string) {
  const redirect = redirectTo || SITE_URL
  return `${SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(hash)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(redirect)}`
}

function renderHtml({
  recipientName,
  copy,
  token,
  url,
}: {
  recipientName: string
  copy: any
  token?: string
  url?: string
}) {
  const tokenBlock = token
    ? `<div style="margin-top:24px;padding:18px;border-radius:10px;background:#180909;border:1px solid #5a1714;text-align:center;"><div style="font-size:11px;letter-spacing:1.5px;color:#6f8798;margin-bottom:8px;">CÓDIGO DE SEGURANÇA</div><div style="font-size:30px;letter-spacing:8px;color:#fff;font-weight:800;">${esc(token)}</div></div>`
    : ""
  const action = url && copy.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td style="background:#d9231b;border-radius:10px;"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:13px 22px;color:#fff;text-decoration:none;font-weight:800;font-size:14px;">${esc(copy.cta)} →</a></td></tr></table>`
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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#060a0f;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#0a1018;border:1px solid #1d2a38;border-radius:18px;overflow:hidden;">
<tr><td style="height:4px;background:#ef2b24;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:26px 28px 16px;"><table role="presentation"><tr>
<td width="64"><img src="${LOGO_URL}" width="52" height="52" alt="CreativeZone" style="display:block;width:52px;height:52px;object-fit:contain;"></td>
<td><div style="font-size:19px;font-weight:800;color:#fff;">Creative<span style="color:#ff3b30;">Zone</span></div><div style="font-size:11px;letter-spacing:2px;color:#6d8297;">COMUNIDADE CREATIVE LAB</div></td>
</tr></table></td></tr>
<tr><td style="padding:14px 28px 32px;">
<div style="font-size:11px;font-weight:800;letter-spacing:1.7px;color:#ff3b30;margin-bottom:12px;">${esc(copy.eyebrow)}</div>
<h1 style="margin:0 0 14px;font-size:29px;line-height:1.2;color:#fff;">${esc(copy.title)}</h1>
<p style="margin:0;color:#9fb0c1;font-size:15px;line-height:1.7;">Olá, ${esc(recipientName)}. ${esc(copy.message)}</p>
${tokenBlock}
${action}
<p style="margin:24px 0 0;color:#718497;font-size:12px;line-height:1.6;">Se você não solicitou esta ação, pode ignorar este e-mail. Nunca compartilhe seu código de segurança.</p>
</td></tr>
<tr><td style="padding:18px 28px;background:#080d13;border-top:1px solid #172230;font-size:11px;color:#687b8d;">CreativeZone · segurança e comunidade em primeiro lugar.</td></tr>
</table>
</td></tr></table>
</body></html>`
}

async function sendAuthEmail(to: string, subject: string, html: string, text: string, key: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      html,
      text,
      tags: [{ name: "category", value: "auth" }],
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof result?.message === "string" ? result.message : "Falha ao enviar e-mail de autenticação.")
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("not allowed", { status: 405 })
  if (!RESEND_API_KEY || !SEND_EMAIL_HOOK_SECRET) {
    return Response.json({ error: { http_code: 503, message: "Email hook não configurado." } }, { status: 503 })
  }

  const payload = await req.text()
  const headers = Object.fromEntries(req.headers)
  const secret = SEND_EMAIL_HOOK_SECRET.replace(/^v1,whsec_/, "")
  const wh = new Webhook(secret)

  try {
    const event = wh.verify(payload, headers) as { user: AuthUser; email_data: EmailData }
    const user = event.user
    const data = event.email_data
    const type = data.email_action_type || "unknown"
    const copy = copyFor(type)
    const displayName = String(
      user.user_metadata?.display_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "membro"
    )

    if (type === "email_change" && user.new_email) {
      if (data.token_hash_new && user.email) {
        const currentUrl = verificationUrl("email_change", data.token_hash_new, data.redirect_to)
        await sendAuthEmail(
          user.email,
          "Autorize a alteração de e-mail — CreativeZone",
          renderHtml({ recipientName: displayName, copy, token: data.token, url: currentUrl }),
          `${copy.title}\n\nCódigo: ${data.token || ""}\n\nConfirmar: ${currentUrl}`,
          `creativezone-auth-email-change-current-${data.token_hash_new}`
        )
      }

      if (data.token_hash && user.new_email) {
        const newUrl = verificationUrl("email_change", data.token_hash, data.redirect_to)
        await sendAuthEmail(
          user.new_email,
          copy.subject,
          renderHtml({ recipientName: displayName, copy, token: data.token_new || data.token, url: newUrl }),
          `${copy.title}\n\nCódigo: ${data.token_new || data.token || ""}\n\nConfirmar: ${newUrl}`,
          `creativezone-auth-email-change-new-${data.token_hash}`
        )
      }

      return Response.json({})
    }

    if (!user.email) throw new Error("Usuário sem e-mail.")
    const hash = data.token_hash || data.token_hash_new || ""
    const url = type === "reauthentication" || !hash
      ? undefined
      : verificationUrl(type, hash, data.redirect_to)
    const token = data.token || data.token_new || undefined

    await sendAuthEmail(
      user.email,
      copy.subject,
      renderHtml({ recipientName: displayName, copy, token, url }),
      [
        copy.title,
        "",
        copy.message,
        token ? `Código: ${token}` : "",
        url ? `Continuar: ${url}` : "",
      ].filter(Boolean).join("\n\n"),
      `creativezone-auth-${type}-${hash || token || Date.now()}`
    )

    return Response.json({})
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar hook de e-mail."
    return Response.json({ error: { http_code: 500, message } }, { status: 500 })
  }
})
