/**
 * 24/7 WHATSAPP AUTO-REPLY BOT FOR RAILWAY
 * Running with Baileys Multi-Device & Browser-Based Graphical QR Code
 */

// Node.js crypto module setup - MUST precede all Baileys and Signal imports
const crypto = require('crypto');
if (!global.crypto) {
  global.crypto = crypto;
}
if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto || crypto;
}
if (crypto.webcrypto && !global.crypto.subtle) {
  try {
    global.crypto.subtle = crypto.webcrypto.subtle;
  } catch (e) {}
}

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Priority: process.env.PORT provided dynamically by Railway, fallback 3000 (or 8080)
const PORT = process.env.PORT || 3000;

// Centralized Connection & QR State
// States: 'WAITING_FOR_QR' | 'QR_READY' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'
let sock = null;
let currentStatus = 'WAITING_FOR_QR';
let latestQrString = null;
let latestQrDataUrl = null;
let connectedJid = null;
let isStarting = false;
let qrReceived = false;

// Persistent WhatsApp authentication path on Railway Volume (/app/data/auth_info)
function resolveAuthDirectory() {
  if (process.env.AUTH_DIR && process.env.AUTH_DIR.trim()) {
    return path.resolve(process.env.AUTH_DIR.trim());
  }
  const primaryDir = '/app/data/auth_info';
  try {
    if (!fs.existsSync(primaryDir)) {
      fs.mkdirSync(primaryDir, { recursive: true });
    }
    return primaryDir;
  } catch {
    const fallbackDir = path.resolve(process.cwd(), 'data', 'auth_info');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return fallbackDir;
  }
}

const AUTH_DIR = resolveAuthDirectory();

// Ensure auth directory exists without removing or recreating volume data
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

async function startBot() {
  // Prevent duplicate concurrent startBot() calls creating competing sockets
  if (isStarting) {
    console.log('⚠️ startBot is already running. Skipping duplicate call.');
    return;
  }
  isStarting = true;

  // Clean up any existing socket before opening a fresh connection
  if (sock) {
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.end(undefined);
    } catch (e) {}
    sock = null;
  }

  console.log('====================================================');
  console.log('🚀 Initializing WhatsApp Baileys 24/7 Bot on Railway...');
  console.log(`📁 Persistent Auth Directory: ${AUTH_DIR}`);
  console.log('====================================================');

  try {
    // Saves and reuses authentication credentials from /app/data/auth_info
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // Log whether state.creds.registered === true/false BEFORE makeWASocket()
    console.log(`📋 Credential State Check: state.creds.registered = ${state.creds?.registered === true}`);
    console.log(`📋 Current Account Identity: ${state.creds?.me?.id || 'none (unauthenticated)'}`);

    if (state.creds?.registered) {
      currentStatus = 'CONNECTING';
    } else {
      currentStatus = 'WAITING_FOR_QR';
    }

    // Critical Fix: If previous pairing leftover exists on unconfirmed credentials,
    // clear unconfirmed companion identity so Baileys sends registration and emits QR code
    if (!state.creds?.registered && state.creds?.me) {
      console.log('🧹 Detected uncompleted pairing-code leftover in credentials.');
      console.log('👉 Clearing unconfirmed companion identity to allow QR code registration...');
      delete state.creds.me;
      delete state.creds.pairingCode;
      await saveCreds();
    }

    // Fetch latest WhatsApp Web version to avoid connection handshake rejections
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307]
    }));

    // Use canonical Ubuntu/Chrome browser identity
    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (err) {
        console.error('❌ Error saving credentials to /app/data/auth_info:', err);
      }
    });

    // Connection update listener
    sock.ev.on('connection.update', async (update) => {
      const {
        connection,
        lastDisconnect,
        qr,
        isNewLogin,
        receivedPendingNotifications
      } = update;

      // Log COMPLETE connection.update fields
      console.log('📡 [connection.update event]:', {
        connection: connection || 'unchanged',
        qr: qr ? `PRESENT (length: ${qr.length})` : undefined,
        isNewLogin: isNewLogin !== undefined ? isNewLogin : undefined,
        receivedPendingNotifications: receivedPendingNotifications !== undefined ? receivedPendingNotifications : undefined,
        lastDisconnect: lastDisconnect ? {
          statusCode: lastDisconnect.error?.output?.statusCode,
          message: lastDisconnect.error?.message,
          data: lastDisconnect.error?.data
        } : undefined
      });

      if (connection === 'connecting' && currentStatus !== 'QR_READY' && currentStatus !== 'CONNECTED') {
        currentStatus = 'CONNECTING';
      }

      // Baileys emitted a fresh QR code
      if (qr) {
        qrReceived = true;
        latestQrString = qr;
        currentStatus = 'QR_READY';

        try {
          // Generate REAL graphical QR code PNG as a data URL
          latestQrDataUrl = await QRCode.toDataURL(qr, {
            width: 360,
            margin: 2,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#111827',
              light: '#ffffff'
            }
          });
        } catch (err) {
          console.error('❌ Error generating graphical QR data URL:', err);
        }

        console.log('\n========================================');
        console.log('========== WHATSAPP QR LOGIN ==========');
        console.log('Scan this QR with WhatsApp → Linked Devices → Link a device');
        console.log('View high-res scannable browser QR at: http://<your-host>/qr');
        console.log('========================================\n');
        
        // Terminal QR as secondary backup in logs
        try {
          qrcodeTerminal.generate(qr, { small: true });
        } catch (e) {}
        console.log('\n========================================\n');
      }

      // Connection closed / disconnected handling
      if (connection === 'close') {
        isStarting = false;
        currentStatus = 'DISCONNECTED';
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || '';
        const errorData = lastDisconnect?.error?.data;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isRestart = statusCode === DisconnectReason.restartRequired || statusCode === 515;

        if (statusCode === 401 && !qrReceived && !state.creds?.registered) {
          console.error('\n❌ [DIAGNOSTIC: 401 before QR]:', {
            statusCode,
            errorMessage,
            errorData,
            credsRegistered: state.creds?.registered,
            credsMe: state.creds?.me,
            fullError: lastDisconnect?.error
          });
        }

        if (isLoggedOut) {
          currentStatus = 'DISCONNECTED';
          latestQrString = null;
          latestQrDataUrl = null;
          qrReceived = false;
          console.log('\n❌ [SESSION TERMINATED]: WhatsApp session was logged out from phone or server.');
          console.log('⚡ Session was revoked. Re-initializing for a fresh QR code...');

          setTimeout(() => {
            startBot();
          }, 3000);
        } else if (isRestart) {
          currentStatus = 'CONNECTING';
          console.log('🔄 [HANDSHAKE TRANSITION]: Baileys restartRequired (code 515). Reconnecting socket...');
          setTimeout(() => {
            startBot();
          }, 1500);
        } else {
          currentStatus = 'DISCONNECTED';
          console.log(`🔄 Temporary disconnect (Status: ${statusCode || 'unknown'}, Reason: "${errorMessage}"). Reconnecting in 4 seconds...`);
          setTimeout(() => {
            startBot();
          }, 4000);
        }
      } else if (connection === 'open') {
        isStarting = false;
        currentStatus = 'CONNECTED';
        connectedJid = sock.user?.id || 'Connected Device';
        latestQrString = null;
        latestQrDataUrl = null;
        console.log('\n========================================');
        console.log('WHATSAPP CONNECTED SUCCESSFULLY');
        console.log(`Device JID: ${connectedJid}`);
        console.log(`Storage: ${AUTH_DIR}`);
        console.log('========================================\n');
      }
    });

    // Automated 24/7 Customer Auto-Reply
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      const msg = messages[0];
      if (!msg || !msg.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid;
      const name = msg.pushName || 'Customer';
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      ).trim();

      if (!text) return;

      console.log(`[Incoming WhatsApp] From: ${name} (${from}): "${text}"`);
      const lower = text.toLowerCase();

      try {
        if (lower === 'hi' || lower === 'hello' || lower === 'namaste' || lower === 'start' || lower === 'rate') {
          await sock.sendMessage(from, {
            text: `Namaste ${name} ji! 🙏 Apex Wholesale & Retail mein aapka swagat hai.\n\nYeh hamara 24/7 WhatsApp Automated Desk hai.\n\nKripya option chunein:\n1️⃣ Product Catalog & Rates\n2️⃣ Latest Bulk Offers\n3️⃣ Talk to Human Executive`
          });
        } else if (lower === '1' || lower.includes('catalog') || lower.includes('price')) {
          await sock.sendMessage(from, {
            text: `Ye lijiye hamari Catalog 📦:\n• Wireless Earbuds: ₹599 (Bulk ₹420)\n• Smartwatch Ultra: ₹1,299 (Bulk ₹950)\n• Fast Charger 65W: ₹499 (Bulk ₹310)\n• Bluetooth Soundbar: ₹1,899 (Bulk ₹1,400)\n\nOrder lagane ke liye product ka naam type karein!`
          });
        } else if (lower === '2' || lower.includes('bulk') || lower.includes('offer')) {
          await sock.sendMessage(from, {
            text: `🔥 *Special Wholesale Bulk Offers:*\n\n• Flat 25% OFF on 20+ units\n• Free shipping on orders above ₹10,000\n• Same-day dispatch with GST invoice\n\nReply with your required quantity to get an instant quote!`
          });
        } else if (lower === '3' || lower.includes('talk') || lower.includes('agent')) {
          await sock.sendMessage(from, {
            text: `Hamare Sales Manager ko notify kar diya gaya hai. Thodi der me aapse baat karenge.`
          });
        }
      } catch (err) {
        console.error('[Auto-Reply Error]:', err);
      }
    });
  } catch (err) {
    isStarting = false;
    currentStatus = 'DISCONNECTED';
    console.error('Fatal error starting WhatsApp Bot:', err);
    setTimeout(startBot, 5000);
  }
}

// ============================================================
// BROWSER-BASED GRAPHICAL QR CODE PAGE & API
// ============================================================

// API endpoint returning current status and latest QR data URL
app.get('/qr/status', (req, res) => {
  res.json({
    status: currentStatus,
    hasQr: !!latestQrDataUrl,
    qrDataUrl: latestQrDataUrl,
    connectedJid: connectedJid,
    authDir: AUTH_DIR,
    timestamp: new Date().toISOString()
  });
});

// GET /qr: Mobile-friendly & desktop-friendly standalone HTML page
app.get('/qr', async (req, res) => {
  if (req.query.json === 'true') {
    return res.json({
      status: currentStatus,
      hasQr: !!latestQrDataUrl,
      qrDataUrl: latestQrDataUrl,
      connectedJid: connectedJid
    });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Bot Login | Scan QR Code</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0b141a;
      color: #e9edef;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .card {
      background: #111b21;
      border: 1px solid #222e35;
      border-radius: 16px;
      width: 100%;
      max-width: 480px;
      padding: 28px 24px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      text-align: center;
    }
    .header-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(37, 211, 102, 0.12);
      border: 1px solid rgba(37, 211, 102, 0.3);
      color: #25d366;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 9999px;
      margin-bottom: 16px;
    }
    .header-badge svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #ffffff;
    }
    .instructions {
      font-size: 14px;
      color: #8696a0;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .step-box {
      background: #182229;
      border: 1px solid #222e35;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 24px;
      font-size: 13px;
      color: #aebac1;
      text-align: left;
    }
    .step-box ol {
      margin-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .step-highlight {
      color: #25d366;
      font-weight: 600;
    }
    .qr-container {
      background: #ffffff;
      padding: 14px;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px auto;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      min-width: 280px;
      min-height: 280px;
      position: relative;
    }
    .qr-container img {
      width: 280px;
      height: 280px;
      max-width: 100%;
      height: auto;
      display: block;
      border-radius: 6px;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 4px solid #e9edef;
      border-top-color: #25d366;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
      margin: 40px auto 16px auto;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 8px;
      margin-top: 4px;
    }
    .status-WAITING_FOR_QR {
      background: #2a2412;
      color: #fbbf24;
      border: 1px solid #573f08;
    }
    .status-QR_READY {
      background: #0f2438;
      color: #38bdf8;
      border: 1px solid #1e4976;
    }
    .status-CONNECTING {
      background: #241639;
      color: #c084fc;
      border: 1px solid #4e297a;
    }
    .status-CONNECTED {
      background: #064e3b;
      color: #34d399;
      border: 1px solid #059669;
    }
    .status-DISCONNECTED {
      background: #36171a;
      color: #f87171;
      border: 1px solid #6b2127;
    }
    .success-card {
      background: #064e3b;
      border: 1px solid #059669;
      border-radius: 12px;
      padding: 32px 20px;
      margin: 10px 0;
      color: #ffffff;
      animation: popIn 0.3s ease-out;
    }
    @keyframes popIn {
      from { transform: scale(0.96); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .success-icon {
      width: 56px;
      height: 56px;
      background: #10b981;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }
    .success-icon svg {
      width: 32px;
      height: 32px;
      fill: #ffffff;
    }
    .success-title {
      font-size: 20px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .success-meta {
      font-size: 13px;
      color: #a7f3d0;
      margin-top: 4px;
    }
    .footer-note {
      font-size: 12px;
      color: #8696a0;
      margin-top: 20px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header-badge">
      <svg viewBox="0 0 24 24">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z"/>
      </svg>
      DirectConnect WhatsApp Bot
    </div>

    <h1>Scan QR with WhatsApp</h1>
    <p class="instructions">Link your device to enable 24/7 automated customer replies</p>

    <div class="step-box">
      <ol>
        <li>Open <span class="step-highlight">WhatsApp</span> on your phone</li>
        <li>Tap <span class="step-highlight">Menu (⋮)</span> or <span class="step-highlight">Settings</span> → <span class="step-highlight">Linked Devices</span></li>
        <li>Tap <span class="step-highlight">Link a device</span> and point camera at the QR code below:</li>
      </ol>
    </div>

    <!-- Active QR Code View -->
    <div id="qr-view">
      <div class="qr-container" id="qr-box">
        <div id="spinner-box">
          <div class="spinner"></div>
          <p style="font-size: 13px; color: #54656f;">Generating fresh QR code...</p>
        </div>
        <img id="qr-img" src="" alt="WhatsApp Login QR Code" style="display: none;" />
      </div>
    </div>

    <!-- Connected Success Screen -->
    <div id="connected-view" style="display: none;">
      <div class="success-card">
        <div class="success-icon">
          <svg viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z"/>
          </svg>
        </div>
        <div class="success-title">WHATSAPP CONNECTED</div>
        <p style="font-size: 14px; margin-top: 4px;">24/7 Bot is online and listening for messages</p>
        <p class="success-meta" id="connected-jid-text"></p>
        <p class="success-meta">Credentials secured in persistent volume</p>
      </div>
    </div>

    <!-- Live Status Pill -->
    <div>
      <div id="status-pill" class="status-badge status-WAITING_FOR_QR">
        <span class="pulse-dot"></span>
        <span id="status-text">WAITING_FOR_QR</span>
      </div>
    </div>

    <p class="footer-note">⚡ Real-time synchronization • Auto-refreshes when a new QR is generated</p>
  </div>

  <script>
    let currentLocalStatus = '';
    let currentLocalQr = '';

    async function checkStatus() {
      try {
        const res = await fetch('/qr/status');
        if (!res.ok) return;
        const data = await res.json();

        // Update status badge
        const pill = document.getElementById('status-pill');
        const statusText = document.getElementById('status-text');
        pill.className = 'status-badge status-' + data.status;
        statusText.innerText = data.status.replace(/_/g, ' ');

        // State: CONNECTED
        if (data.status === 'CONNECTED') {
          document.getElementById('qr-view').style.display = 'none';
          document.getElementById('connected-view').style.display = 'block';
          if (data.connectedJid) {
            document.getElementById('connected-jid-text').innerText = 'Device: ' + data.connectedJid;
          }
          return;
        }

        // State: WAITING_FOR_QR or CONNECTING without QR
        if (!data.hasQr || !data.qrDataUrl) {
          document.getElementById('connected-view').style.display = 'none';
          document.getElementById('qr-view').style.display = 'block';
          document.getElementById('spinner-box').style.display = 'block';
          document.getElementById('qr-img').style.display = 'none';
          return;
        }

        // State: QR_READY with data URL
        document.getElementById('connected-view').style.display = 'none';
        document.getElementById('qr-view').style.display = 'block';
        document.getElementById('spinner-box').style.display = 'none';
        const img = document.getElementById('qr-img');
        if (img.src !== data.qrDataUrl) {
          img.src = data.qrDataUrl;
        }
        img.style.display = 'block';
      } catch (err) {
        console.error('Polling error:', err);
      }
    }

    // Initial check and auto-refresh interval (every 2 seconds)
    checkStatus();
    setInterval(checkStatus, 2000);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Health check endpoint for Railway and external uptime monitors
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'DirectConnect WhatsApp 24/7 Bot',
    connection: currentStatus,
    qrPage: '/qr',
    authDir: AUTH_DIR,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    whatsapp: currentStatus,
    hasActiveSocket: !!sock,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    backend: 'ONLINE',
    whatsappEngine: currentStatus,
    qrPage: '/qr',
    authDirectory: AUTH_DIR,
    timestamp: new Date().toISOString()
  });
});

// Start Express server on 0.0.0.0 and PORT
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
  console.log(`🌐 Browser WhatsApp QR Page: http://0.0.0.0:${PORT}/qr`);
  startBot();
});
