import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { db } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROFILES_DIR = path.resolve(__dirname, '../data/profiles');

class BrowserSession {
  constructor(account, options = {}) {
    this.account = account;
    this.accountId = account.id;
    this.options = options;
    this.context = null;
    this.page = null;
    this.cdp = null;
    this.subscribers = new Set();
    this.isRunning = false;
    this.isHeadless = options.headless ?? true;
    this.viewport = options.viewport || (account.isMobile ? { width: 430, height: 932 } : { width: 1280, height: 800 });
    this.isMobile = options.isMobile ?? Boolean(account.isMobile);
    this.currentUrl = 'https://www.instagram.com/accounts/login/';
    this.lastFrameTime = 0;
    this.minFrameInterval = 33; // ~30 FPS throttle
    this.isStarting = false;
  }

  getProfileDir() {
    const dir = path.join(PROFILES_DIR, this.accountId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  async start() {
    if (this.isRunning && this.page) {
      return this;
    }
    if (this.isStarting) {
      while (this.isStarting) {
        await new Promise(r => setTimeout(r, 100));
      }
      return this;
    }

    this.isStarting = true;

    try {
      const profileDir = this.getProfileDir();
      const args = [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certificate-errors',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        `--window-size=${this.viewport.width},${this.viewport.height}`
      ];

      // Use valid Chrome User Agents to prevent Instagram from blocking rendering
      const userAgent = this.isMobile
        ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

      const launchOptions = {
        headless: this.isHeadless,
        args,
        viewport: this.viewport,
        userAgent,
        bypassCSP: true,
        locale: 'en-US',
        timezoneId: 'America/New_York'
      };

      if (this.account.proxyUrl) {
        launchOptions.proxy = { server: this.account.proxyUrl };
      }

      console.log(`[Browser] Launching session for @${this.account.username || this.accountId} (headless: ${this.isHeadless})...`);
      try {
        this.context = await chromium.launchPersistentContext(profileDir, launchOptions);
      } catch (launchErr) {
        const errMsg = launchErr.message || '';
        if (errMsg.includes("Executable doesn't exist") || errMsg.includes('npx playwright install')) {
          console.warn('[Browser] Playwright browser executable is missing. Auto-downloading Chromium right now...');
          const { execSync } = await import('child_process');
          try {
            execSync('npx playwright install chromium', { stdio: 'inherit' });
            console.log('[Browser] Chromium downloaded successfully! Retrying persistent context launch...');
            this.context = await chromium.launchPersistentContext(profileDir, launchOptions);
          } catch (installErr) {
            console.error('[Browser] Auto-download error:', installErr.message);
            throw launchErr;
          }
        } else {
          throw launchErr;
        }
      }

      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

      // Setup CDP for live binary screencasting
      this.cdp = await this.context.newCDPSession(this.page);
      await this.cdp.send('Page.enable');

      // Binary screencast listener
      this.cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
        const now = Date.now();
        const elapsed = now - this.lastFrameTime;

        // Broadcast binary frame Buffer directly over WebSocket
        if (this.subscribers.size > 0 && data) {
          const frameBuffer = Buffer.from(data, 'base64');
          for (const ws of this.subscribers) {
            if (ws.readyState === 1 /* OPEN */) {
              ws.send(frameBuffer, { binary: true });
            }
          }
        }

        // Paced acknowledgment to throttle CDP frame generation to ~30 FPS
        const delay = Math.max(0, this.minFrameInterval - elapsed);
        if (delay > 0) {
          await new Promise(r => setTimeout(r, delay));
        }

        this.lastFrameTime = Date.now();
        try {
          if (this.cdp) {
            await this.cdp.send('Page.screencastFrameAck', { sessionId });
          }
        } catch (err) {}
      });

      // Start screencast
      await this.startScreencast();

      // Navigation listeners
      this.page.on('load', async () => {
        this.currentUrl = this.page.url();
        this.broadcastJson({ type: 'navigated', url: this.currentUrl });
        this.detectSessionState();
        this.captureAndPushScreenshot();
      });

      this.page.on('framenavigated', (frame) => {
        if (frame === this.page.mainFrame()) {
          this.currentUrl = frame.url();
          this.broadcastJson({ type: 'navigated', url: this.currentUrl });
        }
      });

      // Navigate to Instagram login if fresh page
      const initialUrl = this.page.url();
      if (!initialUrl || initialUrl === 'about:blank') {
        try {
          await this.page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch (e) {
          console.warn(`[Browser] Initial navigation notice:`, e.message);
        }
      }

      this.currentUrl = this.page.url() || 'https://www.instagram.com/accounts/login/';
      this.isRunning = true;

      // Push initial screenshot
      await this.captureAndPushScreenshot();

      // Check session state after 2.5s
      setTimeout(() => this.detectSessionState(), 2500);

      return this;
    } finally {
      this.isStarting = false;
    }
  }

  async startScreencast() {
    if (!this.cdp) return;
    try {
      await this.cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 68,
        maxWidth: this.viewport.width,
        maxHeight: this.viewport.height,
        everyNthFrame: 1
      });
    } catch (e) {
      console.error(`[Browser] Failed to start screencast:`, e.message);
    }
  }

  async stopScreencast() {
    if (!this.cdp) return;
    try {
      await this.cdp.send('Page.stopScreencast');
    } catch (e) {}
  }

  async captureAndPushScreenshot(targetWs = null) {
    if (!this.cdp) return;
    try {
      const { data } = await this.cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 68
      });
      if (!data) return;

      const frameBuffer = Buffer.from(data, 'base64');
      if (targetWs) {
        if (targetWs.readyState === 1) {
          targetWs.send(frameBuffer, { binary: true });
        }
      } else {
        for (const ws of this.subscribers) {
          if (ws.readyState === 1) {
            ws.send(frameBuffer, { binary: true });
          }
        }
      }
    } catch (err) {}
  }

  async addSubscriber(ws) {
    this.subscribers.add(ws);
    // Send initial metadata JSON
    ws.send(JSON.stringify({
      type: 'session_ready',
      url: this.currentUrl,
      viewport: this.viewport,
      accountId: this.accountId,
      isMobile: this.isMobile
    }));

    // Immediately push current frame to the new subscriber
    await this.captureAndPushScreenshot(ws);
  }

  removeSubscriber(ws) {
    this.subscribers.delete(ws);
  }

  broadcastJson(message) {
    const raw = JSON.stringify(message);
    for (const ws of this.subscribers) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(raw);
      }
    }
  }

  // --- Remote Inputs ---
  async handleInput(event) {
    if (!this.cdp) return;

    try {
      switch (event.type) {
        case 'mouse_move':
          await this.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: Math.round(event.x),
            y: Math.round(event.y)
          });
          break;

        case 'mouse_down':
          await this.cdp.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: Math.round(event.x),
            y: Math.round(event.y),
            button: event.button || 'left',
            clickCount: 1
          });
          break;

        case 'mouse_up':
          await this.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: Math.round(event.x),
            y: Math.round(event.y),
            button: event.button || 'left',
            clickCount: 1
          });
          setTimeout(() => this.captureAndPushScreenshot(), 80);
          break;

        case 'mouse_wheel':
          await this.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: Math.round(event.x),
            y: Math.round(event.y),
            deltaX: event.deltaX || 0,
            deltaY: event.deltaY || 0
          });
          break;

        case 'char_input':
          // Single character insert - 100% reliable, never duplicates!
          await this.cdp.send('Input.insertText', { text: event.text });
          setTimeout(() => this.captureAndPushScreenshot(), 40);
          break;

        case 'insert_text':
          // Pasting whole string or clipboard text
          await this.cdp.send('Input.insertText', { text: event.text });
          setTimeout(() => this.captureAndPushScreenshot(), 60);
          break;

        case 'special_key':
          // Enter, Backspace, Delete, Tab, Arrow keys, or shortcuts
          await this.cdp.send('Input.dispatchKeyEvent', {
            type: 'rawKeyDown',
            key: event.key,
            code: event.code,
            windowsVirtualKeyCode: event.keyCode,
            modifiers: event.modifiers || 0
          });
          await this.cdp.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: event.key,
            code: event.code,
            windowsVirtualKeyCode: event.keyCode,
            modifiers: event.modifiers || 0
          });
          setTimeout(() => this.captureAndPushScreenshot(), 50);
          break;

        case 'navigate':
          if (event.url) {
            await this.page.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await this.captureAndPushScreenshot();
          }
          break;

        case 'go_back':
          await this.page.goBack();
          await this.captureAndPushScreenshot();
          break;

        case 'go_forward':
          await this.page.goForward();
          await this.captureAndPushScreenshot();
          break;

        case 'reload':
          await this.page.reload();
          await this.captureAndPushScreenshot();
          break;

        case 'set_viewport':
          if (event.width && event.height) {
            this.viewport = { width: event.width, height: event.height };
            this.isMobile = Boolean(event.isMobile);
            await this.page.setViewportSize(this.viewport);
            await this.stopScreencast();
            await this.startScreencast();
            await this.captureAndPushScreenshot();
          }
          break;

        default:
          break;
      }
    } catch (err) {
      console.warn(`[Browser] Input dispatch notice:`, err.message);
    }
  }

  // --- Session State & Auto-Detection ---
  async detectSessionState() {
    if (!this.context || !this.page) return;

    try {
      const cookies = await this.context.cookies(['https://www.instagram.com']);
      const sessionCookie = cookies.find(c => c.name === 'sessionid');
      const isLoggedIn = Boolean(sessionCookie && sessionCookie.value);

      if (isLoggedIn) {
        const info = await this.page.evaluate(() => {
          let username = null;
          let profilePic = null;

          if (window._sharedData && window._sharedData.config && window._sharedData.config.viewer) {
            username = window._sharedData.config.viewer.username;
            profilePic = window._sharedData.config.viewer.profile_pic_url;
          }

          if (!username) {
            const profileLinks = Array.from(document.querySelectorAll('a[href^="/"]'));
            for (const a of profileLinks) {
              const href = a.getAttribute('href');
              if (href && !['/explore/', '/direct/inbox/', '/reels/', '/accounts/'].some(x => href.startsWith(x))) {
                const match = href.match(/^\/([a-zA-Z0-9._]+)\/$/);
                if (match && a.querySelector('img')) {
                  username = match[1];
                  profilePic = a.querySelector('img').getAttribute('src');
                  break;
                }
              }
            }
          }

          return { username, profilePic };
        }).catch(() => null);

        const updates = {
          status: 'connected',
          lastActiveAt: new Date().toISOString()
        };

        if (info?.username && (!this.account.username || this.account.username.startsWith('account_'))) {
          updates.username = info.username;
        }
        if (info?.profilePic) {
          updates.profilePic = info.profilePic;
        }

        db.updateAccount(this.accountId, updates);
        this.broadcastJson({
          type: 'account_detected',
          account: { ...this.account, ...updates }
        });
      } else {
        if (this.account.status === 'connected') {
          db.updateAccount(this.accountId, { status: 'needs_login' });
          this.broadcastJson({ type: 'account_detected', account: { ...this.account, status: 'needs_login' } });
        }
      }
    } catch (err) {
      console.error(`[Browser] detectSessionState error:`, err.message);
    }
  }

  async close() {
    try {
      this.isRunning = false;
      if (this.cdp) {
        await this.stopScreencast().catch(() => {});
        await this.cdp.detach().catch(() => {});
        this.cdp = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
        this.page = null;
      }
      console.log(`[Browser] Closed session for account ${this.accountId}`);
    } catch (err) {
      console.error(`[Browser] Error closing session:`, err.message);
    }
  }
}

class BrowserManager {
  constructor() {
    this.sessions = new Map(); // accountId -> BrowserSession
  }

  async getOrCreateSession(account, options = {}) {
    let session = this.sessions.get(account.id);
    if (!session || !session.isRunning) {
      session = new BrowserSession(account, options);
      this.sessions.set(account.id, session);
      await session.start();
    }
    return session;
  }

  getSession(accountId) {
    return this.sessions.get(accountId);
  }

  async openNativeWindow(accountId) {
    if (process.platform === 'linux' && !process.env.DISPLAY) {
      throw new Error('Desktop window mode requires a local screen (Windows/Mac). On cloud servers like Render, please use the in-app Remote Browser.');
    }

    const existing = this.sessions.get(accountId);
    if (existing) {
      await existing.close();
      this.sessions.delete(accountId);
    }

    const account = db.getAccount(accountId);
    if (!account) throw new Error('Account not found');

    const nativeSession = new BrowserSession(account, { headless: false });
    this.sessions.set(accountId, nativeSession);
    await nativeSession.start();
    return nativeSession;
  }

  async closeSession(accountId) {
    const session = this.sessions.get(accountId);
    if (session) {
      await session.close();
      this.sessions.delete(accountId);
    }
  }

  async closeAll() {
    for (const [id, session] of this.sessions.entries()) {
      await session.close();
    }
    this.sessions.clear();
  }
}

export const browserManager = new BrowserManager();
