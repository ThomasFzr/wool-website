import { TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="text-xs font-medium text-slate-700">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full rounded-lg border border-slate-200 px-3 py-2 text-sm
            outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300
            ${className}
          `}
          {...props}
        />
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
