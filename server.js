/**
 * 24/7 WHATSAPP AUTO-REPLY BOT FOR RAILWAY
 * Persistent WhatsApp Auth + Auto Reply
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const express = require('express');

// ==================================================
// RAILWAY SERVER CONFIG
// ==================================================

const app = express();

const PORT = process.env.PORT || 8080;

// IMPORTANT:
// Railway Volume is mounted at /app/data
// WhatsApp session will permanently stay here.
const AUTH_DIR =
  process.env.WHATSAPP_AUTH_DIR || '/app/data/auth_info';

let sock = null;
let pairingRequested = false;

// ==================================================
// START WHATSAPP BOT
// ==================================================

async function startBot() {
  try {
    console.log('');
    console.log('========================================');
    console.log('🚀 STARTING WHATSAPP 24/7 BOT');
    console.log('========================================');

    console.log(`🔐 WhatsApp Auth Directory: ${AUTH_DIR}`);

    // Load persistent WhatsApp authentication
    const { state, saveCreds } =
      await useMultiFileAuthState(AUTH_DIR);

    // ==================================================
    // CREATE WHATSAPP SOCKET
    // ==================================================

    sock = makeWASocket({
      auth: state,

      logger: pino({
        level: 'silent'
      }),

      browser: [
        'Ubuntu',
        'Chrome',
        '20.0.04'
      ],

      syncFullHistory: false,

      connectTimeoutMs: 60000,

      defaultQueryTimeoutMs: 0,

      keepAliveIntervalMs: 10000
    });

    // Save WhatsApp credentials whenever they change
    sock.ev.on(
      'creds.update',
      saveCreds
    );

    // ==================================================
    // CONNECTION UPDATE
    // ==================================================

    sock.ev.on(
      'connection.update',
      async (update) => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        // ==================================================
        // PAIRING CODE
        // ==================================================

        if (
          qr &&
          !sock.authState.creds.registered &&
          !pairingRequested
        ) {

          pairingRequested = true;

          const phoneNumber = (
            process.env.PHONE_NUMBER ||
            '917087561933'
          ).replace(/[^0-9]/g, '');

          console.log('');
          console.log(
            `📱 Requesting WhatsApp Pairing Code for ${phoneNumber}...`
          );

          try {

            // Give WhatsApp socket time to stabilize
            await delay(5000);

            const code =
              await sock.requestPairingCode(
                phoneNumber
              );

            console.log('');
            console.log(
              '========================================'
            );

            console.log(
              '🔥 YOUR WHATSAPP PAIRING CODE'
            );

            console.log(
              '👉 ' + code
            );

            console.log(
              '========================================'
            );

            console.log('');
            console.log(
              'WhatsApp → Linked Devices →'
            );

            console.log(
              'Link with phone number'
            );

            console.log('');

          } catch (error) {

            console.error(
              '❌ Pairing code error:',
              error.message
            );

            pairingRequested = false;
          }
        }

        // ==================================================
        // CONNECTION CLOSED
        // ==================================================

        if (connection === 'close') {

          pairingRequested = false;

          const statusCode =
            lastDisconnect?.error?.output?.statusCode;

          const shouldReconnect =
            statusCode !== DisconnectReason.loggedOut;

          console.log('');
          console.log(
            `⚠️ WhatsApp connection closed. Status: ${statusCode}`
          );

          if (shouldReconnect) {

            console.log(
              '🔄 Reconnecting WhatsApp in 5 seconds...'
            );

            setTimeout(
              startBot,
              5000
            );

          } else {

            console.log(
              '❌ WhatsApp session logged out.'
            );

            console.log(
              'Please link the device again.'
            );
          }
        }

        // ==================================================
        // CONNECTION OPEN
        // ==================================================

        else if (connection === 'open') {

          console.log('');
          console.log(
            '========================================'
          );

          console.log(
            '🎉 WHATSAPP BOT IS LIVE!'
          );

          console.log(
            '✅ 24/7 BOT RUNNING ON RAILWAY'
          );

          console.log(
            `✅ Persistent Auth: ${AUTH_DIR}`
          );

          console.log(
            '========================================'
          );

          console.log('');
        }
      }
    );

    // ==================================================
    // INCOMING WHATSAPP MESSAGES
    // ==================================================

    sock.ev.on(
      'messages.upsert',
      async ({ messages, type }) => {

        try {

          // Only process new messages
          if (type !== 'notify') {
            return;
          }

          const msg = messages[0];

          // Ignore invalid messages
          if (
            !msg ||
            !msg.message ||
            msg.key.fromMe
          ) {
            return;
          }

          const from =
            msg.key.remoteJid;

          const name =
            msg.pushName ||
            'Customer';

          // ==================================================
          // GET MESSAGE TEXT
          // ==================================================

          const text = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            ''
          )
            .trim()
            .toLowerCase();

          console.log('');
          console.log(
            `📩 Incoming Message`
          );

          console.log(
            `👤 Customer: ${name}`
          );

          console.log(
            `💬 Message: ${text}`
          );

          // ==================================================
          // AUTO REPLY
          // ==================================================

          if (
            text === 'hi' ||
            text === 'hello' ||
            text === 'namaste' ||
            text === 'price' ||
            text === 'rate'
          ) {

            const reply = `
Namaste ${name} ji! 🙏

Apex Wholesale & Retail mein
aapka swagat hai. 🛍️

📦 *Product Catalog*

• Wireless Earbuds
  Retail: ₹599
  Bulk: ₹420

• Smartwatch Ultra
  Retail: ₹1,299
  Bulk: ₹950

• Fast Charger 65W
  Retail: ₹499
  Bulk: ₹310

📲 Order ke liye product ka naam
reply karein.

Thank you! 🙏
`;

            await sock.sendMessage(
              from,
              {
                text: reply
              }
            );

            console.log(
              `✅ Auto reply sent to ${name}`
            );
          }

        } catch (error) {

          console.error(
            '❌ Message processing error:',
            error.message
          );
        }
      }
    );

  } catch (error) {

    console.error('');
    console.error(
      '❌ WhatsApp Bot Startup Error:'
    );

    console.error(
      error
    );

    console.error(
      '🔄 Restarting bot in 10 seconds...'
    );

    setTimeout(
      startBot,
      10000
    );
  }
}

// ==================================================
// RAILWAY HEALTH CHECK
// ==================================================

app.get(
  '/',
  (req, res) => {

    res.status(200).send(
      'WhatsApp 24/7 Bot is Healthy! 🚀'
    );
  }
);

// ==================================================
// HEALTH API
// ==================================================

app.get(
  '/health',
  (req, res) => {

    res.status(200).json({
      status: 'ok',
      whatsapp: sock ? 'initialized' : 'starting',
      authDirectory: AUTH_DIR,
      uptime: process.uptime()
    });
  }
);

// ==================================================
// START RAILWAY HTTP SERVER
// ==================================================

app.listen(
  PORT,
  () => {

    console.log('');
    console.log(
      '========================================'
    );

    console.log(
      `🌐 Railway Health Server running on port ${PORT}`
    );

    console.log(
      `🔐 Auth Directory: ${AUTH_DIR}`
    );

    console.log(
      '========================================'
    );

    // Start WhatsApp
    startBot();
  }
);
