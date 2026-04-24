import { useEffect, useState } from 'react'
import { routinesApi } from '@/utils/api'
import { Plus, Play, Trash2, Clock, Loader2, Zap, CheckCircle, XCircle } from 'lucide-react'
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
      const { data } = await routinesApi.run(id)
      toast.success(`Routine completed: ${JSON.stringify(data.result).slice(0, 60)}`)
      loadRoutines()
    } catch { toast.error('Routine failed') } finally { setRunning(null) }
  }

  async function toggleRoutine(id: number, enabled: boolean) {
    try {
      const { data } = await routinesApi.update(id, { enabled: !enabled })
      setRoutines(routines.map((r) => r.id === id ? { ...r, ...data } : r))
    } catch {}
  }

  async function deleteRoutine(id: number) {
    try {
      await routinesApi.delete(id)
      setRoutines(routines.filter((r) => r.id !== id))
      toast.success('Routine deleted')
    } catch {}
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap size={20} className="text-nexus-400" /> AI Routines
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Automated AI tasks to organize and enrich your knowledge base
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New Routine
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="text-nexus-400 animate-spin" />
        </div>
      ) : routines.length === 0 ? (
        <div className="card p-12 text-center">
          <Zap size={40} className="text-gray-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-400">No routines yet</h2>
          <p className="text-sm text-gray-600 mt-1">Create AI-powered routines to automate your workflow</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
            <Plus size={16} /> Create Routine
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {routines.map((r) => (
            <div key={r.id} className={clsx('card p-4 flex items-center gap-4',
              !r.enabled && 'opacity-60')}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-white">{r.name}</h3>
                  <span className="badge bg-nexus-500/10 text-nexus-400 text-xs">
                    {ROUTINE_TYPE_LABELS[r.routine_type] || r.routine_type}
                  </span>
                  {r.enabled
                    ? <span className="badge bg-green-500/10 text-green-400 text-xs">Active</span>
                    : <span className="badge bg-gray-500/10 text-gray-500 text-xs">Disabled</span>}
                </div>
                {r.description && <p className="text-xs text-gray-500">{r.description}</p>}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {r.schedule || 'Manual only'}
                  </span>
                  <span>Provider: {r.provider || 'ollama'}</span>
                  <span>Runs: {r.run_count || 0}</span>
                  {r.last_run && <span>Last: {new Date(r.last_run).toLocaleString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runRoutine(r.id)}
                  disabled={running === r.id}
                  className="btn-primary text-sm py-1.5"
                  title="Run now"
                >
                  {running === r.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Play size={14} />}
                </button>
                <button
                  onClick={() => toggleRoutine(r.id, r.enabled)}
                  className={clsx('btn-ghost text-sm py-1.5',
                    r.enabled ? 'text-green-400' : 'text-gray-500')}
                  title={r.enabled ? 'Disable' : 'Enable'}
                >
                  {r.enabled ? <CheckCircle size={16} /> : <XCircle size={16} />}
                </button>
                <button
                  onClick={() => deleteRoutine(r.id)}
                  className="btn-ghost text-red-400 text-sm py-1.5"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card w-[480px] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-white mb-4">New Routine</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Name *</label>
                <input className="input" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="My routine" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Description</label>
                <input className="input" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What does this routine do?" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Type</label>
                <select className="input" value={form.routine_type}
                  onChange={(e) => setForm({ ...form, routine_type: e.target.value })}>
                  {types.map((t) => (
                    <option key={t} value={t}>{ROUTINE_TYPE_LABELS[t] || t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Schedule</label>
                <select className="input" value={form.schedule}
                  onChange={(e) => setForm({ ...form, schedule: e.target.value })}>
                  <option value="">Manual only</option>
                  <option value="interval:3600">Every hour</option>
                  <option value="interval:86400">Every day</option>
                  <option value="interval:604800">Every week</option>
                  <option value="cron:0 9 * * *">Daily at 9am</option>
                  <option value="cron:0 * * * *">Every hour (cron)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">AI Provider</label>
                  <select className="input" value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Claude</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Model (optional)</label>
                  <input className="input" value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="Default model" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={createRoutine} disabled={!form.name} className="btn-primary flex-1">
                  Create Routine
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-ghost flex-1">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
