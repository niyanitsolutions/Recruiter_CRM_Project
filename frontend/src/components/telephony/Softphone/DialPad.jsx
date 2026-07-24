import { useState } from 'react'
import { Delete, Phone, Loader2 } from 'lucide-react'
import { useTelephony } from '../../../context/TelephonyContext'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

export default function DialPad() {
  const { dial } = useTelephony()
  const [number, setNumber] = useState('')
  const [calling, setCalling] = useState(false)

  const press = (key) => setNumber(prev => prev + key)
  const backspace = () => setNumber(prev => prev.slice(0, -1))

  const handleCall = async () => {
    if (!number.trim()) return
    setCalling(true)
    try { await dial({ to: number.trim() }) } finally { setCalling(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text" value={number} onChange={e => setNumber(e.target.value)}
          placeholder="Enter a number"
          className="input-field flex-1 text-center text-lg font-mono tracking-wide"
        />
        {number && (
          <button type="button" onClick={backspace} className="p-2 rounded-lg hover:bg-surface-100 text-surface-500" title="Backspace">
            <Delete className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map(k => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="py-3 rounded-xl bg-surface-50 hover:bg-surface-100 text-lg font-semibold text-surface-800 transition-colors"
          >
            {k}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleCall}
        disabled={!number.trim() || calling}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors disabled:opacity-50"
      >
        {calling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Phone className="w-5 h-5" />}
        Call
      </button>
    </div>
  )
}
