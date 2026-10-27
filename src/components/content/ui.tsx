import React from 'react';
import { X } from 'lucide-react';

export const cardClass =
  'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl';

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`${cardClass} ${className}`}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`${inputBase} ${className}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', rows = 3, ...rest } = props;
  return <textarea rows={rows} {...rest} className={`${inputBase} leading-relaxed ${className}`} />;
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const styles: Record<string, string> = {
    primary: 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold',
    secondary:
      'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium',
    ghost:
      'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium',
    danger: 'bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 font-medium',
  };
  return (
    <button
      type="button"
      {...rest}
      className={`text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: 'slate' | 'amber' | 'green' | 'blue' | 'rose' | 'violet';
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tones[tone]}`}>{children}</span>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full shadow-xl my-4 ${
          wide ? 'max-w-5xl' : 'max-w-2xl'
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-2xl z-10">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 sm:px-6 py-4">{children}</div>
        {footer && (
          <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2 sticky bottom-0 bg-white dark:bg-slate-900 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
