import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignLeft,
  Bold,
  Code2,
  Eye,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Paperclip,
  Palette,
  Pencil,
  Quote,
  Redo2,
  RemoveFormatting,
  Save,
  Smile,
  Table2,
  Type,
  Underline,
  Undo2,
  Upload,
  X,
} from 'lucide-react'

const ACCEPTED = new Set([
  'image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain',
])
const MAX_FILES = 4
const MAX_BYTES = 10 * 1024 * 1024
const FONTS = ['Arial','Verdana','Tahoma','Georgia','Times New Roman','Trebuchet MS','Courier New']
const EMOJIS = ['😀','😂','😍','😎','🤔','😢','😡','👍','👎','❤️','🔥','🎉','✅','⚡','🚀','💡','📦','🎧','💻']

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return ['http:','https:'].includes(url.protocol) ? url : null
  } catch {
    return null
  }
}

function youtubeId(url) {
  if (!url) return null
  if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null
  if (/(^|\.)youtube\.com$/.test(url.hostname)) {
    if (url.pathname === '/watch') return url.searchParams.get('v')
    const parts = url.pathname.split('/').filter(Boolean)
    if (['embed','shorts','live'].includes(parts[0])) return parts[1] || null
  }
  return null
}

function codePenEmbed(url) {
  if (!url || !/(^|\.)codepen\.io$/.test(url.hostname)) return null
  const match = url.pathname.match(/^\/([^/]+)\/pen\/([^/]+)/)
  return match
    ? 'https://codepen.io/' + encodeURIComponent(match[1]) + '/embed/' + encodeURIComponent(match[2])
    : null
}

function isImageUrl(url) {
  return Boolean(url && /\.(?:png|jpe?g|gif|webp)(?:$|\?)/i.test(url.href))
}

function isGithubRepo(url) {
  if (!url || !/(^|\.)github\.com$/.test(url.hostname)) return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') }
}

function cleanFont(value) {
  const match = FONTS.find((font) => font.toLowerCase() === String(value || '').toLowerCase())
  return match || 'Arial'
}

function Inline({ text = '' }) {
  const regex = /(\*\*[^*\n]+\*\*|__[^_\n]+__|_[^_\n]+_|\x60[^\x60\n]+\x60|!\[[^\]\n]*\]\(https?:\/\/[^)\s]+\)|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\[color=#[0-9a-fA-F]{3,8}\][\s\S]*?\[\/color\]|\[size=\d{1,2}\][\s\S]*?\[\/size\]|\[font=[^\]\n]+\][\s\S]*?\[\/font\]|https?:\/\/[^\s<]+)/g
  const parts = String(text).split(regex).filter((part) => part !== '')
  return (
    <>
      {parts.map((part, index) => {
        if (/^\*\*.*\*\*$/.test(part)) return <strong key={index}><Inline text={part.slice(2,-2)} /></strong>
        if (/^__.*__$/.test(part)) return <u key={index}><Inline text={part.slice(2,-2)} /></u>
        if (/^_.*_$/.test(part)) return <em key={index}><Inline text={part.slice(1,-1)} /></em>
        if (/^\x60.*\x60$/.test(part)) return <code key={index}>{part.slice(1,-1)}</code>

        const image = part.match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/)
        if (image) {
          return (
            <a className="rich-inline-image" key={index} href={image[2]} target="_blank" rel="noreferrer noopener">
              <img src={image[2]} alt={image[1] || 'Imagem'} loading="lazy" />
            </a>
          )
        }

        const md = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
        if (md) return <a key={index} href={md[2]} target="_blank" rel="noreferrer noopener">{md[1]}</a>

        const color = part.match(/^\[color=(#[0-9a-fA-F]{3,8})\]([\s\S]*)\[\/color\]$/)
        if (color) return <span key={index} style={{ color: color[1] }}><Inline text={color[2]} /></span>

        const size = part.match(/^\[size=(\d{1,2})\]([\s\S]*)\[\/size\]$/)
        if (size) {
          const px = Math.max(10, Math.min(36, Number(size[1]) || 14))
          return <span key={index} style={{ fontSize: px }}><Inline text={size[2]} /></span>
        }

        const font = part.match(/^\[font=([^\]]+)\]([\s\S]*)\[\/font\]$/)
        if (font) return <span key={index} style={{ fontFamily: cleanFont(font[1]) }}><Inline text={font[2]} /></span>

        if (/^https?:\/\//i.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer noopener">{part}</a>
        return <React.Fragment key={index}>{part}</React.Fragment>
      })}
    </>
  )
}

function UrlEmbed({ value }) {
  const url = safeHttpUrl(value)
  if (!url) return <p><Inline text={value} /></p>

  const yt = youtubeId(url)
  if (yt && /^[\w-]{6,20}$/.test(yt)) {
    return (
      <div className="rich-embed video-embed">
        <iframe
          src={'https://www.youtube-nocookie.com/embed/' + yt}
          title="Vídeo do YouTube"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  const pen = codePenEmbed(url)
  if (pen) {
    return (
      <div className="rich-embed codepen-embed">
        <iframe
          src={pen}
          title="CodePen"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    )
  }

  if (isImageUrl(url)) {
    return (
      <a className="rich-image-link" href={url.href} target="_blank" rel="noreferrer noopener">
        <img src={url.href} alt="Imagem incorporada" loading="lazy" />
      </a>
    )
  }

  const github = isGithubRepo(url)
  if (github) {
    return (
      <a className="rich-github-card" href={url.href} target="_blank" rel="noreferrer noopener">
        <Code2 />
        <span><strong>{github.owner}/{github.repo}</strong><small>Abrir repositório no GitHub</small></span>
      </a>
    )
  }

  return <p><a href={url.href} target="_blank" rel="noreferrer noopener">{url.href}</a></p>
}

function AttachmentBlock({ name, media = [] }) {
  const item = media.find((candidate) => candidate.original_name === name)
  if (!item?.signed_url) {
    return <div className="rich-attachment-missing"><ImageIcon /> <span>{name}</span></div>
  }

  if (String(item.mime_type || '').startsWith('image/')) {
    return (
      <a className="rich-image-link rich-inline-attachment" href={item.signed_url} target="_blank" rel="noreferrer noopener">
        <img src={item.signed_url} alt={name} loading="lazy" />
      </a>
    )
  }

  return (
    <a className="rich-file-card" href={item.signed_url} target="_blank" rel="noreferrer noopener">
      <Paperclip />
      <span>{name}</span>
    </a>
  )
}

function MarkdownBlock({ text = '', media = [] }) {
  const lines = String(text).split('\n')
  const nodes = []
  let list = []
  let listType = 'ul'
  let codeLines = null

  const flushList = () => {
    if (!list.length) return
    const Tag = listType
    nodes.push(
      <Tag key={'list-' + nodes.length}>
        {list.map((item, i) => <li key={i}><Inline text={item} /></li>)}
      </Tag>
    )
    list = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.startsWith(String.fromCharCode(96).repeat(3))) {
      flushList()
      if (codeLines === null) codeLines = []
      else {
        nodes.push(<pre className="rich-code-block" key={'code-' + index}><code>{codeLines.join('\n')}</code></pre>)
        codeLines = null
      }
      continue
    }

    if (codeLines !== null) {
      codeLines.push(line)
      continue
    }

    const bbCode = trimmed.match(/^\[code\]([\s\S]*)\[\/code\]$/i)
    if (bbCode) {
      flushList()
      nodes.push(<pre className="rich-code-block" key={'bbcode-' + index}><code>{bbCode[1]}</code></pre>)
      continue
    }

    const attachment = trimmed.match(/^\[attachment:(.+)\]$/)
    if (attachment) {
      flushList()
      nodes.push(<AttachmentBlock key={'attachment-' + index} name={attachment[1]} media={media} />)
      continue
    }

    const align = trimmed.match(/^\[align=(left|center|right|justify)\]([\s\S]*)\[\/align\]$/i)
    if (align) {
      flushList()
      nodes.push(<p key={'align-' + index} style={{ textAlign: align[1].toLowerCase() }}><Inline text={align[2]} /></p>)
      continue
    }

    if (trimmed === '---' || /^\[hr\]$/i.test(trimmed)) {
      flushList()
      nodes.push(<hr className="rich-horizontal-rule" key={'hr-' + index} />)
      continue
    }

    if (/^\|.*\|$/.test(trimmed) && index + 1 < lines.length && /^\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[index + 1].trim())) {
      flushList()
      const tableRows = [trimmed]
      let cursor = index + 2
      while (cursor < lines.length && /^\|.*\|$/.test(lines[cursor].trim())) {
        tableRows.push(lines[cursor].trim())
        cursor += 1
      }
      const splitRow = (row) => row.replace(/^\||\|$/g,'').split('|').map((cell) => cell.trim())
      const headers = splitRow(tableRows[0])
      const body = tableRows.slice(1).map(splitRow)
      nodes.push(
        <div className="rich-table-wrap" key={'table-' + index}>
          <table>
            <thead><tr>{headers.map((cell,i) => <th key={i}><Inline text={cell} /></th>)}</tr></thead>
            <tbody>{body.map((row,r) => <tr key={r}>{row.map((cell,i) => <td key={i}><Inline text={cell} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      index = cursor - 1
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (list.length && listType !== 'ul') flushList()
      listType = 'ul'
      list.push(trimmed.replace(/^[-*]\s+/, ''))
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (list.length && listType !== 'ol') flushList()
      listType = 'ol'
      list.push(trimmed.replace(/^\d+\.\s+/, ''))
      continue
    }

    flushList()

    if (!trimmed) {
      nodes.push(<div className="rich-spacer" key={'space-' + index} />)
      continue
    }

    const markdownImage = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/)
    if (markdownImage) {
      nodes.push(
        <a className="rich-image-link" href={markdownImage[2]} target="_blank" rel="noreferrer noopener" key={'img-' + index}>
          <img src={markdownImage[2]} alt={markdownImage[1] || 'Imagem'} loading="lazy" />
        </a>
      )
      continue
    }

    if (/^https?:\/\/\S+$/.test(trimmed)) {
      nodes.push(<UrlEmbed key={'url-' + index} value={trimmed} />)
      continue
    }
    if (trimmed.startsWith('### ')) {
      nodes.push(<h4 key={index}><Inline text={trimmed.slice(4)} /></h4>)
      continue
    }
    if (trimmed.startsWith('## ')) {
      nodes.push(<h3 key={index}><Inline text={trimmed.slice(3)} /></h3>)
      continue
    }
    if (trimmed.startsWith('# ')) {
      nodes.push(<h2 key={index}><Inline text={trimmed.slice(2)} /></h2>)
      continue
    }
    if (trimmed.startsWith('> ')) {
      nodes.push(<blockquote key={index}><Inline text={trimmed.slice(2)} /></blockquote>)
      continue
    }
    nodes.push(<p key={index}><Inline text={line} /></p>)
  }

  flushList()
  if (codeLines !== null) {
    nodes.push(<pre className="rich-code-block" key="code-open"><code>{codeLines.join('\n')}</code></pre>)
  }
  return <>{nodes}</>
}

export function RichForumContent({ content = '', media = [] }) {
  const parts = []
  const regex = /\[quote=@([^\]]+)\]([\s\S]*?)\[\/quote\]/g
  let last = 0
  let match
  let index = 0

  while ((match = regex.exec(String(content))) !== null) {
    if (match.index > last) {
      parts.push(<MarkdownBlock key={'text-' + index++} text={String(content).slice(last,match.index)} media={media} />)
    }
    parts.push(
      <blockquote className="forum-quote rich-quote" key={'quote-' + index++}>
        <strong>@{match[1]} escreveu:</strong>
        <MarkdownBlock text={match[2].trim()} media={media} />
      </blockquote>
    )
    last = regex.lastIndex
  }
  if (last < String(content).length) {
    parts.push(<MarkdownBlock key={'text-' + index} text={String(content).slice(last)} media={media} />)
  }

  return <div className="forum-rendered-text rich-forum-content">{parts.length ? parts : <MarkdownBlock text={content} media={media} />}</div>
}

function AttachmentPreview({ file, onRemove }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (!file?.type?.startsWith('image/')) return undefined
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div className="pro-attachment">
      {src ? <img src={src} alt="" /> : <Paperclip />}
      <span title={file.name}>{file.name}</span>
      <button type="button" aria-label={'Remover ' + file.name} onClick={onRemove}><X /></button>
    </div>
  )
}

function EditorDialog({ title, children, onClose, onSubmit, submitLabel = 'Inserir' }) {
  return (
    <form className="editor-floating-dialog" onSubmit={onSubmit}>
      <header>
        <strong>{title}</strong>
        <button type="button" aria-label="Fechar" onClick={onClose}><X /></button>
      </header>
      <div className="editor-floating-dialog-body">{children}</div>
      <footer>
        <button type="button" className="action" onClick={onClose}>Cancelar</button>
        <button className="action primary-action">{submitLabel}</button>
      </footer>
    </form>
  )
}

export function ProfessionalEditor({
  id,
  value = '',
  onChange,
  files = [],
  onFilesChange,
  onSaveDraft,
  placeholder = 'Escreva sua publicação...',
  required = false,
  maxLength = 12000,
  maxFiles = MAX_FILES,
  maxBytes = MAX_BYTES,
}) {
  const textarea = useRef(null)
  const inlineFileInput = useRef(null)
  const gifFileInput = useRef(null)
  const historyRef = useRef([String(value)])
  const historyIndexRef = useRef(0)
  const [preview, setPreview] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dialog, setDialog] = useState('')
  const [dialogData, setDialogData] = useState({ url: '', text: '' })
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [imageMenuOpen, setImageMenuOpen] = useState(false)
  const [previewMedia, setPreviewMedia] = useState([])
  const length = String(value).length
  const fileLimit = Math.max(1, Number(maxFiles) || MAX_FILES)
  const byteLimit = Math.max(1024 * 1024, Number(maxBytes) || MAX_BYTES)
  const acceptedFiles = useMemo(() => files.slice(0, fileLimit), [files,fileLimit])

  useEffect(() => {
    const next = acceptedFiles.map((file) => ({
      original_name: file.name,
      mime_type: file.type,
      signed_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    }))
    setPreviewMedia(next)
    return () => next.forEach((item) => {
      if (item.signed_url?.startsWith('blob:')) URL.revokeObjectURL(item.signed_url)
    })
  }, [acceptedFiles])

  function setEditorValue(next, record = true) {
    const clean = String(next).slice(0,maxLength)
    if (record) {
      const history = historyRef.current.slice(0, historyIndexRef.current + 1)
      if (history[history.length - 1] !== clean) {
        history.push(clean)
        if (history.length > 120) history.shift()
        historyRef.current = history
        historyIndexRef.current = history.length - 1
      }
    }
    onChange(clean)
  }

  function undo() {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    onChange(historyRef.current[historyIndexRef.current])
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    onChange(historyRef.current[historyIndexRef.current])
  }

  function addFiles(incoming) {
    const next = [...acceptedFiles]
    const added = []
    for (const file of Array.from(incoming || [])) {
      if (next.length >= fileLimit) break
      if (!ACCEPTED.has(file.type) || file.size > byteLimit) continue
      const duplicate = next.some((item) => item.name === file.name)
      if (!duplicate) {
        next.push(file)
        added.push(file)
      }
    }
    onFilesChange?.(next)
    return added
  }

  function addInlineFiles(incoming) {
    const added = addFiles(incoming).filter((file) => file.type.startsWith('image/'))
    if (!added.length) return
    insert('\n' + added.map((file) => '[attachment:' + file.name + ']').join('\n') + '\n')
  }

  function selectedText() {
    const el = textarea.current
    if (!el) return ''
    return String(value).slice(el.selectionStart,el.selectionEnd)
  }

  function prefixLines(prefixFactory) {
    const el = textarea.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = String(value).slice(start,end) || 'item'
    const transformed = selected.split('\n').map((line,index) => prefixFactory(index) + line).join('\n')
    const next = String(value).slice(0,start) + transformed + String(value).slice(end)
    setEditorValue(next)
    queueMicrotask(() => {
      el.focus()
      el.setSelectionRange(start,start + transformed.length)
    })
  }

  function stripFormatting() {
    const el = textarea.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = String(value).slice(start,end)
    if (!selected) return
    const stripped = selected
      .replace(/\*\*|__|\x60/g,'')
      .replace(/(^|\n)[#>-]+\s?/g,'$1')
      .replace(/\[(?:color|size|font|align)=[^\]]+\]|\[\/(?:color|size|font|align)\]/gi,'')
      .replace(/\[code\]|\[\/code\]/gi,'')
    setEditorValue(String(value).slice(0,start) + stripped + String(value).slice(end))
    queueMicrotask(() => {
      el.focus()
      el.setSelectionRange(start,start + stripped.length)
    })
  }

  function formatParagraph(level) {
    const prefix = level === 'h1' ? '# ' : level === 'h2' ? '## ' : level === 'h3' ? '### ' : ''
    if (prefix) {
      prefixLines(() => prefix)
      return
    }

    const el = textarea.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = String(value).slice(start,end) || 'Parágrafo'
    const transformed = selected.replace(/^#{1,3}\s+/gm,'')
    setEditorValue(String(value).slice(0,start) + transformed + String(value).slice(end))
    queueMicrotask(() => {
      el.focus()
      el.setSelectionRange(start,start + transformed.length)
    })
  }

  function openDialog(name) {
    setDialogData({ url: '', text: selectedText() })
    setDialog(name)
    setEmojiOpen(false)
    setImageMenuOpen(false)
  }

  function closeDialog() {
    setDialog('')
    setDialogData({ url: '', text: '' })
  }

  function submitLink(event) {
    event.preventDefault()
    const url = safeHttpUrl(dialogData.url)
    if (!url) return
    insert('[' + (dialogData.text || url.href) + '](' + url.href + ')')
    closeDialog()
  }

  function submitImage(event) {
    event.preventDefault()
    const url = safeHttpUrl(dialogData.url)
    if (!url) return
    insert('\n![' + (dialogData.text || 'Imagem') + '](' + url.href + ')\n')
    closeDialog()
  }

  function submitGif(event) {
    event.preventDefault()
    const url = safeHttpUrl(dialogData.url)
    if (!url) return
    insert('\n![' + (dialogData.text || 'GIF') + '](' + url.href + ')\n')
    closeDialog()
  }

  function wrap(before, after = before, fallback = 'texto') {
    const el = textarea.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = String(value).slice(start,end) || fallback
    const next = String(value).slice(0,start) + before + selected + after + String(value).slice(end)
    setEditorValue(next)
    queueMicrotask(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  function insert(text) {
    const el = textarea.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = String(value).slice(0,start) + text + String(value).slice(end)
    setEditorValue(next)
    queueMicrotask(() => {
      el.focus()
      el.setSelectionRange(start + text.length,start + text.length)
    })
  }

  function handleKeyDown(event) {
    const mod = event.ctrlKey || event.metaKey
    if (!mod) return

    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if (key === 'b') {
      event.preventDefault()
      wrap('**')
      return
    }
    if (key === 'i') {
      event.preventDefault()
      wrap('_')
      return
    }
    if (key === 'u') {
      event.preventDefault()
      wrap('__')
      return
    }
    if (key === 'k') {
      event.preventDefault()
      openDialog('link')
    }
  }

  return (
    <div
      className={'professional-editor ' + (dragging ? 'is-dragging' : '')}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        addFiles(e.dataTransfer.files)
      }}
    >
      <div className="professional-editor-head professional-editor-head-advanced">
        <div className="professional-toolbar professional-toolbar-advanced">
          <div className="toolbar-group">
            <button type="button" title="Remover formatação" onClick={stripFormatting}><RemoveFormatting /></button>
            <button type="button" title="Negrito (Ctrl+B)" onClick={() => wrap('**')}><Bold /></button>
            <button type="button" title="Itálico (Ctrl+I)" onClick={() => wrap('_')}><Italic /></button>
            <button type="button" title="Sublinhar (Ctrl+U)" onClick={() => wrap('__')}><Underline /></button>
          </div>

          <div className="toolbar-group toolbar-select-group">
            <Type />
            <select title="Tamanho da fonte" defaultValue="" onChange={(event) => {
              if (event.target.value) wrap('[size=' + event.target.value + ']','[/size]')
              event.target.value = ''
            }}>
              <option value="">Tamanho</option>
              <option value="12">12</option>
              <option value="14">14</option>
              <option value="16">16</option>
              <option value="18">18</option>
              <option value="22">22</option>
              <option value="28">28</option>
              <option value="34">34</option>
            </select>
          </div>

          <div className="toolbar-group toolbar-color-group" title="Cor do texto">
            <Palette />
            <input
              type="color"
              defaultValue="#ff6b61"
              onChange={(event) => wrap('[color=' + event.target.value + ']','[/color]')}
            />
          </div>

          <div className="toolbar-group toolbar-select-group">
            <select title="Família de fontes" defaultValue="" onChange={(event) => {
              if (event.target.value) wrap('[font=' + event.target.value + ']','[/font]')
              event.target.value = ''
            }}>
              <option value="">Fonte</option>
              {FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </div>

          <div className="toolbar-group">
            <button type="button" title="Lista" onClick={() => prefixLines(() => '- ')}><List /></button>
            <button type="button" title="Lista numerada" onClick={() => prefixLines((index) => (index + 1) + '. ')}><ListOrdered /></button>
          </div>

          <div className="toolbar-group toolbar-select-group">
            <AlignLeft />
            <select title="Alinhamento" defaultValue="" onChange={(event) => {
              if (event.target.value) wrap('[align=' + event.target.value + ']','[/align]')
              event.target.value = ''
            }}>
              <option value="">Alinhar</option>
              <option value="left">Esquerda</option>
              <option value="center">Centro</option>
              <option value="right">Direita</option>
              <option value="justify">Justificado</option>
            </select>
          </div>

          <div className="toolbar-group toolbar-select-group">
            <select title="Forma de parágrafo" defaultValue="" onChange={(event) => {
              if (event.target.value) formatParagraph(event.target.value)
              event.target.value = ''
            }}>
              <option value="">Parágrafo</option>
              <option value="normal">Normal</option>
              <option value="h1">Título 1</option>
              <option value="h2">Título 2</option>
              <option value="h3">Título 3</option>
            </select>
          </div>

          <div className="toolbar-group toolbar-popover-wrap">
            <button type="button" title="Emoticons" onClick={() => { setEmojiOpen((open) => !open); setImageMenuOpen(false) }}><Smile /></button>
            {emojiOpen && (
              <div className="editor-emoji-popover">
                {EMOJIS.map((emoji) => (
                  <button type="button" key={emoji} onClick={() => { insert(emoji); setEmojiOpen(false) }}>{emoji}</button>
                ))}
              </div>
            )}
            <button type="button" title="Inserir link (Ctrl+K)" onClick={() => openDialog('link')}><LinkIcon /></button>
          </div>

          <div className="toolbar-group toolbar-popover-wrap">
            <button type="button" title="Inserir imagem" onClick={() => { setImageMenuOpen((open) => !open); setEmojiOpen(false) }}><ImageIcon /></button>
            {imageMenuOpen && (
              <div className="editor-image-popover">
                <button type="button" onClick={() => openDialog('image')}><LinkIcon /> Imagem por URL</button>
                {onFilesChange && <button type="button" onClick={() => inlineFileInput.current?.click()}><Upload /> Carregar imagem</button>}
              </div>
            )}
            <button type="button" title="Inserir GIF" onClick={() => openDialog('gif')}><span className="toolbar-gif-label">GIF</span></button>
          </div>

          <div className="toolbar-group">
            <button type="button" title="Citar" onClick={() => prefixLines(() => '> ')}><Quote /></button>
            <button type="button" title="Inserir tabela" onClick={() => insert('\n| Coluna 1 | Coluna 2 |\n| --- | --- |\n| Conteúdo | Conteúdo |\n')}><Table2 /></button>
            <button type="button" title="Inserir linha horizontal" onClick={() => insert('\n---\n')}><Minus /></button>
            <button type="button" title="Código" onClick={() => {
              const selected = selectedText()
              if (selected.includes('\n')) wrap(String.fromCharCode(96).repeat(3) + '\n','\n' + String.fromCharCode(96).repeat(3),'código')
              else wrap(String.fromCharCode(96))
            }}><Code2 /></button>
            <button type="button" title="Código alternativo BB" onClick={() => wrap('[code]','[/code]','código')}><span className="toolbar-bb-label">[]</span></button>
          </div>

          <div className="toolbar-group">
            <button type="button" title="Desfazer (Ctrl+Z)" onClick={undo}><Undo2 /></button>
            <button type="button" title="Refazer (Ctrl+Shift+Z)" onClick={redo}><Redo2 /></button>
            {onSaveDraft && <button type="button" title="Salvar rascunho" onClick={onSaveDraft}><Save /></button>}
          </div>
        </div>

        <div className="editor-mode">
          <button type="button" className={!preview ? 'active' : ''} onClick={() => setPreview(false)}><Pencil /> Escrever</button>
          <button type="button" className={preview ? 'active' : ''} onClick={() => setPreview(true)}><Eye /> Pré-visualização</button>
        </div>
      </div>

      {dialog === 'link' && (
        <EditorDialog title="Inserir link" onClose={closeDialog} onSubmit={submitLink}>
          <label>
            URL
            <input
              autoFocus
              type="url"
              value={dialogData.url}
              onChange={(event) => setDialogData((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://..."
            />
          </label>
          <label>
            Texto
            <input
              value={dialogData.text}
              onChange={(event) => setDialogData((current) => ({ ...current, text: event.target.value }))}
              placeholder="Texto do link"
            />
          </label>
        </EditorDialog>
      )}

      {dialog === 'image' && (
        <EditorDialog title="Inserir imagem por URL" onClose={closeDialog} onSubmit={submitImage}>
          <label>
            URL da imagem
            <input
              autoFocus
              type="url"
              value={dialogData.url}
              onChange={(event) => setDialogData((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://.../imagem.png"
            />
          </label>
          <label>
            Texto alternativo
            <input
              value={dialogData.text}
              onChange={(event) => setDialogData((current) => ({ ...current, text: event.target.value }))}
              placeholder="Descrição da imagem"
            />
          </label>
        </EditorDialog>
      )}

      {dialog === 'gif' && (
        <EditorDialog title="Inserir GIF" onClose={closeDialog} onSubmit={submitGif}>
          <label>
            URL do GIF
            <input
              autoFocus
              type="url"
              value={dialogData.url}
              onChange={(event) => setDialogData((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://.../animacao.gif"
            />
          </label>
          <label>
            Descrição
            <input
              value={dialogData.text}
              onChange={(event) => setDialogData((current) => ({ ...current, text: event.target.value }))}
              placeholder="GIF"
            />
          </label>
          {onFilesChange && (
            <button type="button" className="editor-upload-inline" onClick={() => gifFileInput.current?.click()}>
              <Upload /> Ou carregar um GIF do computador
            </button>
          )}
        </EditorDialog>
      )}

      {preview ? (
        <div className="professional-preview">
          {String(value).trim() ? <RichForumContent content={value} media={previewMedia} /> : <p className="editor-empty-preview">O preview aparecerá aqui.</p>}
        </div>
      ) : (
        <textarea
          id={id}
          ref={textarea}
          required={required}
          maxLength={maxLength}
          value={value}
          onChange={(e) => setEditorValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck
        />
      )}

      <input
        ref={inlineFileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(event) => {
          addInlineFiles(event.target.files)
          event.target.value = ''
          setImageMenuOpen(false)
        }}
      />
      <input
        ref={gifFileInput}
        type="file"
        accept="image/gif"
        hidden
        onChange={(event) => {
          addInlineFiles(event.target.files)
          event.target.value = ''
          closeDialog()
        }}
      />

      <div className="professional-editor-foot">
        {onFilesChange && (
          <label className="professional-file-button">
            <Paperclip /> Anexar
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain"
              hidden
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
            />
          </label>
        )}
        <span>{onFilesChange
          ? 'Arraste arquivos aqui · até ' + fileLimit + ' anexos · ' + Math.round(byteLimit / (1024 * 1024)) + ' MB cada'
          : 'Markdown, BBCode e embeds suportados'}</span>
        <small className={length > maxLength * .9 ? 'near-limit' : ''}>{length}/{maxLength}</small>
      </div>

      {onFilesChange && acceptedFiles.length > 0 && (
        <div className="professional-attachments">
          {acceptedFiles.map((file,index) => (
            <AttachmentPreview
              key={file.name + '-' + file.size + '-' + index}
              file={file}
              onRemove={() => onFilesChange?.(acceptedFiles.filter((_,i) => i !== index))}
            />
          ))}
        </div>
      )}
      {onFilesChange && dragging && <div className="professional-drop-hint">Solte os arquivos para anexar</div>}
    </div>
  )
}
