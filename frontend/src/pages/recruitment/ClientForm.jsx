import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Building2, ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import clientService from '../../services/clientService'

const ClientForm = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statuses, setStatuses] = useState([])
  const [types, setTypes] = useState([])

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    client_type: 'direct',
    industry: '',
    website: '',
    address: '',
    city: '',
    state: '',
    country: 'India',
    zip_code: '',
    email: '',
    phone: '',
    gstin: '',
    pan: '',
    contact_persons: [],
    commission_percentage: 8.33,
    payment_terms: 30,
    notes: '',
    status: 'active'
  })

  useEffect(() => {
    loadDropdowns()
    if (isEdit) {
      loadClient()
    }
  }, [id])

  const loadDropdowns = async () => {
    try {
      const [statusRes, typeRes] = await Promise.all([
        clientService.getStatuses(),
        clientService.getTypes()
      ])
      setStatuses(statusRes.data || [])
      setTypes(typeRes.data || [])
    } catch (error) {
      console.error('Error loading dropdowns:', error)
    }
  }

  const loadClient = async () => {
    try {
      setLoading(true)
      const response = await clientService.getClient(id)
      if (response.data) {
        setFormData(prev => ({
          ...prev,
          ...response.data,
          contact_persons: response.data.contact_persons || []
        }))
      }
    } catch (error) {
      toast.error('Failed to load client')
      navigate('/clients')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleContactChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      contact_persons: prev.contact_persons.map((contact, i) => 
        i === index ? { ...contact, [field]: value } : contact
      )
    }))
  }

  const addContact = () => {
    setFormData(prev => ({
      ...prev,
      contact_persons: [
        ...prev.contact_persons,
        { name: '', designation: '', email: '', mobile: '', is_primary: prev.contact_persons.length === 0 }
      ]
    }))
  }

  const removeContact = (index) => {
    setFormData(prev => ({
      ...prev,
      contact_persons: prev.contact_persons.filter((_, i) => i !== index)
    }))
  }

  const MOBILE_RE = /^[6-9]\d{9}$/

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Client name is required')
      return
    }

    if (formData.phone && !MOBILE_RE.test(formData.phone.replace(/\D/g, ''))) {
      toast.error('Mobile number must start with 6–9 and be 10 digits.')
      return
    }

    for (let i = 0; i < formData.contact_persons.length; i++) {
      const cp = formData.contact_persons[i]
      if (cp.mobile && !MOBILE_RE.test(cp.mobile.replace(/\D/g, ''))) {
        toast.error(`Contact person ${i + 1}: Mobile number must start with 6–9 and be 10 digits.`)
        return
      }
    }

    try {
      setSaving(true)

      if (isEdit) {
        await clientService.updateClient(id, formData)
        toast.success('Client updated successfully')
      } else {
        await clientService.createClient(formData)
        toast.success('Client created successfully')
      }

      navigate('/clients')
    } catch (error) {
      const detail = error.response?.data?.detail
      const msg = error.response?.data?.message
      if (Array.isArray(detail)) {
        toast.error(detail.map(d => d.msg?.replace('Value error, ', '') || d.msg).join('; '))
      } else {
        toast.error(typeof detail === 'string' ? detail : msg || 'Failed to save client')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/clients')}
          className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">
            {isEdit ? 'Edit Client' : 'Add Client'}
          </h1>
          <p className="text-surface-500">
            {isEdit ? 'Update client information' : 'Create a new hiring company'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Basic Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Client Code
              </label>
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                className="input w-full"
                placeholder="e.g., ABC"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Client Type
              </label>
              <select
                name="client_type"
                value={formData.client_type}
                onChange={handleChange}
                className="input w-full"
              >
                {types.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Industry
              </label>
              <input
                type="text"
                name="industry"
                value={formData.industry}
                onChange={handleChange}
                className="input w-full"
                placeholder="e.g., IT Services"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Website
              </label>
              <input
                type="url"
                name="website"
                value={formData.website}
                onChange={handleChange}
                className="input w-full"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input w-full"
              >
                {statuses.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Contact Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Address
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="input w-full"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                City
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                State
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Country
              </label>
              <input
                type="text"
                name="country"
                value={formData.country}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                ZIP Code
              </label>
              <input
                type="text"
                name="zip_code"
                value={formData.zip_code}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="input w-full"
              />
            </div>
          </div>
        </div>

        {/* Contact Persons */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-surface-900">Contact Persons</h2>
            <button
              type="button"
              onClick={addContact}
              className="btn-secondary text-sm flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Contact
            </button>
          </div>
          
          {formData.contact_persons.length === 0 ? (
            <p className="text-surface-500 text-center py-4">No contact persons added</p>
          ) : (
            <div className="space-y-4">
              {formData.contact_persons.map((contact, index) => (
                <div key={index} className="border border-surface-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={contact.is_primary}
                        onChange={(e) => handleContactChange(index, 'is_primary', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-surface-600">Primary Contact</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeContact(index)}
                      className="p-1 hover:bg-red-50 rounded text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Name"
                      value={contact.name}
                      onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                      className="input"
                    />
                    <input
                      type="text"
                      placeholder="Designation"
                      value={contact.designation}
                      onChange={(e) => handleContactChange(index, 'designation', e.target.value)}
                      className="input"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={contact.email}
                      onChange={(e) => handleContactChange(index, 'email', e.target.value)}
                      className="input"
                    />
                    <input
                      type="tel"
                      placeholder="Mobile"
                      value={contact.mobile}
                      onChange={(e) => handleContactChange(index, 'mobile', e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Business Details */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Business Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                GSTIN
              </label>
              <input
                type="text"
                name="gstin"
                value={formData.gstin}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                PAN
              </label>
              <input
                type="text"
                name="pan"
                value={formData.pan}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Commission %
              </label>
              <input
                type="number"
                name="commission_percentage"
                value={formData.commission_percentage}
                onChange={handleChange}
                className="input w-full"
                step="0.01"
                min="0"
                max="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Payment Terms (days)
              </label>
              <input
                type="number"
                name="payment_terms"
                value={formData.payment_terms}
                onChange={handleChange}
                className="input w-full"
                min="0"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                className="input w-full"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/clients')}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEdit ? 'Update Client' : 'Create Client'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ClientForm