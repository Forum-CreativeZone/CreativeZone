import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const VAPID_PUBLIC = "BAtmaLgtvqyI5b_KIcAij0-U2K6CQ9YmajktFYLM3Jm2JrBZLulntzIxWsTfZzzAkZzqPF6VhWFb5Y1-CzCdKzo";
const SITE_URL = "https://assets-forum.gestao-quiroz.workers.dev";

const typeTitles: Record<string, string> = {
  new_reply: "Nova resposta",
  topic_watch: "Tópico acompanhado atualizado",
  mention: "Você foi mencionado",
  quote: "Sua publicação foi citada",
  reaction: "Nova reação",
  new_follower: "Novo seguidor",
  direct_message: "Nova mensagem direta",
  moderation: "Aviso da moderação",
};

const prefColumns: Record<string, string> = {
  new_reply: "push_reply",
  topic_watch: "push_watch",
  mention: "push_mention",
  quote: "push_quote",
  reaction: "push_reaction",
  new_follower: "push_follower",
  direct_message: "push_dm",
  moderation: "push_moderation",
};

function notificationUrl(notification: any) {
  if (notification.type === "direct_message" && notification.actor?.username) {
    return SITE_URL + "/mensagens/" + encodeURIComponent(notification.actor.username);
  }
  if (notification.data?.topic_id) {
    return SITE_URL + "/topico/" + encodeURIComponent(notification.data.topic_id);
  }
  if (notification.actor?.username) {
    return SITE_URL + "/membro/" + encodeURIComponent(notification.actor.username);
  }
  return SITE_URL + "/";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { data: expectedHook, error: hookError } = await service.rpc("get_push_webhook_token");
  const suppliedHook = req.headers.get("X-CreativeZone-Hook");
  if (hookError || !expectedHook || !suppliedHook || suppliedHook !== expectedHook) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const notificationId = body?.notification_id;
  if (!notificationId || typeof notificationId !== "string") {
    return new Response("Missing notification_id", { status: 400 });
  }

  const { data: notification, error: notificationError } = await service
    .from("notifications")
    .select("id,user_id,type,data,created_at,actor:profiles!notifications_actor_id_fkey(id,username,display_name,avatar_url)")
    .eq("id", notificationId)
    .maybeSingle();

  if (notificationError || !notification) return new Response("Notification not found", { status: 404 });

  const prefColumn = prefColumns[notification.type];
  if (!prefColumn) return Response.json({ skipped: true });

  const { data: settings } = await service
    .from("account_settings")
    .select("push_enabled,push_reply,push_watch,push_mention,push_quote,push_reaction,push_follower,push_dm,push_moderation")
    .eq("user_id", notification.user_id)
    .maybeSingle();

  if (!settings?.push_enabled || !settings?.[prefColumn]) return Response.json({ skipped: true });

  const { data: vapidPrivate, error: vapidError } = await service.rpc("get_web_push_vapid_private");
  if (vapidError || !vapidPrivate) return new Response("Push configuration unavailable", { status: 503 });

  webpush.setVapidDetails(SITE_URL, VAPID_PUBLIC, vapidPrivate);

  const { data: subscriptions, error: subscriptionError } = await service
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", notification.user_id);

  if (subscriptionError) return new Response("Failed to load subscriptions", { status: 500 });

  const actorName = notification.actor?.display_name || notification.actor?.username || "CreativeZone";
  const payload = JSON.stringify({
    title: typeTitles[notification.type] || "CreativeZone",
    body: notification.type === "moderation"
      ? "Você recebeu um novo aviso da moderação."
      : notification.type === "topic_watch"
        ? (
            notification.data?.event === "reply"
              ? actorName + " respondeu a um tópico que você está assistindo."
              : "Há uma atualização em um tópico que você está assistindo."
          )
        : actorName + " gerou uma nova atividade para você.",
    url: notificationUrl(notification),
    tag: "creativezone-" + notification.id,
  });

  let sent = 0;
  for (const subscription of subscriptions || []) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 86400 });
      sent += 1;
    } catch (error: any) {
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) {
        await service.from("push_subscriptions").delete().eq("id", subscription.id);
      }
    }
  }

  return Response.json({ sent });
});
