/**
 * ============================================================
 * WHATSAPP 24/7 AUTO-REPLY BOT
 * Railway + Persistent Volume
 * ============================================================
 *
 * WhatsApp Auth Storage:
 * /app/data/auth_info
 *
 * Railway Volume Mount:
 * /app/data
 *
 * ============================================================
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const express = require('express');

// ============================================================
// EXPRESS / RAILWAY CONFIGURATION
// ============================================================

const app = express();

const PORT = process.env.PORT || 8080;

// Railway persistent volume path
const AUTH_DIR =
  process.env.WHATSAPP_AUTH_DIR ||
  '/app/data/auth_info';

let sock = null;
let pairingRequested = false;

// ============================================================
// START WHATSAPP
// ============================================================

async function startBot() {

  try {

    console.log('');
    console.log('================================================');
    console.log('🚀 STARTING WHATSAPP 24/7 CLOUD BOT');
    console.log('================================================');

    console.log(
      `🔐 WhatsApp Auth Directory: ${AUTH_DIR}`
    );

    // --------------------------------------------------------
    // LOAD PERSISTENT WHATSAPP SESSION
    // --------------------------------------------------------

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(AUTH_DIR);

    console.log(
      '✅ WhatsApp authentication storage loaded'
    );

    // --------------------------------------------------------
    // CREATE WHATSAPP SOCKET
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // SAVE CREDENTIAL CHANGES
    // --------------------------------------------------------

    sock.ev.on(
      'creds.update',
      saveCreds
    );

    // ========================================================
    // WHATSAPP CONNECTION EVENTS
    // ========================================================

    sock.ev.on(
      'connection.update',
      async (update) => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        // ====================================================
        // REQUEST PAIRING CODE
        // ====================================================

        if (
          qr &&
          !sock.authState.creds.registered &&
          !pairingRequested
        ) {

          pairingRequested = true;

          const phoneNumber = (
            process.env.PHONE_NUMBER ||
            '917087561933'
          ).replace(
            /[^0-9]/g,
            ''
          );

          console.log('');
          console.log(
            '📱 WhatsApp pairing required'
          );

          console.log(
            `📞 Phone: ${phoneNumber}`
          );

          try {

            // Give socket time to stabilize
            await delay(5000);

            const code =
              await sock.requestPairingCode(
                phoneNumber
              );

            console.log('');
            console.log(
              '================================================'
            );

            console.log(
              '🔥 YOUR WHATSAPP PAIRING CODE'
            );

            console.log('');
            console.log(
              `👉 ${code}`
            );

            console.log('');

            console.log(
              'WhatsApp → Linked Devices →'
            );

            console.log(
              'Link with phone number'
            );

            console.log(
              '================================================'
            );

            console.log('');

          } catch (error) {

            console.error(
              '❌ Pairing Code Error:',
              error.message
            );

            pairingRequested = false;

          }

        }

        // ====================================================
        // CONNECTION CLOSED
        // ====================================================

        if (connection === 'close') {

          pairingRequested = false;

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          const shouldReconnect =
            statusCode !==
            DisconnectReason.loggedOut;

          console.log('');
          console.log(
            `⚠️ WhatsApp connection closed`
          );

          console.log(
            `Status Code: ${statusCode}`
          );

          // --------------------------------------------------
          // RECONNECT
          // --------------------------------------------------

          if (shouldReconnect) {

            console.log(
              '🔄 Reconnecting in 5 seconds...'
            );

            setTimeout(
              startBot,
              5000
            );

          } else {

            console.log('');
            console.log(
              '❌ WhatsApp session was logged out.'
            );

            console.log(
              'Please link WhatsApp again.'
            );

          }

        }

        // ====================================================
        // CONNECTION OPEN
        // ====================================================

        else if (connection === 'open') {

          console.log('');
          console.log(
            '================================================'
          );

          console.log(
            '🎉 WHATSAPP BOT IS LIVE!'
          );

          console.log(
            '✅ WhatsApp connected successfully'
          );

          console.log(
            '✅ 24/7 Railway bot is running'
          );

          console.log(
            `✅ Persistent Auth: ${AUTH_DIR}`
          );

          console.log(
            '================================================'
          );

          console.log('');

        }

      }
    );

    // ========================================================
    // INCOMING MESSAGES
    // ========================================================

    sock.ev.on(
      'messages.upsert',
      async ({
        messages,
        type
      }) => {

        try {

          // Only process new incoming messages
          if (
            type !== 'notify'
          ) {
            return;
          }

          const msg =
            messages[0];

          // Ignore invalid messages
          if (
            !msg ||
            !msg.message ||
            msg.key.fromMe
          ) {
            return;
          }

          // --------------------------------------------------
          // CUSTOMER INFORMATION
          // --------------------------------------------------

          const from =
            msg.key.remoteJid;

          const name =
            msg.pushName ||
            'Customer';

          // --------------------------------------------------
          // READ MESSAGE
          // --------------------------------------------------

          const text = (

            msg.message.conversation ||

            msg.message
              .extendedTextMessage
              ?.text ||

            msg.message
              .imageMessage
              ?.caption ||

            msg.message
              .videoMessage
              ?.caption ||

            ''

          )
            .trim()
            .toLowerCase();

          console.log('');
          console.log(
            '📩 NEW WHATSAPP MESSAGE'
          );

          console.log(
            `👤 Customer: ${name}`
          );

          console.log(
            `💬 Message: ${text}`
          );

          // ==================================================
          // GREETING / PRICE AUTO REPLY
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

📦 *PRODUCT CATALOG*

━━━━━━━━━━━━━━━━━━

🎧 Wireless Earbuds

Retail Price: ₹599
Bulk Price: ₹420

━━━━━━━━━━━━━━━━━━

⌚ Smartwatch Ultra

Retail Price: ₹1,299
Bulk Price: ₹950

━━━━━━━━━━━━━━━━━━

🔌 Fast Charger 65W

Retail Price: ₹499
Bulk Price: ₹310

━━━━━━━━━━━━━━━━━━

📲 Order ke liye product ka
naam reply karein.

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

          // ==================================================
          // MENU
          // ==================================================

          else if (
            text === 'menu' ||
            text === 'help'
          ) {

            const menuReply = `
Namaste ${name} ji! 🙏

Aap kya jaana chahte hain?

1️⃣ Product Price
2️⃣ Product Catalog
3️⃣ Bulk Order
4️⃣ Customer Support

Reply karein:

PRICE
CATALOG
BULK
SUPPORT
`;

            await sock.sendMessage(
              from,
              {
                text: menuReply
              }
            );

          }

          // ==================================================
          // CATALOG
          // ==================================================

          else if (
            text === 'catalog'
          ) {

            const catalogReply = `
📦 *OUR PRODUCT CATALOG*

🎧 Wireless Earbuds
₹599 Retail
₹420 Bulk

⌚ Smartwatch Ultra
₹1,299 Retail
₹950 Bulk

🔌 Fast Charger 65W
₹499 Retail
₹310 Bulk

📲 Product order karne ke liye
product ka naam bhejein.
`;

            await sock.sendMessage(
              from,
              {
                text: catalogReply
              }
            );

          }

          // ==================================================
          // BULK ORDER
          // ==================================================

          else if (
            text === 'bulk'
          ) {

            const bulkReply = `
📦 *BULK ORDER*

Bulk pricing available hai.

Please send:

• Product Name
• Quantity
• Your Name
• City

Hamari team aapko
bulk quotation degi. 🙏
`;

            await sock.sendMessage(
              from,
              {
                text: bulkReply
              }
            );

          }

          // ==================================================
          // SUPPORT
          // ==================================================

          else if (
            text === 'support'
          ) {

            const supportReply = `
📞 *CUSTOMER SUPPORT*

Aap apni query yahan
message kar sakte hain.

Our support team will
contact you shortly. 🙏
`;

            await sock.sendMessage(
              from,
              {
                text: supportReply
              }
            );

          }

        } catch (error) {

          console.error(
            '❌ Message Processing Error:',
            error.message
          );

        }

      }
    );

  }

  // ========================================================
  // BOT STARTUP ERROR
  // ========================================================

  catch (error) {

    console.error('');
    console.error(
      '❌ WHATSAPP BOT STARTUP ERROR'
    );

    console.error(
      error
    );

    console.error('');

    console.log(
      '🔄 Restarting bot in 10 seconds...'
    );

    setTimeout(
      startBot,
      10000
    );

  }

}

// ============================================================
// RAILWAY HEALTH CHECK
// ============================================================

app.get(
  '/',
  (req, res) => {

    res.status(200).send(
      'WhatsApp 24/7 Bot is Healthy! 🚀'
    );

  }
);

// ============================================================
// HEALTH API
// ============================================================

app.get(
  '/health',
  (req, res) => {

    res.status(200).json({

      status: 'ok',

      whatsapp:
        sock
          ? 'initialized'
          : 'starting',

      authDirectory:
        AUTH_DIR,

      uptime:
        process.uptime()

    });

  }
);

// ============================================================
// START EXPRESS SERVER
// ============================================================

app.listen(
  PORT,
  () => {

    console.log('');
    console.log(
      '================================================'
    );

    console.log(
      '🌐 RAILWAY SERVER STARTED'
    );

    console.log(
      `🌐 Port: ${PORT}`
    );

    console.log(
      `🔐 Auth: ${AUTH_DIR}`
    );

    console.log(
      '================================================'
    );

    console.log('');

    // Start WhatsApp bot
    startBot();

  }
);
