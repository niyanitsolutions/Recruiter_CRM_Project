/**
 * Imports Page - Phase 5
 * Bulk data import with wizard interface
 */
import React, { useState, useEffect } from 'react';
import {
  Upload, FileText, Check, AlertCircle, Download, ArrowRight,
  ArrowLeft, Users, Building, Briefcase, X, RefreshCw
} from 'lucide-react';
import importExportService from '../../services/importExportService';

const ImportsPage = () => {
  const [step, setStep] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [file, setFile] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [columnMappings, setColumnMappings] = useState([]);
  const [importSettings, setImportSettings] = useState({
    duplicate_action: 'skip',
    skip_first_row: true
  });
  const [importJob, setImportJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importHistory, setImportHistory] = useState([]);

  useEffect(() => {
    loadImportHistory();
  }, []);

  const loadImportHistory = async () => {
    try {
      const res = await importExportService.getImportJobs({ page_size: 10 });
      setImportHistory(res.items || []);
    } catch (err) {
      console.error('Error loading import history:', err);
    }
  };

  const entityTypes = [
    { value: 'candidates', label: 'Candidates', icon: Users, description: 'Import candidate profiles' },
    { value: 'clients', label: 'Clients', icon: Building, description: 'Import client companies' },
    { value: 'jobs', label: 'Jobs', icon: Briefcase, description: 'Import job postings' }
  ];

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleValidate = async () => {
    if (!file || !entityType) return;
    try {
      setLoading(true);
      setError(null);
      const result = await importExportService.validateImport(entityType, file);
      setValidationResult(result);
      setColumnMappings(result.suggested_mappings || []);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.detail || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleStartImport = async () => {
    try {
      setLoading(true);
      const result = await importExportService.startImport({
        entity_type: entityType,
        column_mappings: columnMappings,
        duplicate_action: importSettings.duplicate_action
      }, file);
      setImportJob(result);
      setStep(5);
      loadImportHistory();
    } catch (err) {
      setError(err.response?.data?.detail || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setEntityType('');
    setFile(null);
    setValidationResult(null);
    setColumnMappings([]);
    setImportJob(null);
    setError(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Data</h1>
          <p className="text-gray-500 mt-1">Bulk import candidates, clients, and jobs</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3, 4, 5].map((s) => (
          <React.Fragment key={s}>
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {step > s ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 5 && <div className={`w-12 h-1 rounded ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Select Data Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {entityTypes.map((et) => {
                const Icon = et.icon;
                return (
                  <button
                    key={et.value}
                    onClick={() => { setEntityType(et.value); setStep(2); }}
                    className="p-6 border-2 rounded-xl text-left transition-all hover:shadow-lg border-gray-200 hover:border-blue-300"
                  >
                    <div className="p-3 bg-blue-100 rounded-lg w-fit mb-4">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">{et.label}</h3>
                    <p className="text-sm text-gray-500 mt-1">{et.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Upload File</h2>
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer"
              onClick={() => document.getElementById('file-input').click()}
            >
              <input id="file-input" type="file" accept=".csv,.xlsx" onChange={handleFileSelect} className="hidden" />
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">{file ? file.name : 'Drop your file here or click to browse'}</p>
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />Back
              </button>
              <button onClick={handleValidate} disabled={!file || loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
                {loading ? 'Validating...' : 'Continue'}<ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && validationResult && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Map Columns</h2>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">Found {validationResult.total_rows} rows</p>
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-gray-600 rounded-lg flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />Back
              </button>
              <button onClick={() => setStep(4)} className="px-6 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2">
                Continue<ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Import Settings</h2>
            <div className="space-y-4">
              {importExportService.getImportActions().map(action => (
                <label key={action.value} className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name="duplicate"
                    checked={importSettings.duplicate_action === action.value}
                    onChange={() => setImportSettings({ ...importSettings, duplicate_action: action.value })}
                  />
                  <div>
                    <p className="font-medium">{action.label}</p>
                    <p className="text-sm text-gray-500">{action.description}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(3)} className="px-4 py-2 text-gray-600 rounded-lg flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />Back
              </button>
              <button onClick={handleStartImport} disabled={loading} className="px-6 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">
                {loading ? 'Importing...' : 'Start Import'}
              </button>
            </div>
          </div>
        )}

        {step === 5 && importJob && (
          <div className="text-center space-y-6">
            <div className="p-4 bg-green-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold">Import Complete!</h2>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{importJob.success_count || 0}</p>
                <p className="text-sm text-gray-500">Imported</p>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">{importJob.skipped_count || 0}</p>
                <p className="text-sm text-gray-500">Skipped</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{importJob.error_count || 0}</p>
                <p className="text-sm text-gray-500">Errors</p>
              </div>
            </div>
            <button onClick={resetWizard} className="px-6 py-2 bg-blue-600 text-white rounded-lg">
              Import More Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportsPage;
