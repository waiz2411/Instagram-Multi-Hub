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

      const cleanUsername = targetUsername.replace('@', '').trim();
      const profileUrl = `https://www.instagram.com/${cleanUsername}/`;
      console.log(`[Outreach] Opening target profile: ${profileUrl}`);

      // 1. Navigate to user profile
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3000);

      // Dismiss any cookie / app / login banner
      await clickDomElement(page, {
        selector: 'button, div[role="button"]',
        text: 'Not Now',
        timeout: 2000
      });

      // 2. Look for Message button strictly on profile (never match "Messages" in sidebar)
      console.log(`[Outreach] Looking for Message button on @${cleanUsername}'s profile...`);
      let clickedMessage = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('header button, header div[role="button"], main button, main div[role="button"], button, div[role="button"], a[href*="/direct/t/"]'));
        const msgBtn = elements.find(el => {
          const inner = (el.innerText || '').trim().toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
          // Strict equality so it NEVER matches "Messages" in navigation sidebar!
          return inner === 'message' || aria === 'message' || (el.getAttribute('href') && el.getAttribute('href').includes('/direct/t/'));
        });
        if (msgBtn) {
          msgBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
          msgBtn.click();
          return true;
        }
        return false;
      }).catch(() => false);

      if (clickedMessage) {
        console.log(`[Outreach] Clicked Message button on @${cleanUsername}'s profile.`);
        await page.waitForTimeout(3000);
      } else {
        console.log(`[Outreach] Message button not on profile. Navigating to Direct Inbox compose...`);
        await page.goto('https://www.instagram.com/direct/new/', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(2500);

        // Dismiss modal if present
        await clickDomElement(page, {
          selector: 'button',
          text: 'Not Now',
          timeout: 2000
        });

        // Search recipient input
        const searchInputSelector = 'input[name="searchInput"], input[name="queryBox"], input[placeholder*="Search"]';
        const foundSearch = await clickDomElement(page, { selector: searchInputSelector, timeout: 10000 });
        if (!foundSearch) {
          throw new Error(`Could not find recipient search box in compose window.`);
        }
        await page.evaluate((sel) => {
          const inp = document.querySelector(sel);
          if (inp) {
            inp.value = '';
            inp.focus();
          }
        }, searchInputSelector);
        await page.keyboard.type(cleanUsername, { delay: 50 });
        await page.waitForTimeout(2500);

        // Select target user from search results list
        const clickedUser = await page.evaluate((targetUser) => {
          const all = Array.from(document.querySelectorAll('div[role="button"], [role="checkbox"], input[type="checkbox"], [tabindex]'));
          const match = all.find(el => {
            const t = (el.innerText || el.textContent || '').trim().toLowerCase();
            return t.includes(targetUser.toLowerCase());
          });
          if (match) {
            match.click();
            return true;
          }
          return false;
        }, cleanUsername);

        if (!clickedUser) {
          throw new Error(`Could not find user @${cleanUsername} in search results.`);
        }
        await page.waitForTimeout(1000);

        // Click "Send message" or "Chat" or "Next" button in header/footer
        await clickDomElement(page, {
          selector: 'div[role="button"], button',
          text: 'Send message',
          timeout: 4000
        }) || await clickDomElement(page, {
          selector: 'div[role="button"], button',
          text: 'Chat',
          timeout: 4000
        }) || await clickDomElement(page, {
          selector: 'div[role="button"], button',
          text: 'Next',
          timeout: 4000
        });
        await page.waitForTimeout(2500);
      }

      // 3. Wait for the message input box to mount (contenteditable Lexical editor or textarea)
      console.log(`[Outreach] Waiting for message input box to mount for @${cleanUsername}...`);
      const messageBoxSelector =
        'div[contenteditable="true"][role="textbox"], div[data-lexical-editor="true"], div[aria-placeholder*="Message"], div[role="textbox"], textarea[placeholder*="Message"], div[contenteditable="true"]';

      let clickedInput = false;
      const startTime = Date.now();
      while (Date.now() - startTime < 15000) {
        // Dismiss any popups or notification dialogs that might overlay the screen
        await page.evaluate(() => {
          const dismissTexts = ['not now', 'cancel', 'ok', 'got it', 'close', 'dismiss'];
          const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
          for (const b of btns) {
            const t = (b.innerText || '').trim().toLowerCase();
            if (dismissTexts.includes(t)) {
              b.click();
            }
          }
        }).catch(() => {});

        clickedInput = await page.evaluate((sel) => {
          const elements = Array.from(document.querySelectorAll(sel));
          // Filter to visible elements only
          const visible = elements.filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
          });
          const target = visible[0] || elements[0];
          if (target) {
            target.scrollIntoView({ block: 'center', behavior: 'instant' });
            target.focus();
            target.click();

            // Set selection / caret to end of editor
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
        }, messageBoxSelector).catch(() => false);

        if (clickedInput) break;
        await page.waitForTimeout(500);
      }

      if (!clickedInput) {
        throw new Error(`Could not locate message input box for @${cleanUsername}. Check if user allows DMs from non-followers.`);
      }

      await page.waitForTimeout(600);

      // Natural human typing simulation
      console.log(`[Outreach] Typing personalized message...`);
      await page.keyboard.type(message, { delay: Math.floor(Math.random() * 25) + 30 });
      await page.waitForTimeout(800);

      // Send via Enter key
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);

      // Also look for and click explicit "Send" button if still present
      await clickDomElement(page, {
        selector: 'button, div[role="button"]',
        text: 'Send',
        timeout: 2000
      });

      await page.waitForTimeout(2000);
      console.log(`[Outreach] Successfully sent DM to @${cleanUsername}`);
      return true;
    } finally {
      releaseLock();
    }
  }
}

export const outreachEngine = new OutreachEngine();
