import React, { useState, useEffect } from 'react';
import { Activity, RotateCw, CheckCircle2, AlertCircle, Send, ShieldCheck } from 'lucide-react';
import { api } from '../api';

export default function UnifiedLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getLogs(150);
      if (res.success) setLogs(res.logs);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-pink-500" />
            Outreach Activity & Audit Logs
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time tracking of automated messages, browser actions, and safety intervals.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-pink-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold text-slate-400">No activity logged yet</p>
            <p className="text-xs mt-1">Actions from campaigns and browser sessions will appear here live.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 uppercase font-semibold text-[10px] text-slate-400">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-4 text-slate-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>

                    <td className="py-2.5 px-4 font-sans">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        <Send className="w-3 h-3 text-pink-400" />
                        {log.action}
                      </span>
                    </td>

                    <td className="py-2.5 px-4 font-semibold text-slate-200">
                      @{log.targetUsername || 'system'}
                    </td>

                    <td className="py-2.5 px-4 font-sans">
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400">
                          <AlertCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-slate-400 max-w-md truncate font-sans">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
