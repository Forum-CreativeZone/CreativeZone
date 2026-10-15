import { supabase } from './supabaseClient'

function requireSupabase(){
  if(!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

async function invoke(body){
  const client=requireSupabase()
  const {data,error}=await client.functions.invoke('rea-lab',{body})
  if(error) throw error
  if(data?.error){
    const err=new Error(data.error)
    Object.assign(err,data)
    throw err
  }
  return data
}

export async function getReaLabStatus(){
  return invoke({action:'status'})
}

export async function createReaLabJob(payload){
  const data=await invoke({action:'create_job',...payload})
  return data
}

export async function listReaLabJobs(){
  const data=await invoke({action:'list_jobs'})
  return data?.jobs || []
}

export async function getReaLabJob(jobId){
  return invoke({action:'get_job',job_id:jobId})
}

export async function cancelReaLabJob(jobId){
  return invoke({action:'cancel_job',job_id:jobId})
}

export function reaLabErrorMessage(error){
  const code=String(error?.message||error?.error||'')
  const map={
    authentication_required:'Entre na sua conta para usar o REA Lab.',
    lawful_use_acknowledgement_required:'Confirme o uso responsável antes de criar a análise.',
    rea_monthly_limit_reached:'Você atingiu a cota mensal do seu plano para o REA Lab.',
    mode_not_in_plan:'Este modo não está incluído no seu plano.',
    target_type_not_in_plan:'Este tipo de alvo não está incluído no seu plano.',
    project_integration_not_in_plan:'Integração com projetos não está incluída no seu plano.',
    target_blocked_by_link_shield:'O Link Shield bloqueou este destino por risco conhecido.',
    upload_source_not_enabled_yet:'Upload de artefatos será liberado quando o worker isolado estiver conectado.',
    github_source_required:'Informe uma URL válida do GitHub.',
  }
  return map[code] || code || 'Não foi possível executar a ação no REA Lab.'
}
