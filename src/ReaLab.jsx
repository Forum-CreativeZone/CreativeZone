import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileSearch,
  GitBranch,
  Globe2,
  Layers3,
  LockKeyhole,
  Network,
  PackageSearch,
  RefreshCw,
  ScanSearch,
  ServerCog,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  XCircle,
} from 'lucide-react'
import {
  cancelReaLabJob,
  createReaLabJob,
  getReaLabStatus,
  listReaLabJobs,
  reaLabErrorMessage,
} from './services/reaLabApi'
import './ReaLab.css'

const TARGETS=[
  ['website','Website',Globe2,'Estrutura, scripts, rede, comportamento e evidências.'],
  ['javascript','JavaScript',Code2,'Aplicações web, bundles, módulos e source maps.'],
  ['electron','Electron',Layers3,'Renderer, preload, IPC, main process e módulos nativos.'],
  ['dotnet','.NET',PackageSearch,'Assemblies, metadata, CIL e dependências nativas.'],
  ['apk','Android APK',PackageSearch,'Manifest, classes, métodos e recursos.'],
  ['native','Binário nativo',SquareTerminal,'Pseudocódigo, assembly, strings e referências.'],
  ['wasm','WASM',Code2,'Sections, imports, exports e WAT.'],
  ['sqlite','SQLite',ServerCog,'Schema, índices, views, triggers e dados selecionados.'],
  ['har','HAR / rede',Network,'Requests, responses, payloads e evidências de rede.'],
  ['firmware','Firmware',ServerCog,'Regiões, extração e handoff para análise nativa.'],
  ['pcap','PCAP',Network,'Protocolos, endpoints, DNS, TLS e requisições.'],
  ['evm','EVM',Code2,'Selectors, bytecode, argumentos e mutabilidade inferida.'],
  ['flutter','Flutter',PackageSearch,'Snapshot, ABIs, engine e proveniência de build.'],
]

const MODES=[
  {
    id:'analyze',
    icon:ScanSearch,
    title:'Analyze',
    description:'Entenda como o alvo funciona e receba conclusões acompanhadas de evidências e limitações.',
  },
  {
    id:'behavior_spec',
    icon:FileSearch,
    title:'Behavior Specification',
    description:'Transforma a análise em uma especificação estruturada do comportamento observado.',
  },
  {
    id:'rebuild',
    icon:Sparkles,
    title:'Improved Behavioral Rebuild',
    description:'Planeja uma implementação nova e independente, preservando o comportamento útil e propondo melhorias.',
  },
]

const STATUS_LABELS={
  draft:'Rascunho',
  queued:'Na fila',
  waiting_worker:'Aguardando worker',
  running:'Analisando',
  completed:'Concluído',
  failed:'Falhou',
  cancelled:'Cancelado',
}

function planName(value){
  const id=String(value||'free').toUpperCase()
  return id==='OWNER'?'OWNER / ELITE':id
}

function TargetIcon({type}){
  const found=TARGETS.find(([id])=>id===type)
  const Icon=found?.[2]||PackageSearch
  return <Icon/>
}

export function ReaLabPage({ session, navigate, notify }) {
  const [status,setStatus]=useState(null)
  const [jobs,setJobs]=useState([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [mode,setMode]=useState('analyze')
  const [targetType,setTargetType]=useState('website')
  const [sourceType,setSourceType]=useState('url')
  const [reference,setReference]=useState('')
  const [question,setQuestion]=useState('')
  const [objective,setObjective]=useState('')
  const [ack,setAck]=useState(false)

  const caps=status?.plan?.capabilities || {}
  const allowedModes=Array.isArray(caps.modes)?caps.modes:[]
  const allowedTargets=Array.isArray(caps.target_types)?caps.target_types:[]
  const limit=Number(caps.monthly_runs ?? 0)
  const usage=Number(status?.usage||0)
  const workerReady=Boolean(status?.worker_configured)

  async function load(){
    if(!session?.user){
      setStatus(null)
      setJobs([])
      setLoading(false)
      return
    }
    setLoading(true)
    try{
      const [nextStatus,nextJobs]=await Promise.all([
        getReaLabStatus(),
        listReaLabJobs(),
      ])
      setStatus(nextStatus)
      setJobs(nextJobs)
    }catch(error){
      notify?.(reaLabErrorMessage(error))
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{load()},[session?.user?.id])

  useEffect(()=>{
    if(allowedModes.length && !allowedModes.includes(mode)) setMode(allowedModes[0])
  },[allowedModes.join('|')])

  useEffect(()=>{
    if(allowedTargets.length && !allowedTargets.includes(targetType)) setTargetType(allowedTargets[0])
  },[allowedTargets.join('|')])

  const selectedTarget=useMemo(
    ()=>TARGETS.find(([id])=>id===targetType),
    [targetType]
  )

  async function submit(event){
    event.preventDefault()
    if(!session?.user){
      navigate('/entrar')
      return
    }
    setBusy(true)
    try{
      const result=await createReaLabJob({
        mode,
        target_type:targetType,
        source_type:sourceType,
        target_reference:reference,
        question,
        objective,
        acknowledge_lawful_use:ack,
      })
      setReference('')
      setQuestion('')
      setObjective('')
      setAck(false)
      notify?.(
        result?.worker_configured
          ? 'Análise enviada ao REA Lab.'
          : 'Análise criada. Ela aguardará o worker REA isolado.'
      )
      await load()
    }catch(error){
      notify?.(reaLabErrorMessage(error))
    }finally{
      setBusy(false)
    }
  }

  async function cancel(id){
    try{
      await cancelReaLabJob(id)
      notify?.('Análise cancelada.')
      await load()
    }catch(error){
      notify?.(reaLabErrorMessage(error))
    }
  }

  return (
    <section className="rea-lab-page">
      <header className="rea-lab-hero">
        <button className="rea-lab-back" onClick={()=>navigate('/')}>&larr; Voltar</button>
        <div className="rea-lab-hero-grid">
          <div>
            <span className="rea-lab-kicker"><BrainCircuit/> CREATIVEZONE REA LAB</span>
            <h1>Reverse Engineer Anything</h1>
            <p>
              Analise como uma tecnologia funciona, reúna evidências e transforme o conhecimento
              em uma implementação nova, independente e melhor.
            </p>
            <div className="rea-lab-principles">
              <span><ShieldCheck/> Evidência antes de conclusão</span>
              <span><GitBranch/> Implementação independente</span>
              <span><LockKeyhole/> Jobs privados por padrão</span>
            </div>
          </div>
          <aside className="rea-lab-status-card">
            <div>
              <small>PLANO</small>
              <strong>{planName(status?.plan?.plan_id)}</strong>
            </div>
            <div>
              <small>COTA MENSAL</small>
              <strong>{limit<0?usage+' / ilimitado':usage+' / '+limit}</strong>
            </div>
            <div>
              <small>WORKER REA</small>
              <strong className={workerReady?'is-ready':'is-waiting'}>
                {workerReady?'Conectado':'Aguardando infraestrutura'}
              </strong>
            </div>
          </aside>
        </div>
      </header>

      <div className="rea-lab-shell">
        {!session?.user ? (
          <section className="rea-lab-auth">
            <BrainCircuit/>
            <h2>Entre para abrir o REA Lab</h2>
            <p>O histórico de análises é privado e associado à sua conta.</p>
            <button className="action primary-action" onClick={()=>navigate('/entrar')}>Entrar</button>
          </section>
        ) : (
          <>
            <section className="rea-lab-modes">
              <header>
                <div>
                  <small>ETAPA 1</small>
                  <h2>Escolha o objetivo</h2>
                </div>
                <span>O plano atual controla os modos disponíveis.</span>
              </header>
              <div className="rea-lab-mode-grid">
                {MODES.map(item=>{
                  const Icon=item.icon
                  const enabled=allowedModes.includes(item.id)
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={(mode===item.id?'active ':'')+(enabled?'':'disabled')}
                      onClick={()=>enabled&&setMode(item.id)}
                      disabled={!enabled}
                    >
                      <Icon/>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                      {!enabled&&<em>Disponível em plano superior</em>}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rea-lab-targets">
              <header>
                <div>
                  <small>ETAPA 2</small>
                  <h2>Escolha o tipo de alvo</h2>
                </div>
                <span>Suporte baseado nas capacidades reais do REA.</span>
              </header>
              <div className="rea-lab-target-grid">
                {TARGETS.map(([id,label,Icon,description])=>{
                  const enabled=allowedTargets.includes(id)
                  return (
                    <button
                      type="button"
                      key={id}
                      className={(targetType===id?'active ':'')+(enabled?'':'disabled')}
                      onClick={()=>enabled&&setTargetType(id)}
                      disabled={!enabled}
                    >
                      <Icon/>
                      <span><strong>{label}</strong><small>{description}</small></span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rea-lab-create">
              <header>
                <div>
                  <small>ETAPA 3</small>
                  <h2>Crie a investigação</h2>
                </div>
                <span>{selectedTarget?.[1] || targetType}</span>
              </header>

              <form onSubmit={submit}>
                <div className="rea-lab-source-tabs">
                  <button type="button" className={sourceType==='url'?'active':''} onClick={()=>setSourceType('url')}>
                    <Globe2/> URL
                  </button>
                  <button type="button" className={sourceType==='github'?'active':''} onClick={()=>setSourceType('github')}>
                    <GitBranch/> GitHub
                  </button>
                  <button type="button" className={sourceType==='upload'?'active':''} onClick={()=>setSourceType('upload')} disabled>
                    <PackageSearch/> Upload <small>próxima fase</small>
                  </button>
                </div>

                <label>
                  <span>{sourceType==='github'?'Repositório GitHub':'URL do alvo'}</span>
                  <input
                    type="url"
                    value={reference}
                    onChange={(event)=>setReference(event.target.value)}
                    placeholder={sourceType==='github'?'https://github.com/owner/repo':'https://exemplo.com/'}
                    required
                  />
                </label>

                <label>
                  <span>O que você quer entender?</span>
                  <textarea
                    value={question}
                    onChange={(event)=>setQuestion(event.target.value)}
                    placeholder="Ex.: Entenda como a busca funciona, identifique o fluxo e mostre as evidências."
                    maxLength={4000}
                  />
                </label>

                <label>
                  <span>O que pretende construir ou melhorar?</span>
                  <textarea
                    value={objective}
                    onChange={(event)=>setObjective(event.target.value)}
                    placeholder="Ex.: Criar uma implementação independente com UX melhor e maior performance."
                    maxLength={4000}
                  />
                </label>

                <label className="rea-lab-ack">
                  <input type="checkbox" checked={ack} onChange={(event)=>setAck(event.target.checked)}/>
                  <span>
                    Confirmo que vou usar o REA Lab de forma legítima e responsável. O objetivo é compreender,
                    documentar e criar implementação independente — não extrair credenciais, quebrar controles de acesso
                    ou redistribuir código proprietário.
                  </span>
                </label>

                <div className="rea-lab-submit-row">
                  <div>
                    <strong>{workerReady?'Worker disponível':'Worker ainda não conectado'}</strong>
                    <span>
                      {workerReady
                        ? 'O job seguirá para o ambiente isolado.'
                        : 'A fundação já está ativa; jobs ficam em espera até conectarmos o worker REA.'}
                    </span>
                  </div>
                  <button className="action primary-action" disabled={busy||!ack||!reference.trim()}>
                    {busy?<RefreshCw className="is-spinning"/>:<BrainCircuit/>}
                    {busy?'Criando…':'Criar análise'}
                  </button>
                </div>
              </form>
            </section>

            <section className="rea-lab-jobs">
              <header>
                <div>
                  <small>HISTÓRICO</small>
                  <h2>Suas análises</h2>
                </div>
                <button className="action" onClick={load} disabled={loading}><RefreshCw className={loading?'is-spinning':''}/>Atualizar</button>
              </header>

              {loading ? (
                <div className="rea-lab-empty">Carregando REA Lab…</div>
              ) : jobs.length ? (
                <div className="rea-lab-job-list">
                  {jobs.map(job=>(
                    <article key={job.id}>
                      <div className="rea-lab-job-icon"><TargetIcon type={job.target_type}/></div>
                      <div className="rea-lab-job-main">
                        <span>
                          <strong>{job.target_type}</strong>
                          <em>{job.mode}</em>
                        </span>
                        <code>{job.target_reference}</code>
                        <small>{new Date(job.created_at).toLocaleString('pt-BR')}</small>
                      </div>
                      <div className={'rea-lab-job-status status-'+job.status}>
                        {job.status==='completed'?<CheckCircle2/>:job.status==='failed'?<XCircle/>:<Activity/>}
                        <span>{STATUS_LABELS[job.status]||job.status}</span>
                      </div>
                      {!['completed','failed','cancelled'].includes(job.status)&&(
                        <button className="rea-lab-cancel" onClick={()=>cancel(job.id)}>Cancelar</button>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rea-lab-empty">
                  <BrainCircuit/>
                  <strong>Nenhuma análise criada ainda.</strong>
                  <span>Crie sua primeira investigação acima.</span>
                </div>
              )}
            </section>

            <section className="rea-lab-roadmap">
              <div>
                <FileSearch/>
                <span><small>PRO</small><strong>Behavior Specification</strong><em>Comportamento observado, evidências, estados e limitações.</em></span>
              </div>
              <ChevronRight/>
              <div>
                <Sparkles/>
                <span><small>ELITE</small><strong>Improved Behavioral Rebuild</strong><em>Plano de implementação independente + melhorias + testes de compatibilidade.</em></span>
              </div>
              <ChevronRight/>
              <div>
                <GitBranch/>
                <span><small>ELITE</small><strong>DevHub Pipeline</strong><em>Spec → branch → Code Studio → testes → Pull Request.</em></span>
              </div>
            </section>
          </>
        )}
      </div>
    </section>
  )
}
