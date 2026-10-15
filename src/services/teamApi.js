import { supabase } from './supabaseClient'

function requireSupabase(){
  if(!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

async function functionError(error,fallback='Falha na operação.'){
  const context=error?.context
  if(context && typeof context.json==='function'){
    try{
      const response=typeof context.clone==='function'?context.clone():context
      const body=await response.json()
      if(body?.error) return new Error(String(body.error))
      if(body?.message) return new Error(String(body.message))
    }catch{}
  }
  return new Error(error?.message || fallback)
}

async function invokeTeam(body){
  const client=requireSupabase()
  const {data,error}=await client.functions.invoke('teams-api',{body})
  if(error) throw await functionError(error,'Não foi possível acessar as equipes.')
  if(data?.error) throw new Error(data.error)
  return data
}

export const getCreativeTeams=()=>invokeTeam({action:'list'})
export const createCreativeTeam=(payload)=>invokeTeam({action:'create',...payload})
export const getCreativeTeam=(slug)=>invokeTeam({action:'get',slug})
export const inviteCreativeTeamMember=(teamId,payload)=>invokeTeam({action:'invite',team_id:teamId,...payload})
export const respondCreativeTeamInvite=(inviteId,accept)=>invokeTeam({action:'respond_invite',invite_id:inviteId,accept})
export const setCreativeTeamMemberRole=(teamId,userId,role)=>invokeTeam({action:'set_role',team_id:teamId,user_id:userId,role})
export const removeCreativeTeamMember=(teamId,userId)=>invokeTeam({action:'remove_member',team_id:teamId,user_id:userId})
export const updateCreativeTeam=(teamId,payload)=>invokeTeam({action:'update_team',team_id:teamId,...payload})
export const cancelCreativeTeamInvite=(teamId,inviteId)=>invokeTeam({action:'cancel_invite',team_id:teamId,invite_id:inviteId})
export const createCreativeTeamTopic=(teamId,payload)=>invokeTeam({action:'create_topic',team_id:teamId,...payload})
export const getCreativeTeamTopic=(teamSlug,topicSlug)=>invokeTeam({action:'get_topic',team_slug:teamSlug,topic_slug:topicSlug})
export const replyCreativeTeamTopic=(topicId,content)=>invokeTeam({action:'reply_topic',topic_id:topicId,content})
export const updateCreativeTeamTopic=(topicId,payload)=>invokeTeam({action:'update_topic',topic_id:topicId,...payload})
