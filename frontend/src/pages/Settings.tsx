import { useEffect, useState } from 'react'
import { aiApi } from '@/utils/api'
import { Settings, Key, Server, CheckCircle, XCircle, Loader2, RefreshCw, Save, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

export default function SettingsPage() {
  const [config, setConfig] = useState<any>({})
  const [providers, setProviders] = useState<any[]>([])
  const [testing, setTesting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      const [configRes, provRes] = await Promise.all([
        aiApi.getConfig(),
        aiApi.listProviders(),
      ])
      setConfig(configRes.data)
      // Pre-fill non-secret fields; leave API key fields empty (they are write-only)
      setForm({
        ollama_base_url: configRes.data.ollama_base_url || '',
        ollama_default_model: configRes.data.ollama_default_model || '',
        openai_api_key: '',
        openai_base_url: configRes.data.openai_base_url || '',
        openai_default_model: configRes.data.openai_default_model || '',
        anthropic_api_key: '',
        anthropic_default_model: configRes.data.anthropic_default_model || '',
        google_api_key: '',
        google_default_model: configRes.data.google_default_model || '',
        abacus_api_key: '',
        abacus_base_url: configRes.data.abacus_base_url || '',
      })
      setProviders(provRes.data)
    } catch { toast.error('Failed to load settings') }
  }

  async function save() {
    setSaving(true)
    try {
      // Only include API keys if the user actually typed something new
      const payload: any = {
        ollama_base_url: form.ollama_base_url || undefined,
        ollama_default_model: form.ollama_default_model || undefined,
        openai_base_url: form.openai_base_url || undefined,
        openai_default_model: form.openai_default_model || undefined,
        anthropic_default_model: form.anthropic_default_model || undefined,
        google_default_model: form.google_default_model || undefined,
        abacus_base_url: form.abacus_base_url || undefined,
      }
      if (form.openai_api_key) payload.openai_api_key = form.openai_api_key
      if (form.anthropic_api_key) payload.anthropic_api_key = form.anthropic_api_key
      if (form.google_api_key) payload.google_api_key = form.google_api_key
      if (form.abacus_api_key) payload.abacus_api_key = form.abacus_api_key

      await aiApi.updateConfig(payload)
      toast.success('Settings saved')
      loadAll()
    } catch { toast.error('Save failed') } finally { setSaving(false) }
  }

  async function testProvider(name: string) {
    setTesting(name)
    try {
      const { data } = await aiApi.testProvider(name)
      if (data.success) {
        toast.success(`${name}: ${data.response?.slice(0, 80)}`)
      } else {
        toast.error(`${name}: ${data.error}`)
      }
    } catch { toast.error('Test failed') } finally { setTesting(null) }
  }

  function toggleShowKey(key: string) {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function ConfiguredBadge({ configured }: { configured: boolean }) {
    return configured
      ? <span className="badge bg-green-500/10 text-green-400 text-[10px]">✓ Configured</span>
      : <span className="badge bg-gray-500/10 text-gray-500 text-[10px]">Not set</span>
  }

  function ProviderStatus({ name }: { name: string }) {
    const p = providers.find((x) => x.name === name)
    if (!p) return null
    return p.available
      ? <CheckCircle size={14} className="text-green-400" />
      : <XCircle size={14} className="text-gray-600" />
  }

  function ApiKeyField({ field, placeholder, configuredKey }: {
    field: string; placeholder: string; configuredKey?: string
  }) {
    const isConfigured = configuredKey ? config[configuredKey] : false
    const visible = showKeys[field]
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-400">API Key</label>
          {configuredKey && <ConfiguredBadge configured={isConfigured} />}
        </div>
        <div className="relative">
          <input
            className="input text-sm font-mono pr-9"
            type={visible ? 'text' : 'password'}
            value={form[field] || ''}
            onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            placeholder={isConfigured ? '(leave blank to keep existing)' : placeholder}
          />
          <button
            type="button"
            onClick={() => toggleShowKey(field)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings size={20} className="text-nexus-400" /> Settings
        </h1>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save All
        </button>
      </div>

      {/* Ollama */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server size={16} className="text-nexus-400" />
          <h2 className="font-semibold text-white">Ollama (Local AI)</h2>
          <ProviderStatus name="ollama" />
          <button onClick={() => testProvider('ollama')} disabled={testing === 'ollama'}
            className="btn-ghost text-xs py-1 ml-auto">
            {testing === 'ollama' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Test
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Base URL</label>
            <input className="input text-sm" value={form.ollama_base_url || ''}
              onChange={(e) => setForm({ ...form, ollama_base_url: e.target.value })}
              placeholder="http://localhost:11434" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Default Model</label>
            <input className="input text-sm" value={form.ollama_default_model || ''}
              onChange={(e) => setForm({ ...form, ollama_default_model: e.target.value })}
              placeholder="llama3" />
          </div>
        </div>
      </section>

      {/* OpenAI */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Key size={16} className="text-nexus-400" />
          <h2 className="font-semibold text-white">OpenAI / Compatible API</h2>
          <ProviderStatus name="openai" />
          <button onClick={() => testProvider('openai')} disabled={testing === 'openai'}
            className="btn-ghost text-xs py-1 ml-auto">
            {testing === 'openai' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Test
          </button>
        </div>
        <div className="space-y-3">
          <ApiKeyField field="openai_api_key" placeholder="sk-..." configuredKey="openai_configured" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Base URL</label>
              <input className="input text-sm" value={form.openai_base_url || ''}
                onChange={(e) => setForm({ ...form, openai_base_url: e.target.value })}
                placeholder="https://api.openai.com/v1" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Default Model</label>
              <input className="input text-sm" value={form.openai_default_model || ''}
                onChange={(e) => setForm({ ...form, openai_default_model: e.target.value })}
                placeholder="gpt-4o" />
            </div>
          </div>
        </div>
      </section>

      {/* Anthropic */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Key size={16} className="text-nexus-400" />
          <h2 className="font-semibold text-white">Anthropic Claude</h2>
          <ProviderStatus name="anthropic" />
          <button onClick={() => testProvider('anthropic')} disabled={testing === 'anthropic'}
            className="btn-ghost text-xs py-1 ml-auto">
            {testing === 'anthropic' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Test
          </button>
        </div>
        <div className="space-y-3">
          <ApiKeyField field="anthropic_api_key" placeholder="sk-ant-..." configuredKey="anthropic_configured" />
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Default Model</label>
            <input className="input text-sm" value={form.anthropic_default_model || ''}
              onChange={(e) => setForm({ ...form, anthropic_default_model: e.target.value })}
              placeholder="claude-3-5-sonnet-20241022" />
          </div>
        </div>
      </section>

      {/* Google Gemini */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Key size={16} className="text-nexus-400" />
          <h2 className="font-semibold text-white">Google Gemini</h2>
          <ProviderStatus name="gemini" />
          <button onClick={() => testProvider('gemini')} disabled={testing === 'gemini'}
            className="btn-ghost text-xs py-1 ml-auto">
            {testing === 'gemini' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Test
          </button>
        </div>
        <div className="space-y-3">
          <ApiKeyField field="google_api_key" placeholder="AIza..." configuredKey="google_configured" />
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Default Model</label>
            <input className="input text-sm" value={form.google_default_model || ''}
              onChange={(e) => setForm({ ...form, google_default_model: e.target.value })}
              placeholder="gemini-1.5-pro" />
          </div>
        </div>
      </section>

      {/* Abacus */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Key size={16} className="text-nexus-400" />
          <h2 className="font-semibold text-white">Abacus.AI</h2>
          <ProviderStatus name="abacus" />
          <button onClick={() => testProvider('abacus')} disabled={testing === 'abacus'}
            className="btn-ghost text-xs py-1 ml-auto">
            {testing === 'abacus' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Test
          </button>
        </div>
        <div className="space-y-3">
          <ApiKeyField field="abacus_api_key" placeholder="Your Abacus API key" configuredKey="abacus_configured" />
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Base URL</label>
            <input className="input text-sm" value={form.abacus_base_url || ''}
              onChange={(e) => setForm({ ...form, abacus_base_url: e.target.value })}
              placeholder="https://api.abacus.ai/v0" />
          </div>
        </div>
      </section>
    </div>
  )
}
