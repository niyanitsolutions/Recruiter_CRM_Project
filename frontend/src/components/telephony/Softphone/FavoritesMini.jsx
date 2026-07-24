import { useState, useEffect } from 'react'
import { Star, X, Phone, Plus, Flame } from 'lucide-react'
import { useTelephony } from '../../../context/TelephonyContext'
import telephonyService from '../../../services/telephonyService'

const GROUPS = ['All', 'HR Team', 'Recruiters', 'Frequently Called', 'Emergency']

export default function FavoritesMini() {
  const { favorites, dial, addFavorite, removeFavorite } = useTelephony()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('All')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newGroup, setNewGroup] = useState('HR Team')
  const [frequent, setFrequent] = useState([])

  useEffect(() => {
    if (group !== 'Frequently Called' || frequent.length) return
    telephonyService.getFrequentlyCalled().then(r => setFrequent(r.data?.items || [])).catch(() => {})
  }, [group, frequent.length])

  const handleAdd = async () => {
    if (!newPhone.trim() || !newName.trim()) return
    await addFavorite({ phone: newPhone.trim(), name: newName.trim(), group: newGroup })
    setNewName(''); setNewPhone(''); setAdding(false)
  }

  const isFrequent = group === 'Frequently Called'
  const source = isFrequent
    ? frequent.map(f => ({ _id: f._id, name: f._id, phone: f._id, count: f.count }))
    : favorites.filter(f => group === 'All' || f.group === group)
  const filtered = source.filter(f =>
    !search || f.name?.toLowerCase().includes(search.toLowerCase()) || f.phone?.includes(search)
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {GROUPS.map(g => (
          <button
            key={g} type="button" onClick={() => setGroup(g)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${group === g ? 'bg-primary-600 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'}`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search favorites..." className="input-field text-sm flex-1"
        />
        {!isFrequent && (
          <button type="button" onClick={() => setAdding(a => !a)} className="p-2 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100" title="Add favorite">
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 p-2 bg-surface-50 rounded-lg">
          <div className="flex items-center gap-2">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" className="input-field text-sm flex-1" />
            <input type="text" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Phone" className="input-field text-sm flex-1" />
          </div>
          <div className="flex items-center gap-2">
            <select value={newGroup} onChange={e => setNewGroup(e.target.value)} className="input-field text-sm flex-1">
              {GROUPS.filter(g => g !== 'All' && g !== 'Frequently Called').map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button type="button" onClick={handleAdd} className="px-2.5 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium">Save</button>
          </div>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto space-y-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-surface-400 text-center py-6">No favorites yet.</p>
        ) : filtered.map(f => (
          <div key={f._id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface-50 group">
            {isFrequent ? <Flame className="w-4 h-4 text-orange-400 flex-shrink-0" /> : <Star className="w-4 h-4 text-amber-400 flex-shrink-0" />}
            <button type="button" onClick={() => dial({ to: f.phone })} className="flex-1 min-w-0 text-left">
              <p className="text-sm text-surface-800 truncate">{f.name}</p>
              <p className="text-[11px] text-surface-400">{isFrequent ? `${f.count} calls` : f.phone}</p>
            </button>
            <button type="button" onClick={() => dial({ to: f.phone, candidateId: f.candidate_id, employeeId: f.employee_id })} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50">
              <Phone className="w-3.5 h-3.5" />
            </button>
            {!isFrequent && (
              <button type="button" onClick={() => removeFavorite(f._id)} className="p-1.5 rounded-lg text-surface-400 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
