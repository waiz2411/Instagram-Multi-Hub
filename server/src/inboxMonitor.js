import { db } from './db.js';
import { browserManager } from './browserManager.js';
import { outreachEngine } from './outreachEngine.js';

class InboxMonitor {
  constructor() {
    this.isMonitoring = false;
    this.intervalTimer = null;
    this.isChecking = false;
    this.checkIntervalMs = 4 * 60 * 1000; // 4 minutes
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    console.log(`[InboxMonitor] Started reply & message monitor (checks every ${Math.round(this.checkIntervalMs / 60000)}m)`);

    // Run first check after 15 seconds, then recurring
    setTimeout(() => {
      this.checkAllInboxes().catch(err => {
        console.warn(`[InboxMonitor] Initial check notice:`, err.message);
      });
    }, 15000);

    this.intervalTimer = setInterval(() => {
      this.checkAllInboxes().catch(err => {
        console.warn(`[InboxMonitor] Interval check notice:`, err.message);
      });
    }, this.checkIntervalMs);
  }

  stopMonitoring() {
    this.isMonitoring = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    console.log(`[InboxMonitor] Stopped reply monitor.`);
  }

  async checkAllInboxes() {
    if (this.isChecking) return { success: false, message: 'Check already in progress' };
    this.isChecking = true;

    try {
      const alertSettings = db.getAlertSettings();
      if (!alertSettings.enabled) {
        return { success: true, message: 'Alerts are disabled in settings' };
      }

      const recipient = (alertSettings.recipientUsername || 'sync_satisfy').trim().replace('@', '');
      const accounts = db.getAccounts().filter(a => a.status === 'connected' || (a.sessionCookies && a.sessionCookies.length > 0));

      let alertsSent = 0;

      for (const account of accounts) {
        // Skip if cold outreach is actively dispatching a message right now (unless stuck for >3m)
        if (account.currentAction === 'dispatching') {
          const updatedAtTime = new Date(account.updatedAt || 0).getTime();
          const isStuck = Date.now() - updatedAtTime > 3 * 60 * 1000;
          if (!isStuck) {
            console.log(`[InboxMonitor] Account @${account.username} is currently dispatching a DM. Skipping inbox check.`);
            continue;
          } else {
            console.warn(`[InboxMonitor] Account @${account.username} was stuck in 'dispatching' for >3m. Auto-healing status.`);
            db.updateAccount(account.id, { currentAction: 'idle', currentActionDetails: '' });
          }
        }

        try {
          const count = await this.checkAccountInbox(account, recipient);
          alertsSent += count;
        } catch (accErr) {
          console.warn(`[InboxMonitor] Notice checking inbox for @${account.username}:`, accErr.message);
        }
      }

      return { success: true, alertsSent };
    } finally {
      this.isChecking = false;
    }
  }

  async checkAccountInbox(account, recipientUsername = 'sync_satisfy') {
    const session = await browserManager.getOrCreateSession(account, { isMobile: false });
    const page = session.page;
    if (!page) return 0;

    // Skip if session is currently executing outreach or warmup (unless lock is stale > 2.5m)
    if (session.isBusy() && session.currentTask !== 'inboxMonitor') {
      if (session.lockAcquiredAt && Date.now() - session.lockAcquiredAt > 2.5 * 60 * 1000) {
        console.warn(`[InboxMonitor] Force-resetting stale lock on @${account.username} (${session.currentTask})`);
        session.forceResetLock();
      } else {
        console.log(`[InboxMonitor] Session @${account.username} is busy with ${session.currentTask}. Skipping check.`);
        return 0;
      }
    }

    const releaseLock = await session.acquireLock('inboxMonitor');

    try {
      // Verify session (or try auto-restoring cookies if missing)
      let cookies = await session.context.cookies(['https://www.instagram.com']);
      let sessionCookie = cookies.find(c => c.name === 'sessionid');
      if (!sessionCookie || !sessionCookie.value) {
        if (account.sessionCookies && account.sessionCookies.length > 0) {
          await session.context.addCookies(account.sessionCookies);
          cookies = await session.context.cookies(['https://www.instagram.com']);
          sessionCookie = cookies.find(c => c.name === 'sessionid');
        }
        if (!sessionCookie || !sessionCookie.value) {
          return 0;
        }
      }

      console.log(`[InboxMonitor] Scanning Direct Inbox on @${account.username}...`);

      // Navigate to direct inbox if not already there
      const currentUrl = page.url() || '';
      if (!currentUrl.includes('/direct/inbox') && !currentUrl.includes('/direct/t/')) {
        try {
          await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 45000 });
        } catch (e) {
          console.warn(`[InboxMonitor] Notice navigating to inbox:`, e.message);
        }
        await page.waitForTimeout(3000);
      }

      // Dismiss notifications modal if present
      await page.evaluate(() => {
        const notNow = document.querySelector('button');
        if (notNow && (notNow.innerText.includes('Not Now') || notNow.innerText.includes('Cancel'))) {
          notNow.click();
        }
      }).catch(() => {});

      // Wait up to 8s for thread elements to appear in the inbox sidebar
      let threads = [];
      const startScan = Date.now();
      while (Date.now() - startScan < 8000) {
        threads = await page.evaluate(() => {
          function clean(s) {
            return (s || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim();
          }

          const list = [];
          const candidates = Array.from(document.querySelectorAll('div[role="button"], a, [tabindex]'));
          const threadElements = candidates.filter(el => {
            const r = el.getBoundingClientRect();
            return r.left < 450 && r.width > 120 && r.height >= 40 && r.top > 80;
          });

          for (const el of threadElements) {
            const rawText = clean(el.innerText || '');
            const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length >= 2) {
              const sender = lines[0].replace('@', '').trim();
              if (['primary', 'general', 'requests', "what's new...", 'your note', 'messages'].includes(sender.toLowerCase())) {
                continue;
              }

              const snippet = lines[1];
              const lowerSnippet = snippet.toLowerCase();
              const isFromOther = !lowerSnippet.startsWith('you: ') && !lowerSnippet.startsWith('you sent ');
              const isUnread = rawText.toLowerCase().includes('unread') || Boolean(
                el.querySelector('div[aria-label*="unread"], svg[aria-label*="Unread"], span[style*="font-weight: 600"], div[style*="font-weight: 600"]')
              );

              list.push({
                sender,
                snippet,
                isFromOther,
                isUnread
              });
            }
          }
          return list;
        }).catch(() => []);

        if (threads.length > 0) break;
        await page.waitForTimeout(500);
      }

      let alertsTriggered = 0;
      const recipientClean = recipientUsername.toLowerCase();

      for (const thread of threads) {
        const leadClean = thread.sender.toLowerCase();

        // Prevent loops if thread is the forwarded alert itself
        if (thread.snippet.includes('[Lead Reply Alert]') || thread.snippet.includes('[Outreach Alert]')) {
          continue;
        }

        // Only alert if message is incoming from lead or marked unread
        if (!thread.isFromOther && !thread.isUnread) continue;

        // Create signature for deduplication
        const alertKey = `${account.id}:${leadClean}:${thread.snippet.trim()}`;
        if (db.isMessageAlerted(alertKey)) {
          continue;
        }

        console.log(`[InboxMonitor] 🚨 New reply detected on @${account.username} from @${thread.sender}: "${thread.snippet}"`);

        // Construct notification DM to master alert account (@sync_satisfy)
        const alertText = `🚨 [Lead Reply Alert]\nAccount: @${account.username || 'IG Account'}\nLead: @${thread.sender}\nReply: "${thread.snippet}"\nTime: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        let sendSuccess = false;
        try {
          sendSuccess = await outreachEngine.sendInstagramDirectMessage(account, recipientUsername, alertText, { skipLock: true });
        } catch (err) {
          console.error(`[InboxMonitor] Failed to send alert to @${recipientUsername}:`, err.message);
        }

        if (sendSuccess) {
          db.markMessageAlerted(alertKey);
          db.addLog({
            accountId: account.id,
            targetUsername: recipientUsername,
            action: 'reply_alert',
            status: 'success',
            details: `Forwarded reply from @${thread.sender} on @${account.username} to @${recipientUsername}`
          });
          alertsTriggered++;
          console.log(`[InboxMonitor] ✅ Alert successfully delivered to @${recipientUsername}`);
        }

        // Small delay between alerts if multiple
        await new Promise(r => setTimeout(r, 2000));
      }

      return alertsTriggered;
    } finally {
      releaseLock();
    }
  }
}

export const inboxMonitor = new InboxMonitor();
