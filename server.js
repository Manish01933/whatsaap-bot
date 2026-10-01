/**
 * 24/7 WHATSAPP AUTO-REPLY BOT FOR RAILWAY
 * Running with Baileys Multi-Device, 8-Digit Pairing Code & HD Web QR
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Crypto setup for Baileys
const crypto = require('crypto');
if (!global.crypto) global.crypto = crypto;
if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto || crypto;
if (crypto.webcrypto && !global.crypto.subtle) {
  try { global.crypto.subtle = crypto.webcrypto.subtle; } catch (e) {}
}

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestWaWebVersion
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

const PORT = process.env.PORT || 3000;

// Central State
let currentSocket = null;
let currentStatus = 'WAITING_FOR_QR';
let latestQrString = null;
let latestQrDataUrl = null;
let connectedJid = null;
let latestPairingCode = null;
let latestPairingPhone = null;

// Persistent Auth Path (Railway Volume)
const AUTH_DIR = process.env.AUTH_DIR || (fs.existsSync('/app/data') ? '/app/data/auth_info' : path.resolve(process.cwd(), 'data/auth_info'));
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

async function startWhatsApp(triggerReason = 'boot') {
  console.log(`\n[WA] Starting socket... (Trigger: ${triggerReason})`);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const isRegistered = state.creds?.registered === true || !!state.creds?.account;

    let waVersion = [2, 3000, 1048977937];
    try {
      const v = await fetchLatestWaWebVersion();
      if (v?.version) waVersion = v.version;
    } catch (e) {}

    currentSocket = makeWASocket({
      version: waVersion,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
      markOnlineOnConnect: true,
      getMessage: async () => ({ conversation: '' })
    });

    currentSocket.ev.on('creds.update', saveCreds);

    // Auto-request 8-digit Pairing Code on boot if not registered
    const defaultNumber = (process.env.PAIRING_NUMBER || '917087561933').replace(/[^0-9]/g, '');
    if (!isRegistered && defaultNumber.length >= 10) {
      setTimeout(async () => {
        try {
          if (currentSocket && currentStatus !== 'CONNECTED') {
            console.log(`[WA] Generating 8-digit pairing code for: +${defaultNumber}...`);
            const rawCode = await currentSocket.requestPairingCode(defaultNumber);
            const formatted = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
            latestPairingCode = formatted;
            latestPairingPhone = defaultNumber;

            console.log('\n╔════════════════════════════════════════════════════════════════════════════════╗');
            console.log(`║                   WHATSAPP 8-DIGIT PAIRING CODE READY                          ║`);
            console.log('╠════════════════════════════════════════════════════════════════════════════════╣');
            console.log(`║ 📱 Phone Number: +${defaultNumber.padEnd(61)}║`);
            console.log(`║ 🔑 8-DIGIT CODE: ${formatted.padEnd(62)}║`);
            console.log('║                                                                                ║');
            console.log('║ 👉 On Phone: WhatsApp → Linked Devices → Link a device                         ║');
            console.log('║    Tap "Link with phone number instead" (फ़ोन नंबर से लिंक करें)               ║');
            console.log(`║    Enter Code:   ${formatted.padEnd(62)}║`);
            console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');
          }
        } catch (e) {
          console.log('[WA] Note on auto-pairing:', e.message);
        }
      }, 3500);
    }

    currentSocket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      if (qr) {
        currentStatus = 'QR_READY';
        latestQrString = qr;
        try {
          latestQrDataUrl = await QRCode.toDataURL(qr, { width: 500, margin: 4 });
        } catch (e) {}

        console.log('[WA] QR Code Generated! Open in browser: https://whatsaap-bot-production-ca14.up.railway.app/qr');
        try { qrcodeTerminal.generate(qr, { small: true }); } catch (e) {}
      }

      if (connection === 'close') {
        currentStatus = 'DISCONNECTED';
        const isRestart = statusCode === DisconnectReason.restartRequired || statusCode === 515;
        if (isRestart) {
          console.log('[WA] Post-scan restart requested (code 515). Reconnecting with saved credentials...');
          await saveCreds();
          setTimeout(() => startWhatsApp('restart_515'), 1200);
        } else {
          console.log(`[WA] Connection closed (${statusCode}). Reconnecting in 4s...`);
          setTimeout(() => startWhatsApp('reconnect'), 4000);
        }
      } else if (connection === 'open') {
        currentStatus = 'CONNECTED';
        connectedJid = currentSocket.user?.id || 'Connected Device';
        latestPairingCode = null;
        console.log('\n🎉 [WA] WHATSAPP CONNECTED SUCCESSFULLY! JID:', connectedJid);
      }
    });

    // 24/7 Auto-Reply
    currentSocket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      const msg = messages[0];
      if (!msg?.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid;
      const name = msg.pushName || 'Customer';
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
      if (!text) return;

      const lower = text.toLowerCase();
      try {
        if (lower === 'hi' || lower === 'hello' || lower === 'namaste' || lower === 'start') {
          await currentSocket.sendMessage(from, {
            text: `Namaste ${name} ji! 🙏 Apex Wholesale & Retail mein aapka swagat hai.\n\nKripya option chunein:\n1️⃣ Product Catalog & Rates\n2️⃣ Latest Bulk Offers\n3️⃣ Talk to Human Executive`
          });
        } else if (lower === '1' || lower.includes('catalog') || lower.includes('price')) {
          await currentSocket.sendMessage(from, {
            text: `Ye lijiye hamari Catalog 📦:\n• Wireless Earbuds: ₹599 (Bulk ₹420)\n• Smartwatch Ultra: ₹1,299 (Bulk ₹950)\n• Fast Charger 65W: ₹499 (Bulk ₹310)\n• Bluetooth Soundbar: ₹1,899 (Bulk ₹1,400)`
          });
        } else if (lower === '2' || lower.includes('bulk') || lower.includes('offer')) {
          await currentSocket.sendMessage(from, {
            text: `🔥 *Special Bulk Offer:* Flat 25% OFF on 20+ units. Free shipping on orders above ₹10,000!`
          });
        } else if (lower === '3' || lower.includes('talk')) {
          await currentSocket.sendMessage(from, {
            text: `Hamare Sales Manager ko alert bhej diya gaya hai. Kripya pratiksha karein.`
          });
        }
      } catch (err) {
        console.error('[WA Auto-Reply Error]:', err);
      }
    });

  } catch (err) {
    console.error('[WA] Fatal error:', err);
    setTimeout(() => startWhatsApp('recovery'), 5000);
  }
}

// Pair-code API
app.post('/api/pair-code', async (req, res) => {
  const phone = (req.body?.phoneNumber || '').replace(/[^0-9]/g, '');
  if (phone.length < 10) {
    return res.status(400).json({ success: false, error: 'Valid phone number required' });
  }
  if (!currentSocket) {
    return res.status(503).json({ success: false, error: 'Socket initializing. Try in 3 seconds.' });
  }
  try {
    const raw = await currentSocket.requestPairingCode(phone);
    const formatted = raw?.match(/.{1,4}/g)?.join('-') || raw;
    latestPairingCode = formatted;
    latestPairingPhone = phone;
    res.json({ success: true, code: formatted, phoneNumber: phone });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Status API
app.get('/qr/status', (req, res) => {
  res.json({
    status: currentStatus,
    hasQr: !!latestQrDataUrl,
    qrDataUrl: latestQrDataUrl,
    latestPairingCode: latestPairingCode,
    latestPairingPhone: latestPairingPhone,
    connectedJid: connectedJid
  });
});

// Pure PNG QR
app.get('/qr.png', async (req, res) => {
  if (!latestQrString) return res.status(404).send('No QR available yet');
  const buf = await QRCode.toBuffer(latestQrString, { width: 500, margin: 4 });
  res.setHeader('Content-Type', 'image/png');
  res.send(buf);
});

// Dedicated /code Page (8-Digit Code Screen)
app.get('/code', (req, res) => {
  const phone = latestPairingPhone || '917087561933';
  const code = latestPairingCode || 'WAITING...';
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsApp 8-Digit Pairing Code</title>
  <style>
    body { background: #0b141a; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
    .card { background: #111b21; border: 1px solid #222e35; border-radius: 18px; padding: 28px 20px; max-width: 480px; width: 100%; text-align: center; }
    .code-box { background: #182229; border: 2px solid #00a884; border-radius: 14px; padding: 20px; margin: 18px 0; }
    .code-val { font-size: 36px; font-weight: 900; color: #25d366; letter-spacing: 5px; font-family: monospace; margin: 10px 0; }
    .btn { background: #00a884; color: #111b21; border: none; padding: 12px 24px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size: 15px; }
    .steps { background: #182229; padding: 16px; border-radius: 12px; text-align: left; font-size: 13px; line-height: 1.6; margin-top: 18px; color: #d1d7db; }
    .steps b { color: #25d366; }
  </style>
</head>
<body>
  <div class="card">
    <h2 style="margin-bottom:6px;">WhatsApp 8-Digit Code</h2>
    <div style="font-size:13px; color:#8696a0;">Mobile: +<span id="phone-txt">${phone}</span></div>
    <div class="code-box">
      <div style="font-size:12px; color:#00a884; text-transform:uppercase; font-weight:bold;">Aapka Code:</div>
      <div id="code-txt" class="code-val">${code}</div>
      <button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('code-txt').innerText.replace(/-/g,'')); alert('Copied!');">📋 Copy Code</button>
    </div>
    <div class="steps">
      <b>Phone me kaise dalein:</b><br>
      1. WhatsApp kholen → <b>3 Dots (⋮)</b> ya <b>Settings</b><br>
      2. <b>Linked Devices</b> → <b>Link a Device</b> dabayein<br>
      3. Niche dabayein: <b>"Link with phone number instead"</b><br>
      4. Upar dikh raha 8-digit code type karein!
    </div>
    <div style="margin-top:16px;"><a href="/qr" style="color:#00a884; font-size:13px;">📷 Ya QR Code Scan Karein</a></div>
  </div>
  <script>
    setInterval(async () => {
      try {
        const res = await fetch('/qr/status');
        const data = await res.json();
        if (data.latestPairingCode) document.getElementById('code-txt').innerText = data.latestPairingCode;
        if (data.status === 'CONNECTED') alert('WhatsApp Connected!');
      } catch(e) {}
    }, 1500);
  </script>
</body>
</html>`);
});

// Graphical /qr Screen
app.get('/qr', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsApp Bot Login</title>
  <style>
    body { background: #0b141a; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
    .card { background: #111b21; border: 1px solid #222e35; border-radius: 18px; padding: 24px; max-width: 460px; width: 100%; text-align: center; }
    .qr-box { background: #fff; padding: 14px; border-radius: 12px; display: inline-block; margin: 16px 0; }
    .qr-box img { width: 280px; height: 280px; display: block; }
    .btn { background: #00a884; color: #111b21; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-block; margin: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>WhatsApp Bot Login</h2>
    <div class="qr-box">
      <img id="qr-img" src="/qr.png" alt="QR Code">
    </div>
    <div>
      <a class="btn" href="/code">🔑 Use 8-Digit Code Instead</a>
      <a class="btn" style="background:#202c33; color:#fff;" href="/qr.png" target="_blank">Open Full Image</a>
    </div>
  </div>
  <script>
    setInterval(() => {
      document.getElementById('qr-img').src = '/qr.png?t=' + Date.now();
    }, 3000);
  </script>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[HTTP] Server listening on port ${PORT}`);
  startWhatsApp('initial_boot');
});
