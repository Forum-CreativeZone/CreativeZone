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

export const getProjectKanban=(projectId)=>rpc('get_project_kanban',{p_project_id:projectId})
export const getProjectKanbanCard=(cardId)=>rpc('get_project_kanban_card',{p_card_id:cardId})

export const createProjectKanbanCard=(projectId,payload)=>rpc('create_project_kanban_card',{
  p_project_id:projectId,
  p_column_id:payload.columnId,
  p_title:payload.title,
  p_description:payload.description||'',
  p_priority:payload.priority||'normal',
  p_labels:payload.labels||[],
  p_assignee_id:payload.assigneeId||null,
  p_due_at:payload.dueAt||null,
  p_github_issue_number:payload.githubIssueNumber||null,
  p_github_issue_url:payload.githubIssueUrl||null,
  p_github_pr_number:payload.githubPrNumber||null,
  p_github_pr_url:payload.githubPrUrl||null,
  p_github_branch:payload.githubBranch||null,
})

export const updateProjectKanbanCard=(cardId,payload)=>rpc('update_project_kanban_card',{
  p_card_id:cardId,
  p_title:payload.title,
  p_description:payload.description||'',
  p_priority:payload.priority||'normal',
  p_labels:payload.labels||[],
  p_assignee_id:payload.assigneeId||null,
  p_due_at:payload.dueAt||null,
  p_github_issue_number:payload.githubIssueNumber||null,
  p_github_issue_url:payload.githubIssueUrl||null,
  p_github_pr_number:payload.githubPrNumber||null,
  p_github_pr_url:payload.githubPrUrl||null,
  p_github_branch:payload.githubBranch||null,
  p_checklist:payload.checklist||[],
})

export const moveProjectKanbanCard=(cardId,columnId)=>rpc('move_project_kanban_card',{
  p_card_id:cardId,
  p_column_id:columnId,
})

export const deleteProjectKanbanCard=(cardId)=>rpc('delete_project_kanban_card',{p_card_id:cardId})
export const addProjectKanbanComment=(cardId,content)=>rpc('add_project_kanban_comment',{
  p_card_id:cardId,
  p_content:content,
})
