import { useState, useEffect, useCallback } from 'react'
import { Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, SelectField,
  Textarea, ActionBar, SkeletonLoader,
} from './SettingsLayout'

const DEFAULT = {
  prefix: 'INV', next_number: 1001, tax_type: 'GST', tax_rate: 18,
  payment_terms: 'Net 30', bank_name: '', bank_account: '', bank_ifsc: '',
  bank_branch: '', footer_notes: '', due_days: 30,
}

const InvoiceSettingsPage = () => {
  const [data, setData]     = useState(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getInvoiceSettings()
      if (res.data && Object.keys(res.data).length > 0) setData({ ...DEFAULT, ...res.data })
    } catch {
      toast.error('Failed to load invoice settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      setSaving(true)
      await tenantSettingsService.saveInvoiceSettings(data)
      toast.success('Invoice settings saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const set = (f, v) => setData(d => ({ ...d, [f]: v }))

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumb page="Invoice Settings" />
      <PageHeader title="Invoice Settings" description="Configure invoice numbering, tax, payment terms and bank details." />

      <SectionCard title="Invoice Numbering" icon={Receipt}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Invoice Prefix" hint='e.g. "INV" → INV-1001'>
            <Input value={data.prefix} onChange={e => set('prefix', e.target.value)} placeholder="INV" className="w-32" />
          </Field>
          <Field label="Next Invoice Number">
            <Input type="number" min={1} value={data.next_number} onChange={e => set('next_number', parseInt(e.target.value) || 1)} className="w-32" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Tax & Payment">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tax Type">
            <SelectField value={data.tax_type} onChange={e => set('tax_type', e.target.value)}>
              <option value="GST">GST</option>
              <option value="VAT">VAT</option>
              <option value="None">None</option>
              <option value="Custom">Custom</option>
            </SelectField>
          </Field>
          <Field label="Tax Rate (%)">
            <Input type="number" min={0} max={100} step={0.1} value={data.tax_rate} onChange={e => set('tax_rate', parseFloat(e.target.value) || 0)} className="w-32" />
          </Field>
          <Field label="Payment Terms">
            <SelectField value={data.payment_terms} onChange={e => set('payment_terms', e.target.value)}>
              {['Immediate', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Custom'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Due Days" hint="Days after invoice date">
            <Input type="number" min={0} value={data.due_days} onChange={e => set('due_days', parseInt(e.target.value) || 0)} className="w-32" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Bank Details" icon={null}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Bank Name">
            <Input value={data.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="HDFC Bank" />
          </Field>
          <Field label="Account Number">
            <Input value={data.bank_account} onChange={e => set('bank_account', e.target.value)} placeholder="1234567890" />
          </Field>
          <Field label="IFSC Code">
            <Input value={data.bank_ifsc} onChange={e => set('bank_ifsc', e.target.value)} placeholder="HDFC0001234" />
          </Field>
          <Field label="Branch">
            <Input value={data.bank_branch} onChange={e => set('bank_branch', e.target.value)} placeholder="Koramangala, Bangalore" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Footer Notes">
        <Field label="Invoice Footer Notes" hint="Appears at the bottom of every invoice">
          <Textarea value={data.footer_notes} onChange={e => set('footer_notes', e.target.value)} placeholder="Thank you for your business. Payment due within the specified terms." rows={3} />
        </Field>
      </SectionCard>

      <ActionBar saving={saving} onSave={save} />
    </div>
  )
}

export default InvoiceSettingsPage
