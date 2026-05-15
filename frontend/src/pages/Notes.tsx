import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import { notesApi, graphApi } from '@/utils/api'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import { Color } from '@tiptap/extension-color'
import TextStyle from '@tiptap/extension-text-style'
import {
  Plus, Search, Trash2, Folder, Tag, Save,
  Bold, Italic, List, ListOrdered, Code, Quote,
  Hash, CheckSquare, Loader2, Upload, Download, FolderPlus,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function NotesPage() {
  const { notes, folders, activeNoteId, setNotes, setFolders, setActiveNoteId, addNote, updateNote, deleteNote } = useStore()
  const [search, setSearch] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [autosaving, setAutosaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderParentId, setFolderParentId] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const ignoreNextEditorUpdateRef = useRef(false)
  const autosaveTimerRef = useRef<number | null>(null)
  const lastSavedSnapshotRef = useRef<string>('')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
    ],
    content: '',
    editorProps: {
      attributes: { class: 'ProseMirror min-h-[400px] focus:outline-none' },
    },
    onUpdate: () => {
      if (ignoreNextEditorUpdateRef.current) {
        ignoreNextEditorUpdateRef.current = false
        return
      }
      setIsDirty(true)
    },
  })

  useEffect(() => {
    loadNotes()
    loadFolders()
  }, [])

  const lastActiveNoteIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (activeNoteId) {
      const note = notes.find((n) => n.id === activeNoteId)
      if (note && editor) {
        const idChanged = activeNoteId !== lastActiveNoteIdRef.current
        if (idChanged || !isDirty) {
          lastActiveNoteIdRef.current = activeNoteId
          ignoreNextEditorUpdateRef.current = true
          setTitle(note.title)
          setTags(note.tags || [])
          editor.commands.setContent(note.content_html || note.content || '')
          lastSavedSnapshotRef.current = JSON.stringify({
            title: note.title,
            tags: note.tags || [],
            content: note.content_html || note.content || '',
          })
          setIsDirty(false)
        }
      }
    } else {
      lastActiveNoteIdRef.current = null
    }
  }, [activeNoteId, editor, notes, isDirty])

  async function loadNotes() {
    try {
      const { data } = await notesApi.list({
        search: search || undefined,
        folder_id: selectedFolder ?? undefined,
      })
      setNotes(data)
    } catch {}
  }

  async function loadFolders() {
    try {
      const { data } = await notesApi.listFolders()
      setFolders(data)
    } catch {}
  }

  async function createNote() {
    try {
      const { data } = await notesApi.create({
        title: 'Untitled Note',
        content: '',
        content_html: '',
        folder_id: selectedFolder,
      })
      addNote(data)
      setActiveNoteId(data.id)
    } catch {
      toast.error('Failed to create note')
    }
  }

  const saveNote = useCallback(async (options?: { silent?: boolean; autosave?: boolean }) => {
    if (!activeNoteId || !editor) return
    const snapshot = JSON.stringify({
      title,
      tags,
      content: editor.getHTML(),
    })
    if (snapshot === lastSavedSnapshotRef.current) {
      setIsDirty(false)
      return
    }

    if (options?.autosave) setAutosaving(true)
    else setSaving(true)
    try {
      const content_html = editor.getHTML()
      const content = editor.getText()
      const { data } = await notesApi.update(activeNoteId, {
        title, content, content_html, tags,
      })
      updateNote(activeNoteId, data)
      if (content.trim().length > 30) {
        await graphApi.extractEntities({
          note_id: activeNoteId,
          note_title: title,
          text: content,
        })
      }
      lastSavedSnapshotRef.current = snapshot
      setIsDirty(false)
      if (!options?.silent) {
        toast.success('Saved', { duration: 1000 })
      }
    } catch {
      if (!options?.silent) {
        toast.error('Save failed')
      }
    } finally {
      setSaving(false)
      setAutosaving(false)
    }
  }, [activeNoteId, editor, title, tags])

  useEffect(() => {
    if (!activeNoteId || !isDirty || !editor) return
    const snapshot = JSON.stringify({
      title,
      tags,
      content: editor.getHTML(),
    })
    if (snapshot === lastSavedSnapshotRef.current) return

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      saveNote({ silent: true, autosave: true })
    }, 1200)
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [activeNoteId, editor, isDirty, title, tags, saveNote])

  async function removeNote(id: number) {
    try {
      await notesApi.delete(id)
      deleteNote(id)
      if (activeNoteId === id) {
        setActiveNoteId(null)
        setTitle('')
        setTags([])
        editor?.commands.clearContent()
      }
    } catch {}
  }

  const filteredNotes = notes.filter((n) => {
    const matchSearch = !search ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
    const matchFolder = selectedFolder === null || n.folder_id === selectedFolder
    return matchSearch && matchFolder
  })

  function addTag() {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) {
      setTags([...tags, t])
      setTagInput('')
      setIsDirty(true)
    }
  }

  async function createFolder() {
    const name = folderName.trim()
    if (!name) return
    try {
      const { data } = await notesApi.createFolder({ name, parent_id: folderParentId })
      setFolders([...folders, data])
      setFolderName('')
      setFolderParentId(null)
      setShowCreateFolder(false)
      toast.success('Folder created')
    } catch {
      toast.error('Failed to create folder')
    }
  }

  function buildFolderTree(parentId: number | null, depth = 0): React.ReactNode[] {
    return folders
      .filter((f) => (f.parent_id ?? null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((f) => [
        <button
          key={f.id}
          onClick={() => setSelectedFolder(f.id)}
          className={clsx('nav-item w-full text-sm', selectedFolder === f.id && 'active')}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          <Folder size={14} style={{ color: f.color || undefined }} />
          {f.name}
        </button>,
        ...buildFolderTree(f.id, depth + 1),
      ])
  }

  async function importMarkdownFile(file: File) {
    const raw = await file.text()
    const lines = raw.split(/\r?\n/)
    const firstLine = lines[0]?.trim() || ''
    const hasHeading = firstLine.startsWith('# ')
    const titleFromFile = file.name.replace(/\.md$/i, '') || 'Imported Note'
    const noteTitle = hasHeading ? firstLine.slice(2).trim() || titleFromFile : titleFromFile
    const content = hasHeading ? lines.slice(1).join('\n').trim() : raw.trim()
    const escaped = escapeHtml(content || raw)
    const contentHtml = `<pre>${escaped}</pre>`

    const { data } = await notesApi.create({
      title: noteTitle,
      content: content || raw,
      content_html: contentHtml,
      folder_id: selectedFolder,
    })
    addNote(data)
    setActiveNoteId(data.id)
  }

  async function handleImportClick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importMarkdownFile(file)
      toast.success('Markdown imported')
    } catch {
      toast.error('Import failed')
    } finally {
      e.target.value = ''
    }
  }

  function exportCurrentNote() {
    if (!activeNoteId || !editor) return
    const note = notes.find((n) => n.id === activeNoteId)
    if (!note) return
    const safeTitle = (title || note.title || 'note').replace(/[^\w\-]+/g, '_')
    const markdown = `# ${title || note.title}\n\n${editor.getText()}\n`
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeTitle}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar: folders + notes list */}
      <div className="w-64 flex-shrink-0 border-r border-white/5 flex flex-col bg-[#111425]">
        {/* Folders */}
        <div className="p-3 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Folders</span>
            <button
              onClick={() => setShowCreateFolder(true)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <FolderPlus size={14} />
            </button>
          </div>
          <button
            onClick={() => setSelectedFolder(null)}
            className={clsx('nav-item w-full text-sm', !selectedFolder && 'active')}
          >
            <Folder size={14} /> All Notes
          </button>
          {buildFolderTree(null)}
        </div>

        {/* Search + notes */}
        <div className="p-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="input text-sm pl-8 py-1.5"
              onKeyDown={(e) => e.key === 'Enter' && loadNotes()}
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-xs text-gray-600">{filteredNotes.length} notes</span>
          <button onClick={createNote} className="btn-ghost text-xs py-1 px-2">
            <Plus size={12} /> New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              onClick={() => setActiveNoteId(note.id)}
              className={clsx(
                'group p-2.5 rounded-lg cursor-pointer transition-all duration-150',
                activeNoteId === note.id
                  ? 'bg-nexus-500/20 border border-nexus-500/30'
                  : 'hover:bg-white/5 border border-transparent',
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <span className={clsx(
                  'text-sm font-medium truncate',
                  activeNoteId === note.id ? 'text-white' : 'text-gray-300',
                )}>
                  {note.title || 'Untitled'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeNote(note.id) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-0.5 truncate">{note.content?.slice(0, 60)}</p>
              {note.tags?.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {note.tags.slice(0, 3).map((t) => (
                    <span key={t} className="badge bg-nexus-500/10 text-nexus-400 text-[10px]">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-700 mt-1">
                {note.updated_at ? format(new Date(note.updated_at), 'MMM d') : ''}
              </p>
            </div>
          ))}
          {filteredNotes.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-gray-600">No notes found</p>
              <button onClick={createNote} className="btn-primary text-xs mt-3">
                <Plus size={12} /> Create note
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeNoteId ? (
          <>
            {/* Editor toolbar */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-white/5 bg-[#111425]/50 flex-wrap">
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setIsDirty(true)
                }}
                className="flex-1 min-w-0 bg-transparent text-lg font-semibold text-white focus:outline-none placeholder-gray-600 mr-4"
                placeholder="Note title…"
              />

              {/* Format buttons */}
              <EditorButton icon={Bold} onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} title="Bold" />
              <EditorButton icon={Italic} onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} title="Italic" />
              <EditorButton icon={Code} onClick={() => editor?.chain().focus().toggleCode().run()} active={editor?.isActive('code')} title="Code" />
              <EditorButton icon={Hash} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive('heading')} title="Heading" />
              <EditorButton icon={List} onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')} title="Bullet list" />
              <EditorButton icon={ListOrdered} onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive('orderedList')} title="Ordered list" />
              <EditorButton icon={CheckSquare} onClick={() => editor?.chain().focus().toggleTaskList().run()} active={editor?.isActive('taskList')} title="Task list" />
              <EditorButton icon={Quote} onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={editor?.isActive('blockquote')} title="Blockquote" />

              <div className="flex-1" />
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,text/markdown"
                className="hidden"
                onChange={handleImportClick}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-ghost text-sm py-1.5"
                title="Import Markdown"
              >
                <Upload size={14} />
              </button>
              <button
                onClick={exportCurrentNote}
                className="btn-ghost text-sm py-1.5"
                title="Export Markdown"
              >
                <Download size={14} />
              </button>

              <button
                onClick={() => saveNote()}
                disabled={saving || autosaving}
                className="btn-primary text-sm py-1.5"
              >
                {(saving || autosaving)
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Save size={14} />}
                {autosaving ? 'Autosaving…' : isDirty ? 'Save*' : 'Save'}
              </button>
            </div>

            {/* Tags */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5">
              <Tag size={14} className="text-gray-500 flex-shrink-0" />
              <div className="flex gap-1 flex-wrap flex-1">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="badge bg-nexus-500/10 text-nexus-400 cursor-pointer hover:bg-red-500/20 hover:text-red-400"
                    onClick={() => {
                      setTags(tags.filter((x) => x !== t))
                      setIsDirty(true)
                    }}
                  >
                    {t} ×
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }}}
                  placeholder="Add tag…"
                  className="bg-transparent text-xs text-gray-400 placeholder-gray-600 focus:outline-none w-20"
                />
              </div>
            </div>

            {/* Editor content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <EditorContent editor={editor} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-nexus-500/10 rounded-2xl flex items-center justify-center mb-4">
              <Hash size={32} className="text-nexus-500/60" />
            </div>
            <h2 className="text-lg font-semibold text-gray-400">Select a note or create one</h2>
            <button onClick={createNote} className="btn-primary mt-4">
              <Plus size={16} /> New Note
            </button>
          </div>
        )}
      </div>

      {showCreateFolder && (
        <Modal title="Create Folder" onClose={() => setShowCreateFolder(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Folder name</label>
              <input
                className="input"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Project Ideas"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Parent folder</label>
              <select
                className="input"
                value={folderParentId ?? ''}
                onChange={(e) => setFolderParentId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Root</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={createFolder} disabled={!folderName.trim()} className="btn-primary flex-1">
                Create
              </button>
              <button onClick={() => setShowCreateFolder(false)} className="btn-ghost flex-1">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function EditorButton({
  icon: Icon, onClick, active, title,
}: {
  icon: any; onClick: () => void; active?: boolean; title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'p-1.5 rounded transition-all',
        active ? 'bg-nexus-500/20 text-nexus-400' : 'text-gray-500 hover:text-white hover:bg-white/5',
      )}
    >
      <Icon size={14} />
    </button>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="card w-96 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
