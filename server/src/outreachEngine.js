import { db } from './db.js';
import { browserManager } from './browserManager.js';

// Spintax parser: replaces {option1|option2|option3} with a random option
export function parseSpintax(text) {
  if (!text) return '';
  const spintaxRegex = /\{([^{}]+)\}/g;
  let result = text;
  while (spintaxRegex.test(result)) {
    result = result.replace(spintaxRegex, (match, choices) => {
      const options = choices.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
  }
  return result;
}

// Personalize message with variables
export function personalizeMessage(template, lead) {
  let message = parseSpintax(template);
  const fullName = lead.fullName || lead.username || '';
  const firstName = fullName.split(' ')[0] || lead.username || '';

  message = message
    .replace(/{username}/gi, lead.username || '')
    .replace(/{first_name}/gi, firstName)
    .replace(/{name}/gi, firstName)
    .replace(/{full_name}/gi, fullName);

  return message;
}

// Resilient click helper that auto-heals against React virtual DOM re-renders and detached elementHandles
async function safeClick(page, selector, timeout = 7000) {
  const locator = page.locator(selector).first();
  try {
    await locator.waitFor({ state: 'visible', timeout });
    await locator.click({ timeout: 5000 });
    return true;
  } catch (err) {
    // Fallback 1: Direct DOM click inside browser context (100% immune to Playwright ElementHandle detachment)
    const domClicked = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        el.click();
        return true;
      }
      return false;
    }, selector).catch(() => false);

    if (domClicked) return true;

    // Fallback 2: Forced click with locator
    try {
      await page.waitForTimeout(600);
      await page.locator(selector).first().click({ timeout: 4000, force: true });
      return true;
    } catch (finalErr) {
      return false;
    }
  }
}

class OutreachEngine {
  constructor() {
    this.activeAccountWorkers = new Map(); // accountId -> { isRunning: bool, timeoutId: timer }
    this.activeWorkers = new Map(); // campaignId -> { isRunning: bool, timeoutId: timer }
  }

  // --- Account-Direct Outreach Loop ---
  async startAccountOutreach(accountId) {
    if (this.activeAccountWorkers.has(accountId)) {
      console.log(`[Outreach] Account @${accountId} outreach is already active.`);
      return;
    }

    const account = db.getAccount(accountId);
    if (!account) throw new Error('Account not found');

    if (!account.assignedListName) {
      throw new Error('Please assign a Lead List to this account first.');
    }

    db.updateAccount(accountId, {
      outreachStatus: 'running',
      currentAction: 'dispatching',
      currentActionDetails: 'Preparing cold outreach...'
    });
    this.activeAccountWorkers.set(accountId, { isRunning: true });

    console.log(`[Outreach] Starting cold outreach for @${account.username || account.id} on list "${account.assignedListName}"`);
    this.runAccountLoop(accountId).catch(err => {
      console.error(`[Outreach] Account loop error for @${account.username}:`, err);
      this.pauseAccountOutreach(accountId);
    });
  }

  pauseAccountOutreach(accountId) {
    const worker = this.activeAccountWorkers.get(accountId);
    if (worker) {
      worker.isRunning = false;
      if (worker.timeoutId) clearTimeout(worker.timeoutId);
      this.activeAccountWorkers.delete(accountId);
    }
    db.updateAccount(accountId, {
      outreachStatus: 'paused',
      currentAction: 'idle',
      currentActionDetails: '',
      nextRunAt: null
    });
    console.log(`[Outreach] Paused outreach for account ${accountId}`);
  }

  async runAccountLoop(accountId) {
    const worker = this.activeAccountWorkers.get(accountId);
    if (!worker || !worker.isRunning) return;

    const account = db.getAccount(accountId);
    if (!account || account.outreachStatus !== 'running') {
      this.pauseAccountOutreach(accountId);
      return;
    }

    // Check daily limit
    const dailyLimit = account.dailyLimit || 30;
    if ((account.sentToday || 0) >= dailyLimit) {
      console.log(`[Outreach] Account @${account.username} reached daily limit (${dailyLimit}). Entering cooldown.`);
      db.updateAccount(accountId, {
        outreachStatus: 'cooldown',
        currentAction: 'idle',
        currentActionDetails: 'Daily DM limit reached. Cooling down until tomorrow.',
        nextRunAt: null
      });
      this.pauseAccountOutreach(accountId);
      return;
    }

    // Get next pending lead for this account's assigned list
    const leads = db.getLeads({ listName: account.assignedListName, status: 'pending' });
    if (leads.length === 0) {
      console.log(`[Outreach] No more pending leads for list "${account.assignedListName}".`);
      db.updateAccount(accountId, {
        outreachStatus: 'completed',
        currentAction: 'idle',
        currentActionDetails: 'All leads in list contacted.',
        nextRunAt: null
      });
      this.pauseAccountOutreach(accountId);
      return;
    }

    const lead = leads[0];
    const template = account.template || '{Hi|Hey|Hello} {first_name}! Loved your profile.';
    const messageToSend = personalizeMessage(template, lead);

    // Update account status to prominently display "Dispatching message"
    db.updateAccount(accountId, {
      currentAction: 'dispatching',
      currentActionDetails: `Sending DM to @${lead.username}...`
    });

    console.log(`[Outreach] Account @${account.username || account.id} -> Sending DM to @${lead.username}...`);

    let success = false;
    let errorMsg = null;

    try {
      success = await this.sendInstagramDirectMessage(account, lead.username, messageToSend);
    } catch (err) {
      errorMsg = err.message;
      console.error(`[Outreach] Failed to send DM to @${lead.username}:`, err.message);
    }

    const nowIso = new Date().toISOString();

    if (success) {
      db.updateLead(lead.id, { status: 'contacted', contactedAt: nowIso });
      db.updateAccount(accountId, {
        sentToday: (account.sentToday || 0) + 1,
        totalSent: (account.totalSent || 0) + 1,
        lastOutreachAt: nowIso,
        lastSentAt: nowIso
      });
      db.addLog({
        accountId: account.id,
        targetUsername: lead.username,
        action: 'send_dm',
        status: 'success',
        details: `Sent DM: "${messageToSend.substring(0, 45)}..."`
      });
    } else {
      db.updateLead(lead.id, { status: 'failed', notes: errorMsg });
      db.addLog({
        accountId: account.id,
        targetUsername: lead.username,
        action: 'send_dm',
        status: 'failed',
        details: errorMsg || 'Unknown error'
      });
    }

    // Calculate randomized human delay: 25 to 35 minutes by default
    const minDelayMinutes = Number(account.minDelay) > 0 ? Number(account.minDelay) : 25;
    const maxDelayMinutes = Number(account.maxDelay) >= minDelayMinutes ? Number(account.maxDelay) : 35;
    // Humanized randomized interval between min and max minutes
    const randomMinutes = Math.random() * (maxDelayMinutes - minDelayMinutes) + minDelayMinutes;
    const delayMs = Math.round(randomMinutes * 60 * 1000);
    const nextRunAt = new Date(Date.now() + delayMs).toISOString();

    db.updateAccount(accountId, {
      currentAction: 'waiting',
      currentActionDetails: `Waiting ~${Math.round(randomMinutes)}m before next DM`,
      nextRunAt
    });

    console.log(`[Outreach] Waiting ${Math.round(delayMs / 60000)}m (next run at ${nextRunAt}) for @${account.username}...`);

    worker.timeoutId = setTimeout(() => {
      this.runAccountLoop(accountId);
    }, delayMs);
  }

  // --- Instagram DM Automation Actions ---
  async sendInstagramDirectMessage(account, targetUsername, message) {
    const session = await browserManager.getOrCreateSession(account);
    const page = session.page;
    if (!page) throw new Error('Browser page not available');

    // 0. Verify sender session
    const cookies = await session.context.cookies(['https://www.instagram.com']);
    const sessionCookie = cookies.find(c => c.name === 'sessionid');
    if (!sessionCookie || !sessionCookie.value) {
      db.updateAccount(account.id, { status: 'needs_login' });
      throw new Error(
        `Account @${account.username || account.id} is NOT logged into Instagram. Please open browser and log in first.`
      );
    }

    const cleanUsername = targetUsername.replace('@', '').trim();
    const profileUrl = `https://www.instagram.com/${cleanUsername}/`;
    console.log(`[Outreach] Opening target profile: ${profileUrl}`);

    // 1. Navigate to user profile
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3000);

    // Dismiss any cookie / app banner
    await safeClick(
      page,
      'button:has-text("Not Now"), button:has-text("Decline"), button:has-text("Cancel")',
      2500
    );

    // 2. Look for Message button on profile
    const messageBtnSelector =
      'header button:has-text("Message"), header div[role="button"]:has-text("Message"), button:has-text("Message"), div[role="button"]:has-text("Message"), a[href*="/direct/t/"]';

    let hasMessageBtn = false;
    try {
      await page.locator(messageBtnSelector).first().waitFor({ state: 'visible', timeout: 6000 });
      hasMessageBtn = true;
    } catch (e) {
      hasMessageBtn = false;
    }

    if (hasMessageBtn) {
      console.log(`[Outreach] Found Message button on @${cleanUsername}'s profile. Clicking...`);
      await safeClick(page, messageBtnSelector, 6000);
      await page.waitForTimeout(3000);
    } else {
      console.log(`[Outreach] Message button not on profile. Navigating to Direct Inbox compose...`);
      await page.goto('https://www.instagram.com/direct/new/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(2500);

      // Dismiss modal if present
      await safeClick(page, 'button:has-text("Not Now")', 2000);

      // Find recipient search input
      const searchInputSelector = 'input[name="queryBox"], input[placeholder*="Search"]';
      await page.locator(searchInputSelector).first().waitFor({ state: 'visible', timeout: 10000 });
      await safeClick(page, searchInputSelector, 3000);
      await page.locator(searchInputSelector).first().fill('');
      await page.locator(searchInputSelector).first().type(cleanUsername, { delay: 50 });
      await page.waitForTimeout(2500);

      // Select target user from search results list
      const userResultSelector = `span:has-text("${cleanUsername}"), div[role="button"]:has-text("${cleanUsername}"), label:has-text("${cleanUsername}"), input[type="checkbox"]`;
      await safeClick(page, userResultSelector, 8000);
      await page.waitForTimeout(1000);

      // Click "Chat" or "Next" button in header
      const nextBtnSelector =
        'div[role="button"]:has-text("Next"), button:has-text("Next"), div[role="button"]:has-text("Chat"), button:has-text("Chat")';
      await safeClick(page, nextBtnSelector, 6000);
      await page.waitForTimeout(2500);
    }

    // Dismiss notifications prompt if it pops up after opening chat
    await safeClick(page, 'button:has-text("Not Now"), div[role="button"]:has-text("Not Now")', 2000);

    // 3. Wait for the message input box to mount (contenteditable Lexical editor or textarea)
    console.log(`[Outreach] Waiting for message input box to mount for @${cleanUsername}...`);
    const messageBoxSelector =
      'div[contenteditable="true"][role="textbox"], div[role="textbox"], textarea[placeholder*="Message"], div[contenteditable="true"]';

    const inputLocator = page.locator(messageBoxSelector).first();
    try {
      await inputLocator.waitFor({ state: 'visible', timeout: 15000 });
    } catch (e) {
      throw new Error(`Could not locate message input box for @${cleanUsername}. Check if user allows DMs from non-followers.`);
    }

    // Safely focus and click the message box
    await safeClick(page, messageBoxSelector, 5000);
    await page.waitForTimeout(500);

    // Natural human typing simulation
    console.log(`[Outreach] Typing personalized message...`);
    await page.keyboard.type(message, { delay: Math.floor(Math.random() * 25) + 30 });
    await page.waitForTimeout(800);

    // Send via Enter key
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);

    // Also look for and click explicit "Send" button if still present
    await safeClick(page, 'button:has-text("Send"), div[role="button"]:has-text("Send")', 2000);

    await page.waitForTimeout(2000);
    console.log(`[Outreach] Successfully sent DM to @${cleanUsername}`);
    return true;
  }
}

export const outreachEngine = new OutreachEngine();
