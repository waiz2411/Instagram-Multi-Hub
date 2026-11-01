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
      const accounts = db.getAccounts().filter(a => a.status === 'connected');

      let alertsSent = 0;

      for (const account of accounts) {
        // Skip if cold outreach is actively dispatching a message right now
        if (account.currentAction === 'dispatching') {
          console.log(`[InboxMonitor] Account @${account.username} is currently dispatching a DM. Skipping inbox check.`);
          continue;
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

    // Skip if session is currently executing outreach or warmup
    if (session.isBusy()) {
      console.log(`[InboxMonitor] Session @${account.username} is busy with ${session.currentTask}. Skipping check.`);
      return 0;
    }

    const releaseLock = await session.acquireLock('inboxMonitor');

    try {
      // Verify session
      const cookies = await session.context.cookies(['https://www.instagram.com']);
      const sessionCookie = cookies.find(c => c.name === 'sessionid');
      if (!sessionCookie || !sessionCookie.value) {
        return 0;
      }

      console.log(`[InboxMonitor] Scanning Direct Inbox on @${account.username}...`);

      // Navigate to direct inbox
      await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3000);

      // Dismiss notifications modal if present
      await page.evaluate(() => {
        const notNow = document.querySelector('button');
        if (notNow && (notNow.innerText.includes('Not Now') || notNow.innerText.includes('Cancel'))) {
          notNow.click();
        }
      }).catch(() => {});

      // Extract thread previews from inbox list
      const threads = await page.evaluate(() => {
        function clean(s) {
          return (s || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim();
        }

        const list = [];
        const candidates = Array.from(document.querySelectorAll('div[role="button"], a, [tabindex]'));
        const threadElements = candidates.filter(el => {
          const r = el.getBoundingClientRect();
          return r.left < 450 && r.width > 120 && r.height >= 40 && r.top > 100;
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
          sendSuccess = await outreachEngine.sendInstagramDirectMessage(account, recipientUsername, alertText);
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
