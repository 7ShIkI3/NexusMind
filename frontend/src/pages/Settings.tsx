import { useEffect, useState } from 'react'
import { aiApi } from '@/utils/api'
import { 
  Settings, Key, Server, CheckCircle, XCircle, Loader2, 
  RefreshCw, Save, Cpu, Globe, Shield, Activity, Database,
  Terminal, Zap
} from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

export default function SettingsPage() {
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
        anthropic_default_model: form.anthropic_default_model,
        google_api_key: form.google_api_key,
        google_default_model: form.google_default_model,
        abacus_api_key: form.abacus_api_key,
        abacus_base_url: form.abacus_base_url,
        nvidia_mim_api_key: form.nvidia_mim_api_key,
        nvidia_mim_base_url: form.nvidia_mim_base_url,
        nvidia_mim_default_model: form.nvidia_mim_default_model,
      })
      toast.success('Core configuration synchronized')
      loadAll()
    } catch { toast.error('Synchronization failed') } finally { setSaving(false) }
  }

  async function testProvider(name: string) {
    setTesting(name)
    try {
      const { data } = await aiApi.testProvider(name)
      if (data.success) {
        const respText = typeof data.response === 'string' 
          ? data.response 
          : data.response?.content || JSON.stringify(data.response)
        toast.success(`${name}: ${respText?.slice(0, 80)}...`)
      } else {
        toast.error(`${name}: ${data.error}`)
      }
    } catch { toast.error('Neural link test failed') } finally { setTesting(null) }
  }

  return (
    <div className="flex h-full w-full bg-surface-300 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl page-enter relative overflow-y-auto custom-scrollbar p-8 md:p-12">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-nexus-500/5 to-transparent pointer-events-none" />
      
      <div className="max-w-4xl mx-auto w-full space-y-12 relative z-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-white/5 pb-10">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white tracking-tight flex items-center gap-4">
              <div className="p-3 rounded-[1.25rem] bg-nexus-500/10 text-nexus-400 shadow-glow-indigo">
                <Settings size={32} />
              </div>
              System Core
            </h1>
            <p className="text-slate-500 text-base font-medium ml-1 max-w-xl leading-relaxed">
              Configure neural providers, API endpoints, and global system parameters to optimize cognitive processing.
            </p>
          </div>
          <button 
            onClick={save} 
            disabled={saving} 
            className="btn-primary !py-4.5 !px-8 rounded-2xl shadow-glow-indigo active:scale-95 transition-all flex items-center gap-3 shrink-0"
          >
            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
            <span className="uppercase tracking-[0.2em] text-[11px] font-bold">Synchronize All</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-10">
          {/* Ollama */}
          <ConfigSection 
            icon={<Server size={22} />} 
            title="Ollama" 
            subtitle="Local Neural Engine"
            status={providers.find(p => p.name === 'ollama')?.available}
            onTest={() => testProvider('ollama')}
            isTesting={testing === 'ollama'}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputField 
                label="Base Endpoint" 
                value={form.ollama_base_url} 
                onChange={(v: string) => setForm({ ...form, ollama_base_url: v })}
                placeholder="http://localhost:11434"
              />
              <InputField 
                label="Default Model" 
                value={form.ollama_default_model} 
                onChange={(v: string) => setForm({ ...form, ollama_default_model: v })}
                placeholder="llama3"
              />
            </div>
          </ConfigSection>

          {/* OpenAI */}
          <ConfigSection 
            icon={<Globe size={22} />} 
            title="OpenAI Compatible" 
            subtitle="Cloud Intelligence Network"
            status={providers.find(p => p.name === 'openai')?.available}
            onTest={() => testProvider('openai')}
            isTesting={testing === 'openai'}
          >
            <div className="space-y-6">
              <InputField 
                label="API Key" 
                value={form.openai_api_key} 
                onChange={(v: string) => setForm({ ...form, openai_api_key: v })}
                placeholder="sk-..."
                type="password"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField 
                  label="Base URL" 
                  value={form.openai_base_url} 
                  onChange={(v: string) => setForm({ ...form, openai_base_url: v })}
                  placeholder="https://api.openai.com/v1"
                />
                <InputField 
                  label="Default Model" 
                  value={form.openai_default_model} 
                  onChange={(v: string) => setForm({ ...form, openai_default_model: v })}
                  placeholder="gpt-4o"
                />
              </div>
            </div>
          </ConfigSection>

          {/* Anthropic */}
          <ConfigSection 
            icon={<Zap size={22} />} 
            title="Anthropic Claude" 
            subtitle="Advanced Reasoning Core"
            status={providers.find(p => p.name === 'anthropic')?.available}
            onTest={() => testProvider('anthropic')}
            isTesting={testing === 'anthropic'}
          >
            <div className="space-y-6">
              <InputField 
                label="API Key" 
                value={form.anthropic_api_key} 
                onChange={(v: string) => setForm({ ...form, anthropic_api_key: v })}
                placeholder="sk-ant-..."
                type="password"
              />
              <InputField 
                label="Default Model" 
                value={form.anthropic_default_model} 
                onChange={(v: string) => setForm({ ...form, anthropic_default_model: v })}
                placeholder="claude-3-5-sonnet-20241022"
              />
            </div>
          </ConfigSection>

          {/* Google Gemini */}
          <ConfigSection 
            icon={<Activity size={22} />} 
            title="Google Gemini" 
            subtitle="Multimodal Synthesis"
            status={providers.find(p => p.name === 'gemini')?.available}
            onTest={() => testProvider('gemini')}
            isTesting={testing === 'gemini'}
          >
            <div className="space-y-6">
              <InputField 
                label="API Key" 
                value={form.google_api_key} 
                onChange={(v: string) => setForm({ ...form, google_api_key: v })}
                placeholder="AIza..."
                type="password"
              />
              <InputField 
                label="Default Model" 
                value={form.google_default_model} 
                onChange={(v: string) => setForm({ ...form, google_default_model: v })}
                placeholder="gemini-1.5-pro"
              />
            </div>
          </ConfigSection>

          {/* NVIDIA MIM */}
          <ConfigSection 
            icon={<Cpu size={22} />} 
            title="NVIDIA MIM" 
            subtitle="High-Performance Inference"
            status={providers.find(p => p.name === 'nvidia_mim')?.available}
            onTest={() => testProvider('nvidia_mim')}
            isTesting={testing === 'nvidia_mim'}
          >
            <div className="space-y-6">
              <InputField 
                label="API Key" 
                value={form.nvidia_mim_api_key} 
                onChange={(v: string) => setForm({ ...form, nvidia_mim_api_key: v })}
                placeholder="NVIDIA MIM API key"
                type="password"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField 
                  label="Base URL" 
                  value={form.nvidia_mim_base_url} 
                  onChange={(v: string) => setForm({ ...form, nvidia_mim_base_url: v })}
                  placeholder="https://api.nvidia.com/mim"
                />
                <InputField 
                  label="Default Model" 
                  value={form.nvidia_mim_default_model} 
                  onChange={(v: string) => setForm({ ...form, nvidia_mim_default_model: v })}
                  placeholder="mim-large"
                />
              </div>
            </div>
          </ConfigSection>

          {/* Abacus */}
          <ConfigSection 
            icon={<Database size={22} />} 
            title="Abacus.AI" 
            subtitle="Specialized Neural Workloads"
            status={providers.find(p => p.name === 'abacus')?.available}
            onTest={() => testProvider('abacus')}
            isTesting={testing === 'abacus'}
          >
            <div className="space-y-6">
              <InputField 
                label="API Key" 
                value={form.abacus_api_key} 
                onChange={(v: string) => setForm({ ...form, abacus_api_key: v })}
                placeholder="Your Abacus API key"
                type="password"
              />
              <InputField 
                label="Base URL" 
                value={form.abacus_base_url} 
                onChange={(v: string) => setForm({ ...form, abacus_base_url: v })}
                placeholder="https://api.abacus.ai/v0"
              />
            </div>
          </ConfigSection>
        </div>

        {/* System Info Deco */}
        <div className="pt-10 flex flex-col items-center gap-6">
          <div className="flex items-center gap-4 px-6 py-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md">
            <Terminal size={14} className="text-slate-600" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Environment: Production / Neural-v2</span>
          </div>
          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        </div>
      </div>
    </div>
  )
}

function ConfigSection({ icon, title, subtitle, status, onTest, isTesting, children }: any) {
  return (
    <div className="glass-panel p-10 rounded-[3rem] border border-white/5 bg-white/5 shadow-2xl relative overflow-hidden group transition-all duration-500 hover:border-nexus-500/20">
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-nexus-500/5 rounded-full blur-3xl group-hover:bg-nexus-500/10 transition-colors duration-1000" />
      
      <div className="flex items-center justify-between mb-10 relative z-10">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-nexus-400 group-hover:scale-110 group-hover:rotate-6 transition-all duration-700 border border-white/10 shadow-inner">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
              {status !== undefined && (
                status 
                  ? <CheckCircle size={16} className="text-emerald-400 shadow-glow-emerald" />
                  : <XCircle size={16} className="text-slate-600" />
              )}
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">{subtitle}</p>
          </div>
        </div>
        
        <button 
          onClick={onTest} 
          disabled={isTesting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all active:scale-95 group/btn"
        >
          {isTesting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} className="group-hover/btn:rotate-180 transition-transform duration-500" />}
          Test Link
        </button>
      </div>

      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, type = 'text' }: any) {
  return (
    <div className="space-y-3 group/field">
      <div className="flex items-center justify-between ml-1">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] group-focus-within/field:text-nexus-400 transition-colors">{label}</label>
      </div>
      <div className="relative">
        <div className="absolute -inset-0.5 bg-nexus-500/20 rounded-2xl blur opacity-0 group-focus-within/field:opacity-100 transition duration-500" />
        <input 
          type={type}
          className="relative w-full bg-surface-300/50 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all text-white font-medium shadow-inner placeholder:text-slate-700"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
    </div>
  )
}