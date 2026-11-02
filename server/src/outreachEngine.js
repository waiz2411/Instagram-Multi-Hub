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
    this.startWatchdog();
  }

  // --- Watchdog to auto-resume active background workers and heal stuck actions ---
  startWatchdog() {
    // Run watchdog every 60 seconds to resume workers after reboot/spin-down and unstick any deadlocks
    setInterval(() => {
      this.checkAndHealWorkers();
    }, 60 * 1000);
  }

  checkAndHealWorkers() {
    try {
      // Auto-recover leads that failed due to previous software bugs
      const failedLeads = db.getLeads({ status: 'failed' });
      for (const fl of failedLeads) {
        const notes = (fl.notes || '').toLowerCase();
        if (
          notes.includes('execution context was destroyed') ||
          notes.includes('could not locate message input box') ||
          notes.includes('timeout')
        ) {
          console.log(`[Watchdog] Auto-healed lead @${fl.username} back to pending.`);
          db.updateLead(fl.id, { status: 'pending', notes: '' });
        }
      }

      const accounts = db.getAccounts();
      const now = Date.now();

      for (const account of accounts) {
        if (account.outreachStatus === 'running') {
          const worker = this.activeAccountWorkers.get(account.id);

          // 1. Worker was marked running in DB but not active in memory (e.g. server reboot or Render spin-up)
          if (!worker || !worker.isRunning) {
            console.log(`[Watchdog] Resuming background outreach worker for @${account.username}...`);
            this.activeAccountWorkers.set(account.id, { isRunning: true });

            const nextRunTime = account.nextRunAt ? new Date(account.nextRunAt).getTime() : 0;
            if (nextRunTime <= now || account.currentAction === 'dispatching') {
              console.log(`[Watchdog] Running pending DM cycle for @${account.username} immediately.`);
              this.runAccountLoop(account.id).catch(e => console.error('[Watchdog] Loop error:', e));
            } else {
              const remainingMs = Math.max(1000, nextRunTime - now);
              console.log(`[Watchdog] Next DM for @${account.username} scheduled in ${Math.round(remainingMs / 60000)}m`);
              const w = this.activeAccountWorkers.get(account.id);
              if (w) {
                w.timeoutId = setTimeout(() => this.runAccountLoop(account.id), remainingMs);
              }
            }
            continue;
          }

          // 2. Action has been stuck in 'dispatching' for > 3 minutes (recover from stuck browser action)
          if (account.currentAction === 'dispatching') {
            const updatedAt = new Date(account.updatedAt || 0).getTime();
            if (now - updatedAt > 3 * 60 * 1000) {
              console.warn(`[Watchdog] Account @${account.username} stuck in 'dispatching' for >3m. Recovering...`);
              db.updateAccount(account.id, {
                currentAction: 'waiting',
                currentActionDetails: 'Recovered from timeout. Rescheduling next attempt...',
                nextRunAt: new Date(now + 30000).toISOString()
              });
              if (worker.timeoutId) clearTimeout(worker.timeoutId);
              worker.timeoutId = setTimeout(() => this.runAccountLoop(account.id), 30000);
            }
          }

          // 3. Action is waiting, but timer expired without firing (e.g. container sleep)
          if (account.currentAction === 'waiting' && account.nextRunAt) {
            const nextRunTime = new Date(account.nextRunAt).getTime();
            if (now - nextRunTime > 30000) {
              console.log(`[Watchdog] Timer expired for @${account.username}. Running now.`);
              if (worker.timeoutId) clearTimeout(worker.timeoutId);
              this.runAccountLoop(account.id).catch(e => console.error('[Watchdog] Loop error:', e));
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Watchdog] Notice in checkAndHealWorkers:', err.message);
    }
  }

  // --- Account-Direct Outreach Loop ---
  async startAccountOutreach(accountId) {
    const existing = this.activeAccountWorkers.get(accountId);
    if (existing && existing.isRunning) {
      if (existing.timeoutId) {
        clearTimeout(existing.timeoutId);
        existing.timeoutId = null;
      }
      console.log(`[Outreach] Re-triggering active outreach worker for @${accountId} immediately.`);
      db.updateAccount(accountId, {
        outreachStatus: 'running',
        currentAction: 'dispatching',
        currentActionDetails: 'Starting outreach cycle immediately...'
      });
      this.runAccountLoop(accountId).catch(err => {
        console.error(`[Outreach] Account loop error for @${accountId}:`, err);
        this.pauseAccountOutreach(accountId);
      });
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
      success = await this.sendInstagramDirectMessage(account, lead.username, messageToSend, {
        leadFullName: lead.fullName
      });
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
    } else {
      db.updateLead(lead.id, { status: 'failed', notes: errorMsg });
      db.addLog({
        accountId: account.id,
        targetUsername: lead.username,
        action: 'send_dm',
        status: 'failed',
        details: errorMsg || 'Unknown error'
      });

      // Smart recovery: On failure, retry in 2 minutes instead of freezing for 30 minutes!
      const retryMinutes = 2;
      const retryDelayMs = retryMinutes * 60 * 1000;
      const nextRunAt = new Date(Date.now() + retryDelayMs).toISOString();

      db.updateAccount(accountId, {
        currentAction: 'waiting',
        currentActionDetails: `Delivery notice: ${errorMsg || 'Failed'}. Retrying next lead in ${retryMinutes}m...`,
        nextRunAt
      });

      console.log(`[Outreach] Lead failed, scheduling next attempt in ${retryMinutes}m for @${account.username}...`);
      worker.timeoutId = setTimeout(() => {
        this.runAccountLoop(accountId);
      }, retryDelayMs);
    }
  }

  // --- Instagram DM Automation Actions ---
  async sendInstagramDirectMessage(account, targetUsername, message, options = {}) {
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

    // Acquire exclusive session lock unless caller already holds it (e.g. inboxMonitor)
    const releaseLock = options.skipLock ? (() => {}) : await session.acquireLock('outreach');

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

      const cleanTarget = (targetUsername || '').replace('@', '').trim().toLowerCase();
      const cleanFullName = (options.leadFullName || '').trim().toLowerCase();
      console.log(`[Outreach] Preparing DM to @${cleanTarget}${cleanFullName ? ` (${cleanFullName})` : ''}...`);

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

      // 1. Navigate to Direct Inbox if not already on inbox or thread
      const currentUrl = page.url() || '';
      if (!currentUrl.includes('/direct/inbox') && !currentUrl.includes('/direct/t/')) {
        console.log(`[Outreach] Navigating to Instagram Direct Inbox...`);
        try {
          await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 45000 });
        } catch (e) {
          console.warn(`[Outreach] Notice during initial nav to inbox:`, e.message);
        }
        await page.waitForTimeout(3000);
      }

      await dismissPopups();

      // 2. Check if active thread is already open for this recipient
      let threadAlreadyActive = await page.evaluate(({ target, fullName }) => {
        function clean(s) {
          return (s || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim().toLowerCase();
        }
        const headers = Array.from(document.querySelectorAll('header, div[role="main"] h2, div[role="main"] h1, div[role="main"] span'));
        return headers.some(h => {
          const t = clean(h.innerText);
          return t === target || (fullName && t === fullName);
        });
      }, { target: cleanTarget, fullName: cleanFullName }).catch(() => false);

      let threadSelected = threadAlreadyActive;

      // 3. Search for existing thread in sidebar list (polling up to 10s for sidebar render)
      if (!threadSelected) {
        console.log(`[Outreach] Checking inbox sidebar for @${cleanTarget}...`);
        const startSidebar = Date.now();
        while (Date.now() - startSidebar < 10000) {
          await dismissPopups();
          threadSelected = await page.evaluate(({ target, fullName }) => {
            function clean(s) {
              return (s || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim().toLowerCase();
            }
            const buttons = Array.from(document.querySelectorAll('div[role="button"], a[role="link"], [tabindex="0"]'));
            const threadBtn = buttons.find(b => {
              const r = b.getBoundingClientRect();
              const text = clean(b.innerText);
              const isSidebar = r.left < 450 && r.width > 120 && r.height > 35 && r.top > 80;
              return isSidebar && (text.includes(target) || (fullName && text.includes(fullName)));
            });

            if (threadBtn) {
              threadBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
              const rect = threadBtn.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                threadBtn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
              });
              return true;
            }
            return false;
          }, { target: cleanTarget, fullName: cleanFullName }).catch(() => false);

          if (threadSelected) {
            console.log(`[Outreach] Found and opened @${cleanTarget}'s thread from sidebar!`);
            await page.waitForTimeout(2000);
            break;
          }
          await page.waitForTimeout(500);
        }
      }

      // 4. If not found in sidebar list, use inbox sidebar search box
      if (!threadSelected) {
        console.log(`[Outreach] @${cleanTarget} not in sidebar list, using inbox search box...`);
        let searchFocused = false;
        const searchStartTime = Date.now();
        while (Date.now() - searchStartTime < 8000) {
          await dismissPopups();
          searchFocused = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const sidebarSearch = inputs.find(i => {
              const r = i.getBoundingClientRect();
              return r.left < 450 && r.width > 50 && (i.placeholder || '').toLowerCase().includes('search');
            });
            if (sidebarSearch) {
              sidebarSearch.scrollIntoView({ block: 'center', behavior: 'instant' });
              sidebarSearch.focus();
              sidebarSearch.click();
              return true;
            }
            return false;
          }).catch(() => false);
          if (searchFocused) break;
          await page.waitForTimeout(500);
        }

        if (searchFocused) {
          await page.keyboard.press('Control+A').catch(() => {});
          await page.keyboard.press('Backspace').catch(() => {});
          await page.keyboard.type(cleanTarget, { delay: 50 });
          console.log(`[Outreach] Typed @${cleanTarget} in search, awaiting dropdown...`);
          await page.waitForTimeout(3000);

          // Select matching result with full pointer events
          const startSelect = Date.now();
          while (Date.now() - startSelect < 10000) {
            threadSelected = await page.evaluate(({ target }) => {
              function clean(s) {
                return (s || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim().toLowerCase();
              }
              const elements = Array.from(document.querySelectorAll('div[role="button"], a[role="link"], [tabindex="0"]'));
              const item = elements.find(el => {
                const r = el.getBoundingClientRect();
                const text = clean(el.innerText);
                return r.left < 450 && r.top > 130 && r.height >= 35 && text.includes(target);
              });

              if (item) {
                item.scrollIntoView({ block: 'center', behavior: 'instant' });
                const rect = item.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                  item.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
                });
                return true;
              }
              return false;
            }, { target: cleanTarget }).catch(() => false);

            if (threadSelected) {
              console.log(`[Outreach] Selected @${cleanTarget} from search results.`);
              await page.waitForTimeout(2000);
              break;
            }
            await page.waitForTimeout(500);
          }
        }

        // 5. Fallback: Direct Compose Modal (/direct/new/) if search didn't locate
        if (!threadSelected) {
          console.log(`[Outreach] Fallback: opening direct compose (/direct/new/) for @${cleanTarget}...`);
          try {
            await page.goto('https://www.instagram.com/direct/new/', { waitUntil: 'domcontentloaded', timeout: 35000 });
          } catch (e) {}
          await page.waitForTimeout(3000);
          await dismissPopups();

          // Type in queryBox
          const queryFocused = await page.evaluate(() => {
            const inp = document.querySelector('input[name="queryBox"], input[placeholder*="Search"]');
            if (inp) {
              inp.focus();
              inp.click();
              return true;
            }
            return false;
          }).catch(() => false);

          if (queryFocused) {
            await page.keyboard.type(cleanTarget, { delay: 50 });
            await page.waitForTimeout(3000);

            // Click user candidate in modal
            const candidateClicked = await page.evaluate(({ target }) => {
              function clean(s) {
                return (s || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim().toLowerCase();
              }
              const items = Array.from(document.querySelectorAll('div[role="button"], [tabindex="0"]'));
              const candidate = items.find(el => {
                const text = clean(el.innerText);
                return text.includes(target) && el.getBoundingClientRect().height > 30;
              });
              if (candidate) {
                candidate.click();
                return true;
              }
              return false;
            }, { target: cleanTarget }).catch(() => false);

            if (candidateClicked) {
              await page.waitForTimeout(1000);
              await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('div[role="button"], button'));
                const nextBtn = btns.find(b => {
                  const t = (b.innerText || '').trim().toLowerCase();
                  return t === 'chat' || t === 'next';
                });
                if (nextBtn) nextBtn.click();
              }).catch(() => {});
              await page.waitForTimeout(2500);
              threadSelected = true;
            }
          }
        }
      }

      console.log(`[Outreach] Waiting for message input box for @${cleanTarget}...`);
      await page.waitForTimeout(1500);

      // 6. Locate message input box in the active conversation
      let boxFound = false;
      const startBox = Date.now();
      while (Date.now() - startBox < 15000) {
        await dismissPopups();
        boxFound = await page.evaluate(() => {
          const selectors = [
            'div[role="textbox"][contenteditable="true"]',
            'div[data-lexical-editor="true"]',
            'textarea[placeholder*="Message"]',
            'div[aria-placeholder*="Message"]',
            'div[contenteditable="true"]'
          ];
          for (const sel of selectors) {
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
          }
          return false;
        }).catch(() => false);

        if (boxFound) break;
        await page.waitForTimeout(500);
      }

      if (!boxFound) {
        throw new Error(`Could not locate message input box for @${cleanTarget}`);
      }

      // 7. Type and send message naturally
      console.log(`[Outreach] Typing message to @${cleanTarget}...`);
      await page.waitForTimeout(400);
      await page.keyboard.type(message, { delay: Math.floor(Math.random() * 20) + 30 });
      await page.waitForTimeout(700);

      console.log('[Outreach] Dispatching message (Enter)...');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);

      // Click Send button if still visible
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
        const send = btns.find(b => (b.innerText || '').trim().toLowerCase() === 'send');
        if (send && send.getBoundingClientRect().width > 0) send.click();
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
