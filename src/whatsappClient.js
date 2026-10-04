const path = require("path");
const fs = require("fs");
let QRCode = null;
let qrcodeTerminal = null;
let pino = null;
try { QRCode = require("qrcode"); } catch (_) {}
try { qrcodeTerminal = require("qrcode-terminal"); } catch (_) {}
try { pino = require("pino"); } catch (_) {}
const { handleMessage } = require("./commandHandler");

const BOT_PREFIXES = [
  "🇳🇵", "📊", "🎯", "🟢", "🔴", "⚡", "🚨", "🟠", "💎", "🏆", "🚦", "📰", "🎲", "🐋", "🧭",
  "🤖", "🔬", "🏛️", "🏦", "⚔️", "💼", "📢", "🧮", "⏰", "⭐", "❌", "⚠️",
  "📡", "📅", "🕵️", "✅", "🗑️", "🔔"
];

class WhatsAppBotManager {
  constructor() {
    this.sock = null;
    this.status = "DISCONNECTED"; // DISCONNECTED | QR_READY | CONNECTING | CONNECTED
    this.qrDataUrl = null;
    this.qrRaw = null;
    this.connectedUser = null;
    this.lastError = null;
    this.messageLog = [];
    this.authDir = path.join(__dirname, "..", "auth_info_baileys");
    this.reconnecting = false;
  }

  logEvent(direction, from, text) {
    this.messageLog.unshift({
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      direction,
      from,
      text
    });
    if (this.messageLog.length > 50) {
      this.messageLog.pop();
    }
  }

  async resetAndGenerateQR() {
    try {
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.end(undefined);
        } catch (_) {}
        this.sock = null;
      }
      this.qrDataUrl = null;
      this.qrRaw = null;
      this.connectedUser = null;
      this.status = "CONNECTING";
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
      }
    } catch (err) {
      this.lastError = err.message;
    }
    return this.startWhatsApp();
  }

  async startWhatsApp() {
    if (this.reconnecting) return;
    this.reconnecting = true;

    try {
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.end(undefined);
        } catch (_) {}
        this.sock = null;
      }

      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket;
      const useMultiFileAuthState = baileys.useMultiFileAuthState;
      const DisconnectReason = baileys.DisconnectReason;
      const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;

      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      let version = [2, 3000, 1015901307];
      try {
        const latest = await fetchLatestBaileysVersion();
        if (latest && latest.version) version = latest.version;
      } catch (_) {}

      this.status = "CONNECTING";
      this.lastError = null;

      this.sock = makeWASocket({
        version,
        auth: state,
        logger: pino ? pino({ level: "silent" }) : undefined,
        printQRInTerminal: false,
        browser: ["NEPSE Quant Pro", "Chrome", "4.0.0"],
        connectTimeoutMs: 30000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 2000,
        markOnlineOnConnect: false,
        syncFullHistory: false
      });

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrRaw = qr;
          this.status = "QR_READY";
          this.lastError = null;
          if (QRCode) {
            this.qrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
          }
        }

        if (connection === "close") {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const errMsg = lastDisconnect?.error?.message || "";
          this.lastError = errMsg || `Disconnected (code ${statusCode || "unknown"})`;

          const isLoggedOut =
            statusCode === DisconnectReason.loggedOut ||
            statusCode === 401 ||
            statusCode === 403 ||
            errMsg.toLowerCase().includes("logged out");

          const hasPairedCreds = Boolean(state?.creds?.registered);

          this.status = "DISCONNECTED";
          this.qrDataUrl = null;
          this.connectedUser = null;

          if (isLoggedOut) {
            try {
              fs.rmSync(this.authDir, { recursive: true, force: true });
            } catch (_) {}
          } else if (hasPairedCreds) {
            // Only auto-reconnect in the background if the user had already paired a WhatsApp session
            setTimeout(() => this.startWhatsApp(), 8000);
          }
        } else if (connection === "open") {
          this.status = "CONNECTED";
          this.qrDataUrl = null;
          this.qrRaw = null;
          this.lastError = null;
          this.connectedUser = this.sock.user || { id: "Linked WhatsApp Account" };
          console.log("✅ NEPSE WhatsApp Bot is CONNECTED as:", this.connectedUser.id);
        }
      });

      this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        for (const msg of messages) {
          if (!msg.message) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid === "status@broadcast") continue;

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            "";

          if (!text) continue;

          // Avoid infinite loops on bot's own replies
          if (BOT_PREFIXES.some((prefix) => text.trim().startsWith(prefix))) {
            continue;
          }

          this.logEvent("INCOMING", remoteJid, text);
          const reply = await handleMessage(text, remoteJid);

          if (reply && this.sock) {
            await this.sock.sendMessage(remoteJid, { text: reply }, { quoted: msg });
            this.logEvent("OUTGOING", remoteJid, reply);
          }
        }
      });
    } catch (err) {
      this.lastError = err.message;
      this.status = "DISCONNECTED";
      console.warn("⚠️ WhatsApp socket error:", err.message);
    } finally {
      this.reconnecting = false;
    }
  }

  async sendDirectMessage(jid, text) {
    if (this.sock && this.status === "CONNECTED") {
      const formattedJid = jid.includes("@s.whatsapp.net") ? jid : `${jid.replace(/\D/g, "")}@s.whatsapp.net`;
      await this.sock.sendMessage(formattedJid, { text });
      this.logEvent("OUTGOING", formattedJid, text);
      return true;
    }
    return false;
  }

  getStatus() {
    return {
      status: this.status,
      qrDataUrl: this.qrDataUrl,
      connectedUser: this.connectedUser,
      lastError: this.lastError,
      recentMessages: this.messageLog.slice(0, 15)
    };
  }
}

module.exports = new WhatsAppBotManager();
