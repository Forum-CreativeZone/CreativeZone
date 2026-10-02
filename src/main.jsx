import React,{useMemo,useState}from'react';
import{createRoot}from'react-dom/client';
import{Search,Bell,Pencil,Users,Globe,Star,MessageCircle,ChevronDown,Plus,X,Paperclip,Image as ImageIcon,Link as LinkIcon,Smile,Send,Save,Menu,Clock3,TrendingUp,ChevronRight,MoreHorizontal,Pin,Eye}from'lucide-react';
import'./styles.css';

const asset=(n)=>`/assets/figma/0-1/raw-${String(n).padStart(2,'0')}.png`;
const initialTopics=[
{id:1,user:'DanielMFR',title:'Socorro explodi o PC!!!',desc:'Meu computador simplesmente parou depois de um estalo. Alguém já passou por isso?',views:68,replies:15,category:'Hardware',time:'há 12 min',avatar:8},
{id:2,user:'Riba_X?X',title:'Como faz pra imprimir colorido na impressora HP?',desc:'Estou tentando imprimir fotos e preciso acertar as configurações de papel e cor.',views:12,replies:4,category:'Hardware',time:'há 24 min',avatar:9},
{id:3,user:'Gomes_EXE',title:'Quero comprar um PC gamer da positivo, vale a pena?',desc:'Estou montando meu primeiro PC e queria opiniões sobre custo-benefício.',views:55,replies:15,category:'Hardware',time:'há 41 min',avatar:10},
{id:4,user:'FBM_2000',title:'Me indiquem uma TV 4K!!',desc:'Quero uma TV para jogos e filmes. Quais modelos vocês recomendam?',views:789,replies:645,category:'Games',time:'há 1 h',avatar:11},
{id:5,user:'Josué P.',title:'Meu computador desliga sozinho!',desc:'Ele funciona normalmente por alguns minutos e depois desliga sem aviso.',views:650,replies:557,category:'Hardware',time:'há 2 h',avatar:12},
{id:6,user:'SS_Kag',title:'Qual placa de vídeo escolher, 3060Ti ou 6600 XT?',desc:'Estou em dúvida entre desempenho, consumo e preço para meu próximo upgrade.',views:459,replies:423,category:'Hardware',time:'há 3 h',avatar:13}
];

function Avatar({name,index=1,size=''}){return <div className={'avatar '+size}>{index?<img src={asset(index)} alt="" onError={e=>{e.currentTarget.style.display='none'}}/>:null}<span>{name.slice(0,1).toUpperCase()}</span></div>}

function Category({children}){return <span className={'category '+children.toLowerCase()}>{children}</span>}

function Topic({topic,onOpen,featured=false}){return <article className={'topic '+(featured?'featured':'')} onClick={()=>onOpen(topic)}>
  <Avatar name={topic.user} index={topic.avatar}/>
  <div className="topicbody">
    <div className="topicmeta"><b>{topic.user}</b><span>•</span><time><Clock3/> {topic.time}</time></div>
    <h3>{topic.title}</h3>
    <p>{topic.desc}</p>
    <div className="topicfoot"><Category>{topic.category}</Category><div className="stats"><span><Eye/>{topic.views}</span><span><MessageCircle/>{topic.replies}</span></div></div>
  </div>
  <button className="topicmore" onClick={e=>e.stopPropagation()}><MoreHorizontal/></button>
</article>}

function MiniTopic({topic,rank}){return <div className="mini"><span className="rank">{String(rank).padStart(2,'0')}</span><Avatar name={topic.user} index={topic.avatar} size="small"/><div className="minibody"><b>{topic.title}</b><span>{topic.user} · {topic.replies} respostas</span></div></div>}

function Composer({onClose,onPublish}){const[category,setCategory]=useState('Hardware'),[title,setTitle]=useState(''),[desc,setDesc]=useState(''),[saved,setSaved]=useState(false);const save=()=>{setSaved(true);setTimeout(()=>setSaved(false),1800)};const submit=()=>{if(!title.trim())return;onPublish({category,title:title.trim(),desc:desc.trim()||'Nova publicação da comunidade.',user:'Você',views:0,replies:0,time:'agora',avatar:1});onClose()};return <div className="modal"><div className="dialog"><button onClick={onClose} className="close"><X/></button><div className="dialoghead"><span className="eyebrow">NOVO TÓPICO</span><h2>Adicionar novo tópico</h2><p>Compartilhe uma dúvida, descoberta ou experiência com a comunidade.</p></div><label>Tema<select value={category} onChange={e=>setCategory(e.target.value)}><option>Hardware</option><option>Software</option><option>Games</option><option>Ofertas</option></select></label><label>Título<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Digite o título do tópico"/></label><label>Descrição<div className="editor"><div className="toolbar"><button><b>B</b></button><button><i>I</i></button><button><u>U</u></button><button><ImageIcon/></button><button><Paperclip/></button><button><LinkIcon/></button><button><Smile/></button></div><textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Escreva sua publicação..."/></div></label><div className="attachments"><Paperclip/> Você também poderá adicionar anexos ao publicar.</div><div className="actions"><button onClick={save}><Save/> {saved?'Rascunho salvo':'Salvar rascunho'}</button><button className="primary" onClick={submit} disabled={!title.trim()}><Send/> Enviar</button></div></div></div>}

function App(){const[open,setOpen]=useState(false),[menu,setMenu]=useState(false),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[topics,setTopics]=useState(initialTopics),[category,setCategory]=useState('Todos'),[page,setPage]=useState(1);
const filtered=useMemo(()=>topics.filter(t=>(category==='Todos'||t.category===category)&&(t.title+' '+t.user+' '+t.category).toLowerCase().includes(query.toLowerCase())),[topics,query,category]);
const publish=t=>setTopics(v=>[{...t,id:Date.now()},...v]);
return <div className="app">
<header><div className="headerinner"><button className="menubtn" onClick={()=>setMenu(!menu)}><Menu/></button><div className="brand"><span>FÓRUM</span><b>ADRENALINE</b></div><div className={'left '+(menu?'show':'')}><a className="active"><Pencil/>Fórum</a><a><Users/>Membros</a><a><Globe/>Portal</a></div><nav><button className="newtopic" onClick={()=>setOpen(true)}><Pencil/>Novo Tópico</button><label className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar"/></label><button className="iconbtn"><Bell/></button><button className="profile">V</button></nav></div></header>
<div className="crumb"><div><span>Fórum</span><ChevronRight/> <strong>Inicial</strong></div></div>

<div className="pagehero"><div className="heroinner"><div><span className="heroeyebrow">COMUNIDADE ADRENALINE</span><h1>Fórum</h1><p>Discussões, dúvidas e experiências sobre tecnologia, hardware, games e muito mais.</p></div><div className="heroactions"><div><strong>1.284</strong><span>Membros</span></div><div><strong>18.592</strong><span>Tópicos</span></div><div><strong>64.210</strong><span>Respostas</span></div></div></div></div>

<main><section className="maincolumn">
<div className="sectionhead"><div><span className="eyebrow">DISCUSSÕES</span><h2>Tópicos Recentes</h2></div><button className="viewall" onClick={()=>{setCategory('Todos');setQuery('')}}>Ver todos <ChevronRight/></button></div>
<div className="filters"><div className="tabs">{['Todos','Hardware','Games','Software','Ofertas'].map(c=><button key={c} className={category===c?'active':''} onClick={()=>{setCategory(c);setPage(1)}}>{c}</button>)}</div><span className="resultcount">{filtered.length} tópicos</span></div>
<div className="topiclist">{filtered.slice(0,3).map((t,i)=><Topic key={t.id} topic={t} onOpen={setSelected} featured={i===0}/>)}</div>

<div className="sectionhead popularhead"><div><span className="eyebrow">POPULAR</span><h2>Mais Visualizados</h2></div><button className="viewall">Ver ranking <TrendingUp/></button></div>
<div className="populargrid">{[...filtered].sort((a,b)=>b.views-a.views).slice(0,3).map((t,i)=><MiniTopic key={t.id} topic={t} rank={i+1}/>)}</div>

<div className="pagination"><button disabled={page===1} onClick={()=>setPage(Math.max(1,page-1))}>‹</button><button className="active">1</button><button>2</button><button>3</button><span>...</span><button>24</button><button onClick={()=>setPage(page+1)}>›</button></div>
</section>

<aside>
<div className="sidecard activity"><div className="sidehead"><div><span className="eyebrow">ATIVIDADE</span><h3>Últimas publicações</h3></div><button><MoreHorizontal/></button></div>{filtered.slice(3,6).map(t=><div className="activityitem" key={t.id}><Avatar name={t.user} index={t.avatar} size="small"/><div><b>{t.user}</b><span>{t.title}</span><time>{t.time}</time></div></div>)}</div>
<div className="sidecard yourspace"><span className="eyebrow">SEU ESPAÇO</span><h3>Meus temas</h3><div className="emptyspace"><div className="emptyicon"><Pencil/></div><p>Você ainda não criou nenhum tema.</p><button onClick={()=>setOpen(true)}><Plus/>Adicionar novo tema</button></div></div>
<div className="adbox"><span>PUBLICIDADE</span><div>ANÚNCIO</div></div>
</aside></main>
<footer><div className="footerinner"><div className="footerbrand">ADRENALINE <span>FÓRUM</span></div><div>Comunidade · Tecnologia · Hardware · Games</div><div>© 2026 Fórum Adrenaline</div></div></footer>

{selected&&<div className="modal" onClick={e=>e.target===e.currentTarget&&setSelected(null)}><div className="dialog topicdialog"><button onClick={()=>setSelected(null)} className="close"><X/></button><Category>{selected.category}</Category><h2>{selected.title}</h2><div className="author"><Avatar name={selected.user} index={selected.avatar}/><div><b>{selected.user}</b><span>{selected.time} · Publicação da comunidade</span></div></div><p className="fulltext">{selected.desc}</p><div className="stats big"><span><Eye/> {selected.views} visualizações</span><span><MessageCircle/> {selected.replies} respostas</span></div></div></div>}
{open&&<Composer onClose={()=>setOpen(false)} onPublish={publish}/>}
</div>}

createRoot(document.getElementById('root')).render(<App/>);