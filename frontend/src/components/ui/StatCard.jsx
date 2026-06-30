import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatCard({ title, value, subtitle, icon: Icon, trend, trendValue }) {
  return (
    <div className="bg-surface p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-text-muted">{title}</p>
        {Icon && (
          <div className="p-2 bg-primary-50 rounded-lg">
            <Icon className="text-primary-600" size={20} />
          </div>
        )}
      </div>
      
      <h3 className="text-2xl font-bold text-text">{value}</h3>
      
      {subtitle && (
        <div className="flex items-center mt-2 text-xs">
          {trend && (
            <span className={`flex items-center font-semibold mr-1 ${trend === 'up' ? 'text-success-600' : 'text-danger-600'}`}>
              {trend === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {trendValue}
            </span>
          )}
          <span className="text-text-muted">{subtitle}</span>
        </div>
      )}
    </div>
  );
}