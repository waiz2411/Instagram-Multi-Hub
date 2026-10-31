import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  Trash2,
  RotateCw,
  Shield,
  Smartphone,
  Clock,
  AlertCircle,
  Play,
  Pause,
  Sliders,
  Users,
  Flame,
  Zap,
  Eye,
  Heart,
  MessageCircle
} from 'lucide-react';
import { api } from '../api';

export default function AccountCard({
  account,
  lists = [],
  onOpenBrowser,
  onRefresh,
  onDelete,
  onEditSettings
}) {
  const [loading, setLoading] = useState(false);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [warmupLoading, setWarmupLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Real-time 1-second interval timer for countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSync = async () => {
    setLoading(true);
    try {
      await api.syncAccount(account.id);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Sync failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNative = async () => {
    try {
      await api.openNativeWindow(account.id);
    } catch (err) {
      alert('Could not launch desktop window: ' + err.message);
    }
  };

  const handleAssignList = async (listName) => {
    try {
      await api.assignList(account.id, listName);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Failed to assign list: ' + err.message);
    }
  };

  const handleToggleOutreach = async () => {
    if (!account.assignedListName) {
      alert('Please assign a Lead List to this account first.');
      return;
    }
    setOutreachLoading(true);
    try {
      if (account.outreachStatus === 'running') {
        await api.pauseAccountOutreach(account.id);
      } else {
        await api.startAccountOutreach(account.id);
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Outreach action failed: ' + err.message);
    } finally {
      setOutreachLoading(false);
    }
  };

  const handleToggleWarmup = async () => {
    setWarmupLoading(true);
    try {
      await api.toggleWarmup(account.id);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Warmup action failed: ' + err.message);
    } finally {
      setWarmupLoading(false);
    }
  };

  // Find info about assigned list
  const assignedListInfo = lists.find(
    (l) => l.name.toLowerCase() === (account.assignedListName || '').toLowerCase()
  );

  const getStatusBadge = () => {
    switch (account.status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Connected
          </span>
        );
      case 'logging_in':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
            <Clock className="w-3 h-3" /> Login Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" /> Disconnected
          </span>
        );
    }
  };

  // Countdown timer string calculation
  const getNextRunCountdown = () => {
    if (!account.nextRunAt) {
      return account.outreachStatus === 'running' ? 'Scheduling...' : 'Outreach Paused';
    }
    const target = new Date(account.nextRunAt).getTime();
    const diff = target - now;
    if (diff <= 0) {
      return 'Dispatching shortly...';
    }
    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  // Human relative time for last sent message
  const getLastSentTime = () => {
    if (!account.lastSentAt) return 'None yet';
    const diffMs = now - new Date(account.lastSentAt).getTime();
    const diffMins = Math.floor(diffMs / (60 * 1000));
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  const isDispatching = account.currentAction === 'dispatching';
  const dailyLimit = account.dailyLimit || 30;
  const sentToday = account.sentToday || 0;
  const progressPercent = Math.min(100, Math.round((sentToday / dailyLimit) * 100));

  const warmupStats = account.warmupStats || { postsViewed: 0, likesGiven: 0, commentsGiven: 0 };
  const isWarmupRunning = account.warmupEnabled || account.isWarmupActive;

  return (
    <div className="group relative rounded-3xl bg-slate-900/70 border border-slate-800/90 hover:border-pink-500/30 hover:shadow-2xl hover:shadow-pink-500/10 transition-all p-6 flex flex-col justify-between overflow-hidden backdrop-blur-xl">
      {/* Decorative gradient orb */}
      <div className="absolute -top-16 -right-16 w-36 h-36 bg-gradient-to-bl from-pink-500/15 via-purple-500/10 to-transparent rounded-full blur-2xl group-hover:scale-125 transition-all duration-700 pointer-events-none" />

      <div>
        {/* Top Header: Avatar & Username & Status */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl p-[2px] bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 shadow-md">
                <div className="w-full h-full rounded-2xl bg-slate-950 flex items-center justify-center overflow-hidden">
                  {account.profilePic ? (
                    <img src={account.profilePic} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-extrabold text-white uppercase">
                      {(account.username || 'IG')[0]}
                    </span>
                  )}
                </div>
              </div>
              {account.isSessionOpen && (
                <span
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-900 shadow-md"
                  title="Active isolated browser session"
                />
              )}
            </div>

            <div>
              <h3 className="font-extrabold text-white text-base tracking-tight flex items-center gap-1.5">
                @{account.username || 'unnamed'}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                {getStatusBadge()}
                {account.proxyUrl && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Shield className="w-2.5 h-2.5" /> Proxy
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onEditSettings(account)}
              title="Outreach Settings & Template"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(account.id)}
              title="Delete Account"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PROMINENT LIVE DISPATCHING BANNER */}
        {isDispatching && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-pink-500/20 to-purple-500/20 border border-amber-400/50 shadow-lg shadow-amber-500/10 mb-4 animate-pulse flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-ping absolute" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 relative" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                  ⚡ DISPATCHING MESSAGE
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" />
              </div>
              <p className="text-xs font-bold text-white truncate mt-0.5">
                {account.currentActionDetails || 'Sending personalized DM to lead...'}
              </p>
            </div>
          </div>
        )}

        {/* Lead List Assignment Dropdown */}
        <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 mb-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400 font-semibold flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              Assigned Lead List
            </span>
            <span className="text-[11px] text-purple-400 font-semibold">
              {assignedListInfo ? `${assignedListInfo.pending} pending` : '0 pending'}
            </span>
          </div>

          <select
            value={account.assignedListName || ''}
            onChange={(e) => handleAssignList(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-pink-500 transition cursor-pointer"
          >
            <option value="">Select Lead List to Target...</option>
            {lists.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name} ({l.pending} pending / {l.total} total)
              </option>
            ))}
          </select>
        </div>

        {/* TIMESTAMPS & LIVE COUNTDOWN TIMER */}
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 mb-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-400 font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              Next Message In:
            </span>
            <span
              className={`font-mono font-bold text-xs px-2.5 py-0.5 rounded-lg border ${
                account.outreachStatus === 'running'
                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/30 shadow-sm shadow-blue-500/10'
                  : 'bg-slate-800/70 text-slate-400 border-slate-700/60'
              }`}
            >
              {getNextRunCountdown()}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
            <span>
              Last sent: <strong className="text-slate-200">{getLastSentTime()}</strong>
            </span>
            <span className="text-slate-400">
              Interval: <strong className="text-pink-400 font-medium">{account.minDelay || 25}-{account.maxDelay || 35}m</strong>
            </span>
          </div>
        </div>

        {/* HUMAN ACCOUNT WARMUP ENGINE SECTION */}
        <div className={`p-3.5 rounded-2xl border transition-all mb-4 ${
          isWarmupRunning
            ? 'bg-gradient-to-br from-amber-950/30 to-purple-950/30 border-amber-500/40 shadow-md shadow-amber-500/5'
            : 'bg-slate-950/40 border-slate-800/60'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Flame className={`w-4 h-4 ${isWarmupRunning ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
              <span className="text-xs font-extrabold text-slate-200">
                Human Warmup Mode
              </span>
            </div>

            <button
              onClick={handleToggleWarmup}
              disabled={warmupLoading}
              className={`px-3 py-1 rounded-xl text-[11px] font-bold transition border active:scale-95 ${
                isWarmupRunning
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              {warmupLoading ? 'Updating...' : isWarmupRunning ? 'Disable Warmup' : 'Enable Warmup'}
            </button>
          </div>

          {isWarmupRunning ? (
            <div>
              <p className="text-[11px] text-amber-200/90 font-medium truncate mb-2">
                {account.warmupCurrentAction || 'Scrolling feed & viewing reels organically...'}
              </p>
              <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-amber-500/20 text-[10px]">
                <span className="flex items-center gap-1 text-slate-300">
                  <Eye className="w-3 h-3 text-amber-400" />
                  <strong>{warmupStats.postsViewed || 0}</strong> viewed
                </span>
                <span className="flex items-center gap-1 text-slate-300">
                  <Heart className="w-3 h-3 text-rose-400" />
                  <strong>{warmupStats.likesGiven || 0}</strong> liked
                </span>
                <span className="flex items-center gap-1 text-slate-300">
                  <MessageCircle className="w-3 h-3 text-purple-400" />
                  <strong>{warmupStats.commentsGiven || 0}</strong> commented
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 leading-tight">
              Simulates human scrolling, random reel likes & friendly comments to keep accounts healthy.
            </p>
          )}
        </div>

        {/* Cold Outreach Progress & Daily Limit */}
        <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/60 mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400 font-medium">Daily Cold DMs</span>
            <span className="text-white font-bold">
              {sentToday} <span className="text-slate-500 font-normal">/ {dailyLimit} max</span>
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Lifetime: {account.totalSent || 0} sent</span>
            <span
              className={`font-semibold capitalize ${
                account.outreachStatus === 'running'
                  ? 'text-emerald-400'
                  : account.outreachStatus === 'cooldown'
                  ? 'text-blue-400'
                  : 'text-slate-400'
              }`}
            >
              Status: {account.outreachStatus || 'idle'}
            </span>
          </div>
        </div>
      </div>

      {/* Action Footer Buttons */}
      <div className="space-y-2 pt-2 border-t border-slate-800/80">
        <div className="grid grid-cols-2 gap-2">
          {/* Open In-App Browser Stream */}
          <button
            onClick={() => onOpenBrowser(account)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-pink-500/20 transition active:scale-95"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Open Browser</span>
          </button>

          {/* Start / Pause Outreach Engine */}
          <button
            onClick={handleToggleOutreach}
            disabled={outreachLoading}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs transition border active:scale-95 ${
              account.outreachStatus === 'running'
                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-500/10'
            }`}
          >
            {account.outreachStatus === 'running' ? (
              <>
                <Pause className="w-3.5 h-3.5" /> Pause Outreach
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" /> Start Outreach
              </>
            )}
          </button>
        </div>

        {/* Secondary options: Native Desktop Window & Session Sync */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={handleOpenNative}
            title="Open real Chrome window on your desktop (100% native speed)"
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-[11px] font-medium transition"
          >
            <ExternalLink className="w-3 h-3 text-blue-400" />
            <span>Desktop Window</span>
          </button>

          <button
            onClick={handleSync}
            disabled={loading}
            title="Detect / Sync Session"
            className="flex items-center gap-1 py-1.5 px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-[11px] font-medium transition"
          >
            <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin text-pink-400' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>
    </div>
  );
}
