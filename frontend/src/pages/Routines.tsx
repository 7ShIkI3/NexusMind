import { useEffect, useState } from 'react'
import { routinesApi } from '@/utils/api'
import { 
  Plus, Play, Trash2, Clock, Loader2, Zap, CheckCircle, 
  XCircle, Activity, Settings2, Sparkles, Cpu, Terminal, 
  BarChart, Calendar, ChevronRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

const ROUTINE_TYPE_LABELS: Record<string, string> = {
  organize_notes: '📁 Organize Notes',
  auto_tag: '🏷️ Auto Tag',
  auto_link: '🔗 Auto Link',
}

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [running, setRunning] = useState<number | null>(null)
  const [types, setTypes] = useState<string[]>([])
  const [form, setForm] = useState({
    name: '',
    description: '',
    routine_type: 'auto_tag',
    schedule: 'interval:3600',
    provider: 'ollama',
    model: '',
    enabled: true,
  })

  useEffect(() => {
    loadRoutines()
    loadTypes()
  }, [])

  async function loadRoutines() {
    setLoading(true)
    try {
      const { data } = await routinesApi.list()
      setRoutines(data)
    } catch {} finally { setLoading(false) }
  }

  async function loadTypes() {
    try {
      const { data } = await routinesApi.listTypes()
      setTypes(data.types || [])
    } catch {}
  }

  async function createRoutine() {
    try {
      const { data } = await routinesApi.create(form)
      setRoutines([...routines, data])
      setShowCreate(false)
      setForm({ name: '', description: '', routine_type: 'auto_tag',
        schedule: 'interval:3600', provider: 'ollama', model: '', enabled: true })
      toast.success('Routine created')
    } catch { toast.error('Failed to create routine') }
  }

  async function runRoutine(id: number) {
    setRunning(id)
    try {
      await routinesApi.run(id)
      toast.success('Routine completed')
      loadRoutines()
    } catch { toast.error('Routine execution failed') } finally { setRunning(null) }
  }

  async function toggleRoutine(id: number, enabled: boolean) {
    try {
      const { data } = await routinesApi.update(id, { enabled: !enabled })
      setRoutines(routines.map((r) => r.id === id ? { ...r, ...data } : r))
      toast.success(`Routine ${!enabled ? 'activated' : 'deactivated'}`)
    } catch {}
  }

  async function deleteRoutine(id: number) {
    try {
      await routinesApi.delete(id)
      setRoutines(routines.filter((r) => r.id !== id))
      toast.success('Routine purged')
    } catch {}
  }

  return (
    <div className="flex h-full w-full bg-surface-300 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl page-enter relative overflow-y-auto custom-scrollbar p-8 md:p-12">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-nexus-500/5 to-transparent pointer-events-none" />
      
      <div className="max-w-7xl mx-auto w-full space-y-12 relative z-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white tracking-tight flex items-center gap-4">
              <div className="p-3 rounded-[1.25rem] bg-nexus-500/10 text-nexus-400 shadow-glow-indigo">
                <Zap size={32} />
              </div>
              Neural Automations
            </h1>
            <p className="text-slate-500 text-base font-medium ml-1 max-w-2xl leading-relaxed">
              Configure autonomous background processes to enrich, organize, and synthesize your cognitive data using state-of-the-art neural engines.
            </p>
          </div>
          <button 
            onClick={() => setShowCreate(true)} 
            className="btn-primary !py-4.5 !px-8 rounded-2xl shadow-glow-indigo active:scale-95 transition-all group shrink-0"
          >
            <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" /> 
            <span className="uppercase tracking-[0.2em] text-[11px] font-bold">Initialize Routine</span>
          </button>
        </div>

        {/* System Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <OverviewCard icon={<Activity size={24} />} label="Active Routines" value={routines.filter(r => r.enabled).length} color="text-emerald-400" glow="shadow-glow-emerald" />
          <OverviewCard icon={<BarChart size={24} />} label="Total Cycles" value={routines.reduce((acc, r) => acc + (r.run_count || 0), 0)} color="text-nexus-400" glow="shadow-glow-indigo" />
          <OverviewCard icon={<Sparkles size={24} />} label="System Sync" value={routines.length > 0 ? "Operational" : "Idle"} color="text-accent-violet" glow="shadow-glow-violet" />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-nexus-500/20 blur-2xl rounded-full animate-pulse" />
              <Loader2 size={64} className="text-nexus-400 animate-spin relative z-10" />
            </div>
            <p className="text-xs font-mono text-slate-600 uppercase tracking-[0.4em] animate-pulse font-bold">Syncing Automations...</p>
          </div>
        ) : routines.length === 0 ? (
          <div className="glass-panel p-24 text-center rounded-[4rem] border-white/5 space-y-10 bg-white/5 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-nexus-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            
            <div className="w-24 h-24 rounded-[2.5rem] bg-white/5 flex items-center justify-center mx-auto border border-white/5 animate-float relative z-10">
              <Zap size={40} className="text-slate-700 group-hover:text-nexus-400 transition-colors duration-500" />
            </div>
            <div className="space-y-4 relative z-10">
              <h2 className="text-2xl font-bold text-white tracking-tight">No active routines detected</h2>
              <p className="text-base text-slate-500 max-w-md mx-auto leading-relaxed font-medium">
                Unlock the power of autonomous intelligence. Create your first routine to automate organization, metadata extraction, and cognitive linking.
              </p>
            </div>
            <button onClick={() => setShowCreate(true)} className="btn-primary mt-6 py-5 px-12 rounded-2xl shadow-glow-indigo relative z-10 uppercase tracking-widest text-xs font-bold">
              Initialize First Sequence
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {routines.map((r) => (
              <div 
                key={r.id} 
                className={clsx(
                  'glass-panel !p-0 rounded-[2.5rem] flex flex-col md:flex-row items-stretch overflow-hidden border border-white/5 hover:border-nexus-500/20 transition-all duration-500 group relative bg-white/5 shadow-xl hover:-translate-y-1',
                  !r.enabled && 'opacity-60 grayscale-[0.4]'
                )}
              >
                {/* Status Indicator Bar */}
                <div className={clsx('w-2 self-stretch transition-colors duration-500', r.enabled ? 'bg-nexus-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-slate-800')} />
                
                <div className="flex-1 p-8 md:p-10 flex flex-col md:flex-row items-center gap-8">
                  <div className="w-16 h-16 rounded-[1.25rem] bg-white/5 border border-white/5 flex items-center justify-center text-nexus-400 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 flex-shrink-0 shadow-inner">
                    <Activity size={28} />
                  </div>
                  
                  <div className="flex-1 text-center md:text-left space-y-4 min-w-0">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                      <h3 className="text-xl font-bold text-white tracking-tight truncate max-w-md group-hover:text-nexus-400 transition-colors">{r.name}</h3>
                      <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-nexus-500/10 text-nexus-400 border border-nexus-500/10 uppercase tracking-[0.2em] shadow-glow-indigo">
                        {ROUTINE_TYPE_LABELS[r.routine_type] || r.routine_type}
                      </span>
                      {r.enabled && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 text-[10px] font-bold uppercase tracking-widest">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                        </span>
                      )}
                    </div>
                    {r.description && <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed font-medium">{r.description}</p>}
                    
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-5 pt-2">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                        <Clock size={14} className="text-nexus-500" /> {r.schedule || 'Manual Execution'}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                        <Cpu size={14} className="text-accent-violet" /> {r.provider || 'ollama'}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                        <Settings2 size={14} className="text-emerald-500" /> Runs: <span className="text-white ml-1">{r.run_count || 0}</span>
                      </div>
                      {r.last_run && (
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                          <Calendar size={14} className="text-amber-500" /> {new Date(r.last_run).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <button
                      onClick={() => runRoutine(r.id)}
                      disabled={running === r.id}
                      className="w-14 h-14 rounded-2xl bg-white/5 text-nexus-400 hover:bg-nexus-500/10 transition-all border border-white/10 hover:border-nexus-500/30 flex items-center justify-center shadow-lg active:scale-90 disabled:opacity-30 group/play"
                      title="Execute Manual Run"
                    >
                      {running === r.id
                        ? <Loader2 size={24} className="animate-spin" />
                        : <Play size={24} fill="currentColor" className="group-hover/play:scale-110 transition-transform" />}
                    </button>
                    <button
                      onClick={() => toggleRoutine(r.id, r.enabled)}
                      className={clsx(
                        'w-14 h-14 rounded-2xl transition-all border flex items-center justify-center shadow-lg active:scale-90',
                        r.enabled 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                          : 'bg-white/5 text-slate-600 border-white/10 hover:text-slate-400'
                      )}
                      title={r.enabled ? 'Disable Routine' : 'Enable Routine'}
                    >
                      {r.enabled ? <CheckCircle size={24} /> : <XCircle size={24} />}
                    </button>
                    <button
                      onClick={() => deleteRoutine(r.id)}
                      className="w-14 h-14 rounded-2xl bg-red-500/5 text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20 flex items-center justify-center active:scale-90"
                      title="Purge Routine"
                    >
                      <Trash2 size={24} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] px-6 animate-in fade-in duration-500">
          <div className="absolute inset-0 bg-surface-300/70 backdrop-blur-xl" onClick={() => setShowCreate(false)} />
          <div className="glass-panel w-full max-w-2xl p-12 rounded-[3rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 relative overflow-y-auto max-h-[90vh] custom-scrollbar bg-surface-100/90 backdrop-blur-2xl">
            <h2 className="text-3xl font-bold text-white mb-10 tracking-tight flex items-center gap-4">
              <div className="w-2.5 h-10 bg-nexus-500 rounded-full shadow-glow-indigo" /> Initialize Neural Routine
            </h2>
            
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] ml-1 flex items-center gap-2">
                    <Terminal size={12} className="text-nexus-400" /> Routine Designation
                  </label>
                  <input className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all text-white font-medium" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Note Autotagger" />
                </div>
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] ml-1 flex items-center gap-2">
                    <Activity size={12} className="text-nexus-400" /> Routine Type
                  </label>
                  <div className="relative">
                    <select className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all text-white font-medium appearance-none cursor-pointer" value={form.routine_type}
                      onChange={(e) => setForm({ ...form, routine_type: e.target.value })}>
                      {types.map((t) => (
                        <option key={t} value={t} className="bg-surface-100">{ROUTINE_TYPE_LABELS[t] || t}</option>
                      ))}
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <ChevronRight size={16} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] ml-1 flex items-center gap-2">
                  <Sparkles size={12} className="text-nexus-400" /> Mission Description
                </label>
                <input className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all text-white font-medium" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Summarize the routine's purpose..." />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] ml-1 flex items-center gap-2">
                    <Clock size={12} className="text-nexus-400" /> Execution Schedule
                  </label>
                  <div className="relative">
                    <select className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all text-white font-medium appearance-none cursor-pointer" value={form.schedule}
                      onChange={(e) => setForm({ ...form, schedule: e.target.value })}>
                      <option value="" className="bg-surface-100">Manual Synchronization</option>
                      <option value="interval:3600" className="bg-surface-100">Every Hour</option>
                      <option value="interval:86400" className="bg-surface-100">Every 24 Hours</option>
                      <option value="interval:604800" className="bg-surface-100">Every 7 Days</option>
                      <option value="cron:0 9 * * *" className="bg-surface-100">Daily at 09:00</option>
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <ChevronRight size={16} />
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] ml-1 flex items-center gap-2">
                    <Cpu size={12} className="text-nexus-400" /> Neural Engine
                  </label>
                  <div className="relative">
                    <select className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all text-white font-medium appearance-none cursor-pointer" value={form.provider}
                      onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                      <option value="ollama" className="bg-surface-100">Ollama (Local Engine)</option>
                      <option value="openai" className="bg-surface-100">OpenAI (Nexus Cloud)</option>
                      <option value="anthropic" className="bg-surface-100">Anthropic Claude</option>
                      <option value="gemini" className="bg-surface-100">Google Gemini</option>
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <ChevronRight size={16} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-6 pt-10">
                <button 
                  onClick={createRoutine} 
                  disabled={!form.name} 
                  className="btn-primary flex-1 py-5 rounded-2xl shadow-glow-indigo active:scale-95 disabled:opacity-30 disabled:grayscale transition-all uppercase tracking-[0.2em] font-bold text-xs"
                >
                  Confirm Initialization
                </button>
                <button 
                  onClick={() => setShowCreate(false)} 
                  className="btn-ghost flex-1 py-5 rounded-2xl bg-white/5 hover:bg-white/10 uppercase tracking-[0.2em] font-bold text-xs transition-all text-slate-400 hover:text-white"
                >
                  Abort
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OverviewCard({ icon, label, value, color, glow }: { icon: React.ReactNode, label: string, value: string | number, color: string, glow: string }) {
  return (
    <div className={clsx("glass-panel p-8 rounded-[3rem] border border-white/5 shadow-2xl flex items-center gap-6 group hover:border-white/10 transition-all bg-white/5 relative overflow-hidden", glow)}>
      <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000" />
      <div className={clsx("p-4.5 rounded-2xl bg-white/5 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 z-10 shadow-inner", color)}>
        {icon}
      </div>
      <div className="z-10">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] mb-1.5">{label}</p>
        <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
      </div>
    </div>
  )
}
