import {supabase} from './supabaseClient'

export async function getContributionPassport(userId){
  if(!supabase) throw new Error('Supabase não configurado.')
  const {data,error}=await supabase.rpc('get_contribution_passport',{p_user_id:userId})
  if(error) throw error
  return data || null
}
