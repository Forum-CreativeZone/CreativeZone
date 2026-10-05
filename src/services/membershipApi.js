import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function getMembershipPlans() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('membership_plans')
    .select('id,name,description,badge,rank,entitlements')
    .eq('active', true)
    .order('rank')
  if (error) throw error
  return data || []
}

export async function getMembershipState(userId) {
  if (!userId) return null
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_membership_state', {
    p_user_id: userId,
  })
  if (error) throw error
  return data?.[0] || null
}

export async function getProfileCosmetics(userId) {
  if (!userId) return null
  const client = requireSupabase()
  const { data, error } = await client
    .from('profile_cosmetics')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveProfileCosmetics(userId, values) {
  const client = requireSupabase()
  const payload = {
    user_id: userId,
    name_color: values.name_color || null,
    profile_title: values.profile_title?.trim() || null,
    avatar_frame: values.avatar_frame || 'none',
    cover_effect: values.cover_effect || 'none',
    badge_style: values.badge_style || 'default',
  }

  const { data, error } = await client
    .from('profile_cosmetics')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function requestMembershipUpgrade(userId, planId, message = '') {
  const client = requireSupabase()
  const { data, error } = await client
    .from('membership_upgrade_requests')
    .insert({
      user_id: userId,
      plan_id: planId,
      message: message.trim().slice(0, 1000),
    })
    .select('id,user_id,plan_id,status,created_at')
    .single()
  if (error) throw error
  return data
}

export async function getMembershipRequests() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('membership_upgrade_requests')
    .select(
      'id,user_id,plan_id,message,status,reviewed_by,reviewed_at,created_at,profile:profiles!membership_upgrade_requests_user_id_fkey(id,username,display_name,avatar_url),plan:membership_plans!membership_upgrade_requests_plan_id_fkey(id,name,badge,rank)'
    )
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data || []
}

export async function adminGrantMembership({
  adminId,
  userId,
  planId,
  permanent = false,
  days = 30,
  requestId = null,
}) {
  const client = requireSupabase()
  const startsAt = new Date()
  const endsAt = permanent
    ? null
    : new Date(startsAt.getTime() + Math.max(1, Number(days) || 30) * 86400000).toISOString()

  const { data, error } = await client
    .from('user_memberships')
    .upsert({
      user_id: userId,
      plan_id: planId,
      status: 'active',
      permanent: Boolean(permanent),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt,
      source: 'admin',
      granted_by: adminId,
      updated_at: startsAt.toISOString(),
    }, { onConflict: 'user_id' })
    .select('user_id,plan_id,status,permanent,starts_at,ends_at')
    .single()
  if (error) throw error

  if (requestId) {
    const { error: requestError } = await client
      .from('membership_upgrade_requests')
      .update({
        status: 'approved',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
    if (requestError) throw requestError
  }

  return data
}

export async function rejectMembershipRequest(requestId, adminId) {
  const client = requireSupabase()
  const { error } = await client
    .from('membership_upgrade_requests')
    .update({
      status: 'rejected',
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
  if (error) throw error
}

export async function getMemberDecorations(userIds = []) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const client = requireSupabase()
  const [profiles, memberships, cosmetics, plans] = await Promise.all([
    client.from('profiles').select('id,system_owner').in('id', ids),
    client.from('user_memberships')
      .select('user_id,plan_id,status,permanent,ends_at')
      .in('user_id', ids),
    client.from('profile_cosmetics').select('*').in('user_id', ids),
    client.from('membership_plans').select('id,name,badge,rank,entitlements'),
  ])

  for (const result of [profiles, memberships, cosmetics, plans]) {
    if (result.error) throw result.error
  }

  const profileMap = new Map((profiles.data || []).map((item) => [item.id, item]))
  const planMap = new Map((plans.data || []).map((item) => [item.id, item]))
  const cosmeticMap = new Map((cosmetics.data || []).map((item) => [item.user_id, item]))
  const membershipMap = new Map()

  for (const membership of memberships.data || []) {
    const active = membership.status === 'active'
      && (membership.permanent || !membership.ends_at || new Date(membership.ends_at) > new Date())
    if (active) membershipMap.set(membership.user_id, membership)
  }

  return Object.fromEntries(ids.map((id) => {
    const owner = Boolean(profileMap.get(id)?.system_owner)
    const membership = membershipMap.get(id)
    const plan = planMap.get(owner ? 'elite' : (membership?.plan_id || 'free')) || planMap.get('free') || null

    return [id, {
      system_owner: owner,
      membership: plan ? {
        plan_id: plan.id,
        plan_name: plan.name,
        badge: plan.badge,
        rank: plan.rank,
        permanent: owner || Boolean(membership?.permanent),
        ends_at: owner ? null : membership?.ends_at || null,
        entitlements: {
          ...(plan.entitlements || {}),
          ...(owner ? {
            full_access: true,
            featured_projects: 99,
            forum_upload_mb: 500,
            forum_upload_count: 50,
          } : {}),
        },
      } : null,
      cosmetics: cosmeticMap.get(id) || null,
    }]
  }))
}

export function membershipLabel(membership) {
  if (!membership) return 'FREE'
  return membership.badge || membership.plan_id?.toUpperCase() || 'FREE'
}
