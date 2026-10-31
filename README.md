# Instagram Multi-Hub 🚀
### Multi-Account Instagram Outreach System & Automated Human Warmup Engine

Instagram Multi-Hub allows you to connect and manage multiple Instagram accounts within a single unified web dashboard. Every account runs in its own isolated Chromium browser profile, bypassing Instagram's iframe restrictions and cookie collisions through real-time Chrome DevTools Protocol (CDP) WebSocket screencasting.

---

## 🌟 Key Features

1. **Multi-Account Browser Connection**:
   - One-click to connect new Instagram accounts.
   - Live interactive browser streamed directly inside the web UI on an HTML5 `<canvas>`.
   - Log in manually, solve 2FA/SMS codes, and navigate Instagram naturally.
   - Persistent isolated session data (`server/data/profiles/{id}`): once logged in, you remain logged in!
   - Auto-detection of username, avatar, and active login state.

2. **Visual Dispatching & Safe Outreach Cadence**:
   - **Visual Dispatch Badge**: Live glowing status shows `"Dispatching message to @username..."` in real time during send.
   - **Humanized Random Delay (25 to 35 minutes)**: Every outreach message is spaced by a randomized 25–35 minute interval to protect accounts from Instagram spam triggers.
   - **Live Countdown Timer**: Card displays `"Next DM in: 28m 42s"` ticking down every second.
   - **Last Sent Timestamp**: Displays relative time when the last DM was successfully sent (e.g. `"Last sent: 5 mins ago"`).

3. **Automated Human Warmup Mode ("Warmup Engine")**:
   - Toggle warmup mode on any account card with 1 click.
   - Mimics real human usage:
     - Smoothly scrolls feed and reels.
     - Dwells on posts/videos for 4–8 seconds (simulating watching and reading).
     - Randomly likes content (~20–25% chance).
     - Leaves safe, positive comments from a curated natural comment pool (~7% chance).
     - Runs in natural sessions followed by 20–35 minute rest periods over the day.
   - Displays live warmup activity counters (`Viewed`, `Liked`, `Commented`).

4. **Lead Lists Hub**:
   - Organize leads into custom segmented lists (e.g. "Agency Owners", "Real Estate", "Creators").
   - Assign dedicated lead lists to specific accounts to scale cold outreach across multiple accounts simultaneously.
   - Bulk importer supporting CSV or plain-text username lists.

5. **Spintax & Dynamic Personalization**:
   - Randomizes variations: `{Hi|Hey|Hello} {first_name}! Loved your profile.`
   - Dynamic tags: `{username}`, `{first_name}`, `{full_name}`.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express 5, Playwright (Chromium), WebSockets (`ws`), File-based atomic JSON Database.
- **Frontend**: React 19, Vite 8, TailwindCSS v4, Lucide Icons.
- **Streaming**: Chrome DevTools Protocol `Page.startScreencast` + Binary JPEG WebSocket Frame Relay.

---

## 💻 Local Quick Start

### 1. Launch Backend & Frontend
Double-click `start.bat` or run:
```bash
npm run dev
```

- **Frontend Dashboard**: `http://localhost:3000`
- **Backend API & WebSocket Stream**: `http://localhost:5000`

### 2. Connect Your Instagram Account
1. Open `http://localhost:3000`.
2. Click **"Connect Insta Account"**.
3. The live browser stream will open right inside your dashboard.
4. Enter your Instagram login details and complete any 2FA challenge.
5. Click **"Sync"** (or it will auto-detect). Your account is now connected!

---

## ☁️ Deploying to Free Render.com via GitHub

Instagram Multi-Hub is production-ready for deployment on Render's free tier as a unified Web Service (Express serves the compiled React app and Playwright CDP proxy).

### Step 1: Initialize Git and Push to GitHub

In your project directory, run:
```bash
git init
git add .
git commit -m "Production release: Instagram Multi-Hub v2.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```
*(The included `.gitignore` automatically keeps node_modules and heavy temporary cache folders off GitHub.)*

---

### Step 2: Create a Web Service on Render

1. Log into your free account at [dashboard.render.com](https://dashboard.render.com/).
2. Click **"New +"** and select **"Web Service"**.
3. Choose **"Build and deploy from a Git repository"** and select your GitHub repo.
4. Configure the service settings:
   - **Name**: `instagram-multi-hub` (or your preferred name)
   - **Region**: Choose the closest region (e.g., `Oregon (US West)` or `Frankfurt (EU)`)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     chmod +x ./render-build.sh && ./render-build.sh
     ```
     *(This installs dependencies, builds Vite client, and installs Linux Chromium dependencies automatically)*
   - **Start Command**:
     ```bash
     node server/src/index.js
     ```
   - **Plan**: `Free`

5. Under **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `PORT` = `10000` (or leave default, Render sets this automatically)

6. Click **"Create Web Service"**.

---

### Step 3: Accessing Your Deployed App

Once the build finishes (about 3–5 minutes for the initial Chromium download):
1. Click your Render URL (e.g. `https://instagram-multi-hub.onrender.com`).
2. The entire dark-mode dashboard loads cleanly.
3. You can connect accounts, run Warmup Mode, and manage outreach from anywhere!

> [!TIP]
> **Keeping Free Render Active (Preventing Sleep)**:
> Render's free tier spins down web services after 15 minutes of inactivity. To keep your automated Warmup and Outreach engine running continuously 24/7, set up a free monitor at [cron-job.org](https://cron-job.org) or [uptimerobot.com](https://uptimerobot.com) to ping your health endpoint every 10 minutes:
> `https://your-app.onrender.com/api/health`
