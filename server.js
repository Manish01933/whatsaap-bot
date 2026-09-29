/**
 * 24/7 WHATSAPP AUTO-REPLY BOT FOR RAILWAY
 * Pre-Configured for Phone: +91 7087561933
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;
let sock = null;

async function startBot() {
  console.log('🚀 Initializing WhatsApp 24/7 Cloud Daemon...');
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  sock.ev.on('creds.update', saveCreds);

  // If not yet paired, generate real 8-digit WhatsApp code in Railway Logs
  if (!sock.authState.creds.registered) {
    const phoneNumber = process.env.PHONE_NUMBER || '917087561933';
    console.log(`📱 Requesting Official WhatsApp Pairing Code for ${phoneNumber}...`);
    await delay(3000);
    try {
      const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
      console.log('\n========================================');
      console.log('🔥 YOUR REAL 24/7 PAIRING CODE IS:');
      console.log('👉 ' + code);
      console.log('========================================\n');
    } catch (err) {
      console.error('Error fetching code:', err);
    }
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('🎉 24/7 BOT IS NOW PERMANENTLY ONLINE ON RAILWAY!');
    }
  });

  // 24/7 Auto-Reply Logic for Any Incoming Customer Message
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

    console.log(`[Received] ${name}: ${text}`);

    if (text === 'hi' || text === 'hello' || text === 'namaste' || text === 'price' || text === 'rate') {
      await sock.sendMessage(from, {
        text: `Namaste ${name} ji! 🙏 Apex Wholesale & Retail mein aapka swagat hai.\n\nYe lijiye hamara Product Catalog 📦:\n• Wireless Earbuds: ₹599 (Bulk ₹420)\n• Smartwatch Ultra: ₹1,299 (Bulk ₹950)\n• Fast Charger 65W: ₹499 (Bulk ₹310)\n\nOrder lagane ke liye product ka naam reply karein!`
      });
    }
  });
}

app.get('/', (req, res) => res.send('WhatsApp 24/7 Bot Running!'));
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  startBot();
});
