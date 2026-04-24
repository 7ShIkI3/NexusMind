import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { chatApi, streamChat } from '@/utils/api'
import { Send, Plus, Trash2, Bot, User, Loader2, Cpu, ToggleLeft, ToggleRight } from 'lucide-react'
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
  } = useStore()

  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [providers, setProviders] = useState<any[]>([])
  const [models, setModels] = useState<string[]>([])
  const { setSelectedProvider, setSelectedModel } = useStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    loadConversations()
    loadProviders()
  }, [])

  useEffect(() => {
    if (activeConversationId) loadMessages(activeConversationId)
  }, [activeConversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

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
    } catch {}
  }

  async function loadProviders() {
    try {
      const { data } = await chatApi.listProviders()
      setProviders(data)
    } catch {}
  }

  async function loadModels(provider: string) {
    try {
      const { data } = await chatApi.listModels(provider)
      setModels(data.models || [])
    } catch {}
  }

  async function newConversation() {
    try {
      const { data } = await chatApi.createConversation({
        title: 'New Conversation',
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

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')
    setLoading(true)

    const userMsg = { role: 'user', content: text, id: Date.now() }
    setMessages((prev) => [...prev, userMsg])

    const payload = {
      message: text,
      provider: selectedProvider,
      model: selectedModel,
      conversation_id: activeConversationId,
      use_rag: ragEnabled,
      rag_collection: ragCollection,
      stream: true,
    }

    setStreamingContent('')
    const assistantMsg = { role: 'assistant', content: '', id: Date.now() + 1, streaming: true }
    setMessages((prev) => [...prev, assistantMsg])

    abortRef.current = streamChat(
      payload,
      (chunk) => {
        setStreamingContent((prev) => prev + chunk)
      },
      (messageId) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.streaming
              ? { ...m, content: streamingContent, streaming: false, id: messageId }
              : m,
          ),
        )
        setStreamingContent('')
        setLoading(false)
        if (!activeConversationId) loadConversations()
      },
      (err) => {
        toast.error(err)
        setMessages((prev) => prev.filter((m) => !m.streaming))
        setStreamingContent('')
        setLoading(false)
      },
    )
  }, [input, loading, selectedProvider, selectedModel, activeConversationId, ragEnabled, ragCollection, streamingContent])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Conversation list */}
      <div className="w-56 flex-shrink-0 border-r border-white/5 flex flex-col bg-[#111425]">
        <div className="p-3 border-b border-white/5">
          <button onClick={newConversation} className="btn-primary w-full text-sm">
            <Plus size={16} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={clsx(
                'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer',
                'text-sm transition-all duration-150',
                activeConversationId === c.id
                  ? 'bg-nexus-500/20 text-nexus-300'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white',
              )}
              onClick={() => setActiveConversationId(c.id)}
            >
              <Bot size={14} className="flex-shrink-0" />
              <span className="flex-1 truncate">{c.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeConversation(c.id) }}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-xs text-gray-600 text-center mt-4">No conversations yet</p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 bg-[#111425]/50">
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="input text-sm py-1 w-32"
          >
            <option value="ollama">Ollama</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Claude</option>
            <option value="gemini">Gemini</option>
            <option value="abacus">Abacus</option>
          </select>

          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="input text-sm py-1 flex-1 max-w-[200px]"
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            {models.length === 0 && (
              <option value={selectedModel}>{selectedModel}</option>
            )}
          </select>

          <button
            onClick={() => setRagEnabled(!ragEnabled)}
            className={clsx(
              'flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-all',
              ragEnabled
                ? 'border-nexus-500/50 text-nexus-400 bg-nexus-500/10'
                : 'border-white/10 text-gray-500',
            )}
          >
            {ragEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            RAG
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              streamingContent={msg.streaming ? streamingContent : undefined}
            />
          ))}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-nexus-500/20 rounded-2xl flex items-center justify-center mb-4">
                <Cpu size={32} className="text-nexus-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Start a conversation</h2>
              <p className="text-gray-500 text-sm max-w-md">
                Chat with Ollama, Claude, Gemini, GPT-4 and more.
                {ragEnabled && ' RAG mode enabled — your notes will be used as context.'}
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/5">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Message… (Enter to send, Shift+Enter for newline)"
              className="input resize-none flex-1 min-h-[48px] max-h-32"
              rows={1}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="btn-primary px-4 self-end"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChatMessage({
  message,
  streamingContent,
}: {
  message: any
  streamingContent?: string
}) {
  const isUser = message.role === 'user'
  const content = streamingContent !== undefined ? streamingContent : message.content

  return (
    <div className={clsx('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={clsx(
          'w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center',
          isUser ? 'bg-nexus-500' : 'bg-[#1a2040]',
        )}
      >
        {isUser ? <User size={16} /> : <Bot size={16} className="text-nexus-400" />}
      </div>
      <div
        className={clsx(
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm',
          isUser
            ? 'bg-nexus-500/20 text-gray-100 rounded-tr-sm'
            : 'bg-[#1a1d2e] text-gray-200 rounded-tl-sm border border-white/5',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || (streamingContent !== undefined ? '▋' : '')}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
