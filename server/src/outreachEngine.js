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

// Native DOM click by text or CSS selector (100% immune to Playwright ElementHandle detachment errors)
async function clickDomElement(page, { text, selector, timeout = 10000 }) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const success = await page.evaluate(({ txt, sel }) => {
      function simulateClick(el) {
        try {
          el.scrollIntoView({ block: 'center', behavior: 'instant' });
        } catch (e) {}
        try {
          if (typeof el.focus === 'function') el.focus();
        } catch (e) {}
        try {
          const opts = { bubbles: true, cancelable: true, view: window };
          el.dispatchEvent(new MouseEvent('mousedown', opts));
          el.dispatchEvent(new MouseEvent('mouseup', opts));
          el.click();
        } catch (e) {
          try { el.click(); } catch (e2) {}
        }
      }

      let elements = [];
      if (sel) {
        try {
          elements = Array.from(document.querySelectorAll(sel));
        } catch (e) {}
      } else {
        elements = Array.from(document.querySelectorAll('button, div[role="button"], a, input, [tabindex]'));
      }

      if (txt) {
        const lowerTxt = txt.toLowerCase();
        const match = elements.find(el => {
          const content = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim().toLowerCase();
          return content === lowerTxt || content.includes(lowerTxt);
        });
        if (match) {
          const clickable = match.closest('button') || match.closest('div[role="button"]') || match.closest('a') || match;
          simulateClick(clickable);
          return true;
        }
      } else if (elements.length > 0) {
        const el = elements[0];
        const clickable = el.closest('button') || el.closest('div[role="button"]') || el.closest('a') || el;
        simulateClick(clickable);
        return true;
      }
      return false;
    }, { txt: text, sel: selector }).catch(() => false);

    if (success) return true;
    await page.waitForTimeout(300);
  }
  return false;
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
    const session = await browserManager.getOrCreateSession(account, { isMobile: false, viewport: { width: 1280, height: 800 } });
    const page = session.page;
    if (!page) throw new Error('Browser page not available');

    // Ensure desktop viewport for maximum reliability with Instagram's web chat interface
    try {
      const currentVp = page.viewportSize();
      if (!currentVp || currentVp.width < 1000) {
        await page.setViewportSize({ width: 1280, height: 800 });
      }
    } catch (e) {}

    // Acquire exclusive session lock to prevent inboxMonitor or warmup from colliding
    const releaseLock = await session.acquireLock('outreach');

    try {
      // 0. Verify sender session
      const cookies = await session.context.cookies(['https://www.instagram.com']);
      const sessionCookie = cookies.find(c => c.name === 'sessionid');
      if (!sessionCookie || !sessionCookie.value) {
        db.updateAccount(account.id, { status: 'needs_login' });
        throw new Error(
          `Account @${account.username || account.id} is NOT logged into Instagram. Please open browser and log in first.`
        );
      }

      const cleanTarget = targetUsername.replace('@', '').trim().toLowerCase();
      console.log(`[Outreach] Opening Direct Inbox to message @${cleanTarget}...`);

      // 1. Navigate directly to Instagram Direct Inbox
      await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3000);

      // Helper to dismiss notification/modal overlays
      const dismissPopups = async () => {
        await page.evaluate(() => {
          const dismissTexts = ['not now', 'cancel', 'ok', 'got it', 'close', 'dismiss'];
          const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
          for (const b of btns) {
            const t = (b.innerText || '').trim().toLowerCase();
            if (dismissTexts.includes(t)) {
              try { b.click(); } catch (e) {}
            }
          }
        }).catch(() => {});
      };

      await dismissPopups();

      // 2. Check if thread for target is already visible in the sidebar thread list
      console.log(`[Outreach] Checking if thread for @${cleanTarget} is in the inbox sidebar list...`);
      let threadSelected = await page.evaluate((target) => {
        function clean(s) {
          return (s || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim().toLowerCase();
        }
        const all = Array.from(document.querySelectorAll('div[role="button"], a, [tabindex]'));
        const sidebarButtons = all.filter(el => {
          const r = el.getBoundingClientRect();
          return r.left < 450 && r.width > 80 && r.height > 25;
        });

        for (const btn of sidebarButtons) {
          const t = clean(btn.innerText);
          if (t.includes(target)) {
            btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            btn.click();
            return true;
          }
        }
        return false;
      }, cleanTarget);

      // 3. If not already in sidebar list, use inbox sidebar search box to find recipient
      if (!threadSelected) {
        console.log(`[Outreach] Using inbox sidebar search to find @${cleanTarget}...`);
        let searchFound = false;
        const searchStartTime = Date.now();
        while (Date.now() - searchStartTime < 10000) {
          await dismissPopups();
          searchFound = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const sidebarSearch = inputs.find(i => {
              const r = i.getBoundingClientRect();
              return r.left < 450 && r.width > 50 && (i.placeholder || '').toLowerCase().includes('search');
            });
            if (sidebarSearch) {
              sidebarSearch.scrollIntoView({ block: 'center', behavior: 'instant' });
              sidebarSearch.focus();
              sidebarSearch.value = '';
              return true;
            }
            return false;
          });
          if (searchFound) break;
          await page.waitForTimeout(500);
        }

        if (!searchFound) {
          throw new Error(`Could not find inbox search box`);
        }

        await page.keyboard.type(cleanTarget, { delay: 60 });
        console.log(`[Outreach] Typed @${cleanTarget} in search box, awaiting results...`);
        await page.waitForTimeout(3000);

        // Pick user from sidebar search results list
        const startSelect = Date.now();
        while (Date.now() - startSelect < 12000) {
          threadSelected = await page.evaluate((target) => {
            function clean(s) {
              return (s || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim().toLowerCase();
            }
            const all = Array.from(document.querySelectorAll('div[role="button"], a, [tabindex]'));
            const searchItems = all.filter(el => {
              const r = el.getBoundingClientRect();
              return r.left < 450 && r.top > 120 && r.height > 20 && r.width > 80;
            });

            for (const item of searchItems) {
              const t = clean(item.innerText);
              if (t.includes(target)) {
                item.scrollIntoView({ block: 'center', behavior: 'instant' });
                item.click();
                return true;
              }
            }
            return false;
          }, cleanTarget);

          if (threadSelected) break;
          await page.waitForTimeout(500);
        }

        if (!threadSelected) {
          throw new Error(`Could not find @${cleanTarget} in inbox search results.`);
        }
      }

      console.log(`[Outreach] Selected @${cleanTarget}'s conversation! Waiting for message input box...`);
      await page.waitForTimeout(2500);

      // 4. Locate message input box in the active conversation
      const messageBoxSelector =
        'div[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"], div[aria-placeholder*="Message"], textarea[placeholder*="Message"]';

      let boxFound = false;
      const startBox = Date.now();
      while (Date.now() - startBox < 15000) {
        await dismissPopups();
        boxFound = await page.evaluate((sel) => {
          const boxes = Array.from(document.querySelectorAll(sel));
          const visible = boxes.filter(b => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && window.getComputedStyle(b).visibility !== 'hidden';
          });
          const target = visible[0] || boxes[0];
          if (target) {
            target.scrollIntoView({ block: 'center', behavior: 'instant' });
            target.focus();
            target.click();

            try {
              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(target);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            } catch (e) {}

            return true;
          }
          return false;
        }, messageBoxSelector);

        if (boxFound) break;
        await page.waitForTimeout(500);
      }

      if (!boxFound) {
        throw new Error(`Could not locate message input box for @${cleanTarget}`);
      }

      // 5. Type and send message naturally
      console.log(`[Outreach] Typing personalized message to @${cleanTarget}...`);
      await page.waitForTimeout(500);
      await page.keyboard.type(message, { delay: Math.floor(Math.random() * 20) + 30 });
      await page.waitForTimeout(800);

      console.log('[Outreach] Dispatching message (Enter)...');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);

      // Also click Send button if present
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
        const send = btns.find(b => (b.innerText || '').trim().toLowerCase() === 'send');
        if (send) send.click();
      }).catch(() => {});

      await page.waitForTimeout(2500);
      console.log(`[Outreach] ✅ Successfully sent DM to @${cleanTarget}`);
      return true;
    } finally {
      releaseLock();
    }
  }
}

export const outreachEngine = new OutreachEngine();
