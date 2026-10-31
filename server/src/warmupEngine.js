import { db } from './db.js';
import { browserManager } from './browserManager.js';

const FRIENDLY_COMMENTS = [
  'Love this! 🔥',
  'Amazing content 🙌',
  'Great post! 👏',
  'So inspiring ✨',
  'Super cool 💯',
  'Awesome work! 👌',
  'Really well done 💫',
  'Love the vibes here! 🙌',
  'Quality content 👏',
  'Keep it up! 🔥'
];

class WarmupEngine {
  constructor() {
    this.activeWarmupWorkers = new Map(); // accountId -> { isRunning: bool, timeoutId: timer, sessionCount: number }
  }

  isWarmupActive(accountId) {
    const worker = this.activeWarmupWorkers.get(accountId);
    return Boolean(worker && worker.isRunning);
  }

  async startWarmup(accountId) {
    if (this.activeWarmupWorkers.has(accountId)) {
      console.log(`[Warmup] Account ${accountId} warmup is already active.`);
      return;
    }

    const account = db.getAccount(accountId);
    if (!account) throw new Error('Account not found');

    db.updateAccount(accountId, {
      warmupEnabled: true,
      warmupStatus: 'running',
      warmupCurrentAction: 'Initializing human warmup session...'
    });

    const workerState = { isRunning: true, timeoutId: null, sessionCount: 0 };
    this.activeWarmupWorkers.set(accountId, workerState);

    console.log(`[Warmup] Started human warmup mode for @${account.username || account.id}`);
    this.runWarmupLoop(accountId).catch(err => {
      console.error(`[Warmup] Loop error for @${account.username}:`, err.message);
      this.pauseWarmup(accountId);
    });
  }

  pauseWarmup(accountId) {
    const worker = this.activeWarmupWorkers.get(accountId);
    if (worker) {
      worker.isRunning = false;
      if (worker.timeoutId) clearTimeout(worker.timeoutId);
      this.activeWarmupWorkers.delete(accountId);
    }

    db.updateAccount(accountId, {
      warmupEnabled: false,
      warmupStatus: 'paused',
      warmupCurrentAction: 'Warmup paused'
    });
    console.log(`[Warmup] Paused human warmup for account ${accountId}`);
  }

  async runWarmupLoop(accountId) {
    const worker = this.activeWarmupWorkers.get(accountId);
    if (!worker || !worker.isRunning) return;

    let account = db.getAccount(accountId);
    if (!account || !account.warmupEnabled) {
      this.pauseWarmup(accountId);
      return;
    }

    // Yield if cold outreach is actively dispatching a message right now
    if (account.currentAction === 'dispatching') {
      console.log(`[Warmup] Outreach is currently dispatching a DM. Warmup yielding for 30s...`);
      db.updateAccount(accountId, {
        warmupCurrentAction: 'Yielding to cold outreach DM dispatch...'
      });
      worker.timeoutId = setTimeout(() => this.runWarmupLoop(accountId), 30000);
      return;
    }

    try {
      const session = await browserManager.getOrCreateSession(account, {
        isMobile: account.isMobile
      });
      const page = session.page;
      if (!page) throw new Error('Browser page unavailable');

      // Verify session cookie
      const cookies = await session.context.cookies(['https://www.instagram.com']);
      const sessionCookie = cookies.find(c => c.name === 'sessionid');
      if (!sessionCookie || !sessionCookie.value) {
        db.updateAccount(accountId, {
          warmupStatus: 'paused',
          warmupCurrentAction: 'Paused: Account not logged into Instagram'
        });
        this.pauseWarmup(accountId);
        return;
      }

      // Randomly choose between Feed and Reels
      const targetMode = Math.random() < 0.45 ? 'reels' : 'feed';
      const targetUrl = targetMode === 'reels' ? 'https://www.instagram.com/reels/' : 'https://www.instagram.com/';

      db.updateAccount(accountId, {
        warmupStatus: 'running',
        warmupCurrentAction: `Navigating to Instagram ${targetMode === 'reels' ? 'Reels' : 'Home Feed'}...`
      });

      console.log(`[Warmup] @${account.username || account.id} -> Browsing ${targetMode}...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3000);

      // Dismiss any popup modals
      await page.locator('button:has-text("Not Now"), button:has-text("Cancel")').first().click({ timeout: 2000 }).catch(() => {});

      // Execute a session of 8-14 human interactions
      const interactionsInSession = Math.floor(Math.random() * 7) + 8; // 8 to 14
      let sessionComments = 0;

      for (let i = 0; i < interactionsInSession; i++) {
        if (!worker.isRunning) break;
        account = db.getAccount(accountId);
        if (!account || !account.warmupEnabled) break;

        // Yield if outreach started dispatching
        if (account.currentAction === 'dispatching') {
          console.log(`[Warmup] Outreach started dispatching. Pausing session briefly.`);
          break;
        }

        // 1. Human-like scrolling
        const scrollDistance = Math.floor(Math.random() * 350) + 250; // 250-600px
        await page.evaluate((dist) => {
          window.scrollBy({ top: dist, behavior: 'smooth' });
        }, scrollDistance);

        // Update stats: 1 post/reel viewed
        const currentStats = account.warmupStats || { postsViewed: 0, likesGiven: 0, commentsGiven: 0 };
        currentStats.postsViewed = (currentStats.postsViewed || 0) + 1;
        currentStats.lastActiveAt = new Date().toISOString();

        db.updateAccount(accountId, {
          warmupStats: currentStats,
          warmupCurrentAction: `Viewing content (${i + 1}/${interactionsInSession} in session)...`
        });

        // Human pause: dwell on content for 4 to 8 seconds
        const dwellTime = Math.floor(Math.random() * 4000) + 4000;
        await page.waitForTimeout(dwellTime);

        // 2. Chance to Like (~25% probability)
        const shouldLike = Math.random() < 0.25;
        if (shouldLike) {
          try {
            // Find and click like button safely using DOM evaluation (immune to detached handle errors)
            const likeSelector = 'svg[aria-label="Like"], button svg[aria-label="Like"], div[role="button"] svg[aria-label="Like"]';
            const liked = await page.evaluate((sel) => {
              const svg = document.querySelector(sel);
              if (svg) {
                const btn = svg.closest('button') || svg.closest('div[role="button"]') || svg;
                btn.click();
                return true;
              }
              return false;
            }, likeSelector).catch(() => false);

            if (liked) {
              currentStats.likesGiven = (currentStats.likesGiven || 0) + 1;
              db.updateAccount(accountId, {
                warmupStats: currentStats,
                warmupCurrentAction: 'Liked a post/reel ❤️'
              });

              db.addLog({
                accountId: account.id,
                targetUsername: 'feed',
                action: 'warmup_like',
                status: 'success',
                details: 'Warmup Engine: Liked a post organically'
              });

              console.log(`[Warmup] @${account.username} liked a post.`);
              await page.waitForTimeout(2000);
            }
          } catch (likeErr) {
            console.warn(`[Warmup] Notice while liking:`, likeErr.message);
          }
        }

        // 3. Occasional Friendly Comment (~7% probability, max 1 per session)
        const shouldComment = !sessionComments && Math.random() < 0.07;
        if (shouldComment) {
          try {
            const commentSelector = 'textarea[placeholder*="comment"], textarea[aria-label*="comment"], div[contenteditable="true"][role="textbox"]';
            const commentLocator = page.locator(commentSelector).first();
            const isVisible = await commentLocator.isVisible().catch(() => false);

            if (isVisible) {
              const commentText = FRIENDLY_COMMENTS[Math.floor(Math.random() * FRIENDLY_COMMENTS.length)];
              await commentLocator.click({ timeout: 3000 }).catch(() => {});
              await page.waitForTimeout(600);
              await page.keyboard.type(commentText, { delay: Math.floor(Math.random() * 40) + 50 });
              await page.waitForTimeout(1000);
              await page.keyboard.press('Enter');

              sessionComments++;
              currentStats.commentsGiven = (currentStats.commentsGiven || 0) + 1;
              db.updateAccount(accountId, {
                warmupStats: currentStats,
                warmupCurrentAction: `Commented: "${commentText}" 💬`
              });

              db.addLog({
                accountId: account.id,
                targetUsername: 'feed',
                action: 'warmup_comment',
                status: 'success',
                details: `Warmup Engine: Commented "${commentText}"`
              });

              console.log(`[Warmup] @${account.username} commented: "${commentText}"`);
              await page.waitForTimeout(3000);
            }
          } catch (commentErr) {
            console.warn(`[Warmup] Notice while commenting:`, commentErr.message);
          }
        }
                warmupCurrentAction: `Commented: "${commentText}" 💬`
              });

              db.addLog({
                accountId: account.id,
                targetUsername: 'feed',
                action: 'warmup_comment',
                status: 'success',
                details: `Warmup Engine: Commented "${commentText}"`
              });

              console.log(`[Warmup] @${account.username} commented: "${commentText}"`);
              await page.waitForTimeout(3000);
            }
          } catch (commentErr) {
            console.warn(`[Warmup] Notice while commenting:`, commentErr.message);
          }
        }

        // Brief random pause between actions
        await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);
      }

      // Completed an active session! Now take a natural rest cooldown (20 to 35 minutes)
      const restMinutes = Math.floor(Math.random() * 15) + 20; // 20 - 35 minutes
      const restMs = restMinutes * 60 * 1000;
      const nextSessionAt = new Date(Date.now() + restMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      console.log(`[Warmup] Session finished for @${account.username}. Resting for ${restMinutes} minutes (resumes at ${nextSessionAt})...`);

      db.updateAccount(accountId, {
        warmupStatus: 'cooldown',
        warmupCurrentAction: `Resting between sessions (${restMinutes}m rest, resumes ~${nextSessionAt})`
      });

      worker.timeoutId = setTimeout(() => {
        this.runWarmupLoop(accountId);
      }, restMs);

    } catch (err) {
      console.error(`[Warmup] Error during session for @${account.username}:`, err.message);
      // Wait 5 minutes before retrying if network/navigation blip
      worker.timeoutId = setTimeout(() => {
        this.runWarmupLoop(accountId);
      }, 5 * 60 * 1000);
    }
  }
}

export const warmupEngine = new WarmupEngine();
