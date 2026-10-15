import React,{useEffect,useMemo,useState} from 'react'
import {
  Activity,BookOpen,BriefcaseBusiness,Code2,Columns3,ExternalLink,FileCode2,
  GitBranch,GitCommitHorizontal,GitPullRequest,Globe2,GraduationCap,Languages,
  MessageSquare,MessagesSquare,Package,PanelTop,RefreshCw,Search,Settings,
  ShieldCheck,Sparkles,Star,Terminal,Users,Wrench,
} from 'lucide-react'
import {supabase} from './services/supabaseClient'
import './ProjectRoadmap.css'

const MENU=[
  ['overview','Overview','Visão geral',PanelTop],
  ['code','Code','Código',Code2],
  ['issues','Issues','Issues',MessageSquare],
  ['prs','Pull Requests','Pull Requests',GitPullRequest],
  ['projects','Projects','Projetos',Columns3],
  ['team','Team','Equipe',Users],
  ['discussions','Discussions','Discussões',MessagesSquare],
  ['releases','Releases','Versões',Package],
  ['actions','Actions','Ações',Activity],
  ['security','Security','Segurança',ShieldCheck],
  ['terminal','Terminal','Terminal',Terminal],
  ['settings','Settings','Configurações',Settings],
  ['community','Community','Comunidade',Globe2],
  ['mentors','Mentors','Mentores',GraduationCap],
  ['recruiting','Recruiting','Recrutamento',BriefcaseBusiness],
  ['reputation','Reputation','Reputação',Star],
  ['team-chat','Team Chat','Chat da equipe',MessagesSquare],
  ['security-score','Security Score','Pontuação de segurança',ShieldCheck],
  ['osv','OSV','OSV',ShieldCheck],
  ['learning','Learning','Aprendizado',BookOpen],
]

export const DEVHUB_MENU_KEYS=Object.fromEntries(MENU.map(([key,en,pt])=>[key,{en,pt}]))

export function useDevHubLanguage(){
  const [language,setLanguageState]=useState(()=>{
    try{return localStorage.getItem('creativezone-devhub-language')||'en'}catch{return 'en'}
  })

  useEffect(()=>{
    let active=true
    if(!supabase) return undefined
    supabase.auth.getUser().then(({data})=>{
      if(!active||!data?.user) return
      return supabase.rpc('get_devhub_language').then(({data:stored,error})=>{
        if(!active||error||!stored) return
        const next=stored==='pt'?'pt':'en'
        setLanguageState(next)
        try{localStorage.setItem('creativezone-devhub-language',next)}catch{}
      })
    }).catch(()=>{})
    return()=>{active=false}
  },[])

  const setLanguage=(value)=>{
    const next=value==='pt'?'pt':'en'
    setLanguageState(next)
    try{localStorage.setItem('creativezone-devhub-language',next)}catch{}
    try{window.dispatchEvent(new CustomEvent('creativezone-devhub-language',{detail:next}))}catch{}
    if(supabase){
      supabase.auth.getUser().then(({data})=>{
        if(data?.user) supabase.rpc('set_devhub_language',{p_language:next}).catch(()=>{})
      }).catch(()=>{})
    }
  }

  useEffect(()=>{
    const handler=(event)=>setLanguageState(event?.detail==='pt'?'pt':'en')
    window.addEventListener('creativezone-devhub-language',handler)
    return()=>window.removeEventListener('creativezone-devhub-language',handler)
  },[])
  return [language,setLanguage]
}

export function devHubLabel(key,language='en'){
  return DEVHUB_MENU_KEYS[key]?.[language]||DEVHUB_MENU_KEYS[key]?.en||key
}

export function ProjectRoadmapNav({active='overview',onSelect}){
  const [language,setLanguage]=useDevHubLanguage()
  const primary=MENU.slice(0,12)
  const creative=MENU.slice(12)

  const renderGroup=(rows)=><div className="project-roadmap__group">
    {rows.map(([key,en,pt,Icon])=><button
      type="button"
      key={key}
      className={active===key?'active':''}
      onClick={()=>onSelect?.(key)}
      title={language==='pt'?en:pt}
    ><Icon/><span>{language==='pt'?pt:en}</span></button>)}
  </div>

  return <section className="project-roadmap">
    <header>
      <div><Sparkles/><span><small>CREATIVEZONE DEVHUB</small><strong>{language==='pt'?'Navegação do projeto':'Project navigation'}</strong></span></div>
      <div className="project-roadmap__language" role="group" aria-label="Idioma do DevHub">
        <button type="button" className={language==='en'?'active':''} onClick={()=>setLanguage('en')}>EN</button>
        <button type="button" className={language==='pt'?'active':''} onClick={()=>setLanguage('pt')}>PT-BR</button>
      </div>
    </header>
    <div className="project-roadmap__scroll">
      {renderGroup(primary)}
      <span className="project-roadmap__divider"/>
      {renderGroup(creative)}
    </div>
  </section>
}
