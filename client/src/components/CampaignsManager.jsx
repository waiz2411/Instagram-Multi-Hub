import React, { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  Play,
  Pause,
  Trash2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Clock,
  Shuffle,
  ShieldAlert,
  Sliders
} from 'lucide-react';
import { api } from '../api';

export default function CampaignsManager({ accounts }) {
  const [campaigns, setCampaigns] = useState([]);
  const [lists, setLists] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [targetListName, setTargetListName] = useState('');
  const [template, setTemplate] = useState(
    '{Hi|Hey|Hello} {first_name}! Loved your profile. Would love to connect and share ideas about {business|growth|content}.'
  );
  const [dailyLimit, setDailyLimit] = useState(25);
  const [minDelay, setMinDelay] = useState(45);
  const [maxDelay, setMaxDelay] = useState(90);

  // Spintax Preview
  const [previewOutput, setPreviewOutput] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadCampaigns = async () => {
    try {
      const res = await api.getCampaigns();
      if (res.success) setCampaigns(res.campaigns);
    } catch (err) {
      console.error('Error loading campaigns:', err);
    }
  };

  const loadLists = async () => {
    try {
      const res = await api.getLeadLists();
      if (res.success) {
        setLists(res.lists);
        if (res.lists.length > 0 && !targetListName) {
          setTargetListName(res.lists[0].name);
        }
      }
    } catch (err) {
      console.error('Error loading lead lists:', err);
    }
  };

  useEffect(() => {
    loadCampaigns();
    loadLists();
    // Poll campaign progress every 5 seconds
    const interval = setInterval(loadCampaigns, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setAccountId(accounts[0].id);
    }
  }, [accounts]);

  const handleTestPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await api.previewTemplate(template, {
        username: 'sarah_creator',
        fullName: 'Sarah Miller'
      });
      if (res.success) {
        setPreviewOutput(res.preview);
      }
    } catch (err) {
      setPreviewOutput('Error previewing: ' + err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!name || !accountId || !targetListName || !template) {
      alert('Please fill out all required fields');
      return;
    }

    try {
      const res = await api.createCampaign({
        name,
        accountId,
        targetListName,
        template,
        dailyLimit,
        minDelay,
        maxDelay
      });

      if (res.success) {
        setName('');
        setShowCreateModal(false);
        loadCampaigns();
      }
    } catch (err) {
      alert('Failed to create campaign: ' + err.message);
    }
  };

  const handleToggleCampaign = async (campaign) => {
    try {
      if (campaign.status === 'running') {
        await api.pauseCampaign(campaign.id);
      } else {
        await api.startCampaign(campaign.id);
      }
      loadCampaigns();
    } catch (err) {
      alert('Action failed: ' + err.message);
    }
  };

  const handleDeleteCampaign = async (id) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    try {
      await api.deleteCampaign(id);
      loadCampaigns();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const insertVariable = (variable) => {
    setTemplate((prev) => prev + ` ${variable}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-pink-500" />
            Outreach Campaigns
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Automate personalized Direct Messages with safe humanized delays and Spintax variations.
          </p>
        </div>

        <button
          onClick={() => {
            setShowCreateModal(true);
            handleTestPreview();
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-semibold shadow-lg shadow-pink-500/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Campaign</span>
        </button>
      </div>

      {/* Campaigns Grid */}
      {campaigns.length === 0 ? (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-12 text-center text-slate-500">
          <Send className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold text-slate-400">No campaigns created yet</p>
          <p className="text-xs mt-1">
            Connect an Instagram account, add leads, and start your first outreach campaign.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((camp) => {
            const progressPercent = camp.totalLeads > 0
              ? Math.min(100, Math.round(((camp.sentCount || 0) / camp.totalLeads) * 100))
              : 0;

            return (
              <div
                key={camp.id}
                className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-col justify-between hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-100">{camp.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                        <span>Sender: <strong>@{camp.accountUsername}</strong></span>
                        <span>•</span>
                        <span>List: <strong>{camp.targetListName}</strong></span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        camp.status === 'running'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse'
                          : camp.status === 'completed'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {camp.status === 'running' && <Play className="w-3 h-3 fill-current" />}
                      {camp.status === 'paused' && <Pause className="w-3 h-3" />}
                      <span className="capitalize">{camp.status}</span>
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5 my-4">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Progress</span>
                      <span>
                        <strong>{camp.sentCount || 0}</strong> sent / {camp.totalLeads} leads ({progressPercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Template Preview */}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 font-mono line-clamp-2">
                    {camp.template}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    Delay: {camp.minDelay}-{camp.maxDelay}s • Max: {camp.dailyLimit}/day
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleCampaign(camp)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                        camp.status === 'running'
                          ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {camp.status === 'running' ? (
                        <>
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" /> Start
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteCampaign(camp.id)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl my-8">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-pink-500" />
              Create Outreach Campaign
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Target leads and send automated personalized DMs via your connected account.
            </p>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Agency Outreach Q1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Sender Instagram Account *
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        @{acc.username} ({acc.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Target Lead List *
                  </label>
                  <select
                    value={targetListName}
                    onChange={(e) => setTargetListName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                  >
                    {lists.map((l) => (
                      <option key={l.name} value={l.name}>
                        {l.name} ({l.pending} pending)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Message Template & Spintax */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Message Template (with Spintax) *
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => insertVariable('{first_name}')}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-pink-400 font-mono"
                    >
                      + {"{first_name}"}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable('{username}')}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-pink-400 font-mono"
                    >
                      + {"{username}"}
                    </button>
                  </div>
                </div>

                <textarea
                  required
                  rows={4}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-sans focus:outline-none focus:border-pink-500"
                />

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    Use <code className="text-pink-400">{"{Hey|Hello|Hi}"}</code> for Spintax randomization to prevent spam detection.
                  </span>
                  <button
                    type="button"
                    onClick={handleTestPreview}
                    className="flex items-center gap-1 text-[11px] font-semibold text-purple-400 hover:text-purple-300"
                  >
                    <Shuffle className="w-3 h-3" /> Test Random Spin
                  </button>
                </div>

                {/* Spintax live preview box */}
                {previewOutput && (
                  <div className="mt-2 p-2.5 rounded-xl bg-purple-950/20 border border-purple-800/30 text-xs text-purple-200">
                    <span className="text-[10px] uppercase font-bold text-purple-400 block mb-0.5">
                      Sample Generated Variation:
                    </span>
                    "{previewOutput}"
                  </div>
                )}
              </div>

              {/* Safety & Delays */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-400" />
                  Anti-Ban & Safety Settings
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Daily DM Limit
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Min Delay (sec)
                    </label>
                    <input
                      type="number"
                      min={20}
                      max={300}
                      value={minDelay}
                      onChange={(e) => setMinDelay(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Max Delay (sec)
                    </label>
                    <input
                      type="number"
                      min={30}
                      max={600}
                      value={maxDelay}
                      onChange={(e) => setMaxDelay(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 text-white text-xs font-semibold shadow-lg shadow-pink-500/20"
                >
                  Create & Save Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
