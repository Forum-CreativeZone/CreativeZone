import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function getMembershipPlans() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('membership_plans')
    .select('id,name,description,badge,rank,entitlements,price_cents,currency')
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

export async function getVisualEffectCatalog() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('visual_effect_catalog')
    .select('effect_id,kind,label,description,min_rank,animated,interactive,owner_only,sort_order')
    .eq('enabled', true)
    .order('kind')
    .order('min_rank')
    .order('sort_order')
  if (error) throw error
  return data || []
}

export async function saveProfileCosmetics(userId, values) {
  const client = requireSupabase()
  const payload = {
    user_id: userId,
    name_color: values.name_color || null,
    profile_title: values.profile_title?.trim() || null,
    avatar_frame: values.avatar_frame || 'avatar-clean',
    cover_effect: values.cover_effect || 'cover-clean',
    badge_style: values.badge_style || 'default',
    name_effect: values.name_effect || 'clean',
    badge_effect: values.badge_effect || 'clean-badge',
    role_effect: values.role_effect || 'clean-role',
    profile_effect: values.profile_effect || 'none',
  }

  const { data, error } = await client
    .from('profile_cosmetics')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function requestMembershipUpgrade(userId, planId, months = 1, message = '') {
  if (!userId) throw new Error('Autenticação necessária.')
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_membership_whatsapp_request', {
    p_plan_id: planId,
    p_months: Math.max(1, Math.min(Number(months) || 1, 36)),
    p_message: message.trim().slice(0, 1000),
  })
  if (error) throw error
  return data
}

export async function getMembershipRequests() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('membership_upgrade_requests')
    .select(
      'id,user_id,plan_id,message,status,reviewed_by,reviewed_at,created_at,months_requested,unit_price_cents,total_price_cents,currency,reference_code,contact_channel,profile:profiles!membership_upgrade_requests_user_id_fkey(id,username,display_name,avatar_url),plan:membership_plans!membership_upgrade_requests_plan_id_fkey(id,name,badge,rank,price_cents,currency)'
    )
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data || []
}

export async function adminGrantMembership({
  userId,
  planId,
  months = 1,
  permanent = false,
  requestId = null,
}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_set_membership', {
    p_user_id: userId,
    p_plan_id: planId,
    p_months: Math.max(1, Math.min(Number(months) || 1, 36)),
    p_permanent: Boolean(permanent),
    p_request_id: requestId || null,
  })
  if (error) throw error
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


export async function getHistoricalBadgeAdminData() {
  const client = requireSupabase()
  const slugs = ['beta-tester','pioneer-creativezone','early-supporter']
  const [profiles, badges, awards] = await Promise.all([
    client
      .from('profiles')
      .select('id,username,display_name,avatar_url,system_owner')
      .eq('account_status','active')
      .order('created_at')
      .limit(200),
    client
      .from('badges')
      .select('id,slug,name,description,icon')
      .in('slug', slugs)
      .order('name'),
    client
      .from('user_badges')
      .select('user_id,badge_id,awarded_at'),
  ])

  for (const result of [profiles,badges,awards]) {
    if (result.error) throw result.error
  }

  const badgeIds = new Set((badges.data || []).map((badge) => badge.id))
  return {
    profiles: profiles.data || [],
    badges: badges.data || [],
    awards: (awards.data || []).filter((award) => badgeIds.has(award.badge_id)),
  }
}

export async function manageHistoricalBadge(userId, badgeSlug, grant = true) {
  const client = requireSupabase()
  const { error } = await client.rpc('manage_historical_badge', {
    p_user_id: userId,
    p_badge_slug: badgeSlug,
    p_grant: Boolean(grant),
  })
  if (error) throw error
}
