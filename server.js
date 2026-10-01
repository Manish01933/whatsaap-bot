/**
 * 24/7 WHATSAPP AUTO-REPLY BOT FOR RAILWAY
 * Running with Baileys Multi-Device & Terminal QR Code (Zero Meta API Key)
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
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Priority: process.env.PORT provided dynamically by Railway, fallback 3000 (or 8080)
const PORT = process.env.PORT || 3000;
let sock = null;
let currentStatus = 'INITIALIZING';
let latestQrString = null;
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

    // If the session was never registered, but state.creds.me was populated by a previous
    // incomplete pairing code attempt, Baileys treats it as an existing companion device
    // and sends a login payload instead of registration, causing WhatsApp to reject with 401.
    // Resetting uncompleted pairing leftovers ensures Baileys sends the registration payload
    // and immediately emits the QR code.
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

    // qrcode-terminal attached directly to connection.update
    sock.ev.on('connection.update', (update) => {
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

      // Render the actual QR event
      if (qr) {
        qrReceived = true;
        latestQrString = qr;
        currentStatus = 'SCAN_QR_REQUIRED';

        console.log('\n========================================');
        console.log('========== WHATSAPP QR LOGIN ==========');
        console.log('Scan this QR with WhatsApp → Linked Devices → Link a device');
        console.log('========================================\n');
        qrcode.generate(qr, { small: true });
        console.log('\n========================================\n');
      }

      // Connection closed / disconnected handling
      if (connection === 'close') {
        isStarting = false;
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
          currentStatus = 'LOGGED_OUT';
          latestQrString = null;
          qrReceived = false;
          console.log('\n❌ [SESSION TERMINATED]: WhatsApp session was logged out from phone or server.');
          console.log('⚡ Session was revoked. Re-initializing for a fresh QR code...');

          setTimeout(() => {
            startBot();
          }, 3000);
        } else if (isRestart) {
          console.log('🔄 [HANDSHAKE TRANSITION]: Baileys restartRequired (code 515). Reconnecting socket...');
          setTimeout(() => {
            startBot();
          }, 1500);
        } else {
          currentStatus = 'RECONNECTING';
          console.log(`🔄 Temporary disconnect (Status: ${statusCode || 'unknown'}, Reason: "${errorMessage}"). Reconnecting in 4 seconds...`);
          setTimeout(() => {
            startBot();
          }, 4000);
        }
      } else if (connection === 'open') {
        isStarting = false;
        currentStatus = 'CONNECTED';
        latestQrString = null;
        console.log('\n========================================');
        console.log('WHATSAPP CONNECTED SUCCESSFULLY');
        console.log(`Device JID: ${sock.user?.id || 'Connected'}`);
        console.log(`Storage: ${AUTH_DIR}`);
        console.log('========================================\n');
      }
    });

    // Existing WhatsApp message auto-reply functionality
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
    console.error('Fatal error starting WhatsApp Bot:', err);
    setTimeout(startBot, 5000);
  }
}

// Express health endpoints
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'DirectConnect WhatsApp 24/7 Bot',
    connection: currentStatus,
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
    authDirectory: AUTH_DIR,
    timestamp: new Date().toISOString()
  });
});

// Start Express server on 0.0.0.0 and PORT
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
  startBot();
});
