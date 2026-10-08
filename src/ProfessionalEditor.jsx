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

function MarkdownBlock({ text = '' }) {
  const lines = String(text).split('\n')
  const nodes = []
  let list = []

  const flushList = () => {
    if (!list.length) return
    nodes.push(
      <ul key={'list-' + nodes.length}>
        {list.map((item, i) => <li key={i}><Inline text={item} /></li>)}
      </ul>
    )
    list = []
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (/^[-*]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*]\s+/, ''))
      return
    }
    flushList()

    if (!trimmed) {
      nodes.push(<div className="rich-spacer" key={'space-' + index} />)
      return
    }
    if (/^https?:\/\/\S+$/.test(trimmed)) {
      nodes.push(<UrlEmbed key={'url-' + index} value={trimmed} />)
      return
    }
    if (trimmed.startsWith('### ')) {
      nodes.push(<h4 key={index}><Inline text={trimmed.slice(4)} /></h4>)
      return
    }
    if (trimmed.startsWith('## ')) {
      nodes.push(<h3 key={index}><Inline text={trimmed.slice(3)} /></h3>)
      return
    }
    if (trimmed.startsWith('# ')) {
      nodes.push(<h2 key={index}><Inline text={trimmed.slice(2)} /></h2>)
      return
    }
    if (trimmed.startsWith('> ')) {
      nodes.push(<blockquote key={index}><Inline text={trimmed.slice(2)} /></blockquote>)
      return
    }
    nodes.push(<p key={index}><Inline text={line} /></p>)
  })
  flushList()
  return <>{nodes}</>
}

export function RichForumContent({ content = '' }) {
  const parts = []
  const regex = /\[quote=@([^\]]+)\]([\s\S]*?)\[\/quote\]/g
  let last = 0
  let match
  let index = 0

  while ((match = regex.exec(String(content))) !== null) {
    if (match.index > last) {
      parts.push(<MarkdownBlock key={'text-' + index++} text={String(content).slice(last,match.index)} />)
    }
    parts.push(
      <blockquote className="forum-quote rich-quote" key={'quote-' + index++}>
        <strong>@{match[1]} escreveu:</strong>
        <MarkdownBlock text={match[2].trim()} />
      </blockquote>
    )
    last = regex.lastIndex
  }
  if (last < String(content).length) {
    parts.push(<MarkdownBlock key={'text-' + index} text={String(content).slice(last)} />)
  }

  return <div className="forum-rendered-text rich-forum-content">{parts.length ? parts : <MarkdownBlock text={content} />}</div>
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

export function ProfessionalEditor({
  id,
  value = '',
  onChange,
  files = [],
  onFilesChange,
  placeholder = 'Escreva sua publicação...',
  required = false,
  maxLength = 12000,
  maxFiles = MAX_FILES,
  maxBytes = MAX_BYTES,
}) {
  const textarea = useRef(null)
  const [preview, setPreview] = useState(false)
  const [dragging, setDragging] = useState(false)
  const length = String(value).length
  const fileLimit = Math.max(1, Number(maxFiles) || MAX_FILES)
  const byteLimit = Math.max(1024 * 1024, Number(maxBytes) || MAX_BYTES)
  const acceptedFiles = useMemo(() => files.slice(0, fileLimit), [files,fileLimit])

  function addFiles(incoming) {
    const next = [...acceptedFiles]
    for (const file of Array.from(incoming || [])) {
      if (next.length >= fileLimit) break
      if (!ACCEPTED.has(file.type) || file.size > byteLimit) continue
      const duplicate = next.some((item) => item.name === file.name && item.size === file.size)
      if (!duplicate) next.push(file)
    }
    onFilesChange?.(next)
  }

  function wrap(before, after = before, fallback = 'texto') {
    const el = textarea.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = String(value).slice(start,end) || fallback
    const next = String(value).slice(0,start) + before + selected + after + String(value).slice(end)
    onChange(next)
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
    onChange(next)
    queueMicrotask(() => {
      el.focus()
      el.setSelectionRange(start + text.length,start + text.length)
    })
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
      <div className="professional-editor-head">
        <div className="professional-toolbar">
          <button type="button" title="Negrito" onClick={() => wrap('**')}><Bold /></button>
          <button type="button" title="Itálico" onClick={() => wrap('_')}><Italic /></button>
          <button type="button" title="Sublinhar" onClick={() => wrap('__')}><Underline /></button>
          <button type="button" title="Código" onClick={() => wrap(String.fromCharCode(96))}><Code2 /></button>
          <button type="button" title="Citação" onClick={() => insert('> ')}><Quote /></button>
          <button type="button" title="Lista" onClick={() => insert('- ')}><List /></button>
          <button type="button" title="Link" onClick={() => insert('[texto](https://)')}><LinkIcon /></button>
          <button type="button" title="Imagem por URL" onClick={() => insert('\nhttps://exemplo.com/imagem.png\n')}><ImageIcon /></button>
        </div>
        <div className="editor-mode">
          <button type="button" className={!preview ? 'active' : ''} onClick={() => setPreview(false)}><Pencil /> Escrever</button>
          <button type="button" className={preview ? 'active' : ''} onClick={() => setPreview(true)}><Eye /> Preview</button>
        </div>
      </div>

      {preview ? (
        <div className="professional-preview">
          {String(value).trim() ? <RichForumContent content={value} /> : <p className="editor-empty-preview">O preview aparecerá aqui.</p>}
        </div>
      ) : (
        <textarea
          id={id}
          ref={textarea}
          required={required}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}

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
          : 'Markdown e embeds suportados'}</span>
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
