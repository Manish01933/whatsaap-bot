/**
 * 24/7 WHATSAPP AUTO-REPLY BOT FOR RAILWAY
 * Fixed 428 Precondition Required & Connection Closed
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;
let sock = null;
let pairingRequested = false;

async function startBot() {
  console.log('🚀 Initializing WhatsApp 24/7 Cloud Daemon...');
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // जब WhatsApp WebSocket तैयार हो जाए और QR/Pairing कोड माँगे:
    if (qr && !sock.authState.creds.registered && !pairingRequested) {
      pairingRequested = true;
      const phoneNumber = (process.env.PHONE_NUMBER || '917087561933').replace(/[^0-9]/g, '');
      console.log(`📱 WhatsApp Socket Connected! Requesting Pairing Code for ${phoneNumber}...`);
      
      try {
        await delay(5000); // सॉकेट को स्थिर होने दें
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('\n========================================');
        console.log('🔥 YOUR REAL 24/7 PAIRING CODE IS:');
        console.log('👉 ' + code);
        console.log('========================================\n');
        console.log('Apne WhatsApp > Linked Devices > Link with Phone number me ye code dalein!');
      } catch (err) {
        console.error('Retrying pairing code request...', err.message);
        pairingRequested = false;
      }
    }

    if (connection === 'close') {
      pairingRequested = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`⚠️ Connection closed (${statusCode}). Reconnecting in 5s...`);
      if (shouldReconnect) {
        setTimeout(startBot, 5000);
      }
    } else if (connection === 'open') {
      console.log('🎉 24/7 WHATSAPP BOT IS LIVE & RUNNING FOREVER ON RAILWAY!');
    }
  });

  // 24/7 Auto-Reply Logic for Customers
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const name = msg.pushName || 'Customer';
    const text = (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ''
    ).trim().toLowerCase();

    console.log(`[Incoming Msg] ${name}: ${text}`);

    if (text === 'hi' || text === 'hello' || text === 'namaste' || text === 'price' || text === 'rate') {
      await sock.sendMessage(from, {
        text: `Namaste ${name} ji! 🙏 Apex Wholesale & Retail mein aapka swagat hai.\n\nYe lijiye hamara Product Catalog 📦:\n• Wireless Earbuds: ₹599 (Bulk ₹420)\n• Smartwatch Ultra: ₹1,299 (Bulk ₹950)\n• Fast Charger 65W: ₹499 (Bulk ₹310)\n\nOrder ke liye product ka naam reply karein!`
      });
    }
  });
}

app.get('/', (req, res) => res.send('WhatsApp 24/7 Bot is Healthy!'));
app.listen(PORT, () => {
  console.log(`Railway Health Server listening on port ${PORT}`);
  startBot();
});
