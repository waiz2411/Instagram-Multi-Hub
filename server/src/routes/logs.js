import express from 'express';
import { db } from '../db.js';

const router = express.Router();

// Get recent logs
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 100;
  const logs = db.getLogs(limit);
  res.json({ success: true, logs });
});

// Dashboard stats summary
router.get('/stats', (req, res) => {
  const accounts = db.getAccounts();
  const leads = db.getLeads();
  const campaigns = db.getCampaigns();
  const logs = db.getLogs(500);

  // Calculate DMs sent today
  const todayStr = new Date().toISOString().slice(0, 10);
  const sentToday = logs.filter(
    l => l.action === 'send_dm' && l.status === 'success' && l.timestamp && l.timestamp.startsWith(todayStr)
  ).length;

  const connectedAccounts = accounts.filter(a => a.status === 'connected').length;
  const runningCampaigns = campaigns.filter(c => c.status === 'running').length;

  res.json({
    success: true,
    stats: {
      totalAccounts: accounts.length,
      connectedAccounts,
      totalLeads: leads.length,
      contactedLeads: leads.filter(l => l.status === 'contacted').length,
      sentToday,
      activeCampaigns: runningCampaigns
    }
  });
});

export default router;
