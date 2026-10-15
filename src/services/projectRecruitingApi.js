import {supabase} from './supabaseClient'

function requireSupabase(){
  if(!supabase) throw new Error('Supabase não configurado.')
  return supabase
}
async function rpc(name,args){
  const client=requireSupabase()
  const {data,error}=await client.rpc(name,args)
  if(error) throw error
  return data
}

export const getProjectRecruiting=(projectId)=>rpc('get_project_recruiting',{p_project_id:projectId})
export const getProjectRecruitingApplications=(openingId)=>rpc('get_project_recruiting_applications',{p_opening_id:openingId})

export const createProjectRecruitingOpening=(projectId,payload)=>rpc('create_project_recruiting_opening',{
  p_project_id:projectId,
  p_title:payload.title,
  p_category:payload.category||'other',
  p_summary:payload.summary||'',
  p_description:payload.description||'',
  p_skills:payload.skills||[],
  p_commitment:payload.commitment||'',
  p_experience:payload.experience||'',
  p_slots:Number(payload.slots)||1,
  p_visibility:payload.visibility||'public',
})

export const updateProjectRecruitingOpening=(openingId,payload)=>rpc('update_project_recruiting_opening',{
  p_opening_id:openingId,
  p_title:payload.title,
  p_category:payload.category||'other',
  p_summary:payload.summary||'',
  p_description:payload.description||'',
  p_skills:payload.skills||[],
  p_commitment:payload.commitment||'',
  p_experience:payload.experience||'',
  p_slots:Number(payload.slots)||1,
  p_visibility:payload.visibility||'public',
  p_status:payload.status||'open',
})

export const applyProjectRecruiting=(openingId,payload)=>rpc('apply_project_recruiting',{
  p_opening_id:openingId,
  p_message:payload.message||'',
  p_availability:payload.availability||'',
  p_portfolio_url:payload.portfolioUrl||null,
})

export const withdrawProjectRecruitingApplication=(applicationId)=>rpc('withdraw_project_recruiting_application',{
  p_application_id:applicationId,
})

export const reviewProjectRecruitingApplication=(applicationId,status,reviewNote='')=>rpc('review_project_recruiting_application',{
  p_application_id:applicationId,
  p_status:status,
  p_review_note:reviewNote,
})
