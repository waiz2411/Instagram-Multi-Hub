import express from 'express';
import { db } from '../db.js';
import { outreachEngine } from '../outreachEngine.js';
import { warmupEngine } from '../warmupEngine.js';
import { browserManager } from '../browserManager.js';

const router = express.Router();

// Get full server state for client-side local backup
router.get('/state', (req, res) => {
  try {
    const accounts = db.getAccounts();
    const leads = db.getLeads();
    const campaigns = db.data.campaigns || [];
    const settings = db.data.settings || {};
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      accounts,
      leads,
      campaigns,
      settings
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restore state from client-side local backup (e.g. after container restart / redeploy)
router.post('/restore', async (req, res) => {
  try {
    const { accounts, leads, settings } = req.body;
    let restoredAccounts = 0;
    let restoredLeads = 0;

    // 1. Restore / Merge Accounts
    if (Array.isArray(accounts)) {
      for (const incomingAcc of accounts) {
        if (!incomingAcc.id) continue;
        const existing = db.getAccount(incomingAcc.id);
        if (existing) {
          // Merge preserving saved cookies and statuses
          const updates = {
            ...incomingAcc,
            // Prefer incoming sessionCookies if existing lost them
            sessionCookies: incomingAcc.sessionCookies?.length ? incomingAcc.sessionCookies : existing.sessionCookies
          };
          db.updateAccount(incomingAcc.id, updates);
        } else {
          db.addAccount(incomingAcc);
        }
        restoredAccounts++;

        // If account has sessionCookies, inject them into browser session immediately
        if (incomingAcc.sessionCookies && incomingAcc.sessionCookies.length > 0) {
          try {
            const session = await browserManager.getOrCreateSession(incomingAcc, { isMobile: Boolean(incomingAcc.isMobile) });
            await session.context.addCookies(incomingAcc.sessionCookies);
            db.updateAccount(incomingAcc.id, { status: 'connected' });
          } catch (e) {
            console.warn(`[Sync] Notice injecting cookies for @${incomingAcc.username}:`, e.message);
          }
        }

        // Resume outreach if was running
        if (incomingAcc.outreachStatus === 'running') {
          outreachEngine.startAccountOutreach(incomingAcc.id).catch(() => {});
        }
        // Resume warmup if was running
        if (incomingAcc.warmupEnabled) {
          warmupEngine.startWarmup(incomingAcc.id).catch(() => {});
        }
      }
    }

    // 2. Restore / Merge Leads
    if (Array.isArray(leads)) {
      const existingLeads = db.getLeads();
      const existingMap = new Map(existingLeads.map(l => [l.username.toLowerCase(), l]));

      for (const incomingLead of leads) {
        if (!incomingLead.username) continue;
        const cleanUser = incomingLead.username.toLowerCase().replace('@', '');
        const existing = existingMap.get(cleanUser);

        if (existing) {
          // If incoming was contacted, preserve contacted status
          if (incomingLead.status === 'contacted' && existing.status !== 'contacted') {
            db.updateLead(existing.id, {
              status: 'contacted',
              contactedAt: incomingLead.contactedAt || new Date().toISOString()
            });
            restoredLeads++;
          }
        } else {
          db.addLead({
            id: incomingLead.id,
            username: cleanUser,
            fullName: incomingLead.fullName || '',
            profileUrl: incomingLead.profileUrl || `https://www.instagram.com/${cleanUser}/`,
            listName: incomingLead.listName || 'General',
            status: incomingLead.status || 'pending',
            notes: incomingLead.notes || '',
            addedAt: incomingLead.addedAt || new Date().toISOString(),
            contactedAt: incomingLead.contactedAt || null
          });
          restoredLeads++;
        }
      }
    }

    // 3. Restore Settings
    if (settings && typeof settings === 'object') {
      if (settings.alerts) db.updateAlertSettings(settings.alerts);
    }

    console.log(`[Sync] ✅ Successfully synced backup: ${restoredAccounts} accounts, ${restoredLeads} leads updated.`);
    res.json({
      success: true,
      message: `State synchronized: ${restoredAccounts} accounts, ${restoredLeads} leads restored.`,
      accounts: db.getAccounts(),
      leads: db.getLeads()
    });
  } catch (err) {
    console.error('[Sync] Error restoring state:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
