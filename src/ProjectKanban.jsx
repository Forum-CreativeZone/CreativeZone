import React,{useEffect,useMemo,useRef,useState} from 'react'
import {
  CalendarDays,CheckCircle2,CircleDot,Clock3,Columns3,GitBranch,GitPullRequest,GripVertical,
  ListChecks,LockKeyhole,MessageSquare,Plus,RefreshCw,Save,Send,Trash2,UserRound,X,
} from 'lucide-react'
import {
  addProjectKanbanComment,
  createProjectKanbanCard,
  deleteProjectKanbanCard,
  getProjectKanban,
  getProjectKanbanCard,
  moveProjectKanbanCard,
  updateProjectKanbanCard,
} from './services/projectKanbanApi'
import {supabase} from './services/supabaseClient'
import './ProjectKanban.css'

const PRIORITIES={
  low:'Baixa',
  normal:'Normal',
  high:'Alta',
  urgent:'Urgente',
}
const EMPTY_FORM={
  title:'',
  description:'',
  priority:'normal',
  labels:'',
  assigneeId:'',
  dueAt:'',
  githubIssueNumber:'',
  githubPrNumber:'',
  githubBranch:'',
  checklist:[],
}

function asLocalInput(value){
  if(!value) return ''
  const date=new Date(value)
  if(!Number.isFinite(date.getTime())) return ''
  const pad=(number)=>String(number).padStart(2,'0')
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes())
}
function toIso(value){
  if(!value) return null
  const date=new Date(value)
  return Number.isFinite(date.getTime())?date.toISOString():null
}
function dateLabel(value){
  if(!value) return ''
  const date=new Date(value)
  if(!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(date)
}
function relative(value){
  if(!value) return ''
  const diff=Math.max(0,Date.now()-new Date(value).getTime())
  const minutes=Math.floor(diff/60000)
  if(minutes<1) return 'agora'
  if(minutes<60) return 'há '+minutes+' min'
  const hours=Math.floor(minutes/60)
  if(hours<24) return 'há '+hours+' h'
  const days=Math.floor(hours/24)
  return 'há '+days+' dia'+(days===1?'':'s')
}
function checklistProgress(checklist=[]){
  const rows=Array.isArray(checklist)?checklist:[]
  const done=rows.filter(item=>item?.done).length
  return {done,total:rows.length}
}
function repoBase(project){
  try{
    const url=new URL(project?.repo_url||'')
    if(!/(^|\.)github\.com$/i.test(url.hostname)) return ''
    const parts=url.pathname.split('/').filter(Boolean)
    return parts.length>=2?'https://github.com/'+parts[0]+'/'+parts[1].replace(/\.git$/i,''):''
  }catch{return ''}
}
function githubLink(project,type,number){
  const base=repoBase(project)
  if(!base||!number) return ''
  return base+'/'+(type==='issue'?'issues':'pull')+'/'+number
}
function historyLabel(item,columns){
  const actor=item.actor?.display_name||item.actor?.username||'Membro'
  const from=columns.find(column=>column.id===item.from_column_id)?.title
  const to=columns.find(column=>column.id===item.to_column_id)?.title
  if(item.action_type==='created') return actor+' criou o card'
  if(item.action_type==='completed') return actor+' concluiu o card'
  if(item.action_type==='reopened') return actor+' reabriu o card'
  if(item.action_type==='moved') return actor+' moveu '+(from?'de '+from+' ':'')+(to?'para '+to:'')
  if(item.action_type==='commented') return actor+' comentou'
  if(item.action_type==='updated') return actor+' atualizou o card'
  return actor+' · '+item.action_type
}

export function ProjectKanban({project,session,notify}){
  const [board,setBoard]=useState(null)
  const [loading,setLoading]=useState(Boolean(session?.user))
  const [accessDenied,setAccessDenied]=useState(false)
  const [busy,setBusy]=useState(false)
  const [createColumn,setCreateColumn]=useState(null)
  const [form,setForm]=useState(EMPTY_FORM)
  const [detail,setDetail]=useState(null)
  const [detailLoading,setDetailLoading]=useState(false)
  const [comment,setComment]=useState('')
  const [checkText,setCheckText]=useState('')
  const draggedCard=useRef(null)

  async function load(){
    if(!project?.id||!session?.user){
      setBoard(null)
      setLoading(false)
      return
    }
    try{
      const next=await getProjectKanban(project.id)
      setBoard(next)
      setAccessDenied(false)
    }catch(error){
      const message=String(error?.message||'')
      if(/privado|acesso|equipe|permiss/i.test(message)) setAccessDenied(true)
      else notify?.(message||'Não foi possível carregar o Kanban.')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{setLoading(Boolean(session?.user));load()},[project?.id,session?.user?.id])

  useEffect(()=>{
    if(!supabase||!project?.id||!session?.user||accessDenied) return undefined
    const reload=()=>load()
    const channel=supabase
      .channel('creativezone-project-kanban-'+project.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'project_kanban_columns',filter:`project_id=eq.${project.id}`},reload)
      .on('postgres_changes',{event:'*',schema:'public',table:'project_kanban_cards',filter:`project_id=eq.${project.id}`},reload)
      .on('postgres_changes',{event:'*',schema:'public',table:'project_kanban_comments',filter:`project_id=eq.${project.id}`},reload)
      .subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[project?.id,session?.user?.id,accessDenied])

  const columns=board?.columns||[]
  const cards=board?.cards||[]
  const permissions=board?.permissions||{}
  const members=useMemo(()=>{
    const seen=new Set()
    const result=[]
    const add=(id,profile)=>{
      if(!id||seen.has(id)) return
      seen.add(id)
      result.push({id,profile})
    }
    add(project?.owner_id,project?.owner)
    ;(project?.project_members||[]).filter(item=>item.status==='active').forEach(item=>add(item.user_id,item.profile))
    return result
  },[project])

  function cardsFor(columnId){
    return cards.filter(card=>card.column_id===columnId).sort((a,b)=>Number(a.position)-Number(b.position))
  }

  function resetForm(){
    setForm(EMPTY_FORM)
    setCheckText('')
  }

  function openCreate(column){
    resetForm()
    setCreateColumn(column)
    setDetail(null)
  }

  async function createCard(event){
    event.preventDefault()
    if(!createColumn) return
    setBusy(true)
    try{
      const id=await createProjectKanbanCard(project.id,{
        columnId:createColumn.id,
        title:form.title.trim(),
        description:form.description,
        priority:form.priority,
        labels:form.labels.split(',').map(value=>value.trim()).filter(Boolean).slice(0,12),
        assigneeId:form.assigneeId||null,
        dueAt:toIso(form.dueAt),
        githubIssueNumber:form.githubIssueNumber?Number(form.githubIssueNumber):null,
        githubPrNumber:form.githubPrNumber?Number(form.githubPrNumber):null,
        githubBranch:form.githubBranch.trim()||null,
      })
      setCreateColumn(null)
      resetForm()
      await load()
      notify?.('Card criado no Kanban.')
      if(id) openCard(id)
    }catch(error){notify?.(error?.message||'Não foi possível criar o card.')}
    finally{setBusy(false)}
  }

  async function openCard(cardId){
    setDetailLoading(true)
    try{
      const next=await getProjectKanbanCard(cardId)
      setDetail(next)
      const card=next.card
      setForm({
        title:card.title||'',
        description:card.description||'',
        priority:card.priority||'normal',
        labels:(card.labels||[]).join(', '),
        assigneeId:card.assignee_id||'',
        dueAt:asLocalInput(card.due_at),
        githubIssueNumber:card.github_issue_number||'',
        githubPrNumber:card.github_pr_number||'',
        githubBranch:card.github_branch||'',
        checklist:Array.isArray(card.checklist)?card.checklist:[],
      })
      setComment('')
      setCheckText('')
      setCreateColumn(null)
    }catch(error){notify?.(error?.message||'Não foi possível abrir o card.')}
    finally{setDetailLoading(false)}
  }

  async function saveCard(event){
    event.preventDefault()
    const card=detail?.card
    if(!card) return
    setBusy(true)
    try{
      await updateProjectKanbanCard(card.id,{
        title:form.title.trim(),
        description:form.description,
        priority:form.priority,
        labels:form.labels.split(',').map(value=>value.trim()).filter(Boolean).slice(0,12),
        assigneeId:form.assigneeId||null,
        dueAt:toIso(form.dueAt),
        githubIssueNumber:form.githubIssueNumber?Number(form.githubIssueNumber):null,
        githubPrNumber:form.githubPrNumber?Number(form.githubPrNumber):null,
        githubBranch:form.githubBranch.trim()||null,
        checklist:form.checklist,
      })
      await Promise.all([load(),openCard(card.id)])
      notify?.('Card atualizado.')
    }catch(error){notify?.(error?.message||'Não foi possível atualizar o card.')}
    finally{setBusy(false)}
  }

  async function move(cardId,columnId){
    if(!permissions.can_write) return
    setBusy(true)
    try{
      await moveProjectKanbanCard(cardId,columnId)
      await load()
      if(detail?.card?.id===cardId) await openCard(cardId)
    }catch(error){notify?.(error?.message||'Não foi possível mover o card.')}
    finally{setBusy(false)}
  }

  async function removeCard(){
    const card=detail?.card
    if(!card||!window.confirm('Excluir este card do Kanban?')) return
    setBusy(true)
    try{
      await deleteProjectKanbanCard(card.id)
      setDetail(null)
      resetForm()
      await load()
      notify?.('Card excluído.')
    }catch(error){notify?.(error?.message||'Não foi possível excluir o card.')}
    finally{setBusy(false)}
  }

  async function sendComment(event){
    event.preventDefault()
    const card=detail?.card
    if(!card||!comment.trim()) return
    setBusy(true)
    try{
      await addProjectKanbanComment(card.id,comment.trim())
      setComment('')
      await openCard(card.id)
      await load()
    }catch(error){notify?.(error?.message||'Não foi possível comentar.')}
    finally{setBusy(false)}
  }

  function addChecklistItem(){
    const text=checkText.trim()
    if(!text||form.checklist.length>=50) return
    setForm(current=>({...current,checklist:[...current.checklist,{id:crypto.randomUUID?.()||String(Date.now()),text,done:false}]}))
    setCheckText('')
  }

  function toggleCheck(id){
    setForm(current=>({...current,checklist:current.checklist.map(item=>item.id===id?{...item,done:!item.done}:item)}))
  }

  function removeCheck(id){
    setForm(current=>({...current,checklist:current.checklist.filter(item=>item.id!==id)}))
  }

  if(!session?.user){
    return <section className="project-kanban is-locked"><LockKeyhole/><span><strong>Kanban da equipe</strong><small>Entre na sua conta e participe do projeto para acessar o quadro interno.</small></span></section>
  }
  if(loading&&!board){
    return <section className="project-kanban is-loading"><RefreshCw className="security-spin"/><span>Carregando Kanban...</span></section>
  }
  if(accessDenied){
    return <section className="project-kanban is-locked"><LockKeyhole/><span><strong>Kanban privado</strong><small>O quadro de trabalho é visível somente para membros ativos do projeto.</small></span></section>
  }
  if(!board) return null

  return <section className="project-kanban">
    <header className="project-kanban__head">
      <div><Columns3/><span><small>CREATIVEZONE DEVHUB</small><strong>Kanban do projeto</strong><em>Tarefas, responsáveis, GitHub, checklist e histórico em tempo real.</em></span></div>
      <div>
        <span className="project-kanban__counter">{cards.length} card{cards.length===1?'':'s'}</span>
        <button type="button" className="action" onClick={load}><RefreshCw/>Atualizar</button>
      </div>
    </header>

    <div className="project-kanban__board">
      {columns.map(column=>{
        const rows=cardsFor(column.id)
        return <section
          className={'project-kanban__column '+(column.is_done?'is-done':'')}
          key={column.id}
          onDragOver={event=>{if(permissions.can_write) event.preventDefault()}}
          onDrop={event=>{
            event.preventDefault()
            const id=draggedCard.current
            draggedCard.current=null
            if(id) move(id,column.id)
          }}
        >
          <header>
            <span><b>{column.title}</b><small>{rows.length}</small></span>
            {permissions.can_write&&<button type="button" onClick={()=>openCreate(column)} title={'Criar em '+column.title}><Plus/></button>}
          </header>
          <div className="project-kanban__cards">
            {rows.map(card=>{
              const progress=checklistProgress(card.checklist)
              const overdue=card.due_at&&!card.completed_at&&new Date(card.due_at).getTime()<Date.now()
              const issueUrl=card.github_issue_url||githubLink(project,'issue',card.github_issue_number)
              const prUrl=card.github_pr_url||githubLink(project,'pr',card.github_pr_number)
              return <article
                key={card.id}
                className={'project-kanban-card priority-'+card.priority}
                draggable={Boolean(permissions.can_write)}
                onDragStart={()=>{draggedCard.current=card.id}}
                onDragEnd={()=>{draggedCard.current=null}}
                onClick={()=>openCard(card.id)}
              >
                <div className="project-kanban-card__top">
                  {permissions.can_write&&<GripVertical/>}
                  <span>{PRIORITIES[card.priority]||card.priority}</span>
                  {card.completed_at&&<CheckCircle2/>}
                </div>
                <strong>{card.title}</strong>
                {(card.labels||[]).length>0&&<div className="project-kanban-card__labels">{card.labels.slice(0,4).map(label=><span key={label}>{label}</span>)}</div>}
                <div className="project-kanban-card__meta">
                  {card.assignee&&<span title={card.assignee.display_name||card.assignee.username}>{card.assignee.avatar_url?<img src={card.assignee.avatar_url} alt=""/>:<UserRound/>}</span>}
                  {card.due_at&&<span className={overdue?'overdue':''}><CalendarDays/>{dateLabel(card.due_at)}</span>}
                  {progress.total>0&&<span><ListChecks/>{progress.done}/{progress.total}</span>}
                  {Number(card.comments_count)>0&&<span><MessageSquare/>{card.comments_count}</span>}
                </div>
                {(issueUrl||prUrl||card.github_branch)&&<div className="project-kanban-card__github">
                  {issueUrl&&<a href={issueUrl} target="_blank" rel="noreferrer" onClick={event=>event.stopPropagation()}><CircleDot/>#{card.github_issue_number}</a>}
                  {prUrl&&<a href={prUrl} target="_blank" rel="noreferrer" onClick={event=>event.stopPropagation()}><GitPullRequest/>#{card.github_pr_number}</a>}
                  {card.github_branch&&<span><GitBranch/>{card.github_branch}</span>}
                </div>}
              </article>
            })}
            {!rows.length&&<div className="project-kanban__empty">Solte um card aqui</div>}
          </div>
        </section>
      })}
    </div>

    {createColumn&&<div className="project-kanban-modal" onMouseDown={()=>setCreateColumn(null)}>
      <form className="project-kanban-dialog create" onSubmit={createCard} onMouseDown={event=>event.stopPropagation()}>
        <header><span><Plus/><strong>Novo card</strong><small>{createColumn.title}</small></span><button type="button" onClick={()=>setCreateColumn(null)}><X/></button></header>
        <KanbanFields form={form} setForm={setForm} members={members} repoConnected={Boolean(repoBase(project))}/>
        <footer><button type="button" className="action" onClick={()=>setCreateColumn(null)}>Cancelar</button><button className="action primary-action" disabled={busy}><Plus/>{busy?'Criando...':'Criar card'}</button></footer>
      </form>
    </div>}

    {(detail||detailLoading)&&<div className="project-kanban-modal" onMouseDown={()=>{if(!busy)setDetail(null)}}>
      <div className="project-kanban-dialog detail" onMouseDown={event=>event.stopPropagation()}>
        {detailLoading&&!detail
          ? <div className="project-kanban-detail-loading"><RefreshCw className="security-spin"/>Carregando card...</div>
          : detail&&<>
              <header><span><Columns3/><strong>{detail.card.title}</strong><small>{columns.find(column=>column.id===detail.card.column_id)?.title}</small></span><button type="button" onClick={()=>setDetail(null)}><X/></button></header>
              <div className="project-kanban-dialog__layout">
                <form className="project-kanban-edit" onSubmit={saveCard}>
                  <KanbanFields form={form} setForm={setForm} members={members} repoConnected={Boolean(repoBase(project))}/>
                  <section className="project-kanban-checklist">
                    <header><ListChecks/><strong>Checklist</strong><span>{checklistProgress(form.checklist).done}/{checklistProgress(form.checklist).total}</span></header>
                    <div>{form.checklist.map(item=><label key={item.id}><input type="checkbox" checked={Boolean(item.done)} disabled={!permissions.can_write} onChange={()=>toggleCheck(item.id)}/><span className={item.done?'done':''}>{item.text}</span>{permissions.can_write&&<button type="button" onClick={()=>removeCheck(item.id)}><X/></button>}</label>)}</div>
                    {permissions.can_write&&<div className="project-kanban-check-add"><input maxLength={240} value={checkText} onChange={event=>setCheckText(event.target.value)} placeholder="Adicionar item..." onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addChecklistItem()}}}/><button type="button" onClick={addChecklistItem}><Plus/></button></div>}
                  </section>
                  {permissions.can_write&&<footer><button type="submit" className="action primary-action" disabled={busy}><Save/>{busy?'Salvando...':'Salvar alterações'}</button>{(permissions.can_manage||detail.card.created_by===session.user.id)&&<button type="button" className="action danger-action" onClick={removeCard} disabled={busy}><Trash2/>Excluir</button>}</footer>}
                </form>

                <aside className="project-kanban-side">
                  <section>
                    <header><GitBranch/><strong>Mover card</strong></header>
                    <select disabled={!permissions.can_write||busy} value={detail.card.column_id} onChange={event=>move(detail.card.id,event.target.value)}>{columns.map(column=><option value={column.id} key={column.id}>{column.title}</option>)}</select>
                  </section>
                  <section className="project-kanban-comments">
                    <header><MessageSquare/><strong>Comentários</strong><span>{detail.comments?.length||0}</span></header>
                    <div>{(detail.comments||[]).map(item=><article key={item.id}>{item.user?.avatar_url?<img src={item.user.avatar_url} alt=""/>:<UserRound/>}<span><strong>{item.user?.display_name||item.user?.username||'Membro'}</strong><small>{relative(item.created_at)}</small><p>{item.content}</p></span></article>)}{!(detail.comments||[]).length&&<p className="project-kanban-side-empty">Nenhum comentário.</p>}</div>
                    {permissions.can_write&&<form onSubmit={sendComment}><textarea maxLength={4000} value={comment} onChange={event=>setComment(event.target.value)} placeholder="Escreva um comentário..."/><button className="action" disabled={busy||!comment.trim()}><Send/>Comentar</button></form>}
                  </section>
                  <section className="project-kanban-history">
                    <header><Clock3/><strong>Histórico</strong></header>
                    <div>{(detail.history||[]).slice(0,20).map(item=><p key={item.id}><strong>{historyLabel(item,columns)}</strong><small>{relative(item.created_at)}</small></p>)}</div>
                  </section>
                </aside>
              </div>
            </>}
      </div>
    </div>}
  </section>
}

function KanbanFields({form,setForm,members,repoConnected}){
  return <div className="project-kanban-fields">
    <label className="wide">Título<input required minLength={3} maxLength={160} value={form.title} onChange={event=>setForm({...form,title:event.target.value})}/></label>
    <label className="wide">Descrição<textarea maxLength={5000} value={form.description} onChange={event=>setForm({...form,description:event.target.value})} placeholder="Contexto, objetivo e critérios de conclusão..."/></label>
    <label>Prioridade<select value={form.priority} onChange={event=>setForm({...form,priority:event.target.value})}>{Object.entries(PRIORITIES).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
    <label>Responsável<select value={form.assigneeId} onChange={event=>setForm({...form,assigneeId:event.target.value})}><option value="">Sem responsável</option>{members.map(item=><option value={item.id} key={item.id}>{item.profile?.display_name||item.profile?.username||'Membro'}</option>)}</select></label>
    <label>Prazo<input type="datetime-local" value={form.dueAt} onChange={event=>setForm({...form,dueAt:event.target.value})}/></label>
    <label>Labels<input maxLength={400} value={form.labels} onChange={event=>setForm({...form,labels:event.target.value})} placeholder="frontend, bug, docs"/></label>
    {repoConnected&&<>
      <label>GitHub Issue #<input type="number" min="1" value={form.githubIssueNumber} onChange={event=>setForm({...form,githubIssueNumber:event.target.value})} placeholder="14"/></label>
      <label>Pull Request #<input type="number" min="1" value={form.githubPrNumber} onChange={event=>setForm({...form,githubPrNumber:event.target.value})} placeholder="22"/></label>
      <label className="wide">Branch<input maxLength={255} value={form.githubBranch} onChange={event=>setForm({...form,githubBranch:event.target.value})} placeholder="feature/shader-animation"/></label>
    </>}
  </div>
}
