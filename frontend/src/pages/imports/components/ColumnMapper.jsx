/**
 * Column Mapper Component - Phase 5
 * Maps file columns to system fields for import
 */
import React, { useState, useEffect } from 'react';
import { ArrowRight, Check, AlertCircle, HelpCircle, Wand2 } from 'lucide-react';

const ColumnMapper = ({
  fileColumns = [],
  targetFields = [],
  mappings = [],
  onChange,
  onAutoMap
}) => {
  const [localMappings, setLocalMappings] = useState([]);
  const [unmappedRequired, setUnmappedRequired] = useState([]);

  useEffect(() => {
    // Initialize mappings from prop or create empty ones
    const initial = fileColumns.map(col => {
      const existing = mappings.find(m => m.source === col);
      return existing || { source: col, target: '' };
    });
    setLocalMappings(initial);
  }, [fileColumns, mappings]);

  useEffect(() => {
    // Check for unmapped required fields
    const requiredFields = targetFields.filter(f => f.required);
    const mappedTargets = localMappings.map(m => m.target).filter(Boolean);
    const unmapped = requiredFields.filter(f => !mappedTargets.includes(f.key));
    setUnmappedRequired(unmapped);
  }, [localMappings, targetFields]);

  const handleMappingChange = (sourceColumn, targetField) => {
    const updated = localMappings.map(m =>
      m.source === sourceColumn ? { ...m, target: targetField } : m
    );
    setLocalMappings(updated);
    onChange(updated.filter(m => m.target));
  };

  const handleAutoMap = () => {
    // Attempt automatic mapping based on column name similarity
    const autoMapped = fileColumns.map(col => {
      const colLower = col.toLowerCase().replace(/[_\s-]/g, '');
      
      // Find matching target field
      const match = targetFields.find(field => {
        const fieldLower = field.key.toLowerCase().replace(/[_\s-]/g, '');
        const labelLower = (field.label || '').toLowerCase().replace(/[_\s-]/g, '');
        
        return colLower === fieldLower || 
               colLower === labelLower ||
               colLower.includes(fieldLower) ||
               fieldLower.includes(colLower);
      });

      return { source: col, target: match?.key || '' };
    });

    setLocalMappings(autoMapped);
    onChange(autoMapped.filter(m => m.target));
    
    if (onAutoMap) onAutoMap();
  };

  const getTargetFieldInfo = (key) => {
    return targetFields.find(f => f.key === key);
  };

  const isMapped = (sourceColumn) => {
    const mapping = localMappings.find(m => m.source === sourceColumn);
    return mapping && mapping.target;
  };

  const isTargetUsed = (targetKey) => {
    return localMappings.some(m => m.target === targetKey);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-gray-900">Map Columns</h4>
          <p className="text-sm text-gray-500">
            Match your file columns to system fields
          </p>
        </div>
        <button
          onClick={handleAutoMap}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
        >
          <Wand2 className="w-4 h-4" />
          Auto-map
        </button>
      </div>

      {/* Unmapped Required Warning */}
      {unmappedRequired.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Required fields not mapped:</p>
              <p className="text-sm text-yellow-700">
                {unmappedRequired.map(f => f.label || f.key).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mapping Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                File Column
              </th>
              <th className="px-4 py-3 text-center w-12"></th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                System Field
              </th>
              <th className="px-4 py-3 text-center w-20 text-xs font-semibold text-gray-600 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {fileColumns.map((col, index) => {
              const mapping = localMappings.find(m => m.source === col);
              const targetInfo = mapping?.target ? getTargetFieldInfo(mapping.target) : null;
              const mapped = isMapped(col);

              return (
                <tr key={index} className={mapped ? 'bg-green-50/50' : ''}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{col}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ArrowRight className="w-4 h-4 text-gray-400 mx-auto" />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={mapping?.target || ''}
                      onChange={(e) => handleMappingChange(col, e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        mapped ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    >
                      <option value="">-- Skip this column --</option>
                      {targetFields.map(field => (
                        <option
                          key={field.key}
                          value={field.key}
                          disabled={isTargetUsed(field.key) && mapping?.target !== field.key}
                        >
                          {field.label || field.key}
                          {field.required && ' *'}
                          {isTargetUsed(field.key) && mapping?.target !== field.key && ' (already mapped)'}
                        </option>
                      ))}
                    </select>
                    {targetInfo?.description && (
                      <p className="text-xs text-gray-500 mt-1">{targetInfo.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {mapped ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <Check className="w-4 h-4" />
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">Skip</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {localMappings.filter(m => m.target).length} of {fileColumns.length} columns mapped
        </span>
        <span className={`${unmappedRequired.length > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
          {unmappedRequired.length > 0 
            ? `${unmappedRequired.length} required field(s) missing`
            : 'All required fields mapped'
          }
        </span>
      </div>
    </div>
  );
};

export default ColumnMapper;
