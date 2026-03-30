import { useState, useEffect, useCallback } from 'react'
import { ScanLine, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, Toggle, ActionBar, SkeletonLoader,
} from './SettingsLayout'

const DEFAULT = {
  auto_parse: true, duplicate_detection: true, duplicate_threshold: 80,
  whitelist_skills: [], blacklist_skills: [],
  extract_contact: true, extract_education: true, extract_experience: true,
  extract_skills: true, min_experience_years: 0,
}

const ResumeParsingPage = () => {
  const [data, setData]         = useState(DEFAULT)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [newWhitelist, setNewWhitelist] = useState('')
  const [newBlacklist, setNewBlacklist] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getResumeParsing()
      if (res.data && Object.keys(res.data).length > 0) setData({ ...DEFAULT, ...res.data })
    } catch {
      toast.error('Failed to load parsing rules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      setSaving(true)
      await tenantSettingsService.saveResumeParsing(data)
      toast.success('Resume parsing rules saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const set = (f, v) => setData(d => ({ ...d, [f]: v }))

  const addToList = (listKey, value, clear) => {
    const v = value.trim()
    if (!v) return
    if (data[listKey].includes(v)) { toast.error('Already in list'); return }
    set(listKey, [...data[listKey], v])
    clear('')
  }

  const removeFromList = (listKey, item) => set(listKey, data[listKey].filter(i => i !== item))

  const TagList = ({ items, listKey }) => (
    <div className="flex flex-wrap gap-2 min-h-[2rem]">
      {items.map(item => (
        <span key={item} className="flex items-center gap-1 px-2 py-1 bg-surface-100 text-surface-700 text-xs rounded-lg">
          {item}
          <button onClick={() => removeFromList(listKey, item)} className="hover:text-danger-500 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </span>
      ))}
      {items.length === 0 && <span className="text-xs text-surface-400">None added</span>}
    </div>
  )

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumb page="Resume Parsing Rules" />
      <PageHeader title="Resume Parsing Rules" description="Configure automatic resume extraction, duplicate detection, and skill filters." />

      <SectionCard title="Parsing Settings" icon={ScanLine}>
        <div className="border border-surface-100 rounded-xl px-4 mb-4 divide-y divide-surface-50">
          <Toggle checked={data.auto_parse} onChange={v => set('auto_parse', v)} label="Auto-Parse Resumes" description="Automatically extract data from uploaded resumes" />
          <Toggle checked={data.extract_contact} onChange={v => set('extract_contact', v)} label="Extract Contact Information" description="Name, email, phone, location" />
          <Toggle checked={data.extract_education} onChange={v => set('extract_education', v)} label="Extract Education" description="Degrees, institutions, graduation years" />
          <Toggle checked={data.extract_experience} onChange={v => set('extract_experience', v)} label="Extract Work Experience" description="Job titles, companies, durations" />
          <Toggle checked={data.extract_skills} onChange={v => set('extract_skills', v)} label="Extract Skills" description="Technical and soft skills" />
        </div>
        <Field label="Minimum Experience Filter (years)" hint="Candidates with less experience are flagged">
          <Input type="number" min={0} value={data.min_experience_years} onChange={e => set('min_experience_years', parseInt(e.target.value) || 0)} className="w-24" />
        </Field>
      </SectionCard>

      <SectionCard title="Duplicate Detection">
        <div className="border border-surface-100 rounded-xl px-4 mb-4">
          <Toggle checked={data.duplicate_detection} onChange={v => set('duplicate_detection', v)} label="Enable Duplicate Detection" description="Alert when a new resume is similar to an existing candidate" />
        </div>
        {data.duplicate_detection && (
          <Field label="Similarity Threshold" hint={`${data.duplicate_threshold}% match flags as duplicate`}>
            <div className="flex items-center gap-4">
              <input
                type="range" min={50} max={99} value={data.duplicate_threshold}
                onChange={e => set('duplicate_threshold', parseInt(e.target.value))}
                className="flex-1 accent-accent-600"
              />
              <span className="text-sm font-semibold text-accent-700 w-10">{data.duplicate_threshold}%</span>
            </div>
          </Field>
        )}
      </SectionCard>

      <SectionCard title="Skill Filters">
        <div className="space-y-4">
          <Field label="Whitelist Skills" hint="Only extract these skills (empty = extract all)">
            <TagList items={data.whitelist_skills} listKey="whitelist_skills" />
            <div className="flex gap-2 mt-2">
              <Input value={newWhitelist} onChange={e => setNewWhitelist(e.target.value)} placeholder="e.g. React, Python" onKeyDown={e => e.key === 'Enter' && addToList('whitelist_skills', newWhitelist, setNewWhitelist)} className="flex-1" />
              <button onClick={() => addToList('whitelist_skills', newWhitelist, setNewWhitelist)} className="flex items-center gap-1 px-3 py-2 bg-success-50 text-success-700 text-sm rounded-lg hover:bg-success-100 transition-colors">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </Field>

          <Field label="Blacklist Skills" hint="Always exclude these skills from extraction">
            <TagList items={data.blacklist_skills} listKey="blacklist_skills" />
            <div className="flex gap-2 mt-2">
              <Input value={newBlacklist} onChange={e => setNewBlacklist(e.target.value)} placeholder="e.g. MS Office, Typing" onKeyDown={e => e.key === 'Enter' && addToList('blacklist_skills', newBlacklist, setNewBlacklist)} className="flex-1" />
              <button onClick={() => addToList('blacklist_skills', newBlacklist, setNewBlacklist)} className="flex items-center gap-1 px-3 py-2 bg-danger-50 text-danger-700 text-sm rounded-lg hover:bg-danger-100 transition-colors">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </Field>
        </div>
      </SectionCard>

      <ActionBar saving={saving} onSave={save} />
    </div>
  )
}

export default ResumeParsingPage
