import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.resolve(__dirname, '../data/db.json');

const defaultData = {
  accounts: [],
  leads: [],
  campaigns: [],
  logs: [],
  settings: {
    defaultViewport: { width: 1280, height: 800 },
    mobileViewport: { width: 430, height: 932 },
    defaultMinDelay: 25, // in minutes
    defaultMaxDelay: 35, // in minutes
    dailyDmLimit: 30,
    lastResetDate: new Date().toISOString().slice(0, 10),
    alerts: {
      enabled: true,
      recipientUsername: 'sync_satisfy',
      alertedKeys: []
    }
  }
};

class Database {
  constructor() {
    this.data = defaultData;
    this.init();
  }

  init() {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = { ...defaultData, ...JSON.parse(raw) };
      } else {
        this.save();
      }
      this.checkDailyReset();
    } catch (err) {
      console.error('[DB] Failed to load database, using defaults:', err.message);
      this.data = defaultData;
    }
  }

  checkDailyReset() {
    const today = new Date().toISOString().slice(0, 10);
    if (!this.data.settings) this.data.settings = defaultData.settings;
    if (this.data.settings.lastResetDate !== today) {
      this.data.settings.lastResetDate = today;
      // Reset sentToday on all accounts
      for (const acc of this.data.accounts) {
        acc.sentToday = 0;
        if (acc.outreachStatus === 'cooldown') {
          acc.outreachStatus = 'idle';
        }
      }
      this.save();
    }
  }

  save() {
    try {
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('[DB] Error saving database:', err.message);
    }
  }

  // --- Accounts ---
  getAccounts() {
    this.checkDailyReset();
    return this.data.accounts.map(acc => ({
      assignedListName: 'General',
      outreachStatus: 'idle',
      currentAction: 'idle', // 'idle' | 'dispatching' | 'waiting'
      currentActionDetails: '',
      lastSentAt: null,
      nextRunAt: null,
      template: '{Hi|Hello|Hey} {first_name}! Loved your profile. Would love to connect!',
      dailyLimit: 30,
      sentToday: 0,
      totalSent: 0,
      minDelay: 25, // 25 minutes default
      maxDelay: 35, // 35 minutes default
      warmupEnabled: false,
      warmupStatus: 'idle', // 'idle' | 'running' | 'paused' | 'cooldown'
      warmupCurrentAction: '',
      warmupStats: { postsViewed: 0, likesGiven: 0, commentsGiven: 0, lastActiveAt: null },
      ...acc
    }));
  }

  getAccount(id) {
    return this.data.accounts.find(a => a.id === id);
  }

  addAccount(account) {
    const enriched = {
      assignedListName: 'General',
      outreachStatus: 'idle', // 'idle' | 'running' | 'paused' | 'completed' | 'cooldown'
      currentAction: 'idle',
      currentActionDetails: '',
      lastSentAt: null,
      nextRunAt: null,
      template: '{Hi|Hello|Hey} {first_name}! Loved your profile. Would love to connect and share insights about {growth|content|marketing}.',
      dailyLimit: 30,
      sentToday: 0,
      totalSent: 0,
      minDelay: 25, // 25 min
      maxDelay: 35, // 35 min
      warmupEnabled: false,
      warmupStatus: 'idle',
      warmupCurrentAction: '',
      warmupStats: { postsViewed: 0, likesGiven: 0, commentsGiven: 0, lastActiveAt: null },
      lastOutreachAt: null,
      ...account
    };
    this.data.accounts.push(enriched);
    this.save();
    return enriched;
  }

  updateAccount(id, updates) {
    const idx = this.data.accounts.findIndex(a => a.id === id);
    if (idx !== -1) {
      this.data.accounts[idx] = { ...this.data.accounts[idx], ...updates, updatedAt: new Date().toISOString() };
      this.save();
      return this.data.accounts[idx];
    }
    return null;
  }

  deleteAccount(id) {
    const initialLen = this.data.accounts.length;
    this.data.accounts = this.data.accounts.filter(a => a.id !== id);
    if (this.data.accounts.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // --- Leads ---
  getLeads(filter = {}) {
    let list = this.data.leads;
    if (filter.listName) {
      list = list.filter(l => l.listName.toLowerCase() === filter.listName.toLowerCase());
    }
    if (filter.status) {
      list = list.filter(l => l.status === filter.status);
    }
    return list;
  }

  addLead(lead) {
    this.data.leads.push(lead);
    this.save();
    return lead;
  }

  addLeadsBulk(leads) {
    this.data.leads.push(...leads);
    this.save();
    return leads;
  }

  updateLead(id, updates) {
    const idx = this.data.leads.findIndex(l => l.id === id);
    if (idx !== -1) {
      this.data.leads[idx] = { ...this.data.leads[idx], ...updates };
      this.save();
      return this.data.leads[idx];
    }
    return null;
  }

  deleteLead(id) {
    this.data.leads = this.data.leads.filter(l => l.id !== id);
    this.save();
    return true;
  }

  clearLeadsByList(listName) {
    this.data.leads = this.data.leads.filter(l => l.listName !== listName);
    this.save();
  }

  // --- Campaigns ---
  getCampaigns() {
    return this.data.campaigns;
  }

  getCampaign(id) {
    return this.data.campaigns.find(c => c.id === id);
  }

  addCampaign(campaign) {
    this.data.campaigns.push(campaign);
    this.save();
    return campaign;
  }

  updateCampaign(id, updates) {
    const idx = this.data.campaigns.findIndex(c => c.id === id);
    if (idx !== -1) {
      this.data.campaigns[idx] = { ...this.data.campaigns[idx], ...updates };
      this.save();
      return this.data.campaigns[idx];
    }
    return null;
  }

  deleteCampaign(id) {
    this.data.campaigns = this.data.campaigns.filter(c => c.id !== id);
    this.save();
    return true;
  }

  // --- Alert Settings for Incoming Replies ---
  getAlertSettings() {
    if (!this.data.settings) this.data.settings = defaultData.settings;
    if (!this.data.settings.alerts) {
      this.data.settings.alerts = {
        enabled: true,
        recipientUsername: 'sync_satisfy',
        alertedKeys: []
      };
    }
    return this.data.settings.alerts;
  }

  isMessageAlerted(key) {
    const alerts = this.getAlertSettings();
    return Array.isArray(alerts.alertedKeys) && alerts.alertedKeys.includes(key);
  }

  markMessageAlerted(key) {
    const alerts = this.getAlertSettings();
    if (!Array.isArray(alerts.alertedKeys)) {
      alerts.alertedKeys = [];
    }
    if (!alerts.alertedKeys.includes(key)) {
      alerts.alertedKeys.push(key);
      if (alerts.alertedKeys.length > 2000) {
        alerts.alertedKeys = alerts.alertedKeys.slice(-2000);
      }
      this.save();
    }
  }

  updateAlertSettings(updates) {
    this.getAlertSettings();
    this.data.settings.alerts = { ...this.data.settings.alerts, ...updates };
    this.save();
    return this.data.settings.alerts;
  }

  // --- Logs ---
  getLogs(limit = 100) {
    return this.data.logs.slice(-limit).reverse();
  }

  addLog(log) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      ...log
    };
    this.data.logs.push(entry);
    if (this.data.logs.length > 1000) {
      this.data.logs = this.data.logs.slice(-1000);
    }
    this.save();
    return entry;
  }
}

export const db = new Database();
