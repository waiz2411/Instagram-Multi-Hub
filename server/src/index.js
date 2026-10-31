import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import url from 'url';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import accountsRouter from './routes/accounts.js';
import leadsRouter from './routes/leads.js';
import campaignsRouter from './routes/campaigns.js';
import logsRouter from './routes/logs.js';
import { db } from './db.js';
import { browserManager } from './browserManager.js';
import { outreachEngine } from './outreachEngine.js';
import { warmupEngine } from './warmupEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Mount API Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/logs', logsRouter);

// Serve Vite frontend static build in production or when client/dist exists
if (fs.existsSync(CLIENT_DIST)) {
  console.log(`[Server] Serving production frontend from ${CLIENT_DIST}`);
  app.use(express.static(CLIENT_DIST));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      return res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    }
    next();
  });
}

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server for live browser screencasting
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const parsedUrl = url.parse(request.url, true);
  const pathname = parsedUrl.pathname;

  // Pattern: /ws/browser/:accountId or query ?accountId=...
  if (pathname.startsWith('/ws/browser/')) {
    const accountId = pathname.replace('/ws/browser/', '').split('/')[0];
    request.accountId = accountId;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (parsedUrl.query && parsedUrl.query.accountId) {
    request.accountId = parsedUrl.query.accountId;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (ws, request) => {
  const accountId = request.accountId;
  console.log(`[WS] Client connected for account ${accountId}`);

  const account = db.getAccount(accountId);
  if (!account) {
    ws.send(JSON.stringify({ type: 'error', message: 'Account not found' }));
    ws.close();
    return;
  }

  try {
    const session = await browserManager.getOrCreateSession(account, {
      isMobile: account.isMobile
    });

    session.addSubscriber(ws);

    ws.on('message', async (data) => {
      try {
        const payload = JSON.parse(data.toString());
        await session.handleInput(payload);
      } catch (err) {
        console.warn(`[WS] Invalid input packet:`, err.message);
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected from account ${accountId}`);
      session.removeSubscriber(ws);
    });

    ws.on('error', (err) => {
      console.error(`[WS] Socket error on account ${accountId}:`, err.message);
    });
  } catch (err) {
    console.error(`[WS] Failed to link browser session:`, err.message);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to launch browser: ' + err.message }));
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down gracefully...');
  await browserManager.closeAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Server] SIGTERM received, shutting down...');
  await browserManager.closeAll();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Instagram Multi-Hub Backend Running on:`);
  console.log(`   HTTP: http://localhost:${PORT}`);
  console.log(`   WS:   ws://localhost:${PORT}/ws/browser/:id`);
  console.log(`===============================================`);
});
