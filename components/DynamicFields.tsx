
import React from 'react';
import { FieldDefinition } from '../types';
import { Input, Textarea } from './Input';

interface DynamicFieldsProps {
  fields: FieldDefinition[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  section?: string;
  errors?: Record<string, string>; // Added support for errors
}

export const DynamicFields: React.FC<DynamicFieldsProps> = ({ fields, values, onChange, section, errors }) => {
  const filteredFields = section 
    ? fields.filter(f => f.section === section) 
    : fields;

  if (filteredFields.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in">
      {filteredFields.map(field => {
        const commonProps = {
            label: field.label,
            placeholder: field.placeholder,
            required: field.required,
            value: values[field.key] !== undefined ? values[field.key] : (field.defaultValue || ''),
            onChange: (e: any) => onChange(field.key, e.target.value),
            error: errors?.[field.key] // Pass error to Input
        };

        if (field.type === 'select') {
            return (
                <div key={field.key} className="flex flex-col space-y-1">
                    <label className="text-sm font-semibold text-slate-700">
                        {field.label} {field.required && '*'}
                    </label>
                    <select
                        className={`px-3 py-2 bg-white text-black border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none ${errors?.[field.key] ? 'border-red-500 focus:ring-red-200' : 'border-slate-300'}`}
                        value={commonProps.value}
                        onChange={commonProps.onChange}
                    >
                        <option value="">Selecione...</option>
                        {field.options?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                    {errors?.[field.key] && <span className="text-xs text-red-500 font-medium">{errors[field.key]}</span>}
                </div>
            );
        }

        if (field.type === 'textarea') {
            return (
                <div key={field.key} className="col-span-full">
                    <Textarea {...commonProps} rows={3} className={errors?.[field.key] ? 'border-red-500' : ''} />
                    {errors?.[field.key] && <span className="text-xs text-red-500 font-medium">{errors[field.key]}</span>}
                </div>
            );
        }

        return (
            <Input 
                key={field.key}
                type={field.type}
                {...commonProps}
            />
        );
      })}
    </div>
  );
};
