"use client";

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MonthlyData {
  month: string;
  orders?: number;
  reservations?: number; // Pour compatibilité
  validated: number;
  revenue: number;
  cost?: number;
  profit?: number;
  sold: number;
}

interface StatsChartProps {
  data: MonthlyData[];
  type?: 'orders' | 'reservations' | 'revenue' | 'profit';
}

export function StatsChart({ data, type = 'orders' }: StatsChartProps) {
  if (type === 'revenue') {
    // Calculer les valeurs max pour définir les domaines des axes
    const maxRevenue = Math.max(...data.map(d => d.revenue || 0), 1);
    const maxSold = Math.max(...data.map(d => d.sold || 0), 1);
    
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
              yAxisId="left"
              stroke="#64748b"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => {
                if (value === 0) return '0€';
                return `${Math.round(value)}€`;
              }}
              domain={[0, maxRevenue > 0 ? maxRevenue * 1.1 : 1]}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="#64748b"
              style={{ fontSize: '12px' }}
              domain={[0, maxSold * 1.1]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: any, name: string) => {
                // name correspond au dataKey ou au prop name du Bar
                if (name === 'sold' || name === 'Créations vendues') {
                  return [value, 'Créations vendues'];
                }
                if (name === 'revenue' || name === 'Revenus') {
                  return [`${Number(value).toFixed(2)}€`, 'Revenus'];
                }
                return [value, name];
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
            <Bar yAxisId="left" dataKey="revenue" fill="#10b981" name="revenue" radius={[8, 8, 0, 0]} />
            <Bar yAxisId="right" dataKey="sold" fill="#3b82f6" name="sold" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'profit') {
    // Calculer les valeurs max/min pour définir le domaine de l'axe Y
    const allValues = data.flatMap(d => [d.revenue || 0, d.cost || 0, d.profit || 0]);
    const maxValue = Math.max(...allValues, 1);
    const minValue = Math.min(...allValues, 0);
    
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
              tickFormatter={(value) => {
                if (value === 0) return '0€';
                return `${Math.round(value)}€`;
              }}
              domain={[minValue < 0 ? minValue * 1.1 : 0, maxValue > 0 ? maxValue * 1.1 : 1]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: any, name: string) => {
                // name correspond au prop name du Line (qui est maintenant "revenue", "cost", ou "profit")
                let label = '';
                if (name === 'revenue') label = 'Revenus';
                else if (name === 'cost') label = 'Coûts';
                else if (name === 'profit') label = 'Profit';
                else label = name;
                return [`${Number(value).toFixed(2)}€`, label];
              }}
            />
            <Legend 
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => {
                if (value === 'revenue') return 'Revenus';
                if (value === 'cost') return 'Coûts';
                if (value === 'profit') return 'Profit';
                return value;
              }}
            />
            <Line 
              type="monotone" 
              dataKey="revenue" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={{ fill: '#10b981', r: 4 }}
              activeDot={{ r: 6 }}
              name="revenue"
            />
            <Line 
              type="monotone" 
              dataKey="cost" 
              stroke="#ef4444" 
              strokeWidth={2}
              dot={{ fill: '#ef4444', r: 4 }}
              activeDot={{ r: 6 }}
              name="cost"
            />
            <Line 
              type="monotone" 
              dataKey="profit" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              activeDot={{ r: 6 }}
              name="profit"
            />
          </LineChart>
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
              if (value === 'orders' || value === 'reservations') return 'Commandes';
              if (value === 'validated') return 'Validées';
              return value;
            }}
          />
          <Line 
            type="monotone" 
            dataKey={data[0]?.orders !== undefined ? "orders" : "reservations"}
            stroke="#3b82f6" 
            strokeWidth={2}
            name="Commandes"
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
