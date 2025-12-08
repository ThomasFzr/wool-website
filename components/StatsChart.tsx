"use client";

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MonthlyData {
  month: string;
  reservations: number;
  validated: number;
  revenue: number;
  sold: number;
}

interface StatsChartProps {
  data: MonthlyData[];
  type?: 'reservations' | 'revenue';
}

export function StatsChart({ data, type = 'reservations' }: StatsChartProps) {
  if (type === 'revenue') {
    return (
      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="month" 
              stroke="#64748b"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#64748b"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `${value}€`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: any, name: string) => {
                if (name === 'Créations vendues') return [value, 'Créations vendues'];
                return [`${Number(value).toFixed(2)}€`, 'Revenus'];
              }}
            />
            <Legend 
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => {
                if (value === 'revenue') return 'Revenus';
                if (value === 'sold') return 'Créations vendues';
                return value;
              }}
            />
            <Bar dataKey="revenue" fill="#10b981" name="Revenus" radius={[8, 8, 0, 0]} />
            <Bar dataKey="sold" fill="#3b82f6" name="Créations vendues" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis 
            dataKey="month" 
            stroke="#64748b"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#64748b"
            style={{ fontSize: '12px' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#fff', 
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '12px'
            }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '12px' }}
            formatter={(value) => {
              if (value === 'reservations') return 'Réservations';
              if (value === 'validated') return 'Validées';
              return value;
            }}
          />
          <Line 
            type="monotone" 
            dataKey="reservations" 
            stroke="#3b82f6" 
            strokeWidth={2}
            name="Réservations"
            dot={{ fill: '#3b82f6', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line 
            type="monotone" 
            dataKey="validated" 
            stroke="#10b981" 
            strokeWidth={2}
            name="Validées"
            dot={{ fill: '#10b981', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
