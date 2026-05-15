import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { chatApi, streamChat } from '@/utils/api'
import { Send, Plus, Trash2, Bot, User, Loader2, Paperclip, Pencil, Settings2, Save, Sparkles, Terminal, Database } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function ChatPage() {
  const {
    conversations, activeConversationId,
    setConversations, setActiveConversationId,
    addConversation, deleteConversation,
    selectedProvider, selectedModel,
    ragEnabled, ragCollection, setRagEnabled,
    setProviders: setStoreProviders,
    setSelectedProvider, setSelectedModel
  } = useStore()

  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [activeTools, setActiveTools] = useState<{ id: string; name: string; status: 'running' | 'done' }[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [models, setModels] = useState<string[]>([])
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [attachmentLabel, setAttachmentLabel] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const streamedTextRef = useRef('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadConversations()
    loadProviders()
  }, [])

  useEffect(() => {
    if (activeConversationId) loadMessages(activeConversationId)
  }, [activeConversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, activeTools])

  useEffect(() => {
    if (selectedProvider) loadModels(selectedProvider)
  }, [selectedProvider])

  async function loadConversations() {
    try {
      const { data } = await chatApi.listConversations()
      setConversations(data)
      if (data.length > 0 && !activeConversationId) {
        setActiveConversationId(data[0].id)
      }
    } catch {}
  }

  async function loadMessages(id: number) {
    try {
      const { data } = await chatApi.getConversation(id)
      setMessages(data.messages || [])
      setSystemPrompt(data.system_prompt || '')
    } catch {}
  }

  async function loadProviders() {
    try {
      const { data } = await chatApi.listProviders()
      setProviders(data)
      setStoreProviders(data)
      if (data?.length > 0 && !data.some((provider: any) => provider.name === selectedProvider)) {
        setSelectedProvider(data[0].name)
      }
    } catch {}
  }

  async function loadModels(provider: string) {
    try {
      const { data } = await chatApi.listModels(provider)
      const nextModels = data.models || []
      setModels(nextModels)
      if (nextModels.length > 0 && !nextModels.includes(selectedModel)) {
        setSelectedModel(nextModels[0])
      }
    } catch {
      setModels([])
    }
  }

  async function newConversation() {
    try {
      const { data } = await chatApi.createConversation({
        title: 'New Neural Sequence',
        provider: selectedProvider,
        model: selectedModel,
      })
      addConversation(data)
      setActiveConversationId(data.id)
      setMessages([])
    } catch (e) {
      toast.error('Failed to create conversation')
    }
  }

  async function removeConversation(id: number) {
    try {
      await chatApi.deleteConversation(id)
      deleteConversation(id)
      if (activeConversationId === id) {
        setActiveConversationId(null)
        setMessages([])
      }
    } catch {}
  }

  async function renameConversation(id: number, currentTitle: string) {
    const nextTitle = prompt('Conversation title:', currentTitle)
    if (!nextTitle || nextTitle.trim() === currentTitle) return
    try {
      const { data } = await chatApi.updateConversation(id, { title: nextTitle.trim() })
      setConversations(conversations.map((c) => (c.id === id ? { ...c, title: data.title } : c)))
      toast.success('Sequence renamed')
    } catch {
      toast.error('Rename failed')
    }
  }

  async function saveSystemPrompt() {
    if (!activeConversationId) return
    try {
      const { data } = await chatApi.updateConversation(activeConversationId, { system_prompt: systemPrompt })
      setConversations(conversations.map((c) =>
        c.id === activeConversationId ? { ...c, system_prompt: data.system_prompt } : c))
      toast.success('Core logic updated')
    } catch {
      toast.error('Failed to save core logic')
    }
  }

  async function onAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const snippet = text.slice(0, 20_000)
      const block = `\n\n[Injection: ${file.name}]\n\`\`\`\n${snippet}\n\`\`\`\n`
      setInput((prev) => (prev + block).trimStart())
      setAttachmentLabel(file.name)
      toast.success(`Injected ${file.name}`)
    } catch {
      toast.error('Injection failed')
    } finally {
      e.target.value = ''
    }
  }

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return
    const provider = selectedProvider || providers[0]?.name || 'ollama'
    const model = selectedModel || models[0] || undefined
    const text = input.trim()
    setInput('')
    setLoading(true)

    const userMsg = { role: 'user', content: text, id: Date.now() }
    setMessages((prev) => [...prev, userMsg])

    const payload = {
      message: text,
      provider,
      model,
      conversation_id: activeConversationId,
      system_prompt: systemPrompt || undefined,
      use_rag: ragEnabled,
      rag_collection: ragCollection,
      stream: true,
    }

    abortRef.current?.()
    setStreamingContent('')
    setActiveTools([])
    streamedTextRef.current = ''
    const assistantMsg = { role: 'assistant', content: '', id: Date.now() + 1, streaming: true }
    setMessages((prev) => [...prev, assistantMsg])

    abortRef.current = streamChat(
      payload,
      (chunk) => {
        streamedTextRef.current += chunk
        setStreamingContent(streamedTextRef.current)
      },
      (messageId) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.streaming
              ? { ...m, content: streamedTextRef.current, streaming: false, id: messageId }
              : m,
          ),
        )
        setStreamingContent('')
        setActiveTools([])
        streamedTextRef.current = ''
        abortRef.current = null
        setLoading(false)
        if (!activeConversationId) loadConversations()
      },
      (err) => {
        toast.error(err)
        setMessages((prev) => prev.filter((m) => !m.streaming))
        setStreamingContent('')
        setActiveTools([])
        streamedTextRef.current = ''
        abortRef.current = null
        setLoading(false)
      },
      (action) => {
        if (action.type === 'start') {
          setActiveTools((prev) => [...prev, { id: action.id!, name: action.name, status: 'running' }])
        } else if (action.type === 'result') {
          setActiveTools((prev) => prev.map(t => (t.name === action.name || t.id === action.id) ? { ...t, status: 'done' } : t))
          setTimeout(() => {
            setActiveTools((prev) => prev.filter(t => (t.name !== action.name && t.id !== action.id) || t.status === 'running'))
          }, 3000)
        }
      }
    )
  }, [input, loading, selectedProvider, selectedModel, providers, models, activeConversationId, ragEnabled, ragCollection, systemPrompt, addConversation, conversations, deleteConversation, setActiveConversationId, setConversations, setStoreProviders, setSelectedProvider, setSelectedModel])

  return (
    <div className="flex h-full w-full bg-surface-300 rounded-3xl overflow-hidden border border-white/5 shadow-2xl page-enter">
      {/* Sidebar - History */}
      <div className="w-72 flex-shrink-0 border-r border-white/5 flex flex-col bg-surface-100/50 backdrop-blur-sm">
        <div className="p-5 border-b border-white/5">
          <button 
            onClick={newConversation} 
            className="w-full bg-gradient-to-r from-nexus-600 to-accent-violet hover:from-nexus-500 hover:to-accent-violet/80 text-white rounded-2xl py-3 px-4 flex items-center justify-center gap-2 transition-all shadow-glow-indigo active:scale-[0.98] font-semibold text-sm"
          >
            <Plus size={18} /> <span>New Neural Sequence</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-2">Recent Synchronizations</p>
          {conversations.map((c) => (
            <div
              key={c.id}
              className={clsx(
                'group relative flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer transition-all duration-300',
                activeConversationId === c.id
                  ? 'bg-nexus-500/10 text-nexus-400 border border-nexus-500/20 shadow-glow-indigo'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent',
              )}
              onClick={() => setActiveConversationId(c.id)}
            >
              <Terminal size={14} className={clsx('flex-shrink-0', activeConversationId === c.id ? 'text-nexus-400' : 'text-slate-600')} />
              <span className="flex-1 truncate text-sm font-medium">{c.title}</span>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); renameConversation(c.id, c.title) }}
                  className="p-1 hover:text-nexus-400"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); removeConversation(c.id) }}
                  className="p-1 hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="py-10 text-center">
              <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                <Terminal size={16} className="text-slate-600" />
              </div>
              <p className="text-xs text-slate-600">No active history</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat View */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-200/30 relative">
        {/* Header / Config Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-surface-100/30 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
              <select
                value={selectedProvider}
                onChange={(e) => { setSelectedProvider(e.target.value); setSelectedModel('') }}
                className="bg-transparent text-xs font-bold text-slate-400 focus:outline-none px-2 py-1 cursor-pointer hover:text-white transition-colors"
              >
                {providers.map((p: any) => (
                  <option key={p.name} value={p.name} className="bg-surface-100">{p.name.toUpperCase()}</option>
                ))}
              </select>
              <div className="w-px h-4 bg-white/10 mx-1 self-center" />
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-transparent text-xs font-medium text-nexus-400 focus:outline-none px-2 py-1 cursor-pointer hover:text-nexus-300 transition-colors max-w-[180px]"
              >
                {models.map((m) => (
                  <option key={m} value={m} className="bg-surface-100">{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setRagEnabled(!ragEnabled)}
              className={clsx(
                'flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all uppercase tracking-wider',
                ragEnabled
                  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                  : 'border-white/10 text-slate-500 hover:border-white/20',
              )}
            >
              <Database size={12} />
              <span>RAG: {ragEnabled ? 'Online' : 'Off'}</span>
            </button>

            <button
              onClick={() => setShowSystemPrompt((v) => !v)}
              className={clsx(
                'p-2 rounded-xl border transition-all',
                showSystemPrompt
                  ? 'border-nexus-500/50 text-nexus-400 bg-nexus-500/10'
                  : 'border-white/10 text-slate-500 hover:text-white hover:bg-white/5',
              )}
              title="System Instructions"
            >
              <Settings2 size={18} />
            </button>
          </div>
        </div>

        {/* System Prompt Dropdown */}
        {showSystemPrompt && (
          <div className="absolute top-[73px] left-0 right-0 px-6 py-4 bg-surface-100/90 backdrop-blur-2xl border-b border-nexus-500/20 z-20 animate-in slide-in-from-top duration-300">
            <div className="max-w-4xl mx-auto flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-nexus-400 uppercase tracking-widest">Neural Directives (System Prompt)</label>
                <button onClick={saveSystemPrompt} className="text-[10px] bg-nexus-500/20 text-nexus-400 px-3 py-1 rounded-md hover:bg-nexus-500/30 transition-colors flex items-center gap-1">
                  <Save size={10} /> Update Core
                </button>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Define the behavior, identity, and constraints of the AI..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:border-nexus-500/30 min-h-[120px] transition-all"
              />
            </div>
          </div>
        )}

        {/* Chat Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative px-4 md:px-10 py-8 space-y-8">
          {messages.length === 0 && activeTools.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto page-enter">
              <div className="w-24 h-24 bg-gradient-to-tr from-nexus-600/20 to-accent-violet/20 rounded-[2.5rem] flex items-center justify-center mb-8 border border-white/10 shadow-2xl animate-float">
                <Sparkles size={48} className="text-nexus-400" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">NexusMind Engine Ready</h2>
              <p className="text-slate-400 text-base leading-relaxed">
                Awaiting neural synchronization. Access global knowledge via 
                <span className="text-nexus-400 mx-1 font-semibold">Gemini</span>, 
                <span className="text-accent-violet mx-1 font-semibold">Claude</span> or 
                <span className="text-accent-pink mx-1 font-semibold">GPT-4</span>.
              </p>
              <div className="grid grid-cols-2 gap-3 mt-10 w-full">
                {['Analyze my notes', 'Write a script', 'Explain Quantum Computing', 'Optimize this code'].map(t => (
                  <button key={t} onClick={() => setInput(t)} className="px-4 py-3 rounded-2xl bg-white/5 border border-white/5 text-xs text-slate-300 hover:bg-white/10 hover:border-nexus-500/30 transition-all text-left font-medium">
                    {t} →
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              streamingContent={msg.streaming ? streamingContent : undefined}
            />
          ))}
          
          {/* Active Tools */}
          {activeTools.length > 0 && (
            <div className="flex flex-col gap-3 ml-12">
              {activeTools.map((tool) => (
                <div key={tool.id} className="flex items-center gap-3 text-xs text-nexus-400 bg-nexus-500/5 border border-nexus-500/20 w-fit px-4 py-2 rounded-2xl animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-nexus-500 animate-ping" />
                  <span className="font-mono tracking-tight font-bold">Neural Link: {tool.name}...</span>
                </div>
              ))}
            </div>
          )}
          
          <div ref={messagesEndRef} className="h-10" />
        </div>

        {/* Input Zone */}
        <div className="px-4 md:px-10 pb-8 pt-4">
          <div className="max-w-4xl mx-auto relative group">
            {/* Decoration */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-nexus-500 to-accent-violet rounded-[2rem] opacity-20 blur group-focus-within:opacity-40 transition-opacity duration-500 pointer-events-none" />
            
            <div className="relative glass-card !rounded-[2rem] p-2 flex flex-col gap-2 shadow-2xl">
              {attachmentLabel && (
                <div className="px-4 pt-2 flex items-center gap-2">
                  <div className="bg-nexus-500/20 text-nexus-400 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2 border border-nexus-500/20">
                    <Paperclip size={10} /> {attachmentLabel}
                    <button onClick={() => setAttachmentLabel('')} className="hover:text-white">×</button>
                  </div>
                </div>
              )}
              
              <div className="flex items-end gap-2 px-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-slate-500 hover:text-nexus-400 transition-colors rounded-2xl hover:bg-white/5 mb-1"
                  title="Inject data"
                >
                  <Paperclip size={20} />
                </button>
                
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="Type a message or /command..."
                  className="w-full bg-transparent border-none focus:ring-0 text-slate-100 placeholder:text-slate-600 resize-none py-3 min-h-[56px] max-h-48 text-sm"
                  rows={1}
                  disabled={loading}
                />
                
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={onAttachFile}
                />

                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className={clsx(
                    'p-3.5 rounded-2xl transition-all duration-300 mb-1',
                    loading || !input.trim()
                      ? 'bg-white/5 text-slate-700'
                      : 'bg-nexus-600 text-white shadow-glow-indigo hover:scale-105 active:scale-95'
                  )}
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </div>
          <p className="text-center text-[10px] text-slate-600 mt-4 font-medium tracking-wide">
            NexusMind v1.2.0 • Advanced AI synchronization active • Latency: 24ms
          </p>
        </div>
      </div>
    </div>
  )
}

function ChatMessage({ message, streamingContent }: { message: any, streamingContent?: string }) {
  const isUser = message.role === 'user'
  const content = streamingContent !== undefined ? streamingContent : message.content

  return (
    <div className={clsx('flex gap-4 group', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={clsx(
          'w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 duration-300',
          isUser 
            ? 'bg-gradient-to-br from-nexus-500 to-nexus-700 text-white' 
            : 'bg-surface-100 border border-white/10 text-nexus-400',
        )}
      >
        {isUser ? <User size={20} /> : <Bot size={20} />}
      </div>

      {/* Bubble */}
      <div
        className={clsx(
          'max-w-[85%] lg:max-w-[75%] rounded-[1.5rem] px-5 py-4 text-sm leading-relaxed relative',
          isUser
            ? 'bg-nexus-600/10 text-slate-100 rounded-tr-none border border-nexus-600/20 shadow-sm'
            : 'glass-card bg-surface-100/40 text-slate-200 rounded-tl-none border-white/5 shadow-xl',
        )}
      >
        <div className="absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-2 mb-2 -translate-y-full pb-2">
           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
             {isUser ? 'Neural Output' : 'Engine Response'}
           </span>
        </div>

        {isUser ? (
          <p className="whitespace-pre-wrap font-medium">{content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/5 prose-pre:rounded-2xl">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || (streamingContent !== undefined ? '▋' : '')}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
