import React, { useState } from 'react';
import { X, Smartphone, Monitor, Shield, Sparkles, AlertCircle, Users } from 'lucide-react';
import { api } from '../api';

export default function AddAccountModal({ lists = [], onClose, onAccountCreated }) {
  const [username, setUsername] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [assignedListName, setAssignedListName] = useState(
    lists.length > 0 ? lists[0].name : 'General'
  );
  const [isMobile, setIsMobile] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.createAccount({
        username: username.trim(),
        proxyUrl: proxyUrl.trim(),
        assignedListName: assignedListName.trim(),
        isMobile
      });

      if (res.success && res.account) {
        onAccountCreated(res.account);
      } else {
        setError(res.error || 'Failed to initialize account');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Glow decorative */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-pink-500/15 via-purple-500/15 to-transparent rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div>
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-pink-500" />
              Connect Instagram Account
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Launches an isolated browser session where you can log in securely.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              Account Label / Handle (Optional)
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. outreach_acc_1 (auto-detected on login)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              Assign Cold Outreach Lead List
            </label>
            <select
              value={assignedListName}
              onChange={(e) => setAssignedListName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-pink-500 transition"
            >
              {lists.map((l) => (
                <option key={l.name} value={l.name}>
                  {l.name} ({l.pending} pending leads)
                </option>
              ))}
              <option value="General">General / New List</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              Proxy URL (Optional)
            </label>
            <input
              type="text"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="http://username:password@ip:port"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500 transition"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Supports HTTP/HTTPS/SOCKS5. Recommended when connecting 3+ accounts.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              Default Viewport
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsMobile(true)}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition ${
                  isMobile
                    ? 'bg-pink-500/10 border-pink-500/50 text-pink-400'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Mobile View (Optimized)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMobile(false)}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition ${
                  !isMobile
                    ? 'bg-blue-500/10 border-blue-500/50 text-blue-400'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>Desktop View</span>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-pink-500/25 transition disabled:opacity-50"
            >
              {loading ? 'Launching Session...' : 'Connect & Open Browser'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
