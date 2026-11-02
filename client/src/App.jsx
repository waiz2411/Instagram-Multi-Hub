import React, { useState, useEffect } from 'react';
import {
  Users,
  Send,
  Activity,
  Plus,
  Play,
  CheckCircle2,
  Shield,
  Smartphone,
  Globe,
  TrendingUp,
  Sparkles,
  ExternalLink,
  Layers,
  Settings,
  RefreshCw,
  Zap,
  Bell
} from 'lucide-react';
import { api } from './api';
import AccountCard from './components/AccountCard';
import AddAccountModal from './components/AddAccountModal';
import AccountSettingsModal from './components/AccountSettingsModal';
import RemoteBrowser from './components/RemoteBrowser';
import LeadsManager from './components/LeadsManager';
import UnifiedLogs from './components/UnifiedLogs';

export default function App() {
  const [activeTab, setActiveTab] = useState('accounts'); // 'accounts' | 'leads' | 'logs'
  const [accounts, setAccounts] = useState([]);
  const [leadLists, setLeadLists] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals & Active Session
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [activeBrowserAccount, setActiveBrowserAccount] = useState(null);
  const [scanningReplies, setScanningReplies] = useState(false);

  const handleScanReplies = async () => {
    setScanningReplies(true);
    try {
      const res = await api.triggerInboxScan();
      if (res.alertsSent > 0) {
        alert(`🚨 Sent ${res.alertsSent} new reply alert(s) to @sync_satisfy!`);
      } else {
        alert('✅ Direct inboxes scanned. No new unalerted replies.');
      }
      loadData();
    } catch (err) {
      alert('Alert scan error: ' + err.message);
    } finally {
      setScanningReplies(false);
    }
  };

  const loadData = async () => {
    try {
      const [accRes, listsRes, statsRes] = await Promise.all([
        api.getAccounts(),
        api.getLeadLists(),
        api.getStats()
      ]);

      let currentAccounts = accRes.success ? accRes.accounts : [];

      // Auto-restore from resilient local backup if server restarted with defaults
      const cachedRaw = localStorage.getItem('igmh_backup_data');
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw);
          const cachedAccounts = cached.accounts || [];
          const hasCachedConnected = cachedAccounts.some(a => a.status === 'connected' && a.sessionCookies?.length);
          const serverNeedsRestore =
            currentAccounts.length === 0 ||
            (hasCachedConnected && currentAccounts.every(a => a.status === 'needs_login' || !a.sessionCookies?.length));

          if (serverNeedsRestore && cachedAccounts.length > 0) {
            console.log('[AutoSync] Server restart detected. Restoring session and state from local backup...');
            const restoreRes = await api.restoreSync({
              accounts: cachedAccounts,
              leads: cached.leads || []
            });
            if (restoreRes.success && restoreRes.accounts) {
              currentAccounts = restoreRes.accounts;
            }
          }
        } catch (e) {
          console.warn('[AutoSync] Notice:', e.message);
        }
      }

      if (accRes.success) {
        setAccounts(currentAccounts);
        // If accounts have active/connected cookies or settings, persist updated snapshot to localStorage
        if (currentAccounts.some(a => a.status === 'connected' || a.sessionCookies?.length)) {
          api.getLeads().then(leadsRes => {
            const leads = leadsRes.success ? leadsRes.leads : [];
            localStorage.setItem('igmh_backup_data', JSON.stringify({
              accounts: currentAccounts,
              leads,
              timestamp: Date.now()
            }));
          }).catch(() => {});
        }
      }
      if (listsRes.success) setLeadLists(listsRes.lists);
      if (statsRes.success) setStats(statsRes.stats);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 3500);
    return () => clearInterval(timer);
  }, []);

  const handleAccountCreated = (newAccount) => {
    setShowAddModal(false);
    setAccounts((prev) => [newAccount, ...prev]);
    // Immediately open live browser stream so user can log in without waiting!
    setActiveBrowserAccount(newAccount);
    loadData();
  };

  const handleAccountUpdated = (updatedAccount) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === updatedAccount.id ? { ...a, ...updatedAccount } : a))
    );
    if (activeBrowserAccount && activeBrowserAccount.id === updatedAccount.id) {
      setActiveBrowserAccount((prev) => ({ ...prev, ...updatedAccount }));
    }
    loadData();
  };

  const handleDeleteAccount = async (id) => {
    if (!confirm('Are you sure you want to remove this Instagram account? Its session will be deleted.')) return;
    try {
      await api.deleteAccount(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      if (activeBrowserAccount && activeBrowserAccount.id === id) {
        setActiveBrowserAccount(null);
      }
      loadData();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-pink-500 selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-pink-500/25 ring-2 ring-pink-500/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base tracking-tight text-white">
                  Instagram Multi-Hub
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20 text-[10px] font-bold">
                  v2.0 Turbo
                </span>
              </div>
              <span className="text-[11px] font-semibold text-slate-400 tracking-wide block">
                Multi-Account Browser & Automated Outreach Engine
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800/90 p-1.5 rounded-2xl shadow-inner">
            <button
              onClick={() => setActiveTab('accounts')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'accounts'
                  ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-md shadow-pink-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>Connected Accounts ({accounts.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('leads')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'leads'
                  ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-md shadow-pink-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Lead Lists ({leadLists.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'logs'
                  ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-md shadow-pink-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Live Outreach Logs</span>
            </button>
          </nav>

          {/* Connect Account CTA & Master Alert Pill */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleScanReplies}
              disabled={scanningReplies}
              title="Incoming lead replies to any connected account are automatically forwarded as DMs to @sync_satisfy. Click to run a manual inbox scan."
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-2xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold transition shadow-sm"
            >
              <Bell className={`w-3.5 h-3.5 text-purple-400 ${scanningReplies ? 'animate-bounce' : ''}`} />
              <span>Alerts: @sync_satisfy</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-extrabold shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Connect Insta Account</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="md:hidden flex items-center justify-around border-t border-slate-800/80 px-2 py-2 bg-slate-950">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex flex-col items-center text-[10px] ${
              activeTab === 'accounts' ? 'text-pink-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Smartphone className="w-4 h-4 mb-0.5" />
            <span>Accounts</span>
          </button>
          <button
            onClick={() => setActiveTab('leads')}
            className={`flex flex-col items-center text-[10px] ${
              activeTab === 'leads' ? 'text-pink-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Users className="w-4 h-4 mb-0.5" />
            <span>Lead Lists</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex flex-col items-center text-[10px] ${
              activeTab === 'logs' ? 'text-pink-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Activity className="w-4 h-4 mb-0.5" />
            <span>Live Logs</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Real-time SaaS Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 shadow-lg flex items-center justify-between backdrop-blur-md">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Connected Accounts
              </span>
              <p className="text-2xl font-extrabold text-white mt-1">
                {stats?.connectedAccounts ?? 0}
                <span className="text-xs text-slate-500 font-normal ml-1.5">/ {accounts.length}</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
              <Smartphone className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 shadow-lg flex items-center justify-between backdrop-blur-md">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Lead Database
              </span>
              <p className="text-2xl font-extrabold text-white mt-1">{stats?.totalLeads ?? 0}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 shadow-lg flex items-center justify-between backdrop-blur-md">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Cold DMs Sent Today
              </span>
              <p className="text-2xl font-extrabold text-white mt-1">{stats?.sentToday ?? 0}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 shadow-lg flex items-center justify-between backdrop-blur-md">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Active Outreach Workers
              </span>
              <p className="text-2xl font-extrabold text-white mt-1">
                {accounts.filter((a) => a.outreachStatus === 'running').length}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Zap className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Tab 1: Accounts Hub */}
        {activeTab === 'accounts' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-pink-500" />
                  Instagram Multi-Account Hub
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Each account runs in its own isolated browser profile. Assign separate lead lists to each account to scale your cold outreach.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadData}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {accounts.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/40 p-14 text-center">
                <div className="w-16 h-16 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center mx-auto mb-4">
                  <Smartphone className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">No Accounts Connected Yet</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
                  Click below to add your first Instagram account. Instagram will open right inside your web dashboard where you can log in securely.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-pink-500/20 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Connect First Account</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {accounts.map((acc) => (
                  <AccountCard
                    key={acc.id}
                    account={acc}
                    lists={leadLists}
                    onOpenBrowser={(account) => setActiveBrowserAccount(account)}
                    onRefresh={loadData}
                    onDelete={handleDeleteAccount}
                    onEditSettings={(account) => setEditingAccount(account)}
                  />
                ))}

                {/* Add Another Account Card */}
                <button
                  onClick={() => setShowAddModal(true)}
                  className="rounded-3xl border-2 border-dashed border-slate-800 hover:border-pink-500/50 bg-slate-900/30 hover:bg-slate-900/60 p-6 flex flex-col items-center justify-center text-center transition group min-h-[300px] cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 group-hover:bg-pink-600/20 flex items-center justify-center text-slate-400 group-hover:text-pink-400 mb-3 transition shadow-inner">
                    <Plus className="w-7 h-7" />
                  </div>
                  <h4 className="font-extrabold text-slate-200 text-sm group-hover:text-white transition">
                    Connect Another Account
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
                    Assign a distinct lead list and run parallel cold outreach
                  </p>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Lead Lists Hub */}
        {activeTab === 'leads' && <LeadsManager />}

        {/* Tab 3: Unified Activity Logs */}
        {activeTab === 'logs' && <UnifiedLogs />}
      </main>

      {/* Add Account Modal */}
      {showAddModal && (
        <AddAccountModal
          lists={leadLists}
          onClose={() => setShowAddModal(false)}
          onAccountCreated={handleAccountCreated}
        />
      )}

      {/* Account Settings / Script Modal */}
      {editingAccount && (
        <AccountSettingsModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onUpdated={handleAccountUpdated}
        />
      )}

      {/* High-Speed Remote Browser Screencast Modal */}
      {activeBrowserAccount && (
        <RemoteBrowser
          account={activeBrowserAccount}
          onClose={() => setActiveBrowserAccount(null)}
          onAccountUpdated={handleAccountUpdated}
        />
      )}
    </div>
  );
}
