/**
 * Schedule Report Modal - Phase 5
 * Modal for scheduling automated report delivery
 */
import React, { useState } from 'react';
import { X, Clock, Mail, Calendar, AlertCircle } from 'lucide-react';
import reportService from '../../../services/reportService';

const ScheduleReportModal = ({ report, onClose, onSave }) => {
  const [schedule, setSchedule] = useState({
    frequency: 'weekly',
    day_of_week: 1, // Monday
    day_of_month: 1,
    time: '09:00',
    timezone: 'Asia/Kolkata',
    recipients: '',
    format: 'excel',
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const frequencies = reportService.getScheduleFrequencies();
  const formats = reportService.getExportFormats();

  const daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Validate recipients
      const recipientList = schedule.recipients
        .split(',')
        .map(e => e.trim())
        .filter(e => e);

      if (recipientList.length === 0) {
        setError('Please enter at least one recipient email');
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = recipientList.filter(e => !emailRegex.test(e));
      if (invalidEmails.length > 0) {
        setError(`Invalid email(s): ${invalidEmails.join(', ')}`);
        return;
      }

      await reportService.updateSavedReport(report.id, {
        schedule: {
          ...schedule,
          recipients: recipientList
        }
      });

      onSave();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSchedule = async () => {
    if (!window.confirm('Remove the schedule for this report?')) return;

    try {
      setSaving(true);
      await reportService.updateSavedReport(report.id, { schedule: null });
      onSave();
    } catch (err) {
      setError('Failed to remove schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Schedule Report</h3>
              <p className="text-sm text-gray-500">{report.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Frequency
            </label>
            <div className="grid grid-cols-3 gap-2">
              {frequencies.map(freq => (
                <button
                  key={freq.value}
                  onClick={() => setSchedule({ ...schedule, frequency: freq.value })}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                    schedule.frequency === freq.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {freq.label}
                </button>
              ))}
            </div>
          </div>

          {/* Day Selection */}
          {schedule.frequency === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Day of Week
              </label>
              <select
                value={schedule.day_of_week}
                onChange={(e) => setSchedule({ ...schedule, day_of_week: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {daysOfWeek.map(day => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
            </div>
          )}

          {schedule.frequency === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Day of Month
              </label>
              <select
                value={schedule.day_of_month}
                onChange={(e) => setSchedule({ ...schedule, day_of_month: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
          )}

          {/* Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time
            </label>
            <input
              type="time"
              value={schedule.time}
              onChange={(e) => setSchedule({ ...schedule, time: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Timezone: IST (Asia/Kolkata)</p>
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Export Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {formats.map(fmt => (
                <button
                  key={fmt.value}
                  onClick={() => setSchedule({ ...schedule, format: fmt.value })}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                    schedule.format === fmt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {fmt.value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Mail className="w-4 h-4 inline mr-1" />
              Email Recipients
            </label>
            <textarea
              value={schedule.recipients}
              onChange={(e) => setSchedule({ ...schedule, recipients: e.target.value })}
              placeholder="email1@example.com, email2@example.com"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Separate multiple emails with commas</p>
          </div>

          {/* Active Toggle */}
          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={schedule.is_active}
              onChange={(e) => setSchedule({ ...schedule, is_active: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="font-medium text-gray-900">Enable Schedule</p>
              <p className="text-sm text-gray-500">Report will be sent automatically</p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          {report.schedule ? (
            <button
              onClick={handleRemoveSchedule}
              disabled={saving}
              className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              Remove Schedule
            </button>
          ) : (
            <div></div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleReportModal;
