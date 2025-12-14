import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col space-y-1">
        <label className="text-sm font-semibold text-slate-700">{label}</label>
        <input
          ref={ref}
          className={`px-3 py-2 bg-white border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all ${
            error ? 'border-red-500 focus:ring-red-200' : 'border-slate-300'
          } ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }>(
    ({ label, className = '', ...props }, ref) => {
      return (
        <div className="flex flex-col space-y-1">
          <label className="text-sm font-semibold text-slate-700">{label}</label>
          <textarea
            ref={ref}
            className={`px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all ${className}`}
            {...props}
          />
        </div>
      );
    }
  );
Textarea.displayName = 'Textarea';