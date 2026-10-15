import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export async function requestModerationAnalysis(targetType, targetId, { force = false } = {}) {
  const client=requireSupabase()
  const {data,error}=await client.functions.invoke('moderation-assist',{
    body:{action:'analyze_target',target_type:targetType,target_id:targetId,force:Boolean(force)},
  })
  if(error) throw error
  return data?.assessment || null
}

export function scheduleModerationAnalysis(targetType,targetId) {
  if(!supabase || !targetType || !targetId) return Promise.resolve(null)
  return supabase.functions.invoke('moderation-assist',{
    body:{action:'analyze_target',target_type:targetType,target_id:targetId},
  }).then(({data,error})=>{
    if(error) throw error
    return data?.assessment || null
  }).catch((error)=>{
    console.warn('CreativeZone Moderation Assist:',error?.message || error)
    return null
  })
}

export async function processModerationQueue(limit=15) {
  const client=requireSupabase()
  const safeLimit=Math.max(1,Math.min(Number(limit)||15,30))
  const {data,error}=await client.functions.invoke('moderation-assist',{
    body:{action:'batch',limit:safeLimit},
  })
  if(error) throw error
  return data || {requested:0,completed:0,failed:0}
}

export async function reviewModerationAssessment(assessmentId,status,note='') {
  const client=requireSupabase()
  const {error}=await client.rpc('review_moderation_assessment',{
    p_assessment_id:assessmentId,
    p_status:status,
    p_note:note,
  })
  if(error) throw error
}

export async function getModerationAssessments(status='pending') {
  const client=requireSupabase()
  let query=client
    .from('moderation_assessments')
    .select('*, author:profiles!moderation_assessments_author_id_fkey(id,username,display_name,avatar_url), reviewer:profiles!moderation_assessments_reviewed_by_fkey(id,username,display_name)')
    .order('risk_score',{ascending:false})
    .order('analyzed_at',{ascending:false})
    .limit(150)

  if(status==='attention') {
    query=query.eq('review_status','pending').in('recommendation',['review','urgent'])
  } else if(status==='urgent') {
    query=query.eq('review_status','pending').eq('recommendation','urgent')
  } else if(status!=='all') {
    query=query.eq('review_status',status)
  }
  const {data,error}=await query
  if(error) throw error

  const rows=data || []
  const topicIds=rows.filter((item)=>item.target_type==='topic').map((item)=>item.target_id)
  const postIds=rows.filter((item)=>item.target_type==='post').map((item)=>item.target_id)
  const chatIds=rows.filter((item)=>item.target_type==='chat_message').map((item)=>item.target_id)

  const [topics,posts,chat]=await Promise.all([
    topicIds.length
      ? client.from('topics').select('id,title,content,slug,locked,pinned').in('id',topicIds)
      : Promise.resolve({data:[],error:null}),
    postIds.length
      ? client.from('posts').select('id,topic_id,content').in('id',postIds)
      : Promise.resolve({data:[],error:null}),
    chatIds.length
      ? client.from('chat_messages').select('id,content,deleted_at').in('id',chatIds)
      : Promise.resolve({data:[],error:null}),
  ])

  if(topics.error) throw topics.error
  if(posts.error) throw posts.error
  if(chat.error) throw chat.error

  const topicMap=new Map((topics.data||[]).map((item)=>[item.id,item]))
  const postMap=new Map((posts.data||[]).map((item)=>[item.id,item]))
  const chatMap=new Map((chat.data||[]).map((item)=>[item.id,item]))

  return rows.map((item)=>({
    ...item,
    target_preview:item.target_type==='topic'
      ? topicMap.get(item.target_id)||null
      : item.target_type==='post'
        ? postMap.get(item.target_id)||null
        : chatMap.get(item.target_id)||null,
  }))
}
