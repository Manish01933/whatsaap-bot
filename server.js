/**
 * ============================================================
 * WHATSAPP 24/7 RAILWAY BOT
 * Persistent Auth + Pairing Code + Auto Reply
 * ============================================================
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  Browsers
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const express = require('express');

// ============================================================
// RAILWAY CONFIG
// ============================================================

const app = express();

const PORT = process.env.PORT || 8080;

// Railway Volume:
// /app/data
//
// WhatsApp authentication:
// /app/data/auth_info

const AUTH_DIR =
  process.env.WHATSAPP_AUTH_DIR ||
  '/app/data/auth_info';

let sock = null;
let pairingRequested = false;
let starting = false;

// ============================================================
// START WHATSAPP BOT
// ============================================================

async function startBot() {

  if (starting) {
    return;
  }

  starting = true;

  try {

    console.log('');
    console.log('================================================');
    console.log('🚀 STARTING WHATSAPP 24/7 CLOUD BOT');
    console.log('================================================');

    console.log(
      `🔐 WhatsApp Auth Directory: ${AUTH_DIR}`
    );

    // --------------------------------------------------------
    // LOAD AUTH STATE
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

      /*
       * IMPORTANT:
       *
       * Do NOT use a custom browser label.
       *
       * Browsers.ubuntu('Chrome') creates a
       * canonical WEB_BROWSER identity.
       */
      browser: Browsers.ubuntu('Chrome'),

      syncFullHistory: false,

      connectTimeoutMs: 60000,

      defaultQueryTimeoutMs: 60000,

      keepAliveIntervalMs: 10000,

      markOnlineOnConnect: false

    });

    // --------------------------------------------------------
    // SAVE CREDENTIALS
    // --------------------------------------------------------

    sock.ev.on(
      'creds.update',
      async () => {

        try {

          await saveCreds();

          console.log(
            '💾 WhatsApp credentials saved'
          );

        } catch (error) {

          console.error(
            '❌ Could not save credentials:',
            error.message
          );

        }

      }
    );

    // ========================================================
    // CONNECTION UPDATE
    // ========================================================

    sock.ev.on(
      'connection.update',
      async (update) => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        // ----------------------------------------------------
        // PAIRING CODE
        // ----------------------------------------------------

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
            '📱 WHATSAPP PAIRING REQUIRED'
          );

          console.log(
            `📞 Phone: ${phoneNumber}`
          );

          try {

            /*
             * Give the WebSocket a moment to stabilize.
             */
            await delay(3000);

            const code =
              await sock.requestPairingCode(
                phoneNumber
              );

            console.log('');
            console.log(
              '================================================'
            );

            console.log(
              '🔥 YOUR NEW WHATSAPP PAIRING CODE'
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

        // ----------------------------------------------------
        // CONNECTION OPEN
        // ----------------------------------------------------

        if (
          connection === 'open'
        ) {

          starting = false;

          pairingRequested = false;

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
            '✅ 24/7 Railway bot running'
          );

          console.log(
            `🔐 Persistent Auth: ${AUTH_DIR}`
          );

          console.log(
            '================================================'
          );

          console.log('');

        }

        // ----------------------------------------------------
        // CONNECTION CLOSED
        // ----------------------------------------------------

        if (
          connection === 'close'
        ) {

          starting = false;

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          const errorMessage =
            lastDisconnect
              ?.error
              ?.message || '';

          console.log('');
          console.log(
            '⚠️ WHATSAPP CONNECTION CLOSED'
          );

          console.log(
            `Status Code: ${statusCode}`
          );

          console.log(
            `Message: ${errorMessage}`
          );

          /*
           * 401 = Logged out / invalid session
           *
           * This is the only normal terminal
           * authentication state.
           */
          const loggedOut =
            statusCode ===
            DisconnectReason.loggedOut;

          if (loggedOut) {

            console.log('');
            console.log(
              '❌ WhatsApp session is logged out.'
            );

            console.log(
              'A fresh pairing is required.'
            );

            pairingRequested = false;

            return;
          }

          /*
           * 515 = restart required
           *
           * This can happen immediately after
           * successful pairing.
           *
           * It is NOT treated as logout.
           */

          if (
            statusCode ===
            DisconnectReason.restartRequired
          ) {

            console.log(
              '🔄 Restart required after pairing.'
            );

          } else {

            console.log(
              '🔄 Temporary WhatsApp disconnect.'
            );

          }

          pairingRequested = false;

          /*
           * Reconnect using the credentials
           * already saved in /app/data/auth_info.
           */

          setTimeout(
            () => {

              startBot();

            },
            2000
          );

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

          if (
            type !== 'notify'
          ) {
            return;
          }

          const msg =
            messages[0];

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

          // --------------------------------------------------
          // EXTRACT MESSAGE
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
          // GREETING / PRICE
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

Retail: ₹599
Bulk: ₹420

━━━━━━━━━━━━━━━━━━

⌚ Smartwatch Ultra

Retail: ₹1,299
Bulk: ₹950

━━━━━━━━━━━━━━━━━━

🔌 Fast Charger 65W

Retail: ₹499
Bulk: ₹310

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
              `✅ Reply sent to ${name}`
            );

          }

          // ==================================================
          // MENU
          // ==================================================

          else if (

            text === 'menu' ||
            text === 'help'

          ) {

            await sock.sendMessage(
              from,
              {
                text: `
Namaste ${name} ji! 🙏

Aap kya jaana chahte hain?

1️⃣ PRICE
2️⃣ CATALOG
3️⃣ BULK
4️⃣ SUPPORT

Bas option ka naam reply karein.
`
              }
            );

          }

          // ==================================================
          // CATALOG
          // ==================================================

          else if (
            text === 'catalog'
          ) {

            await sock.sendMessage(
              from,
              {
                text: `
📦 *PRODUCT CATALOG*

🎧 Wireless Earbuds
₹599 Retail
₹420 Bulk

⌚ Smartwatch Ultra
₹1,299 Retail
₹950 Bulk

🔌 Fast Charger 65W
₹499 Retail
₹310 Bulk

📲 Order ke liye product ka
naam bhejein.
`
              }
            );

          }

          // ==================================================
          // BULK
          // ==================================================

          else if (
            text === 'bulk'
          ) {

            await sock.sendMessage(
              from,
              {
                text: `
📦 *BULK ORDER*

Bulk pricing available hai.

Please send:

• Product Name
• Quantity
• Your Name
• City

Hamari team aapko
bulk quotation degi. 🙏
`
              }
            );

          }

          // ==================================================
          // SUPPORT
          // ==================================================

          else if (
            text === 'support'
          ) {

            await sock.sendMessage(
              from,
              {
                text: `
📞 *CUSTOMER SUPPORT*

Aap apni query yahan
message kar sakte hain.

Our support team will
contact you shortly. 🙏
`
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

  } catch (error) {

    starting = false;

    console.error('');
    console.error(
      '❌ WHATSAPP STARTUP ERROR'
    );

    console.error(
      error
    );

    console.error(
      '🔄 Restarting in 10 seconds...'
    );

    setTimeout(
      () => {
        startBot();
      },
      10000
    );

  }

}

// ============================================================
// RAILWAY HEALTH ROUTE
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
// START RAILWAY SERVER
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

    startBot();

  }
);
