import type { Health } from '../types';

export function StatusBar({ health }: { health: Health | null }) {
  if (!health) {
    return (
      <div className="text-xs text-slate-500 no-drag">Sprawdzanie statusu…</div>
    );
  }

  const magemarStale = health.magemar.age_hours > 24;
  const isProduction = health.qbo.env === 'production';

  return (
    <div className="flex items-center gap-4 text-xs no-drag">
      {/* Magemar */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400">Magemar:</span>
        <span className={magemarStale ? 'text-amber-400' : 'text-emerald-400'}>
          {magemarStale ? '⚠️' : '✓'}
        </span>
        <span className="text-slate-300">
          {health.magemar.age_hours < 1
            ? 'świeży'
            : `${Math.round(health.magemar.age_hours)}h temu`}
        </span>
      </div>

      <div className="w-px h-4 bg-slate-700" />

      {/* QBO */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400">QBO:</span>
        <span className={health.qbo.pro === 'ok' && health.qbo.store === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
          {health.qbo.pro === 'ok' && health.qbo.store === 'ok' ? '🟢' : '🔴'}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${isProduction ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>
          {health.qbo.env.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
