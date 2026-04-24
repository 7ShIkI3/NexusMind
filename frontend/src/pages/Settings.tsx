import { useEffect, useState } from 'react'
import { aiApi } from '@/utils/api'
import { Settings, Key, Server, CheckCircle, XCircle, Loader2, RefreshCw, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

export default function SettingsPage() {
  const [config, setConfig] = useState<any>({})
  const [providers, setProviders] = useState<any[]>([])
  const [testing, setTesting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({})

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
      setForm(configRes.data)
      setProviders(provRes.data)
    } catch {}
  }

  async function save() {
    setSaving(true)
    try {
      await aiApi.updateConfig({
        ollama_base_url: form.ollama_base_url,
        ollama_default_model: form.ollama_default_model,
        openai_api_key: form.openai_api_key,
        openai_base_url: form.openai_base_url,
        openai_default_model: form.openai_default_model,
        anthropic_api_key: form.anthropic_api_key,
        google_api_key: form.google_api_key,
        abacus_api_key: form.abacus_api_key,
      })
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

  function ProviderStatus({ name }: { name: string }) {
    const p = providers.find((x) => x.name === name)
    if (!p) return null
    return p.available
      ? <CheckCircle size={14} className="text-green-400" />
      : <XCircle size={14} className="text-gray-600" />
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
          <div>
            <label className="text-xs text-gray-400 mb-1 block">API Key</label>
            <input className="input text-sm font-mono" type="password"
              value={form.openai_api_key || ''}
              onChange={(e) => setForm({ ...form, openai_api_key: e.target.value })}
              placeholder="sk-..." />
          </div>
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
        <div>
          <label className="text-xs text-gray-400 mb-1 block">API Key</label>
          <input className="input text-sm font-mono" type="password"
            value={form.anthropic_api_key || ''}
            onChange={(e) => setForm({ ...form, anthropic_api_key: e.target.value })}
            placeholder="sk-ant-..." />
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
        <div>
          <label className="text-xs text-gray-400 mb-1 block">API Key</label>
          <input className="input text-sm font-mono" type="password"
            value={form.google_api_key || ''}
            onChange={(e) => setForm({ ...form, google_api_key: e.target.value })}
            placeholder="AIza..." />
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
        <div>
          <label className="text-xs text-gray-400 mb-1 block">API Key</label>
          <input className="input text-sm font-mono" type="password"
            value={form.abacus_api_key || ''}
            onChange={(e) => setForm({ ...form, abacus_api_key: e.target.value })}
            placeholder="Your Abacus API key" />
        </div>
      </section>
    </div>
  )
}
