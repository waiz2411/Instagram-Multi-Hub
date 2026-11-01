const BASE_URL = '';

export const api = {
  // Accounts
  async getAccounts() {
    const res = await fetch(`${BASE_URL}/api/accounts`);
    return res.json();
  },

  async createAccount(data) {
    const res = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async updateAccount(id, data) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async assignList(id, listName) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/assign-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listName })
    });
    return res.json();
  },

  async startAccountOutreach(id) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/outreach/start`, {
      method: 'POST'
    });
    return res.json();
  },

  async pauseAccountOutreach(id) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/outreach/pause`, {
      method: 'POST'
    });
    return res.json();
  },

  async startWarmup(id) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/warmup/start`, {
      method: 'POST'
    });
    return res.json();
  },

  async pauseWarmup(id) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/warmup/pause`, {
      method: 'POST'
    });
    return res.json();
  },

  async toggleWarmup(id) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/warmup/toggle`, {
      method: 'POST'
    });
    return res.json();
  },

  // Reply & Message Alerts to Master Account (@sync_satisfy)
  async getAlertSettings() {
    const res = await fetch(`${BASE_URL}/api/accounts/alerts/settings`);
    return res.json();
  },

  async updateAlertSettings(data) {
    const res = await fetch(`${BASE_URL}/api/accounts/alerts/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async triggerInboxScan() {
    const res = await fetch(`${BASE_URL}/api/accounts/alerts/check`, {
      method: 'POST'
    });
    return res.json();
  },

  async openAccountSession(id, data = {}) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async importCookie(id, cookieData) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/import-cookie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(typeof cookieData === 'string' ? { cookie: cookieData } : cookieData)
    });
    return res.json();
  },

  async openNativeWindow(id) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/native-window`, {
      method: 'POST'
    });
    return res.json();
  },

  async closeAccountSession(id) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/close`, {
      method: 'POST'
    });
    return res.json();
  },

  async syncAccount(id) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}/sync`, {
      method: 'POST'
    });
    return res.json();
  },

  async deleteAccount(id) {
    const res = await fetch(`${BASE_URL}/api/accounts/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // Leads
  async getLeads(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE_URL}/api/leads?${query}`);
    return res.json();
  },

  async getLeadLists() {
    const res = await fetch(`${BASE_URL}/api/leads/lists`);
    return res.json();
  },

  async addLead(lead) {
    const res = await fetch(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead)
    });
    return res.json();
  },

  async updateLead(id, data) {
    const res = await fetch(`${BASE_URL}/api/leads/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async importLeads(data) {
    const res = await fetch(`${BASE_URL}/api/leads/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteLead(id) {
    const res = await fetch(`${BASE_URL}/api/leads/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // Campaigns
  async getCampaigns() {
    const res = await fetch(`${BASE_URL}/api/campaigns`);
    return res.json();
  },

  async createCampaign(campaign) {
    const res = await fetch(`${BASE_URL}/api/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaign)
    });
    return res.json();
  },

  async startCampaign(id) {
    const res = await fetch(`${BASE_URL}/api/campaigns/${id}/start`, {
      method: 'POST'
    });
    return res.json();
  },

  async pauseCampaign(id) {
    const res = await fetch(`${BASE_URL}/api/campaigns/${id}/pause`, {
      method: 'POST'
    });
    return res.json();
  },

  async previewTemplate(template, sampleLead) {
    const res = await fetch(`${BASE_URL}/api/campaigns/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, sampleLead })
    });
    return res.json();
  },

  async deleteCampaign(id) {
    const res = await fetch(`${BASE_URL}/api/campaigns/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // Logs & Stats
  async getLogs(limit = 100) {
    const res = await fetch(`${BASE_URL}/api/logs?limit=${limit}`);
    return res.json();
  },

  async getStats() {
    const res = await fetch(`${BASE_URL}/api/logs/stats`);
    return res.json();
  }
};
