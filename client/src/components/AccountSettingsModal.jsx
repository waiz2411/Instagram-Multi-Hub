import React, { useState } from 'react';
import { X, Sparkles, Shuffle, ShieldCheck, Check } from 'lucide-react';
import { api } from '../api';

export default function AccountSettingsModal({ account, onClose, onUpdated }) {
  const [template, setTemplate] = useState(
    account.template ||
      '{Hi|Hello|Hey} {first_name}! Loved your profile. Would love to connect and share ideas about {growth|content|marketing}.'
  );
  const [dailyLimit, setDailyLimit] = useState(account.dailyLimit || 30);
  const [minDelay, setMinDelay] = useState(account.minDelay || 25);
  const [maxDelay, setMaxDelay] = useState(account.maxDelay || 35);
  const [proxyUrl, setProxyUrl] = useState(account.proxyUrl || '');

  const [previewOutput, setPreviewOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleTestPreview = async () => {
    try {
      const res = await api.previewTemplate(template, {
        username: 'creator_alex',
        fullName: 'Alex Morgan'
      });
      if (res.success) {
        setPreviewOutput(res.preview);
      }
    } catch (err) {
      setPreviewOutput('Error previewing: ' + err.message);
    }
  };

  const insertVariable = (variable) => {
    setTemplate((prev) => prev + ` ${variable}`);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.updateAccount(account.id, {
        template,
        dailyLimit: Number(dailyLimit),
        minDelay: Number(minDelay),
        maxDelay: Number(maxDelay),
        proxyUrl: proxyUrl ? proxyUrl.trim() : null
      });

      if (res.success && res.account) {
        setSaved(true);
        if (onUpdated) onUpdated(res.account);
        setTimeout(() => {
          onClose();
        }, 800);
      }
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-pink-500" />
              Settings for @{account.username}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Customize the personalized cold DM script and safety limits for this account.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Message Template */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-200">
                Cold DM Message Script (with Spintax)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => insertVariable('{first_name}')}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-pink-400 font-mono transition"
                >
                  + {"{first_name}"}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable('{username}')}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-pink-400 font-mono transition"
                >
                  + {"{username}"}
                </button>
              </div>
            </div>

            <textarea
              rows={4}
              required
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-xs text-slate-100 focus:outline-none focus:border-pink-500 transition leading-relaxed font-sans"
            />

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500">
                Wrap variations in <code className="text-pink-400">{"{Hey|Hello|Hi}"}</code> to avoid spam detection.
              </span>
              <button
                type="button"
                onClick={handleTestPreview}
                className="flex items-center gap-1 text-[11px] font-bold text-purple-400 hover:text-purple-300"
              >
                <Shuffle className="w-3 h-3" /> Test Spin
              </button>
            </div>

            {previewOutput && (
              <div className="mt-2.5 p-3 rounded-2xl bg-purple-950/20 border border-purple-800/30 text-xs text-purple-200">
                <span className="text-[10px] uppercase font-bold text-purple-400 block mb-0.5">
                  Generated Sample DM:
                </span>
                "{previewOutput}"
              </div>
            )}
          </div>

          {/* Safety Settings */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Safety & Anti-Ban Controls
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Daily DM Limit</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Min Delay (mins)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={minDelay}
                  onChange={(e) => setMinDelay(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Max Delay (mins)</label>
                <input
                  type="number"
                  min={2}
                  max={180}
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="text-[10px] text-slate-500 italic">
              💡 Recommended: 25 to 35 minute randomized interval protects accounts from Instagram restrictions.
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Residential Proxy (Optional)</label>
              <input
                type="text"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="http://user:pass@ip:port"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600"
              />
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-pink-500/20 transition disabled:opacity-50"
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" /> Saved!
                </>
              ) : loading ? (
                'Saving...'
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
