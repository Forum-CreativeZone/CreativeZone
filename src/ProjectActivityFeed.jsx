import React,{useEffect,useMemo,useState} from 'react'
import {
  Activity,CheckCircle2,ChevronDown,ChevronUp,CircleDot,ExternalLink,GitCommitHorizontal,GitPullRequest,
  GitPullRequestArrow,RefreshCw,ShieldCheck,Tag,Workflow,XCircle,
} from 'lucide-react'
import {getProjectActivity} from './services/extendedApi'
import {supabase} from './services/supabaseClient'

function dayLabel(value){
  const date=new Date(value)
  const now=new Date()
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()
  const target=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime()
  const diff=Math.round((today-target)/86400000)
  if(diff===0) return 'HOJE'
  if(diff===1) return 'ONTEM'
  return date.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:date.getFullYear()===now.getFullYear()?undefined:'numeric'}).toUpperCase()
}
function timeLabel(value){
  return new Date(value).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
}
function eventIcon(item){
  if(item.source==='security') return <ShieldCheck/>
  if(item.event_type==='commit') return <GitCommitHorizontal/>
  if(item.event_type==='pull_request') return <GitPullRequest/>
  if(item.event_type==='pull_request_review') return <GitPullRequestArrow/>
  if(item.event_type==='issues') return <CircleDot/>
  if(item.event_type==='release') return <Tag/>
  if(item.event_type==='workflow_run') return <Workflow/>
  return <Activity/>
}
function statusIcon(item){
  if(['failure','failed','error'].includes(String(item.status||'').toLowerCase())) return <XCircle/>
  if(['success','merged','published','closed','approved'].includes(String(item.status||'').toLowerCase())) return <CheckCircle2/>
  return null
}
function sourceLabel(item){
  if(item.source==='security') return 'SECURITY'
  if(item.source==='creativezone') return 'CREATIVEZONE'
  if(item.event_type==='workflow_run') return 'GITHUB ACTIONS'
  return 'GITHUB'
}

export function ProjectActivityFeed({projectId,notify}){
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [expanded,setExpanded]=useState(false)
  const [panelOpen,setPanelOpen]=useState(false)

  async function load(){
    if(!projectId) return
    try{
      const next=await getProjectActivity(projectId,60)
      setItems(next)
    }catch(error){
      notify?.(error?.message||'Não foi possível carregar a atividade do projeto.')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{setLoading(true);load()},[projectId])

  useEffect(()=>{
    if(!supabase||!projectId) return undefined
    const channel=supabase
      .channel('creativezone-project-activity-'+projectId)
      .on('postgres_changes',{event:'*',schema:'public',table:'project_activity_feed',filter:`project_id=eq.${projectId}`},load)
      .subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[projectId])

  const visible=useMemo(()=>{
    const sorted=[...items].sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at))
    return expanded?sorted:sorted.slice(0,16)
  },[items,expanded])

  const groups=useMemo(()=>{
    const result=[]
    for(const item of visible){
      const label=dayLabel(item.occurred_at)
      let group=result[result.length-1]
      if(!group||group.label!==label){
        group={label,items:[]}
        result.push(group)
      }
      group.items.push(item)
    }
    return result
  },[visible])

  const latest=items[0]||null

  return <section className={'project-activity-feed '+(panelOpen?'is-open':'is-collapsed')}>
    <header className="project-activity-head">
      <div><Activity/><span><strong>Project Activity</strong><small>{items.length?items.length+' evento(s) registrados'+(latest?' · última atividade '+latest.title:''):'GitHub, Security e CreativeZone em uma única linha do tempo.'}</small></span></div>
      <div className="project-activity-head-actions">
        {panelOpen&&<button type="button" className="action" onClick={load} disabled={loading}><RefreshCw className={loading?'security-spin':''}/>{loading?'Atualizando...':'Atualizar'}</button>}
        <button type="button" className="action" onClick={()=>setPanelOpen(value=>!value)} aria-expanded={panelOpen}>
          {panelOpen?<><ChevronUp/>Minimizar</>:<><ChevronDown/>Expandir</>}
        </button>
      </div>
    </header>

    {panelOpen&&<>
      {loading&&!items.length
        ? <div className="project-activity-loading"><RefreshCw className="security-spin"/>Carregando atividade real do projeto...</div>
        : groups.map(group=><div className="project-activity-day" key={group.label}>
            <div className="project-activity-day-label"><span>{group.label}</span></div>
            <div className="project-activity-timeline">
              {group.items.map(item=><article className={'project-activity-item source-'+item.source+' status-'+(item.status||'neutral')} key={item.id}>
                <span className="project-activity-icon">{eventIcon(item)}</span>
                <div className="project-activity-copy">
                  <small>{sourceLabel(item)} · {timeLabel(item.occurred_at)}</small>
                  <strong>{item.title}</strong>
                  {item.summary&&<p>{item.summary}</p>}
                  {item.event_type==='commit'&&item.metadata?.sha&&<code>{String(item.metadata.sha).slice(0,7)}</code>}
                </div>
                <span className="project-activity-status">{statusIcon(item)}</span>
                {item.target_url&&<a href={item.target_url} target="_blank" rel="noreferrer" className="project-activity-link" aria-label="Abrir no GitHub"><ExternalLink/></a>}
              </article>)}
            </div>
          </div>)}

      {!loading&&!items.length&&<div className="project-activity-empty"><Activity/><span><strong>A atividade aparecerá aqui</strong><small>Commits, Pull Requests, Issues, builds, releases e auditorias de segurança entram automaticamente pelo GitHub e CreativeZone.</small></span></div>}

      {items.length>16&&<footer><button type="button" className="action" onClick={()=>setExpanded(value=>!value)}>{expanded?'Mostrar menos':`Ver mais ${items.length-16} atividade(s)`}</button></footer>}
    </>}
  </section>
}
