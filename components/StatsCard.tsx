import { ReactNode } from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: {
    value: string;
    label: string;
    isPositive?: boolean;
  };
}

export function StatsCard({ title, value, subtitle, icon, trend }: StatsCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-600">{title}</p>
        </div>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>

      <div className="mb-2">
        <p className="text-3xl font-bold text-slate-900">{value}</p>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        )}
      </div>

      {trend && (
        <div className="flex items-center gap-1.5 mt-3">
          <span
            className={`text-xs font-medium ${
              trend.isPositive === false
                ? "text-red-600"
                : "text-green-600"
            }`}
          >
            {trend.isPositive !== false && "↗"} {trend.value}
          </span>
          <span className="text-xs text-slate-500">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
