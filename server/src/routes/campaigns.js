import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { outreachEngine, personalizeMessage, parseSpintax } from '../outreachEngine.js';

const router = express.Router();

// List all campaigns
router.get('/', (req, res) => {
  const campaigns = db.getCampaigns();
  const accounts = db.getAccounts();
  const leads = db.getLeads();

  const enriched = campaigns.map(c => {
    const acc = accounts.find(a => a.id === c.accountId);
    const targetLeads = leads.filter(l => l.listName.toLowerCase() === (c.targetListName || '').toLowerCase());
    const pendingLeads = targetLeads.filter(l => l.status === 'pending');

    return {
      ...c,
      accountUsername: acc ? acc.username : 'Unknown Account',
      accountStatus: acc ? acc.status : 'disconnected',
      totalLeads: targetLeads.length,
      pendingLeads: pendingLeads.length,
      isWorkerActive: outreachEngine.activeWorkers.has(c.id)
    };
  });

  res.json({ success: true, campaigns: enriched });
});

// Create campaign
router.post('/', (req, res) => {
  try {
    const { name, accountId, targetListName, template, dailyLimit, minDelay, maxDelay } = req.body;

    if (!name || !accountId || !targetListName || !template) {
      return res.status(400).json({ success: false, error: 'Missing required campaign fields' });
    }

    const campaign = {
      id: uuidv4(),
      name: name.trim(),
      accountId,
      targetListName: targetListName.trim(),
      template: template.trim(),
      dailyLimit: Number(dailyLimit) || 30,
      minDelay: Number(minDelay) || 45,
      maxDelay: Number(maxDelay) || 90,
      status: 'idle',
      sentCount: 0,
      failedCount: 0,
      createdAt: new Date().toISOString()
    };

    db.addCampaign(campaign);
    res.json({ success: true, campaign });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start campaign
router.post('/:id/start', async (req, res) => {
  try {
    await outreachEngine.startCampaign(req.params.id);
    const updated = db.getCampaign(req.params.id);
    res.json({ success: true, campaign: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pause campaign
router.post('/:id/pause', (req, res) => {
  try {
    outreachEngine.pauseCampaign(req.params.id);
    const updated = db.getCampaign(req.params.id);
    res.json({ success: true, campaign: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Test / Preview template
router.post('/preview', (req, res) => {
  const { template, sampleLead } = req.body;
  const lead = sampleLead || {
    username: 'alex_fitness',
    fullName: 'Alex Johnson'
  };

  const preview = personalizeMessage(template || '', lead);
  res.json({ success: true, preview });
});

// Delete campaign
router.delete('/:id', (req, res) => {
  outreachEngine.pauseCampaign(req.params.id);
  db.deleteCampaign(req.params.id);
  res.json({ success: true, message: 'Campaign deleted' });
});

export default router;
