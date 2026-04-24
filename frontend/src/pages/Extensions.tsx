import { useEffect, useState } from 'react'
import { extensionsApi } from '@/utils/api'
import { Puzzle, ToggleLeft, ToggleRight, Trash2, Loader2, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadExtensions() }, [])

  async function loadExtensions() {
    setLoading(true)
    try {
      const { data } = await extensionsApi.list()
      setExtensions(data)
    } catch {} finally { setLoading(false) }
  }

  async function toggleExtension(slug: string) {
    try {
      const { data } = await extensionsApi.toggle(slug)
      setExtensions(extensions.map((e) =>
        e.slug === slug ? { ...e, enabled: data.enabled } : e))
      toast.success(`Extension ${data.enabled ? 'enabled' : 'disabled'}`)
    } catch { toast.error('Toggle failed') }
  }

  async function uninstall(slug: string) {
    if (!confirm(`Uninstall extension "${slug}"?`)) return
    try {
      await extensionsApi.uninstall(slug)
      setExtensions(extensions.filter((e) => e.slug !== slug))
      toast.success('Extension uninstalled')
    } catch { toast.error('Uninstall failed') }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Puzzle size={20} className="text-nexus-400" /> Extensions
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Extend NexusMind with custom plugins and integrations
          </p>
        </div>
      </div>

      {/* How to install */}
      <div className="card p-4 mb-6 border border-nexus-500/20 bg-nexus-500/5">
        <h3 className="text-sm font-semibold text-nexus-300 mb-2">Installing Extensions</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          Place your extension folder in <code className="bg-white/10 px-1 rounded font-mono text-xs">extensions/installed/&lt;slug&gt;/</code> with a{' '}
          <code className="bg-white/10 px-1 rounded font-mono text-xs">manifest.json</code> and entry point. The extension will be loaded on next restart.
        </p>
        <pre className="mt-3 text-xs bg-[#0a0c14] rounded p-3 text-gray-400 font-mono overflow-x-auto">{`{
  "name": "My Extension",
  "slug": "my-ext",
  "version": "1.0.0",
  "description": "Does something cool",
  "author": "You",
  "entry_point": "main.py"
}`}</pre>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="text-nexus-400 animate-spin" />
        </div>
      ) : extensions.length === 0 ? (
        <div className="card p-12 text-center">
          <Package size={40} className="text-gray-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-400">No extensions installed</h2>
          <p className="text-sm text-gray-600 mt-1">
            Drop extension folders into <code className="font-mono text-xs bg-white/10 px-1 rounded">extensions/installed/</code>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {extensions.map((ext) => (
            <div key={ext.slug} className={clsx('card p-4', !ext.enabled && 'opacity-60')}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-white">{ext.name}</h3>
                  <p className="text-xs text-gray-500">v{ext.version} · {ext.author || 'Unknown'}</p>
                </div>
                <div className="flex items-center gap-1">
                  {ext.loaded && (
                    <span className="badge bg-green-500/10 text-green-400 text-[10px]">Loaded</span>
                  )}
                  <span className={clsx('badge text-[10px]',
                    ext.enabled ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-500')}>
                    {ext.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              {ext.description && (
                <p className="text-xs text-gray-400 mb-3">{ext.description}</p>
              )}

              {ext.tags?.length > 0 && (
                <div className="flex gap-1 mb-3 flex-wrap">
                  {ext.tags.map((t: string) => (
                    <span key={t} className="badge bg-white/5 text-gray-500 text-[10px]">{t}</span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => toggleExtension(ext.slug)}
                  className={clsx('btn-ghost text-sm flex-1',
                    ext.enabled ? 'text-nexus-400' : 'text-gray-500')}
                >
                  {ext.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {ext.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => uninstall(ext.slug)}
                  className="btn-ghost text-red-400 text-sm"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
