import React from 'react';

interface TextFieldProps {
  value: string | number;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  type?: 'text' | 'email' | 'tel' | 'password' | 'number';
  className?: string;
  id?: string;
}

export const TextField: React.FC<TextFieldProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  prefix,
  suffix,
  type = 'text',
  className = '',
  id,
}) => {
  return (
    <div
      className={`relative flex items-center bg-surface-card border border-border-subtle rounded-xl px-3 py-1.5 focus-within:border-brand-500 transition-colors ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {prefix && <span className="mr-2 text-text-muted text-xs flex-shrink-0">{prefix}</span>}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-transparent text-xs font-bold text-text-primary placeholder:text-text-muted/60 focus:outline-none"
      />
      {suffix && <span className="ml-2 text-text-muted text-xs flex-shrink-0">{suffix}</span>}
    </div>
  );
};
