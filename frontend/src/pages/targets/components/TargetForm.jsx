/**
 * Target Form Component - Phase 5
 * Reusable form for creating/editing targets
 */
import React, { useState, useEffect } from 'react';
import { Calendar, Target, Users, DollarSign } from 'lucide-react';
import targetService from '../../../services/targetService';

const TargetForm = ({
  initialData = null,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const [formData, setFormData] = useState({
    name: '',
    target_type: 'placements',
    period: 'monthly',
    target_value: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    scope: 'individual',
    assigned_to: '',
    description: '',
    milestones: []
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...formData,
        ...initialData,
        start_date: initialData.start_date?.split('T')[0] || '',
        end_date: initialData.end_date?.split('T')[0] || ''
      });
    }
  }, [initialData]);

  const targetTypes = targetService.getTargetTypeOptions();
  const periods = targetService.getPeriodOptions();
  const scopes = targetService.getScopeOptions();

  const validate = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.target_value || formData.target_value <= 0) {
      newErrors.target_value = 'Target value must be greater than 0';
    }
    if (!formData.start_date) {
      newErrors.start_date = 'Start date is required';
    }
    if (!formData.end_date) {
      newErrors.end_date = 'End date is required';
    }
    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      newErrors.end_date = 'End date must be after start date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit({
        ...formData,
        target_value: Number(formData.target_value)
      });
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const getTypeIcon = (type) => {
    const icons = {
      placements: Target,
      revenue: DollarSign,
      interviews: Calendar,
      candidates_added: Users
    };
    return icons[type] || Target;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Target Name *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g., Q1 Placement Target"
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
            errors.name ? 'border-red-300' : 'border-gray-300'
          }`}
        />
        {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name}</p>}
      </div>

      {/* Type and Period */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Type *
          </label>
          <select
            value={formData.target_type}
            onChange={(e) => handleChange('target_type', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {targetTypes.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Period *
          </label>
          <select
            value={formData.period}
            onChange={(e) => handleChange('period', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {periods.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Target Value */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Target Value *
        </label>
        <input
          type="number"
          value={formData.target_value}
          onChange={(e) => handleChange('target_value', e.target.value)}
          placeholder={formData.target_type === 'revenue' ? 'Amount in INR' : 'Count'}
          min="1"
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
            errors.target_value ? 'border-red-300' : 'border-gray-300'
          }`}
        />
        {errors.target_value && <p className="text-sm text-red-600 mt-1">{errors.target_value}</p>}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date *
          </label>
          <input
            type="date"
            value={formData.start_date}
            onChange={(e) => handleChange('start_date', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.start_date ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.start_date && <p className="text-sm text-red-600 mt-1">{errors.start_date}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Date *
          </label>
          <input
            type="date"
            value={formData.end_date}
            onChange={(e) => handleChange('end_date', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.end_date ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.end_date && <p className="text-sm text-red-600 mt-1">{errors.end_date}</p>}
        </div>
      </div>

      {/* Scope */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Scope
        </label>
        <div className="grid grid-cols-3 gap-2">
          {scopes.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleChange('scope', opt.value)}
              className={`px-4 py-2 text-sm border-2 rounded-lg transition-colors ${
                formData.scope === opt.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          rows={3}
          placeholder="Optional description..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : initialData ? 'Update Target' : 'Create Target'}
        </button>
      </div>
    </form>
  );
};

export default TargetForm;
