import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Upload,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Folder,
  Layers,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { api } from '../api';

export default function LeadsManager() {
  const [leads, setLeads] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Single add form
  const [singleUsername, setSingleUsername] = useState('');
  const [singleFullName, setSingleFullName] = useState('');
  const [singleListName, setSingleListName] = useState('');

  // Bulk import form
  const [bulkText, setBulkText] = useState('');
  const [bulkListName, setBulkListName] = useState('');

  const loadData = async () => {
    try {
      const [leadsRes, listsRes] = await Promise.all([
        api.getLeads({ listName: selectedList, status: statusFilter }),
        api.getLeadLists()
      ]);
      if (leadsRes.success) setLeads(leadsRes.leads);
      if (listsRes.success) setLists(listsRes.lists);
    } catch (err) {
      console.error('Error loading leads:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedList, statusFilter]);

  const handleAddSingle = async (e) => {
    e.preventDefault();
    if (!singleUsername) return;
    try {
      await api.addLead({
        username: singleUsername,
        fullName: singleFullName,
        listName: singleListName || 'General'
      });
      setSingleUsername('');
      setSingleFullName('');
      setShowAddModal(false);
      loadData();
    } catch (err) {
      alert('Failed to add lead: ' + err.message);
    }
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    if (!bulkText) return;
    try {
      await api.importLeads({
        textData: bulkText,
        listName: bulkListName || 'General'
      });
      setBulkText('');
      setShowBulkModal(false);
      loadData();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };

  const handleDeleteLead = async (id) => {
    try {
      await api.deleteLead(id);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      loadData();
    } catch (err) {
      alert('Failed to delete lead: ' + err.message);
    }
  };

  const handleResetLead = async (id) => {
    try {
      await api.updateLead(id, { status: 'pending', notes: '' });
      loadData();
    } catch (err) {
      alert('Failed to reset lead: ' + err.message);
    }
  };

  const filteredLeads = leads.filter(
    (l) =>
      l.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.fullName && l.fullName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-pink-500" />
            Lead Target Lists Hub
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Segment your prospects into distinct lists and assign them to specific Instagram outreach accounts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setBulkListName(selectedList || 'Cold Leads');
              setShowBulkModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <Upload className="w-4 h-4 text-purple-400" />
            <span>Bulk Import Leads</span>
          </button>

          <button
            onClick={() => {
              setSingleListName(selectedList || 'General');
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-pink-500/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Single Lead</span>
          </button>
        </div>
      </div>

      {/* Target Lists Cards Grid */}
      {lists.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
          <div
            onClick={() => setSelectedList('')}
            className={`p-4 rounded-2xl border transition cursor-pointer ${
              selectedList === ''
                ? 'bg-pink-500/10 border-pink-500/40 text-white'
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span>All Lists</span>
              <Layers className="w-4 h-4 text-pink-400" />
            </div>
            <p className="text-xl font-extrabold text-white">
              {lists.reduce((acc, l) => acc + l.total, 0)} <span className="text-xs font-normal text-slate-500">leads</span>
            </p>
          </div>

          {lists.map((l) => (
            <div
              key={l.name}
              onClick={() => setSelectedList(l.name === selectedList ? '' : l.name)}
              className={`p-4 rounded-2xl border transition cursor-pointer ${
                selectedList === l.name
                  ? 'bg-purple-500/15 border-purple-500/40 text-white shadow-lg shadow-purple-500/5'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1 truncate">
                <span className="truncate">{l.name}</span>
                <Folder className="w-4 h-4 text-purple-400 shrink-0" />
              </div>
              <div className="flex items-baseline justify-between">
                <p className="text-xl font-extrabold text-white">{l.total}</p>
                <span className="text-[11px] text-emerald-400 font-semibold">{l.pending} pending</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by username or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-pink-500 transition"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-pink-500 transition cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="contacted">Contacted</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="text-xs text-slate-400">
          Showing <strong>{filteredLeads.length}</strong> leads
          {selectedList && <span> in list <strong>"{selectedList}"</strong></span>}
        </div>
      </div>

      {/* Leads Table */}
      <div className="rounded-3xl bg-slate-900/60 border border-slate-800/80 overflow-hidden shadow-xl backdrop-blur-md">
        {filteredLeads.length === 0 ? (
          <div className="p-14 text-center text-slate-500">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30 text-pink-400" />
            <p className="text-sm font-bold text-slate-300">No leads found in this list</p>
            <p className="text-xs text-slate-500 mt-1">Import or add leads to populate this list.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 border-b border-slate-800 uppercase font-bold text-[10px] text-slate-400 tracking-wider">
                <tr>
                  <th className="py-3.5 px-5">Target Instagram Profile</th>
                  <th className="py-3.5 px-4">Assigned List</th>
                  <th className="py-3.5 px-4">Cold Outreach Status</th>
                  <th className="py-3.5 px-4">Added Date</th>
                  <th className="py-3.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500/20 via-pink-500/20 to-purple-500/20 border border-pink-500/30 flex items-center justify-center font-bold text-pink-300">
                          {lead.username[0]?.toUpperCase()}
                        </div>
                        <div>
                          <a
                            href={lead.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-slate-100 hover:text-pink-400 flex items-center gap-1.5"
                          >
                            @{lead.username}
                            <ExternalLink className="w-3 h-3 opacity-50" />
                          </a>
                          {lead.fullName && (
                            <span className="text-[11px] text-slate-400">{lead.fullName}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-semibold text-[11px] border border-slate-700/60">
                        {lead.listName}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {lead.status === 'contacted' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Contacted
                        </span>
                      ) : lead.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20" title={lead.notes}>
                          <AlertCircle className="w-3 h-3" /> Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(lead.addedAt).toLocaleDateString()}
                    </td>

                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {lead.status !== 'pending' && (
                          <button
                            onClick={() => handleResetLead(lead.id)}
                            title="Reset lead back to Pending"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteLead(lead.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Single Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">Add Single Lead</h3>
            <form onSubmit={handleAddSingle} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Instagram Username *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. fitness_coach"
                  value={singleUsername}
                  onChange={(e) => setSingleUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={singleFullName}
                  onChange={(e) => setSingleFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Target List Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Miami Coaches"
                  value={singleListName}
                  onChange={(e) => setSingleListName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-md shadow-pink-500/20"
                >
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1.5 flex items-center gap-2">
              <Upload className="w-5 h-5 text-purple-400" />
              Bulk Import Leads
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Paste usernames or comma-separated rows (`username, Full Name`), one per line.
            </p>

            <form onSubmit={handleBulkImport} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Assign to Lead List
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Miami Coaches"
                  value={bulkListName}
                  onChange={(e) => setBulkListName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Usernames (One per line)
                </label>
                <textarea
                  required
                  rows={8}
                  placeholder={`cristiano\nleomessi, Lionel Messi\ntherock, Dwayne Johnson\nzuck`}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-pink-500/20"
                >
                  Import Leads
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
