import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Image as ImageIcon,
  LockKeyhole,
  MessageSquarePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
  Wrench,
  Workflow,
} from 'lucide-react'
import {
  commitProjectStudioBatch,
  commitProjectStudioFile,
  createProjectSecurityFix,
  createProjectStudioBranch,
  createProjectStudioIssue,
  createProjectStudioPullRequest,
  addProjectStudioIssueComment,
  deleteProjectStudioFile,
  getProjectSecurityFixes,
  getProjectStudioBranches,
  getProjectStudioCi,
  getProjectStudioCommits,
  getProjectStudioIssues,
  getProjectStudioIssueComments,
  getProjectStudioPullRequests,
  getProjectStudioPullRequestReviews,
  getProjectStudioRepositorySettings,
  getProjectStudioStatus,
  getProjectStudioTree,
  mergeProjectStudioPullRequest,
  reviewProjectStudioPullRequest,
  readProjectStudioFile,
  previewProjectStudioFile,
  runProjectStudioTerminal,
  runProjectStudioCode,
  updateProjectStudioIssue,
  updateProjectStudioRepositorySettings,
} from './services/githubStudioApi'

function StudioLocked({ plan }) {
  return (
    <section className="project-studio locked">
      <header><Code2/><span><small>CREATIVEZONE DEVHUB · ELITE</small><strong>Dev Workspace</strong></span><LockKeyhole/></header>
      <p>O Dev Workspace coloca código, branches, commits, Issues, Pull Requests, CI/CD, segurança e Git dentro do fórum.</p>
      <small>Plano atual: {(plan?.plan_id || 'free').toUpperCase()} · o workspace completo está disponível no ELITE.</small>
    </section>
  )
}

function readFileAsBase64(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onerror=()=>reject(reader.error || new Error('Falha ao ler o arquivo.'))
    reader.onload=()=>{
      const value=String(reader.result || '')
      resolve(value.includes(',') ? value.slice(value.indexOf(',')+1) : value)
    }
    reader.readAsDataURL(file)
  })
}

function shortDate(value) {
  if(!value) return ''
  try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}
  catch{return ''}
}

function buildFileTree(files=[]) {
  const root=[]
  const folderMap=new Map()
  const ensureFolder=(parts,index,parent,pathPrefix)=>{
    const name=parts[index]
    const path=pathPrefix ? pathPrefix+'/'+name : name
    let folder=folderMap.get(path)
    if(!folder){
      folder={type:'folder',name,path,children:[]}
      folderMap.set(path,folder)
      parent.push(folder)
    }
    return folder
  }
  for(const file of files){
    const path=String(file.path||'')
    if(!path) continue
    const parts=path.split('/').filter(Boolean)
    let parent=root
    let prefix=''
    for(let index=0;index<parts.length-1;index++){
      const folder=ensureFolder(parts,index,parent,prefix)
      parent=folder.children
      prefix=folder.path
    }
    parent.push({...file,type:'file',name:parts[parts.length-1],path})
  }
  const sortNodes=(nodes)=>{
    nodes.sort((a,b)=>{
      if(a.type!==b.type) return a.type==='folder'?-1:1
      return String(a.name).localeCompare(String(b.name),'pt-BR',{sensitivity:'base'})
    })
    nodes.forEach(node=>{if(node.type==='folder') sortNodes(node.children)})
  }
  sortNodes(root)
  return root
}

export function ProjectStudio({ project, canManage = false, notify }) {
  const [status,setStatus]=useState(null)
  const [loading,setLoading]=useState(false)
  const [tab,setTab]=useState('code')
  const [files,setFiles]=useState([])
  const [query,setQuery]=useState('')
  const [branches,setBranches]=useState([])
  const [branch,setBranch]=useState('')
  const [baseBranch,setBaseBranch]=useState('')
  const [newBranch,setNewBranch]=useState('')
  const [selected,setSelected]=useState('')
  const [selectedMeta,setSelectedMeta]=useState(null)
  const [preview,setPreview]=useState(null)
  const [editMenuOpen,setEditMenuOpen]=useState(false)
  const [terminalEditor,setTerminalEditor]=useState(null)
  const [terminalEditorMessage,setTerminalEditorMessage]=useState('')
  const [content,setContent]=useState('')
  const [original,setOriginal]=useState('')
  const [message,setMessage]=useState('')
  const [newPath,setNewPath]=useState('')
  const [expandedFolders,setExpandedFolders]=useState(()=>new Set())
  const [commitInfo,setCommitInfo]=useState(null)
  const [commits,setCommits]=useState([])
  const [issues,setIssues]=useState([])
  const [issueTitle,setIssueTitle]=useState('')
  const [issueBody,setIssueBody]=useState('')
  const [selectedIssue,setSelectedIssue]=useState(null)
  const [issueComments,setIssueComments]=useState([])
  const [issueComment,setIssueComment]=useState('')
  const [pulls,setPulls]=useState([])
  const [selectedPull,setSelectedPull]=useState(null)
  const [pullReviews,setPullReviews]=useState([])
  const [reviewBody,setReviewBody]=useState('')
  const [settings,setSettings]=useState(null)
  const [settingsForm,setSettingsForm]=useState({description:'',homepage:'',has_issues:true,has_projects:true,has_wiki:false})
  const [ciRuns,setCiRuns]=useState([])
  const [fixes,setFixes]=useState([])
  const [terminalLines,setTerminalLines]=useState([{type:'system',text:'CreativeZone Git Terminal — digite help para ver os comandos disponíveis.'}])
  const [terminalCommand,setTerminalCommand]=useState('')
  const [runnerSource,setRunnerSource]=useState('')
  const [runnerLanguage,setRunnerLanguage]=useState('javascript')
  const [runnerStdin,setRunnerStdin]=useState('')
  const [runnerResult,setRunnerResult]=useState(null)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const uploadRef=useRef(null)

  useEffect(()=>{
    let active=true
    if(!project?.id || !canManage) return undefined
    setLoading(true)
    getProjectStudioStatus(project.id)
      .then(async(result)=>{
        if(!active) return
        setStatus(result)
        const base=result?.repository?.default_branch || 'main'
        setBaseBranch(base)
        setBranch(base)
        if(result?.enabled){
          const [treeResult,branchResult]=await Promise.all([
            getProjectStudioTree(project.id,base),
            getProjectStudioBranches(project.id),
          ])
          if(!active) return
          const loadedFiles=treeResult.files || []
          setFiles(loadedFiles)
          setExpandedFolders(new Set(loadedFiles.map(item=>String(item.path||'').split('/')[0]).filter((name,index,self)=>name && self.indexOf(name)===index)))
          setBranches(branchResult.branches || [])
        }
      })
      .catch((next)=>active && setError(next?.message || 'Não foi possível abrir o Dev Workspace.'))
      .finally(()=>active && setLoading(false))
    return()=>{active=false}
  },[project?.id,canManage])

  const visibleFiles=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    return needle?files.filter(item=>String(item.path).toLowerCase().includes(needle)):files
  },[files,query])

  const fileTree=useMemo(()=>buildFileTree(visibleFiles),[visibleFiles])

  if(!canManage) return null
  if(loading) return <section className="project-studio loading"><RefreshCw className="security-spin"/> Preparando Dev Workspace...</section>
  if(!status) return error?<section className="project-studio locked"><p>{error}</p></section>:null
  if(!status.enabled) return <StudioLocked plan={status.plan}/>

  async function refreshTree(nextBranch=branch || baseBranch) {
    setBusy('tree');setError('')
    try{
      const result=await getProjectStudioTree(project.id,nextBranch)
      const loadedFiles=result.files || []
      setFiles(loadedFiles)
      setExpandedFolders(current=>{
        if(current.size) return current
        return new Set(loadedFiles.map(item=>String(item.path||'').split('/')[0]).filter(Boolean))
      })
      setBranch(result.branch || nextBranch)
    }catch(next){setError(next?.message || 'Não foi possível listar os arquivos.')}
    finally{setBusy('')}
  }

  async function refreshBranches() {
    setBusy('branches');setError('')
    try{const result=await getProjectStudioBranches(project.id);setBranches(result.branches || [])}
    catch(next){setError(next?.message || 'Não foi possível carregar as branches.')}
    finally{setBusy('')}
  }

  async function chooseBranch(nextBranch) {
    setBranch(nextBranch)
    setCommitInfo(null)
    setSelected('')
    setSelectedMeta(null)
    setPreview(null)
    setEditMenuOpen(false)
    setContent('')
    setOriginal('')
    await refreshTree(nextBranch)
  }

  async function openFile(item) {
    const path=typeof item==='string'?item:item?.path
    if(!path) return
    const meta=typeof item==='object'?item:null
    setSelected(path)
    setSelectedMeta(meta)
    setPreview(null)
    setEditMenuOpen(false)
    setError('')

    const isImage=/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(path)
    if(isImage){
      setContent('')
      setOriginal('')
      setBusy('preview')
      try{
        const result=await previewProjectStudioFile(project.id,{
          path,
          branch:branch || baseBranch,
          sha:meta?.sha,
          size:meta?.size,
        })
        setPreview(result)
      }catch(next){
        setError(next?.message || 'Não foi possível visualizar a imagem.')
      }finally{
        setBusy('')
      }
      return
    }

    if(meta?.editable===false){
      setContent('')
      setOriginal('')
      return
    }

    setBusy('file')
    try{
      const result=await readProjectStudioFile(project.id,path,branch || baseBranch)
      setSelected(result.path)
      setSelectedMeta(current=>current || {path:result.path,editable:true})
      setContent(result.content || '')
      setOriginal(result.content || '')
    }catch(next){setError(next?.message || 'Não foi possível abrir o arquivo.')}
    finally{setBusy('')}
  }

  function createFileDraft() {
    const path=newPath.trim().replace(/^\/+/, '')
    if(!path) return notify?.('Informe o caminho do novo arquivo.')
    setSelected(path)
    setSelectedMeta({path,editable:true,binary:false,size:0,new:true})
    setContent('')
    setOriginal('__creativezone_new_file__')
    setNewPath('')
  }

  function createFolderDraft() {
    const folder=newPath.trim().replace(/^\/+|\/+$/g,'')
    if(!folder) return notify?.('Informe o caminho da nova pasta.')
    const path=folder+'/.gitkeep'
    setExpandedFolders(current=>new Set([...current,folder,...folder.split('/').map((_,index,parts)=>parts.slice(0,index+1).join('/'))]))
    setSelected(path)
    setSelectedMeta({path,editable:true,binary:false,size:0,new:true})
    setContent('')
    setOriginal('__creativezone_new_file__')
    setNewPath('')
    notify?.('Pasta preparada. Faça o commit para criá-la no GitHub.')
  }

  function toggleFolder(path) {
    setExpandedFolders(current=>{
      const next=new Set(current)
      if(next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function renderTree(nodes,depth=0) {
    return nodes.map(node=>{
      if(node.type==='folder'){
        const open=expandedFolders.has(node.path) || Boolean(query.trim())
        return <React.Fragment key={'folder:'+node.path}>
          <button
            type="button"
            className="studio-tree-folder"
            style={{'--tree-depth':depth}}
            onClick={()=>toggleFolder(node.path)}
            title={open?'Recolher pasta':'Expandir pasta'}
          >
            {open?<ChevronDown/>:<ChevronRight/>}
            {open?<FolderOpen/>:<Folder/>}
            <span>{node.name}</span>
          </button>
          {open&&renderTree(node.children,depth+1)}
        </React.Fragment>
      }
      return <button
        type="button"
        key={node.path}
        className={'studio-tree-file '+(selected===node.path?'active':'')}
        style={{'--tree-depth':depth}}
        onClick={()=>openFile(node)}
        title={node.path}
      ><FileCode2/><span>{node.name}</span></button>
    })
  }

  function openDirectEditor() {
    if(!selected || selectedMeta?.editable===false) return
    setEditMenuOpen(false)
    setTab('code')
  }

  function openTerminalEditor() {
    if(!selected || selectedMeta?.editable===false) return
    setEditMenuOpen(false)
    setTerminalEditor({
      path:selected,
      content,
      original,
    })
    setTerminalEditorMessage('')
    setTab('terminal')
    setTerminalLines(lines=>[
      ...lines,
      {type:'system',text:'editor '+selected+' aberto no terminal CreativeZone.'},
    ])
  }

  async function saveTerminalEditor() {
    if(!terminalEditor || terminalEditor.content===terminalEditor.original) return
    setBusy('terminal-editor');setError('')
    try{
      const requestedBranch=branch && branch!==baseBranch ? branch : undefined
      const result=await commitProjectStudioFile(project.id,{
        path:terminalEditor.path,
        content:terminalEditor.content,
        message:terminalEditorMessage || ('Edit '+terminalEditor.path+' via CreativeZone Terminal'),
        branch:requestedBranch,
      })
      setTerminalEditor(current=>current?{...current,original:current.content}:current)
      setTerminalEditorMessage('')
      setCommitInfo(result)
      setBranch(result.branch)
      setContent(terminalEditor.content)
      setOriginal(terminalEditor.content)
      notify?.('Arquivo salvo e commitado pelo terminal CreativeZone.')
      setTerminalLines(lines=>[
        ...lines,
        {type:'output',text:'[saved] '+terminalEditor.path+'\ncommit '+String(result?.commit?.sha || '').slice(0,12)},
      ])
      await Promise.all([refreshTree(result.branch),refreshBranches()])
    }catch(next){
      const msg=next?.message || 'Não foi possível salvar pelo terminal.'
      setError(msg)
      notify?.(msg)
    }finally{setBusy('')}
  }

  async function commit() {
    if(!selected || content===original) return
    setBusy('commit');setError('')
    try{
      const requestedBranch=commitInfo?.branch || (branch && branch!==baseBranch?branch:undefined)
      const result=await commitProjectStudioFile(project.id,{
        path:selected,
        content,
        message:message || ((original==='__creativezone_new_file__'?'Create ':'Update ')+selected+' via CreativeZone'),
        branch:requestedBranch,
      })
      setCommitInfo(result)
      setBranch(result.branch)
      setOriginal(content)
      setMessage('')
      notify?.('Commit criado diretamente pelo CreativeZone.')
      await Promise.all([refreshTree(result.branch),refreshBranches()])
    }catch(next){const msg=next?.message || 'Falha ao criar commit.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function ensureWorkBranch() {
    if(branch && branch!==baseBranch) return branch
    const next=('creativezone/'+Date.now()).slice(0,80)
    const result=await createProjectStudioBranch(project.id,{branch:next,base_branch:baseBranch})
    setBranch(result.branch)
    await refreshBranches()
    return result.branch
  }

  async function renameCurrentFile() {
    if(!selected || original==='__creativezone_new_file__') return
    const nextPath=window.prompt('Novo caminho/nome do arquivo:',selected)?.trim().replace(/^\/+/, '')
    if(!nextPath || nextPath===selected) return
    setBusy('rename');setError('')
    try{
      const workBranch=await ensureWorkBranch()
      const result=await commitProjectStudioBatch(project.id,{
        branch:workBranch,
        message:'Move '+selected+' to '+nextPath+' via CreativeZone',
        changes:[
          {path:nextPath,content_text:content},
          {path:selected,delete:true},
        ],
      })
      setSelected(nextPath)
      setCommitInfo(result)
      notify?.('Arquivo movido/renomeado em um único commit.')
      await refreshTree(workBranch)
    }catch(next){const msg=next?.message || 'Não foi possível mover o arquivo.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function removeCurrentFile() {
    if(!selected || !window.confirm('Excluir “'+selected+'” do repositório? A alteração será commitada em uma branch.')) return
    setBusy('delete');setError('')
    try{
      const workBranch=await ensureWorkBranch()
      await deleteProjectStudioFile(project.id,{
        path:selected,
        branch:workBranch,
        message:'Delete '+selected+' via CreativeZone',
      })
      setSelected('');setContent('');setOriginal('')
      notify?.('Arquivo excluído e commitado pelo CreativeZone.')
      await refreshTree(workBranch)
    }catch(next){const msg=next?.message || 'Não foi possível excluir o arquivo.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function uploadFiles(event) {
    const selectedFiles=Array.from(event.target.files || [])
    event.target.value=''
    if(!selectedFiles.length) return
    if(selectedFiles.length>40) return notify?.('Envie no máximo 40 arquivos por commit.')
    setBusy('upload');setError('')
    try{
      let workBranch=branch && branch!==baseBranch?branch:''
      if(!workBranch) workBranch=await ensureWorkBranch()
      const changes=[]
      for(const file of selectedFiles){
        changes.push({
          path:file.webkitRelativePath || file.name,
          content_base64:await readFileAsBase64(file),
        })
      }
      const result=await commitProjectStudioBatch(project.id,{
        branch:workBranch,
        message:'Upload de '+selectedFiles.length+' arquivo(s) via CreativeZone',
        changes,
      })
      setCommitInfo(result)
      notify?.(selectedFiles.length+' arquivo(s) enviados em um único commit no GitHub.')
      await Promise.all([refreshTree(workBranch),refreshBranches()])
    }catch(next){const msg=next?.message || 'Falha no upload.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function createBranch() {
    if(!newBranch.trim()) return
    setBusy('new-branch');setError('')
    try{
      const result=await createProjectStudioBranch(project.id,{branch:newBranch.trim(),base_branch:branch || baseBranch})
      setNewBranch('')
      setBranch(result.branch)
      setCommitInfo(null)
      await Promise.all([refreshBranches(),refreshTree(result.branch)])
      notify?.('Branch '+result.branch+' criada.')
    }catch(next){setError(next?.message || 'Não foi possível criar a branch.')}
    finally{setBusy('')}
  }

  async function loadCommits() {
    setBusy('commits');setError('')
    try{const result=await getProjectStudioCommits(project.id,branch || baseBranch);setCommits(result.commits || [])}
    catch(next){setError(next?.message || 'Não foi possível carregar commits.')}
    finally{setBusy('')}
  }

  async function loadIssues() {
    setBusy('issues');setError('')
    try{const result=await getProjectStudioIssues(project.id,'all');setIssues(result.issues || [])}
    catch(next){setError(next?.message || 'Não foi possível carregar Issues.')}
    finally{setBusy('')}
  }

  async function createIssue(event) {
    event.preventDefault()
    if(!issueTitle.trim()) return
    setBusy('new-issue');setError('')
    try{
      await createProjectStudioIssue(project.id,{title:issueTitle.trim(),body:issueBody.trim()})
      setIssueTitle('');setIssueBody('')
      notify?.('Issue criada no GitHub sem sair do fórum.')
      await loadIssues()
    }catch(next){const msg=next?.message || 'Não foi possível criar a Issue.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function loadPulls() {
    setBusy('prs');setError('')
    try{const result=await getProjectStudioPullRequests(project.id,'all');setPulls(result.pull_requests || [])}
    catch(next){setError(next?.message || 'Não foi possível carregar Pull Requests.')}
    finally{setBusy('')}
  }


  async function toggleIssue(item) {
    setBusy('issue-state:'+item.number);setError('')
    try{
      await updateProjectStudioIssue(project.id,{number:item.number,state:item.state==='open'?'closed':'open'})
      await loadIssues()
      notify?.('Issue #'+item.number+' '+(item.state==='open'?'fechada.':'reaberta.'))
    }catch(next){const msg=next?.message || 'Não foi possível atualizar a Issue.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function openIssueComments(item) {
    setSelectedIssue(item)
    setIssueComment('')
    setBusy('issue-comments');setError('')
    try{
      const result=await getProjectStudioIssueComments(project.id,item.number)
      setIssueComments(result.comments || [])
    }catch(next){setError(next?.message || 'Não foi possível carregar comentários.')}
    finally{setBusy('')}
  }

  async function submitIssueComment(event) {
    event.preventDefault()
    if(!selectedIssue || !issueComment.trim()) return
    setBusy('issue-comment');setError('')
    try{
      await addProjectStudioIssueComment(project.id,selectedIssue.number,issueComment.trim())
      setIssueComment('')
      await openIssueComments(selectedIssue)
      notify?.('Comentário publicado na Issue pelo CreativeZone.')
    }catch(next){const msg=next?.message || 'Não foi possível comentar.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function createPr() {
    const source=commitInfo?.branch || (branch!==baseBranch?branch:'')
    if(!source) return notify?.('Crie uma branch ou faça uma alteração antes de abrir a Pull Request.')
    setBusy('pr');setError('')
    try{
      const result=await createProjectStudioPullRequest(project.id,{
        branch:source,
        base_branch:commitInfo?.base_branch || baseBranch,
        title:'CreativeZone: '+(selected || source),
      })
      setCommitInfo(current=>({...current,pull_request:result.pull_request}))
      notify?.('Pull Request criada pelo CreativeZone.')
      setTab('prs')
      await loadPulls()
    }catch(next){const msg=next?.message || 'Falha ao criar Pull Request.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }


  async function openPullReviews(item) {
    setSelectedPull(item)
    setReviewBody('')
    setBusy('reviews');setError('')
    try{
      const result=await getProjectStudioPullRequestReviews(project.id,item.number)
      setPullReviews(result.reviews || [])
    }catch(next){setError(next?.message || 'Não foi possível carregar as reviews.')}
    finally{setBusy('')}
  }

  async function submitReview(eventName) {
    if(!selectedPull) return
    setBusy('review');setError('')
    try{
      await reviewProjectStudioPullRequest(project.id,selectedPull.number,eventName,reviewBody.trim())
      setReviewBody('')
      await openPullReviews(selectedPull)
      notify?.('Review enviada pelo CreativeZone.')
    }catch(next){const msg=next?.message || 'Não foi possível enviar a review.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function loadSettings() {
    setBusy('settings');setError('')
    try{
      const result=await getProjectStudioRepositorySettings(project.id)
      setSettings(result.settings || null)
      setSettingsForm({
        description:result.settings?.description || '',
        homepage:result.settings?.homepage || '',
        has_issues:Boolean(result.settings?.has_issues),
        has_projects:Boolean(result.settings?.has_projects),
        has_wiki:Boolean(result.settings?.has_wiki),
      })
    }catch(next){setError(next?.message || 'Não foi possível carregar as configurações.')}
    finally{setBusy('')}
  }

  async function saveSettings(event) {
    event.preventDefault()
    setBusy('save-settings');setError('')
    try{
      const result=await updateProjectStudioRepositorySettings(project.id,settingsForm)
      setSettings(current=>({...current,...result.settings}))
      notify?.('Configurações do repositório atualizadas pelo CreativeZone.')
    }catch(next){const msg=next?.message || 'Não foi possível salvar as configurações.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function mergePr(number) {
    if(!window.confirm('Fazer merge da Pull Request #'+number+'?')) return
    setBusy('merge:'+number);setError('')
    try{
      const result=await mergeProjectStudioPullRequest(project.id,number,'squash')
      notify?.(result.merged?'Pull Request integrada com sucesso.':(result.message || 'O GitHub não permitiu o merge.'))
      await loadPulls()
    }catch(next){const msg=next?.message || 'Não foi possível fazer merge.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }

  async function loadCi() {
    setBusy('ci');setError('')
    try{const result=await getProjectStudioCi(project.id,branch || baseBranch);setCiRuns(result.runs || [])}
    catch(next){setError(next?.message || 'Não foi possível carregar CI/CD.')}
    finally{setBusy('')}
  }

  async function loadFixes() {
    setBusy('fixes');setError('')
    try{const result=await getProjectSecurityFixes(project.id);setFixes(result.fixes || [])}
    catch(next){setError(next?.message || 'Não foi possível carregar correções.')}
    finally{setBusy('')}
  }

  async function autoFix(id) {
    setBusy('autofix:'+id);setError('')
    try{
      const result=await createProjectSecurityFix(project.id,id)
      notify?.('AutoFix criou uma Pull Request para revisão dentro do DevHub.')
      if(result?.pull_request){setTab('prs');await loadPulls()}
    }catch(next){const msg=next?.message || 'Não foi possível criar a correção.';setError(msg);notify?.(msg)}
    finally{setBusy('')}
  }


  function languageForPath(path) {
    const ext=String(path||'').split('.').pop()?.toLowerCase()
    return ({
      js:'javascript',mjs:'javascript',cjs:'javascript',
      ts:'typescript',tsx:'typescript',
      py:'python',sh:'bash',bash:'bash',
      cpp:'cpp',cc:'cpp',cxx:'cpp',c:'c',
      java:'java',cs:'csharp',go:'go',rs:'rust',php:'php',rb:'ruby',
    })[ext] || 'javascript'
  }

  async function runCode() {
    if(!runnerSource.trim()) return notify?.('Adicione código para executar.')
    setBusy('runner');setError('');setRunnerResult(null)
    try{
      const result=await runProjectStudioCode(project.id,{
        source_code:runnerSource,
        language:runnerLanguage,
        stdin:runnerStdin,
      })
      setRunnerResult(result)
    }catch(next){
      const msg=next?.message || 'Não foi possível executar o código.'
      setError(msg);notify?.(msg)
    }finally{setBusy('')}
  }

  async function runTerminal(event) {
    event.preventDefault()
    const command=terminalCommand.trim()
    if(!command) return
    setTerminalCommand('')
    setTerminalLines(lines=>[...lines,{type:'command',text:'$ '+command}])
    setBusy('terminal');setError('')
    try{
      const result=await runProjectStudioTerminal(project.id,command,branch || baseBranch)
      if(result.branch && result.branch!==branch){
        setBranch(result.branch)
        await Promise.all([refreshBranches(),refreshTree(result.branch)])
      }
      setTerminalLines(lines=>[...lines,{type:'output',text:result.output || ''}])
    }catch(next){
      const msg=next?.message || 'Comando não executado.'
      setTerminalLines(lines=>[...lines,{type:'error',text:msg}])
    }finally{setBusy('')}
  }

  function changeTab(next) {
    setTab(next)
    if(next==='branches'&&!branches.length) refreshBranches()
    if(next==='commits') loadCommits()
    if(next==='issues') loadIssues()
    if(next==='prs') loadPulls()
    if(next==='ci') loadCi()
    if(next==='security'&&!fixes.length) loadFixes()
    if(next==='settings'&&!settings) loadSettings()
    if(next==='runner'){
      if(selected && content){
        setRunnerSource(content)
        setRunnerLanguage(languageForPath(selected))
      }
    }
  }

  return (
    <section className="project-studio devhub-workspace">
      <header className="project-studio-head">
        <Code2/>
        <span><small>CREATIVEZONE DEVHUB · {String(status.plan?.plan_id || 'elite').toUpperCase()}</small><strong>Dev Workspace</strong></span>
        <em><GitBranch/>{branch || baseBranch}</em>
        <small className="studio-role">permissão: {status.role || 'contributor'}</small>
      </header>

      <nav className="project-studio-tabs devhub-tabs">
        <button className={tab==='code'?'active':''} onClick={()=>changeTab('code')}><FileCode2/>Código</button>
        <button className={tab==='issues'?'active':''} onClick={()=>changeTab('issues')}><MessageSquarePlus/>Issues</button>
        <button className={tab==='prs'?'active':''} onClick={()=>changeTab('prs')}><GitPullRequest/>Pull Requests</button>
        <button className={tab==='branches'?'active':''} onClick={()=>changeTab('branches')}><GitBranch/>Branches</button>
        <button className={tab==='commits'?'active':''} onClick={()=>changeTab('commits')}><GitCommitHorizontal/>Commits</button>
        <button className={tab==='terminal'?'active':''} onClick={()=>changeTab('terminal')}><Terminal/>Git Terminal</button>
        <button className={tab==='runner'?'active':''} onClick={()=>changeTab('runner')}><Code2/>Executar código</button>
        <button className={tab==='ci'?'active':''} onClick={()=>changeTab('ci')}><Workflow/>CI/CD</button>
        <button className={tab==='security'?'active':''} onClick={()=>changeTab('security')}><ShieldCheck/>Segurança</button>
        <button className={tab==='settings'?'active':''} onClick={()=>changeTab('settings')}><Wrench/>Configurações</button>
      </nav>

      {error&&<p className="project-studio-error"><AlertTriangle/>{error}</p>}

      {tab==='code'&&<div className="project-studio-workspace">
        <aside>
          <div className="project-studio-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar arquivo"/></div>
          <div className="studio-code-tools">
            <button className="action" onClick={()=>refreshTree()} disabled={Boolean(busy)}><RefreshCw/>Atualizar</button>
            <button className="action" onClick={()=>uploadRef.current?.click()} disabled={Boolean(busy)}><Upload/>Upload</button>
            <input ref={uploadRef} type="file" multiple hidden onChange={uploadFiles}/>
          </div>
          <div className="studio-new-file">
            <input value={newPath} onChange={e=>setNewPath(e.target.value)} placeholder="src/novo-arquivo.js ou src/nova-pasta"/>
            <button type="button" onClick={createFileDraft} title="Criar arquivo"><FilePlus2/></button>
            <button type="button" onClick={createFolderDraft} title="Criar pasta"><FolderPlus/></button>
          </div>
          <div className="project-studio-files studio-file-tree" aria-label="Estrutura do repositório">
            {renderTree(fileTree)}
            {!visibleFiles.length&&<small>Nenhum arquivo carregado.</small>}
          </div>
        </aside>
        <main>
          {selected?<>
            <div className="project-studio-filebar"><strong>{selected}</strong><span>{selectedMeta?.editable===false?'Somente visualização':content===original?'Sem alterações':original==='__creativezone_new_file__'?'Novo arquivo':'Alterado'}</span>{selectedMeta?.editable!==false&&original!=='__creativezone_new_file__'&&<button title="Renomear ou mover arquivo" onClick={renameCurrentFile} disabled={Boolean(busy)}>Mover</button>}<button title="Excluir arquivo" onClick={removeCurrentFile}><Trash2/></button></div>
            {selectedMeta?.editable===false
              ? <div className="project-studio-binary-file"><FileCode2/><strong>{selectedMeta?.binary?'Arquivo binário':'Arquivo grande demais para o editor de texto'}</strong><p>{selectedMeta?.size?Math.ceil(Number(selectedMeta.size)/1024).toLocaleString('pt-BR')+' KB · ':''}O arquivo faz parte do repositório e aparece na estrutura. Para substituí-lo, use <b>Upload</b>; para excluir, use o botão acima.</p></div>
              : <>
                  <textarea className="project-studio-editor" spellCheck="false" value={content} onChange={e=>setContent(e.target.value)}/>
                  <div className="project-studio-commitbar">
                    <input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Mensagem do commit"/>
                    <button className="action primary-action" onClick={commit} disabled={content===original||Boolean(busy)}><GitCommitHorizontal/>{busy==='commit'?'Commitando...':'Commitar'}</button>
                    {(commitInfo?.branch||branch!==baseBranch)&&<button className="action" onClick={createPr} disabled={Boolean(busy)}><GitPullRequest/>Criar PR</button>}
                  </div>
                </>}
          </>:<div className="project-studio-empty"><Code2/><strong>Code Studio</strong><p>Abra, crie, edite, envie ou exclua arquivos. As alterações são gravadas no GitHub sem sair da CreativeZone.</p></div>}
        </main>
      </div>}

      {tab==='branches'&&<div className="studio-panel">
        <header><span><GitBranch/><strong>Branches</strong></span><button className="action" onClick={refreshBranches}><RefreshCw/>Atualizar</button></header>
        <div className="studio-create-row"><input value={newBranch} onChange={e=>setNewBranch(e.target.value)} placeholder="feature/minha-alteracao"/><button className="action primary-action" onClick={createBranch} disabled={!newBranch.trim()||Boolean(busy)}><Plus/>Criar branch</button></div>
        <div className="studio-list">{branches.map(item=><button key={item.name} className={item.name===branch?'active':''} onClick={()=>chooseBranch(item.name)}><GitBranch/><span><strong>{item.name}</strong><small>{item.sha?String(item.sha).slice(0,10):''}{item.protected?' · protegida':''}</small></span>{item.name===baseBranch&&<em>padrão</em>}</button>)}</div>
      </div>}

      {tab==='commits'&&<div className="studio-panel">
        <header><span><GitCommitHorizontal/><strong>Commits · {branch}</strong></span><button className="action" onClick={loadCommits}><RefreshCw/>Atualizar</button></header>
        <div className="studio-list">{commits.map(item=><article key={item.sha}><GitCommitHorizontal/><span><strong>{item.message?.split('\n')[0]}</strong><small>{item.sha?.slice(0,8)} · {item.author} · {shortDate(item.date)}</small></span></article>)}</div>
      </div>}

      {tab==='issues'&&<div className="studio-panel">
        <header><span><MessageSquarePlus/><strong>Issues</strong></span><button className="action" onClick={loadIssues}><RefreshCw/>Atualizar</button></header>
        <form className="studio-issue-form" onSubmit={createIssue}><input value={issueTitle} onChange={e=>setIssueTitle(e.target.value)} placeholder="Título da nova Issue"/><textarea value={issueBody} onChange={e=>setIssueBody(e.target.value)} placeholder="Descreva a tarefa, bug ou melhoria..."/><button className="action primary-action" disabled={!issueTitle.trim()||Boolean(busy)}><Plus/>Criar Issue</button></form>
        <div className="studio-list">{issues.map(item=><article key={item.number}><span className={'studio-state '+item.state}>{item.state}</span><span><strong>#{item.number} {item.title}</strong><small>{item.user||'GitHub'} · {item.comments||0} comentário(s) · {shortDate(item.updated_at)}</small><p>{item.body}</p></span><div className="studio-item-actions"><button className="action" onClick={()=>openIssueComments(item)}><MessageSquarePlus/>Comentários</button><button className="action" onClick={()=>toggleIssue(item)}>{item.state==='open'?'Fechar':'Reabrir'}</button></div></article>)}</div>
        {selectedIssue&&<section className="studio-thread"><header><strong>Issue #{selectedIssue.number} · comentários</strong><button onClick={()=>setSelectedIssue(null)}>×</button></header><div>{issueComments.map(comment=><article key={comment.id}><strong>@{comment.user}</strong><small>{shortDate(comment.created_at)}</small><p>{comment.body}</p></article>)}</div><form onSubmit={submitIssueComment}><textarea value={issueComment} onChange={e=>setIssueComment(e.target.value)} placeholder="Adicionar comentário..."/><button className="action primary-action" disabled={!issueComment.trim()||Boolean(busy)}>Comentar</button></form></section>}
      </div>}

      {tab==='prs'&&<div className="studio-panel">
        <header><span><GitPullRequest/><strong>Pull Requests</strong></span><div><button className="action" onClick={createPr}><Plus/>Nova PR da branch atual</button><button className="action" onClick={loadPulls}><RefreshCw/>Atualizar</button></div></header>
        <div className="studio-list">{pulls.map(item=><article key={item.number}><GitPullRequest/><span><strong>#{item.number} {item.title}</strong><small>{item.head} → {item.base} · {item.user||'GitHub'} · {item.state}{item.draft?' · draft':''}</small><p>{item.body}</p></span><div className="studio-item-actions"><button className="action" onClick={()=>openPullReviews(item)}>Review</button>{status.can_manage&&item.state==='open'&&<button className="action primary-action" onClick={()=>mergePr(item.number)} disabled={Boolean(busy)}><GitMerge/>{busy==='merge:'+item.number?'Integrando...':'Merge'}</button>}</div></article>)}</div>
        {selectedPull&&<section className="studio-thread"><header><strong>PR #{selectedPull.number} · reviews</strong><button onClick={()=>setSelectedPull(null)}>×</button></header><div>{pullReviews.map(review=><article key={review.id}><strong>@{review.user} · {review.state}</strong><small>{shortDate(review.submitted_at)}</small><p>{review.body}</p></article>)}</div><div className="studio-review-form"><textarea value={reviewBody} onChange={e=>setReviewBody(e.target.value)} placeholder="Comentário da review..."/><div><button className="action" onClick={()=>submitReview('COMMENT')} disabled={!reviewBody.trim()||Boolean(busy)}>Comentar</button><button className="action" onClick={()=>submitReview('REQUEST_CHANGES')} disabled={!reviewBody.trim()||Boolean(busy)}><AlertTriangle/>Solicitar mudanças</button><button className="action primary-action" onClick={()=>submitReview('APPROVE')} disabled={Boolean(busy)}><CheckCircle2/>Aprovar</button></div></div></section>}
      </div>}

      {tab==='terminal'&&<div className="studio-terminal">
        <header><Terminal/><span><strong>Terminal Git seguro</strong><small>Comandos Git são executados por API no repositório real. Não é um shell Linux arbitrário.</small></span></header>
        <div className="studio-terminal-screen">{terminalLines.map((line,index)=><pre key={index} className={'terminal-'+line.type}>{line.text}</pre>)}</div>
        <form onSubmit={runTerminal}><span>$</span><input value={terminalCommand} onChange={e=>setTerminalCommand(e.target.value)} placeholder="git status" autoComplete="off"/><button disabled={busy==='terminal'}>Executar</button></form>
      </div>}

      {tab==='runner'&&<div className="studio-runner studio-panel">
        <header><span><Code2/><strong>Sandbox de execução · Judge0 CE</strong></span><small>Execução isolada, sem acesso aos segredos ou ao servidor da CreativeZone.</small></header>
        <div className="studio-runner-toolbar">
          <label>Linguagem
            <select value={runnerLanguage} onChange={e=>setRunnerLanguage(e.target.value)}>
              <option value="javascript">JavaScript / Node.js</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python 3</option>
              <option value="bash">Bash</option>
              <option value="cpp">C++</option>
              <option value="c">C</option>
              <option value="java">Java</option>
              <option value="csharp">C#</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
              <option value="php">PHP</option>
              <option value="ruby">Ruby</option>
            </select>
          </label>
          <button className="action" type="button" onClick={()=>{if(selected){setRunnerSource(content);setRunnerLanguage(languageForPath(selected))}}} disabled={!selected}>Usar arquivo aberto</button>
          <button className="action primary-action" type="button" onClick={runCode} disabled={busy==='runner'||!runnerSource.trim()}>{busy==='runner'?'Executando...':'Executar no sandbox'}</button>
        </div>
        <div className="studio-runner-grid">
          <label>Código<textarea className="studio-runner-code" value={runnerSource} onChange={e=>setRunnerSource(e.target.value)} spellCheck="false" placeholder="// Código para executar"/></label>
          <label>stdin<textarea value={runnerStdin} onChange={e=>setRunnerStdin(e.target.value)} placeholder="Entrada opcional"/></label>
        </div>
        {runnerResult&&<section className="studio-runner-result">
          <header><strong>{runnerResult.status?.description || 'Resultado'}</strong><span>{runnerResult.language}{runnerResult.time?' · '+runnerResult.time+'s':''}{runnerResult.memory?' · '+runnerResult.memory+' KB':''}</span></header>
          {runnerResult.stdout&&<pre className="runner-stdout">{runnerResult.stdout}</pre>}
          {runnerResult.compile_output&&<pre className="runner-compile">{runnerResult.compile_output}</pre>}
          {runnerResult.stderr&&<pre className="runner-stderr">{runnerResult.stderr}</pre>}
          {runnerResult.message&&<pre className="runner-message">{runnerResult.message}</pre>}
          {!runnerResult.stdout&&!runnerResult.compile_output&&!runnerResult.stderr&&!runnerResult.message&&<pre>Sem saída.</pre>}
        </section>}
        <p className="studio-runner-note">Este runner usa o Judge0 CE, API gratuita/open-source listada nas referências de APIs da CreativeZone. Para comandos Git e sincronização use a aba Git Terminal.</p>
      </div>}

      {tab==='ci'&&<div className="project-studio-ci studio-panel">
        <header><span><Workflow/><strong>CI/CD Cockpit</strong></span><button className="action" onClick={loadCi}><RefreshCw/>Atualizar</button></header>
        {ciRuns.map(run=><article key={run.id}><Workflow/><span><b>{run.name}</b><small>{run.event} · {String(run.head_sha||'').slice(0,7)} · {shortDate(run.created_at)}</small></span><em className={'ci-'+(run.conclusion||run.status)}>{run.conclusion||run.status}</em></article>)}
        {!ciRuns.length&&!busy&&<p>Nenhuma execução encontrada nesta branch.</p>}
      </div>}

      {tab==='security'&&<div className="project-studio-security studio-panel">
        <header><span><ShieldCheck/><strong>CreativeZone Security + AutoFix</strong></span><button className="action" onClick={loadFixes}><RefreshCw/>Atualizar</button></header>
        {!fixes.length&&!busy&&<p>Nenhuma vulnerabilidade com versão corrigida disponível no último relatório.</p>}
        {fixes.map(item=><article key={item.id}><span><b>{item.package_name}</b><small>{item.osv_id} · {item.severity} · {item.version} → {item.fixed_versions?.[0]}</small></span><button className="action" onClick={()=>autoFix(item.id)} disabled={Boolean(busy)}><Wrench/>{busy==='autofix:'+item.id?'Criando PR...':'Criar correção'}</button></article>)}
      </div>}

      {tab==='settings'&&<div className="studio-panel studio-settings">
        <header><span><Wrench/><strong>Configurações do repositório</strong></span><button className="action" onClick={loadSettings}><RefreshCw/>Atualizar</button></header>
        {settings&&<form onSubmit={saveSettings}>
          <div className="studio-settings-summary"><span><strong>{settings.full_name || status.repository?.repo_owner+'/'+status.repository?.repo_name}</strong><small>{settings.visibility} · branch padrão {settings.default_branch}</small></span>{settings.archived&&<em>Arquivado</em>}</div>
          <label>Descrição<textarea value={settingsForm.description} onChange={e=>setSettingsForm({...settingsForm,description:e.target.value})} maxLength={350}/></label>
          <label>Homepage<input type="url" value={settingsForm.homepage} onChange={e=>setSettingsForm({...settingsForm,homepage:e.target.value})} placeholder="https://..."/></label>
          <div className="studio-setting-toggles">
            <label><input type="checkbox" checked={settingsForm.has_issues} onChange={e=>setSettingsForm({...settingsForm,has_issues:e.target.checked})}/> Issues habilitadas</label>
            <label><input type="checkbox" checked={settingsForm.has_projects} onChange={e=>setSettingsForm({...settingsForm,has_projects:e.target.checked})}/> GitHub Projects habilitado</label>
            <label><input type="checkbox" checked={settingsForm.has_wiki} onChange={e=>setSettingsForm({...settingsForm,has_wiki:e.target.checked})}/> Wiki habilitada</label>
          </div>
          <button className="action primary-action" disabled={Boolean(busy)}>Salvar no GitHub</button>
        </form>}
        {!settings&&!busy&&<p>Carregue as configurações para editar o repositório pelo CreativeZone.</p>}
      </div>}

      <footer className="studio-footer-note"><CheckCircle2/>GitHub é a infraestrutura de versionamento; o trabalho cotidiano pode ser feito dentro da CreativeZone.</footer>
    </section>
  )
}
