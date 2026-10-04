import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "missing_authorization" }, { status: 401, headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch {}
  if (body?.confirmation !== "EXCLUIR MINHA CONTA") {
    return Response.json({ error: "confirmation_required" }, { status: 400, headers: corsHeaders });
  }

  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData?.user) {
    return Response.json({ error: "invalid_session" }, { status: 401, headers: corsHeaders });
  }

  const user = userData.user;
  const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
  if (Date.now() - lastSignIn > 30 * 60 * 1000) {
    return Response.json(
      { error: "reauth_required", message: "Entre novamente na sua conta antes de excluí-la." },
      { status: 401, headers: corsHeaders }
    );
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
  if (deleteError) return Response.json({ error: "delete_failed" }, { status: 500, headers: corsHeaders });

  return Response.json({ success: true }, { headers: corsHeaders });
});
