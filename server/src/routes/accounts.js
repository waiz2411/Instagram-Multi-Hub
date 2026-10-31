import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';
import { browserManager } from '../browserManager.js';
import { outreachEngine } from '../outreachEngine.js';
import { warmupEngine } from '../warmupEngine.js';
import { inboxMonitor } from '../inboxMonitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROFILES_DIR = path.resolve(__dirname, '../../data/profiles');

const router = express.Router();

// List all accounts with real-time session and outreach status
router.get('/', (req, res) => {
  const accounts = db.getAccounts();
  const enriched = accounts.map(acc => {
    const session = browserManager.getSession(acc.id);
    const isWorkerActive = outreachEngine.activeAccountWorkers.has(acc.id);
    const isWarmupActive = warmupEngine.isWarmupActive(acc.id);
    return {
      ...acc,
      isSessionOpen: Boolean(session && session.isRunning),
      isWorkerActive,
      isWarmupActive
    };
  });
  res.json({ success: true, accounts: enriched });
});

// Create new account & fast-spawn isolated browser
router.post('/', async (req, res) => {
  try {
    const { username, proxyUrl, isMobile, assignedListName } = req.body;
    const accountId = uuidv4();

    const newAccount = {
      id: accountId,
      username: username ? username.trim().replace('@', '') : `account_${Date.now().toString(36)}`,
      fullName: '',
      profilePic: '',
      status: 'logging_in',
      proxyUrl: proxyUrl ? proxyUrl.trim() : null,
      isMobile: isMobile !== undefined ? Boolean(isMobile) : true,
      assignedListName: assignedListName ? assignedListName.trim() : 'General',
      outreachStatus: 'idle',
      currentAction: 'idle',
      currentActionDetails: '',
      lastSentAt: null,
      nextRunAt: null,
      template: '{Hi|Hello|Hey} {first_name}! Loved your profile. Would love to connect and share insights about {growth|content|marketing}.',
      dailyLimit: 30,
      sentToday: 0,
      totalSent: 0,
      minDelay: 25,
      maxDelay: 35,
      warmupEnabled: false,
      warmupStatus: 'idle',
      warmupCurrentAction: '',
      warmupStats: { postsViewed: 0, likesGiven: 0, commentsGiven: 0, lastActiveAt: null },
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    };

    db.addAccount(newAccount);

    // Launch browser asynchronously without blocking HTTP response
    browserManager.getOrCreateSession(newAccount, {
      isMobile: newAccount.isMobile
    }).catch(err => {
      console.error('[Accounts API] Browser spawn error:', err.message);
    });

    res.json({ success: true, account: newAccount });
  } catch (err) {
    console.error('[Accounts API] Error creating account:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Master Alert Settings (Replies & Incoming Messages)
router.get('/alerts/settings', (req, res) => {
  const settings = db.getAlertSettings();
  res.json({ success: true, settings });
});

// Update Master Alert Settings
router.post('/alerts/settings', (req, res) => {
  const updated = db.updateAlertSettings(req.body);
  res.json({ success: true, settings: updated });
});

// Trigger an immediate inbox scan across all connected accounts
router.post('/alerts/check', async (req, res) => {
  try {
    const result = await inboxMonitor.checkAllInboxes();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single account
router.get('/:id', (req, res) => {
  const account = db.getAccount(req.params.id);
  if (!account) return res.status(404).json({ success: false, error: 'Account not found' });
  const session = browserManager.getSession(account.id);
  const isWorkerActive = outreachEngine.activeAccountWorkers.has(account.id);
  const isWarmupActive = warmupEngine.isWarmupActive(account.id);
  res.json({
    success: true,
    account: {
      ...account,
      isSessionOpen: Boolean(session && session.isRunning),
      isWorkerActive,
      isWarmupActive
    }
  });
});

// Update account settings / list assignment / template
router.put('/:id', (req, res) => {
  const updated = db.updateAccount(req.params.id, req.body);
  if (!updated) return res.status(404).json({ success: false, error: 'Account not found' });
  res.json({ success: true, account: updated });
});

// Assign lead list to account
router.post('/:id/assign-list', (req, res) => {
  const { listName } = req.body;
  if (!listName) return res.status(400).json({ success: false, error: 'listName required' });
  const updated = db.updateAccount(req.params.id, { assignedListName: listName.trim() });
  if (!updated) return res.status(404).json({ success: false, error: 'Account not found' });
  res.json({ success: true, account: updated });
});

// Start account outreach
router.post('/:id/outreach/start', async (req, res) => {
  try {
    await outreachEngine.startAccountOutreach(req.params.id);
    const updated = db.getAccount(req.params.id);
    res.json({ success: true, account: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pause account outreach
router.post('/:id/outreach/pause', (req, res) => {
  try {
    outreachEngine.pauseAccountOutreach(req.params.id);
    const updated = db.getAccount(req.params.id);
    res.json({ success: true, account: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Warmup Mode
router.post('/:id/warmup/start', async (req, res) => {
  try {
    await warmupEngine.startWarmup(req.params.id);
    const updated = db.getAccount(req.params.id);
    res.json({ success: true, account: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pause Warmup Mode
router.post('/:id/warmup/pause', (req, res) => {
  try {
    warmupEngine.pauseWarmup(req.params.id);
    const updated = db.getAccount(req.params.id);
    res.json({ success: true, account: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle Warmup Mode
router.post('/:id/warmup/toggle', async (req, res) => {
  try {
    const isCurrentlyActive = warmupEngine.isWarmupActive(req.params.id);
    if (isCurrentlyActive) {
      warmupEngine.pauseWarmup(req.params.id);
    } else {
      await warmupEngine.startWarmup(req.params.id);
    }
    const updated = db.getAccount(req.params.id);
    res.json({ success: true, account: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Open / launch embedded browser session
router.post('/:id/open', async (req, res) => {
  try {
    const account = db.getAccount(req.params.id);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    const session = await browserManager.getOrCreateSession(account, {
      isMobile: req.body.isMobile ?? account.isMobile
    });

    res.json({ success: true, isSessionOpen: session.isRunning, url: session.currentUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Open real native desktop browser window (100% zero-lag native window)
router.post('/:id/native-window', async (req, res) => {
  try {
    const account = db.getAccount(req.params.id);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    await browserManager.openNativeWindow(account.id);
    res.json({ success: true, message: 'Native desktop browser opened' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Close browser session
router.post('/:id/close', async (req, res) => {
  try {
    await browserManager.closeSession(req.params.id);
    res.json({ success: true, message: 'Session closed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync / detect session
router.post('/:id/sync', async (req, res) => {
  try {
    const account = db.getAccount(req.params.id);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    const session = await browserManager.getOrCreateSession(account);
    await session.detectSessionState();

    const freshAccount = db.getAccount(account.id);
    res.json({ success: true, account: freshAccount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete account
router.delete('/:id', async (req, res) => {
  try {
    const accountId = req.params.id;
    warmupEngine.pauseWarmup(accountId);
    outreachEngine.pauseAccountOutreach(accountId);
    await browserManager.closeSession(accountId);

    const profileDir = path.join(PROFILES_DIR, accountId);
    if (fs.existsSync(profileDir)) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`[Accounts API] Could not delete directory:`, e.message);
      }
    }

    db.deleteAccount(accountId);
    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
