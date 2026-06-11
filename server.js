const fs = require("fs");
const path = require("path");
const envPath = fs.existsSync(path.join(__dirname, ".env.local")) ? ".env.local" : ".env";
require("dotenv").config({ path: envPath });
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const XLSX = require("xlsx");
const pc = require("picocolors");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Global error handlers to log crashes
process.on("unhandledRejection", (reason, promise) => {
  const msg = `[${new Date().toISOString()}] Unhandled Rejection: ${reason?.stack || reason}\n`;
  console.error(msg);
  fs.writeFileSync(path.join(__dirname, "crash.log"), msg, { flag: "a" });
});
process.on("uncaughtException", (error) => {
  const msg = `[${new Date().toISOString()}] Uncaught Exception: ${error?.stack || error}\n`;
  console.error(msg);
  fs.writeFileSync(path.join(__dirname, "crash.log"), msg, { flag: "a" });
  process.exit(1);
});

// Country prefix mapping database for offline enrichment
const countryMap = {
  1: "USA/Canada",
  7: "Russia/Kazakhstan",
  20: "Egypt",
  27: "South Africa",
  30: "Greece",
  31: "Netherlands",
  32: "Belgium",
  33: "France",
  34: "Spain",
  36: "Hungary",
  39: "Italy",
  40: "Romania",
  41: "Switzerland",
  43: "Austria",
  44: "United Kingdom",
  45: "Denmark",
  46: "Sweden",
  47: "Norway",
  48: "Poland",
  49: "Germany",
  51: "Peru",
  52: "Mexico",
  54: "Argentina",
  55: "Brazil",
  56: "Chile",
  57: "Colombia",
  58: "Venezuela",
  60: "Malaysia",
  61: "Australia",
  62: "Indonesia",
  63: "Philippines",
  64: "New Zealand",
  65: "Singapore",
  66: "Thailand",
  81: "Japan",
  82: "South Korea",
  84: "Vietnam",
  86: "China",
  90: "Turkey",
  91: "India",
  92: "Pakistan",
  93: "Afghanistan",
  94: "Sri Lanka",
  95: "Myanmar",
  98: "Iran",
  212: "Morocco",
  213: "Algeria",
  216: "Tunisia",
  218: "Libya",
  220: "Gambia",
  221: "Senegal",
  222: "Mauritania",
  223: "Mali",
  224: "Guinea",
  225: "Ivory Coast",
  226: "Burkina Faso",
  227: "Niger",
  228: "Togo",
  229: "Benin",
  230: "Mauritius",
  231: "Liberia",
  232: "Sierra Leone",
  233: "Ghana",
  234: "Nigeria",
  237: "Cameroon",
  241: "Gabon",
  242: "Congo",
  243: "DR Congo",
  244: "Angola",
  249: "Sudan",
  250: "Rwanda",
  251: "Ethiopia",
  252: "Somalia",
  253: "Djibouti",
  254: "Kenya",
  255: "Tanzania",
  256: "Uganda",
  257: "Burundi",
  258: "Mozambique",
  260: "Zambia",
  261: "Madagascar",
  263: "Zimbabwe",
  264: "Namibia",
  265: "Malawi",
  266: "Lesotho",
  267: "Botswana",
  268: "Eswatini",
  351: "Portugal",
  352: "Luxembourg",
  353: "Ireland",
  354: "Iceland",
  355: "Albania",
  356: "Malta",
  357: "Cyprus",
  358: "Finland",
  359: "Bulgaria",
  370: "Lithuania",
  371: "Latvia",
  372: "Estonia",
  380: "Ukraine",
  381: "Serbia",
  385: "Croatia",
  386: "Slovenia",
  387: "Bosnia and Herzegovina",
  420: "Czech Republic",
  421: "Slovakia",
  501: "Belize",
  502: "Guatemala",
  503: "El Salvador",
  504: "Honduras",
  505: "Nicaragua",
  506: "Costa Rica",
  507: "Panama",
  509: "Haiti",
  591: "Bolivia",
  592: "Guyana",
  593: "Ecuador",
  595: "Paraguay",
  598: "Uruguay",
  852: "Hong Kong",
  853: "Macau",
  855: "Cambodia",
  856: "Laos",
  880: "Bangladesh",
  886: "Taiwan",
  960: "Maldives",
  961: "Lebanon",
  962: "Jordan",
  963: "Syria",
  964: "Iraq",
  965: "Kuwait",
  966: "Saudi Arabia",
  967: "Yemen",
  968: "Oman",
  971: "UAE",
  972: "Israel",
  973: "Bahrain",
  974: "Qatar",
  977: "Nepal",
  992: "Tajikistan",
  993: "Turkmenistan",
  994: "Azerbaijan",
  995: "Georgia",
  996: "Kyrgyzstan",
  998: "Uzbekistan",
};

// Sort prefixes descending by length so we match longest prefix first
const sortedPrefixes = Object.keys(countryMap).sort(
  (a, b) => b.length - a.length,
);

function getCountryCodeOffline(number) {
  if (!number) return { prefix: "", country: "Unknown" };
  const cleanNumber = number.replace(/\D/g, "");
  for (const prefix of sortedPrefixes) {
    if (cleanNumber.startsWith(prefix)) {
      return {
        prefix: `+${prefix}`,
        country: countryMap[prefix],
      };
    }
  }
  return { prefix: "", country: "Unknown" };
}

// CSV value escaper — module-scope so both the download route and socket handlers can use it
function escapeCSV(val) {
  if (val === undefined || val === null) return "";
  const str = String(val);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const next = require("next");
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

// Express App & Server Initialization
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Global state variables
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      clientState: "disconnected",
      activeQr: null,
      activeCode: null,
      isPairingActive: false,
      logHistory: [],
      client: null,
      lastActive: Date.now(),
      sockets: new Set(),
      qrExpired: false
    });
  }
  return sessions.get(sessionId);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    // Case 1: Active UI tab is open, but they haven't scanned/completed login for 3 minutes.
    // Clean up only the Puppeteer client to release RAM, but keep the session state so they can click "Refresh".
    if (s.sockets.size > 0 && s.client && s.clientState !== "ready") {
      if (now - s.lastActive > 3 * 60 * 1000) {
        const clientToDestroy = s.client;
        s.client = null;
        s.clientState = "disconnected";
        s.activeQr = null;
        s.activeCode = null;
        s.qrExpired = true;
        io.to(id).emit("status", { state: "disconnected", qr: null, code: null, qrExpired: true });
        console.log(`[Session Cleanup] Destroyed inactive QR-pending client for session ${id} due to 3-min timeout`);
        clientToDestroy.destroy().catch(err => {
          console.error(`Error destroying client on idle timeout for session ${id}:`, err.message);
        });
      }
    }

    // Case 2: UI tab is closed / user navigated away (s.sockets.size === 0)
    if (s.sockets.size === 0) {
      const gracePeriod = s.clientState === "ready"
        ? 10 * 60 * 1000  // 10 minutes for authenticated sessions to survive page refreshes
        : 2 * 60 * 1000;  // 2 minutes for unauthenticated/pending QR sessions

      if (now - s.lastActive > gracePeriod) {
        if (s.client) {
          try { s.client.destroy(); } catch (e) {}
        }
        sessions.delete(id);
        console.log(`[Session Cleanup] Destroyed inactive session ${id} (${s.clientState}, idle for > ${gracePeriod / 60000} mins)`);
      }
    }
  }
}, 15 * 1000);

const activeFiles = new Map(); // fileId -> { filePath, groupName, expiresAt }

// Ensure temporary downloads directory exists
const downloadsDir = path.join(__dirname, "temp_downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

// Log formatting and socket broadcasting
function logProgress(message, sessionId) {
  const s = getSession(sessionId);
  const timestamp = new Date().toLocaleTimeString();
  const formattedLog = `[${timestamp}] ${message}`;
  
  // Console coloring based on emoji/keywords
  let coloredLog = formattedLog;
  if (message.includes("❌") || message.toLowerCase().includes("error")) {
    coloredLog = pc.red(formattedLog);
  } else if (message.includes("✅")) {
    coloredLog = pc.green(formattedLog);
  } else if (message.includes("⏳") || message.includes("🔄") || message.includes("⚠️")) {
    coloredLog = pc.yellow(formattedLog);
  } else if (message.includes("🔌") || message.includes("📱") || message.includes("🔑") || message.includes("⚡")) {
    coloredLog = pc.cyan(formattedLog);
  } else {
    coloredLog = pc.white(formattedLog);
  }
  
  console.log(`[${sessionId}] ` + coloredLog);
  s.logHistory.push(formattedLog);

  // Keep last 100 logs in memory
  if (s.logHistory.length > 100) {
    s.logHistory.shift();
  }

  io.to(sessionId).emit("log", formattedLog);
}

// Dynamic fetching and filtering of groups
async function fetchAndEmitGroups(sessionId) {
  const s = getSession(sessionId);
  const client = s.client;
  const target = io.to(sessionId);

  if (s.clientState !== "ready" || !client) return;
  if (s.isFetchingGroups) {
    logProgress(
      "ℹ️ Group list fetching is already in progress. Skipping duplicate call.",
      sessionId
    );
    return;
  }

  s.isFetchingGroups = true;
  logProgress(
    "⏳ Waiting for WhatsApp Web chat synchronization to complete (4s)...",
    sessionId
  );

  await new Promise((resolve) => setTimeout(resolve, 4000));

  logProgress("⏳ Fetching WhatsApp groups list via optimized in-memory query...", sessionId);
  try {
    const groups = await client.pupPage.evaluate(() => {
      try {
        const ChatCollection = window.require('WAWebCollections').Chat;
        if (!ChatCollection) return [];
        return ChatCollection.getModelsArray()
          .filter((chat) => chat.id && chat.id.server === 'g.us')
          .map((chat) => {
            const serialized = chat.serialize();
            return {
              id: serialized.id._serialized,
              name: serialized.name || serialized.formattedTitle || "Unnamed Group",
            };
          });
      } catch (e) {
        return { error: e.message };
      }
    });

    if (groups && groups.error) {
      throw new Error(groups.error);
    }

    logProgress(`✅ Fetched ${groups.length} groups successfully.`, sessionId);
    target.emit("groups-loaded", { groups });
  } catch (err) {
    logProgress(`❌ Error fetching groups: ${err.message}`, sessionId);
    target.emit("extraction-error", `Failed to fetch groups: ${err.message}`);
  } finally {
    s.isFetchingGroups = false;
  }
}

// WhatsApp Web Client Initialization
function initClient(sessionId) {
  const s = getSession(sessionId);
  if (s.client) return;

  logProgress("🔄 Initializing WhatsApp Client...", sessionId);
  const puppeteerOptions = {
    headless: true,
    protocolTimeout: 180000, // Increase protocol timeout to 3 minutes to prevent injection timeout
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--blink-settings=imagesEnabled=false",
    ],
  };

  // Use custom Puppeteer path if defined (useful for OCI Linux ARM64 systems)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  } else {
    puppeteerOptions.channel = "chrome";
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionId }), // Session persistence per tenant
    webVersionCache: {
      type: "remote",
      remotePath:
        "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html",
    },
    puppeteer: puppeteerOptions,
  });

  s.client = client;

  let isInitializing = false;
  async function safeInitialize() {
    if (isInitializing) {
      logProgress("ℹ️ Client initialization is already in progress. Skipping.", sessionId);
      return;
    }
    isInitializing = true;
    try {
      logProgress("🔄 Initializing WhatsApp Web Client...", sessionId);

      // Self-healing: Kill any locking Chrome processes for this session before initializing
      try {
        const { execSync } = require("child_process");
        const searchString = `session-${sessionId}`;
        const checkCmd = `ps aux | grep "${searchString}" | grep -v grep | awk '{print $2}'`;
        const pidsRaw = execSync(checkCmd).toString().trim();
        if (pidsRaw) {
          const pids = pidsRaw.split(/\s+/).filter(Boolean);
          if (pids.length > 0) {
            logProgress(`[Self-Healing] Found locking Chrome processes: ${pids.join(", ")}. Terminating...`, sessionId);
            execSync(`kill -9 ${pids.join(" ")}`);
            // Wait a moment for processes to be fully terminated
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      } catch (e) {
        // Ignore self-healing errors (e.g. if ps/kill aren't available)
      }

      await client.initialize();
      logProgress("✅ Client initialization request completed successfully.", sessionId);
    } catch (err) {
      logProgress(`❌ Client initialization failed: ${err.message}`, sessionId);
      try {
        logProgress("🧹 Cleaning up WhatsApp client...", sessionId);
        await client.destroy();
      } catch (destroyErr) {
        logProgress(`⚠️ Error during client cleanup: ${destroyErr.message}`, sessionId);
      }
      logProgress("🔄 Retrying client initialization in 10 seconds...", sessionId);
      setTimeout(() => {
        const currentSession = getSession(sessionId);
        if (currentSession.client === client) {
          currentSession.client = null;
          initClient(sessionId);
        }
      }, 10000);
    } finally {
      isInitializing = false;
    }
  }

  // WhatsApp Event Listeners
  client.on("qr", async (qr) => {
    s.clientState = "disconnected";
    s.activeCode = null;
    s.isPairingActive = false;
    logProgress("📱 Scan the QR code below to authenticate:", sessionId);

    qrcodeTerminal.generate(qr, { small: true });

    try {
      s.activeQr = await QRCode.toDataURL(qr);
      io.to(sessionId).emit("status", { state: s.clientState, qr: s.activeQr, code: null });
    } catch (err) {
      logProgress(`❌ Error generating QR image: ${err.message}`, sessionId);
    }
  });

  client.on("code", (code) => {
    s.clientState = "disconnected";
    s.activeCode = code;
    s.activeQr = null;
    s.isPairingActive = true;
    io.to(sessionId).emit("status", { state: s.clientState, qr: null, code: s.activeCode });
    logProgress(`🔑 WhatsApp pairing code generated: ${code}`, sessionId);
  });

  client.on("loading_screen", (percent, message) => {
    if (s.clientState === "ready") return;
    s.clientState = "authenticating";
    s.activeQr = null;
    s.activeCode = null;
    s.isPairingActive = false;
    io.to(sessionId).emit("status", { state: s.clientState, qr: null, code: null });
    logProgress(`⏳ Authenticating... ${percent}% - ${message}`, sessionId);
  });

  client.on("authenticated", () => {
    if (s.clientState === "ready") return;
    s.clientState = "authenticating";
    s.activeQr = null;
    s.activeCode = null;
    s.isPairingActive = false;
    io.to(sessionId).emit("status", { state: s.clientState, qr: null, code: null });
    logProgress("✅ Authenticated successfully! Waiting for ready signal...", sessionId);
  });

  client.on("auth_failure", (msg) => {
    s.clientState = "disconnected";
    s.activeCode = null;
    s.isPairingActive = false;
    io.to(sessionId).emit("status", { state: s.clientState, qr: null, code: null });
    logProgress(`❌ Authentication failure: ${msg}`, sessionId);
  });

  client.on("ready", async () => {
    s.clientState = "ready";
    s.activeQr = null;
    s.activeCode = null;
    s.isPairingActive = false;
    io.to(sessionId).emit("status", { state: s.clientState, qr: null, code: null });
    logProgress("✅ WhatsApp Client is ready and connected!", sessionId);

    try {
      const me = client.info;
      const profilePicUrl = await client
        .getProfilePicUrl(me.wid._serialized)
        .catch(() => null);
      io.to(sessionId).emit("session-profile", {
        name: me.pushname || "WhatsApp User",
        number: me.wid.user,
        avatar: profilePicUrl,
      });
    } catch (err) {
      logProgress(`⚠️ Failed to fetch profile details: ${err.message}`, sessionId);
    }

    await fetchAndEmitGroups(sessionId);
  });

  client.on("disconnected", (reason) => {
    s.clientState = "disconnected";
    s.activeQr = null;
    s.activeCode = null;
    s.isPairingActive = false;
    io.to(sessionId).emit("status", { state: s.clientState, qr: null, code: null });
    logProgress(`❌ Client was disconnected. Reason: ${reason}`, sessionId);
  });

  safeInitialize();
}

// Socket.io Connection Logic
io.on("connection", (socket) => {
  const sessionId = socket.handshake.query.sessionId;
  if (!sessionId) { socket.disconnect(); return; }
  socket.join(sessionId);

  const s = getSession(sessionId);
  s.sockets.add(socket.id);
  s.lastActive = Date.now();

  // Update lastActive on any incoming message from client to prevent idle timeout
  socket.onAny(() => {
    s.lastActive = Date.now();
  });

  initClient(sessionId);

  logProgress(`🔌 New user interface session connected: ${socket.id}`, sessionId);

  // Send initial status and log history to newly connected UI
  socket.emit("init", {
    state: s.clientState,
    qr: s.activeQr,
    code: s.activeCode,
    logs: s.logHistory,
    qrExpired: s.qrExpired || false,
  });

  // Handle re-initializing client on request (e.g. after QR code timeout)
  socket.on("initialize-client", () => {
    s.lastActive = Date.now();
    s.qrExpired = false;
    if (!s.client) {
      logProgress("🔄 Re-initializing WhatsApp Client on user request...", sessionId);
      initClient(sessionId);
    } else {
      socket.emit("status", {
        state: s.clientState,
        qr: s.activeQr,
        code: s.activeCode,
        qrExpired: s.qrExpired,
      });
    }
  });

  if (s.clientState === "ready" && s.client) {
    // Fetch and emit profile details for the newly connected UI
    try {
      const me = s.client.info;
      s.client
        .getProfilePicUrl(me.wid._serialized)
        .then((profilePicUrl) => {
          socket.emit("session-profile", {
            name: me.pushname || "WhatsApp User",
            number: me.wid.user,
            avatar: profilePicUrl,
          });
        })
        .catch(() => {
          socket.emit("session-profile", {
            name: me.pushname || "WhatsApp User",
            number: me.wid.user,
            avatar: null,
          });
        });
    } catch (err) {
      console.error("Error sending profile details on reconnect:", err.message);
    }
    fetchAndEmitGroups(sessionId);
  }

  // Handle pairing code request
  socket.on("request-pairing-code", async ({ phoneNumber }) => {
    if (s.clientState !== "disconnected") {
      socket.emit(
        "extraction-error",
        "WhatsApp client is already authenticating or ready.",
      );
      return;
    }

    const cleanNumber = phoneNumber.replace(/\D/g, "");
    if (!cleanNumber || cleanNumber.length < 8) {
      socket.emit(
        "extraction-error",
        "Invalid phone number format. Please provide a valid international number.",
      );
      return;
    }

    logProgress(`🔄 Requesting pairing code for +${cleanNumber}...`, sessionId);
    try {
      if (!s.client) {
        throw new Error("WhatsApp client is not initialized. Please click restart or refresh the page.");
      }
      s.isPairingActive = true;
      const code = await s.client.requestPairingCode(cleanNumber);
      s.activeCode = code;
      io.to(sessionId).emit("status", { state: s.clientState, qr: null, code: s.activeCode });
      logProgress(`🔑 Pairing code generated successfully: ${code}`, sessionId);
    } catch (err) {
      s.isPairingActive = false;
      s.activeCode = null;
      logProgress(`❌ Error requesting pairing code: ${err.message}`, sessionId);
      socket.emit(
        "extraction-error",
        `Failed to request pairing code: ${err.message}`,
      );
    }
  });

  // Handle cancel pairing code
  socket.on("cancel-pairing-code", async () => {
    if (!s.activeCode) {
      logProgress("ℹ️ No active pairing code to cancel.", sessionId);
      return;
    }

    logProgress("🔄 Cancelling pairing code session, returning to QR mode...", sessionId);
    try {
      if (!s.client) {
        throw new Error("WhatsApp client is not initialized.");
      }
      await s.client.cancelPairingCode();
      s.activeCode = null;
      s.isPairingActive = false;
      logProgress("✅ Pairing code session cancelled.", sessionId);
    } catch (err) {
      logProgress(`❌ Error cancelling pairing code: ${err.message}`, sessionId);
      socket.emit(
        "extraction-error",
        `Failed to cancel pairing code: ${err.message}`,
      );
    }
  });

  // Handle extraction request
  socket.on(
    "extract-contacts",
    async ({
      groupIds,
      groupId,
      enrichData,
      fetchProfilePics,
      fetchAboutStatus,
      excludeAdmins,
      excludeSaved,
      countryFilter,
      delayMs,
    }) => {
      if (s.clientState !== "ready") {
        socket.emit(
          "extraction-error",
          "WhatsApp client is not ready. Please wait or scan QR first.",
        );
        return;
      }

      let targetGroupIds = groupIds;
      if (!targetGroupIds && groupId) {
        targetGroupIds = [groupId];
      }

      if (
        !targetGroupIds ||
        !Array.isArray(targetGroupIds) ||
        targetGroupIds.length === 0 ||
        targetGroupIds[0] === "undefined"
      ) {
        logProgress(
          "❌ Error: Extraction request sent with an invalid or empty group list.", sessionId
        );
        s.clientState = "ready";
        io.to(sessionId).emit("status", { state: s.clientState });
        socket.emit(
          "extraction-error",
          "No groups were selected. Please select at least one group.",
        );
        return;
      }

      s.clientState = "extracting";
      io.to(sessionId).emit("status", { state: s.clientState });
      logProgress(
        `🔍 Extraction triggered by client. Targets: ${targetGroupIds.join(", ")}`, sessionId
      );

      // Fetch Subscription Limits
      const phoneNumber = s.client?.info?.wid?.user;
      let userTier = 'free';
      let extractionsToday = 0;
      let todayStr = new Date().toISOString().split('T')[0];
      let wasLimited = false;
      let originalContactCount = 0;

      if (phoneNumber && supabase) {
        logProgress(`⏳ Verifying subscription status for phone number: ${phoneNumber}...`, sessionId);
        const { data: sub, error } = await supabase
          .from('user_subscriptions')
          .select('*')
          .eq('phone_number', phoneNumber)
          .single();
        
        if (error) {
          logProgress(`⚠️ Error fetching subscription: ${error.message}`, sessionId);
        }
        if (sub) {
          logProgress(`✅ Subscription found: tier=${sub.tier}, status=${sub.subscription_status}`, sessionId);
          userTier = sub.tier || 'free';
          extractionsToday = sub.extractions_today || 0;
          if (sub.last_extraction_date !== todayStr) {
            extractionsToday = 0; // Reset counter for a new day
          }
        } else {
          logProgress(`⚠️ No subscription found for phone number: ${phoneNumber}, defaulting to free tier.`, sessionId);
        }
      } else {
        logProgress(`⚠️ Subscription verification skipped: phoneNumber=${phoneNumber}, supabase=${!!supabase}`, sessionId);
      }

        // Enforce Limits
        if (userTier === 'free' && extractionsToday >= 3) {
          logProgress("❌ Limit Exceeded: Free tier is limited to 3 extractions per day.", sessionId);
          s.clientState = "ready";
          io.to(sessionId).emit("status", { state: s.clientState });
          socket.emit("rate-limit-error", { tier: 'free', message: "You have reached your daily limit of 3 extractions on the Free tier. Upgrade to extract more!" });
          return;
        }
        if (userTier === 'pro' && extractionsToday >= 10) {
          logProgress("❌ Limit Exceeded: Pro tier is capped at 10 extractions per day.", sessionId);
          s.clientState = "ready";
          io.to(sessionId).emit("status", { state: s.clientState });
          socket.emit("rate-limit-error", { tier: 'pro', message: "You have reached your daily cap of 10 extractions on the Pro tier. Upgrade to Unlimited for unrestricted access!" });
          return;
        }

      try {
        const compiledParticipants = []; // Array of { id, userId, isAdmin, groupName }
        const resolvedGroupNames = [];

        for (const gId of targetGroupIds) {
          try {
            logProgress(`⏳ Fetching group participants for ID "${gId}"...`, sessionId);
            const groupData = await s.client.pupPage.evaluate(async (groupId) => {
              try {
                const ChatCollection = window.require('WAWebCollections').Chat;
                const chatWid = window.require('WAWebWidFactory').createWid(groupId);
                let chat = ChatCollection.get(chatWid);
                if (!chat) {
                  const findResult = await window.require('WAWebFindChatAction').findOrCreateLatestChat(chatWid).catch(() => null);
                  chat = findResult ? findResult.chat : null;
                }
                if (!chat) {
                  throw new Error("Group chat not found in WhatsApp Web store.");
                }

                let rawParticipants = chat.groupMetadata && chat.groupMetadata.participants
                  ? (typeof chat.groupMetadata.participants.serialize === 'function'
                     ? chat.groupMetadata.participants.serialize()
                     : chat.groupMetadata.participants)
                  : [];

                // Always trigger update if participants list is currently empty
                if (rawParticipants.length === 0) {
                  const groupMetadataCollection = window.require('WAWebCollections').GroupMetadata ||
                                                  window.require('WAWebCollections').WAWebGroupMetadataCollection;
                  
                  if (groupMetadataCollection && typeof groupMetadataCollection.update === 'function') {
                    // Trigger update in background without awaiting the promise that might hang
                    groupMetadataCollection.update(chatWid).catch(() => {});
                  }

                  try {
                    const groupQueryJob = window.require('WAWebGroupQueryJob');
                    if (groupQueryJob && typeof groupQueryJob.queryAndUpdateGroupMetadataById === 'function') {
                      // Trigger direct GraphQL/Mex server query for group metadata
                      groupQueryJob.queryAndUpdateGroupMetadataById({ id: groupId }).catch(() => {});
                    }
                  } catch (jobErr) {}

                  // Poll for up to 15 seconds (checking every 1s) for participants to be loaded
                  for (let attempt = 0; attempt < 15; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const updatedChat = ChatCollection.get(chatWid);
                    if (updatedChat && updatedChat.groupMetadata && updatedChat.groupMetadata.participants) {
                      const currentParticipants = typeof updatedChat.groupMetadata.participants.serialize === 'function'
                        ? updatedChat.groupMetadata.participants.serialize()
                        : updatedChat.groupMetadata.participants;
                      if (currentParticipants && currentParticipants.length > 0) {
                        rawParticipants = currentParticipants;
                        break;
                      }
                    }
                  }
                }

                const updatedChat = ChatCollection.get(chatWid);
                if (!updatedChat || !updatedChat.groupMetadata) {
                  throw new Error("Group metadata could not be fetched or synchronized.");
                }

                const { toPn } = window.require('WAWebLidMigrationUtils') || {};
                const name = updatedChat.name || updatedChat.formattedTitle || "Unnamed Group";
                const participants = rawParticipants.map(p => {
                  let resolvedIdObj = p.id;
                  if (toPn && typeof toPn === 'function') {
                    resolvedIdObj = toPn(p.id) ?? p.id;
                  }
                  const pId = resolvedIdObj._serialized || resolvedIdObj;
                  const uId = resolvedIdObj.user || (pId ? pId.split('@')[0] : '');
                  return {
                    id: pId,
                    userId: uId,
                    isAdmin: p.isAdmin || p.isSuperAdmin || false,
                    groupName: name
                  };
                });

                return { name, participants };
              } catch (e) {
                return { error: e.message };
              }
            }, gId);

            if (groupData && groupData.error) {
              throw new Error(groupData.error);
            }

            logProgress(`✅ Found group: "${groupData.name}" with ${groupData.participants.length} participants`, sessionId);
            resolvedGroupNames.push(groupData.name);
            compiledParticipants.push(...groupData.participants);

          } catch (err) {
            logProgress(`❌ Error fetching group "${gId}": ${err.message}`, sessionId);
          }
        }

        if (compiledParticipants.length === 0) {
          logProgress(
            "❌ Error: No participants found in any of the selected groups.", sessionId
          );
          s.clientState = "ready";
          io.to(sessionId).emit("status", { state: s.clientState });
          socket.emit(
            "extraction-error",
            "Failed to retrieve participants from the selected groups.",
          );
          return;
        }

        // Deduplicate contacts by phone number (userId)
        const uniqueContactsMap = new Map();
        for (const p of compiledParticipants) {
          if (uniqueContactsMap.has(p.userId)) {
            uniqueContactsMap.get(p.userId).groupNames.add(p.groupName);
          } else {
            uniqueContactsMap.set(p.userId, {
              id: p.id,
              userId: p.userId,
              isAdmin: p.isAdmin,
              groupNames: new Set([p.groupName]),
            });
          }
        }

        let filteredContactsList = Array.from(uniqueContactsMap.values());

        logProgress(
          `👥 Total participants: ${compiledParticipants.length}. Unique contacts: ${filteredContactsList.length}`, sessionId
        );

        // Apply Filters
        // 1. Exclude Admins
        if (excludeAdmins) {
          filteredContactsList = filteredContactsList.filter((c) => !c.isAdmin);
          logProgress(
            `🧹 Excluded group admins. Remaining: ${filteredContactsList.length}`, sessionId
          );
        }

        // Apply Subscription Contact Limits
        originalContactCount = filteredContactsList.length;
        if (userTier === 'free') {
          const limit = Math.ceil(originalContactCount / 3);
          if (filteredContactsList.length > limit) {
            wasLimited = true;
            logProgress(`⚠️ Free tier limit: Slicing contacts to 1/3 (${limit} of ${originalContactCount}). Upgrade to Pro/Unlimited to extract all contacts!`, sessionId);
            filteredContactsList = filteredContactsList.slice(0, limit);
          }
        } else if (userTier === 'pro') {
          const limit = Math.ceil(originalContactCount / 2);
          if (filteredContactsList.length > limit) {
            wasLimited = true;
            logProgress(`⚠️ Pro tier limit: Slicing contacts to 1/2 (${limit} of ${originalContactCount}). Upgrade to Unlimited to extract all contacts!`, sessionId);
            filteredContactsList = filteredContactsList.slice(0, limit);
          }
        }

        const enrichedContacts = [];
        const total = filteredContactsList.length;

       let excludedSavedCount = 0;
        if (enrichData || excludeSaved) {
          const delay = delayMs !== undefined ? parseInt(delayMs) : 100;
          logProgress(
            `⏳ Starting batch data enrichment for ${total} contacts with a ${delay}ms delay...`, sessionId
          );

          // Fetch details in batches of 10
          const batchSize = 10;
          for (let i = 0; i < total; i += batchSize) {
            const batch = filteredContactsList.slice(i, i + batchSize);
            const batchPromises = batch.map(async (c) => {
              try {
                const contact = await s.client.getContactById(c.id);
                
                // Exclude contacts in the address book if toggle is checked
                if (excludeSaved && contact.isMyContact) {
                  return null;
                }

                // Resolve LID to phone number if available
                const actualNumber = (contact.id && contact.id.server === 'c.us') ? contact.id.user : c.userId;
                const offlineCC = getCountryCodeOffline(actualNumber);
                
                let profilePicUrl = "";
                let aboutStatus = "";
                if (enrichData && fetchProfilePics) {
                  try { profilePicUrl = await contact.getProfilePicUrl(); } catch(e){}
                }
                if (enrichData && fetchAboutStatus) {
                  try { aboutStatus = await contact.getAbout(); } catch(e){}
                }

                return {
                  number: actualNumber,
                  name: enrichData ? (contact.name || "") : "",
                  pushname: enrichData ? (contact.pushname || "") : "",
                  country: offlineCC.country,
                  countryCode: offlineCC.prefix,
                  isBusiness: enrichData ? (contact.isBusiness || contact.isEnterprise || false) : false,
                  isAdmin: c.isAdmin,
                  isMyContact: contact.isMyContact || false,
                  sourceGroup: Array.from(c.groupNames).join("; "),
                  profilePicUrl,
                  aboutStatus,
                };
              } catch (err) {
                const offlineCC = getCountryCodeOffline(c.userId);
                return {
                  number: c.userId,
                  name: "",
                  pushname: "",
                  country: offlineCC.country,
                  countryCode: offlineCC.prefix,
                  isBusiness: false,
                  isAdmin: c.isAdmin,
                  isMyContact: false,
                  sourceGroup: Array.from(c.groupNames).join("; "),
                  profilePicUrl: "",
                  aboutStatus: "",
                };
              }
            });

            const rawBatchResults = await Promise.all(batchPromises);
            const batchResults = rawBatchResults.filter(item => {
              if (item === null) {
                excludedSavedCount++;
                return false;
              }
              return true;
            });
            enrichedContacts.push(...batchResults);

            const processed = Math.min(i + batch.length, total);
            const percent = Math.round((processed / total) * 100);
            io.to(sessionId).emit("extraction-progress", { processed, total, percent });

            if (delay > 0 && i + batchSize < total) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
          logProgress("✅ Enrichment complete.", sessionId);
          if (excludeSaved && excludedSavedCount > 0) {
            logProgress(`🧹 Excluded ${excludedSavedCount} saved contacts from final extraction list.`, sessionId);
          }
        } else {
          // Instant basic extraction without Puppeteer getContact calls
          logProgress(
            "⚡ Direct extraction mode selected. Skipping contact details fetch.", sessionId
          );
          for (const c of filteredContactsList) {
            const offlineCC = getCountryCodeOffline(c.userId);
            enrichedContacts.push({
              number: c.userId,
              name: "",
              pushname: "",
              country: offlineCC.country,
              countryCode: offlineCC.prefix,
              isBusiness: false,
              isAdmin: c.isAdmin,
              isMyContact: false,
              sourceGroup: Array.from(c.groupNames).join("; "),
              profilePicUrl: "",
              aboutStatus: "",
            });
          }
        }

        // Apply country prefix filter on the final mapped numbers list
        let finalContacts = enrichedContacts;
        if (countryFilter && countryFilter.trim()) {
          const prefixes = countryFilter
            .split(",")
            .map((p) => p.trim().replace("+", ""))
            .filter(Boolean);
          if (prefixes.length > 0) {
            finalContacts = finalContacts.filter((c) => {
              return prefixes.some((p) => c.number.startsWith(p));
            });
            logProgress(
              `🧹 Filtered by country prefix (${prefixes.join(", ")}). Remaining: ${finalContacts.length}`, sessionId
            );
          }
        }

        // Check if lists are now empty
        if (finalContacts.length === 0) {
          logProgress(
            "⚠️ Filtering complete. No contacts matched the criteria.", sessionId
          );
          s.clientState = "ready";
          io.to(sessionId).emit("status", { state: s.clientState });
          socket.emit(
            "extraction-error",
            "No contacts matched your filter criteria.",
          );
          return;
        }

        // --- Save a separate file per group so each downloads independently ---
        const expiresAt = Date.now() + 5 * 60 * 1000;
        const results = [];

        for (const groupName of resolvedGroupNames) {
          // Filter contacts belonging to this group (a contact may be in multiple groups)
          const groupContacts = finalContacts.filter((c) =>
            c.sourceGroup.split("; ").includes(groupName),
          );
          if (groupContacts.length === 0) continue;

          const fileId = Math.random().toString(36).substring(2, 15);
          const filePath = path.join(downloadsDir, `contacts_${fileId}.json`);

          fs.writeFileSync(
            filePath,
            JSON.stringify(
              {
                contacts: groupContacts,
                groupName, // stored so download route can use it as filename even after restart
                groupNames: groupName,
              },
              null,
              2,
            ),
          );

          activeFiles.set(fileId, {
            filePath,
            groupName,
            expiresAt,
          });

          results.push({ fileId, count: groupContacts.length, groupName });
          logProgress(
            `💾 Saved ${groupContacts.length} contacts for "${groupName}" → session ${fileId}`, sessionId
          );
        }

        if (results.length === 0) {
          throw new Error(
            "No contacts were saved — check group filter settings.",
          );
        }

        // --- Save a combined file of all groups ---
        const combinedFileId = Math.random().toString(36).substring(2, 15);
        const combinedFilePath = path.join(downloadsDir, `contacts_${combinedFileId}.json`);
        const combinedGroupName = resolvedGroupNames.length === 1 
          ? resolvedGroupNames[0] 
          : "All_Groups";

        fs.writeFileSync(
          combinedFilePath,
          JSON.stringify(
            {
              contacts: finalContacts,
              groupName: combinedGroupName,
              groupNames: resolvedGroupNames.join("; "),
            },
            null,
            2
          )
        );

        activeFiles.set(combinedFileId, {
          filePath: combinedFilePath,
          groupName: combinedGroupName,
          expiresAt,
        });

        s.clientState = "ready";
        io.to(sessionId).emit("status", { state: s.clientState });

        // Increment extraction counter
        if (phoneNumber && supabase) {
          try {
            await supabase.from('user_subscriptions').upsert({
              phone_number: phoneNumber,
              tier: userTier, // Maintain current tier
              extractions_today: extractionsToday + 1,
              last_extraction_date: todayStr
            }, { onConflict: 'phone_number' });
          } catch (err) {
            console.error("Failed to update extractions_today:", err);
          }
        }

        // Emit results array — one entry per group file + combined file details
        io.to(sessionId).emit("extraction-complete", { 
          results,
          combined: {
            fileId: combinedFileId,
            count: finalContacts.length,
            groupName: combinedGroupName
          },
          wasLimited,
          originalContactCount,
          tier: userTier
        });
      } catch (err) {
        logProgress(`❌ Extraction error: ${err.message}`, sessionId);
        s.clientState = "ready";
        io.to(sessionId).emit("status", { state: s.clientState });
        socket.emit(
          "extraction-error",
          `An error occurred during extraction: ${err.message}`,
        );
      }
    },
  );

  // Handle send-to-dm request
  socket.on("send-to-dm", async ({ fileId, groupName, format, chunkIndex, chunkSize }) => {
    const sessionId = socket.handshake.query.sessionId;
    const s = getSession(sessionId);

    if (!s || s.clientState !== "ready") {
      socket.emit("send-to-dm-response", {
        success: false,
        message: "WhatsApp client is not ready.",
        fileId,
        groupName,
        chunkIndex,
        chunkSize
      });
      return;
    }

    try {
      const fmt = format || "txt";
      logProgress(
        `📤 Generating .${fmt.toUpperCase()} document for group: "${groupName}"...`,
        sessionId
      );

      // Retrieve the file
      const fileData = activeFiles.get(fileId);
      let resolvedFilePath = null;

      if (fileData && fs.existsSync(fileData.filePath)) {
        resolvedFilePath = fileData.filePath;
      } else {
        const jsonFallback = path.join(downloadsDir, `contacts_${fileId}.json`);
        if (fs.existsSync(jsonFallback)) {
          resolvedFilePath = jsonFallback;
        } else {
          socket.emit("send-to-dm-response", {
            success: false,
            message: "File not found. Link may have expired.",
            fileId,
            groupName,
            chunkIndex,
            chunkSize
          });
          return;
        }
      }

      // Read and parse the contacts file
      const raw = fs.readFileSync(resolvedFilePath, "utf-8");
      const parsed = JSON.parse(raw);
      let contacts = parsed.contacts || [];

      if (contacts.length === 0) {
        socket.emit("send-to-dm-response", {
          success: false,
          message: "No contacts found in the file.",
          fileId,
          groupName,
          chunkIndex,
          chunkSize
        });
        return;
      }

      // Slice contacts if chunk parameters are provided
      if (chunkIndex !== undefined && chunkIndex !== null && chunkSize !== undefined && chunkSize !== null) {
        const start = chunkIndex * chunkSize;
        const end = start + chunkSize;
        contacts = contacts.slice(start, end);
      }

      if (contacts.length === 0) {
        socket.emit("send-to-dm-response", {
          success: false,
          message: "No contacts found in this chunk.",
          fileId,
          groupName,
          chunkIndex,
          chunkSize
        });
        return;
      }

      // Generate file content based on format
      let fileContent = "";
      let mimeType = "text/plain";
      let extension = "txt";

      if (fmt === "txt") {
        fileContent = contacts.map((c) => `+${c.number}`).join("\n");
        mimeType = "text/plain";
        extension = "txt";
      } else if (fmt === "csv") {
        const headers = [
          "Phone Number",
          "Name",
          "WhatsApp Name",
          "Country",
          "Country Code",
          "Is Business",
          "Is Admin",
          "Is My Contact",
          "Source Group",
          "Profile Picture URL",
          "About Status"
        ];
        const csvRows = [headers.join(",")];

        for (const c of contacts) {
          const row = [
            `+${c.number}`,
            escapeCSV(c.name),
            escapeCSV(c.pushname),
            escapeCSV(c.country),
            escapeCSV(c.countryCode),
            c.isBusiness ? "Yes" : "No",
            c.isAdmin ? "Yes" : "No",
            c.isMyContact ? "Yes" : "No",
            escapeCSV(c.sourceGroup),
            escapeCSV(c.profilePicUrl || ""),
            escapeCSV(c.aboutStatus || "")
          ];
          csvRows.push(row.join(","));
        }

        fileContent = csvRows.join("\n");
        mimeType = "text/csv";
        extension = "csv";
      } else if (fmt === "xlsx") {
        const dataSheet = contacts.map((c) => ({
          "Phone Number": `+${c.number}`,
          Name: c.name,
          "WhatsApp Name": c.pushname,
          Country: c.country,
          "Country Code": c.countryCode,
          "Is Business": c.isBusiness ? "Yes" : "No",
          "Is Admin": c.isAdmin ? "Yes" : "No",
          "Is My Contact": c.isMyContact ? "Yes" : "No",
          "Source Group": c.sourceGroup,
          "Profile Picture URL": c.profilePicUrl || "",
          "About Status": c.aboutStatus || ""
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dataSheet);
        XLSX.utils.book_append_sheet(wb, ws, "Contacts");
        fileContent = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        mimeType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        extension = "xlsx";
      } else if (fmt === "vcf") {
        const vcards = [];
        let i = 0;
        const startIndex = (chunkIndex !== undefined && chunkIndex !== null && chunkSize !== undefined && chunkSize !== null)
          ? chunkIndex * chunkSize
          : 0;

        for (const c of contacts) {
          const groupNameFirst = c.sourceGroup ? c.sourceGroup.split(";")[0].trim() : "Contact";
          const displayName = `${groupNameFirst} ${startIndex + i + 1}`;
          vcards.push("BEGIN:VCARD");
          vcards.push("VERSION:3.0");
          vcards.push(`N:;${displayName};;;`);
          vcards.push(`FN:${displayName}`);
          vcards.push(`TEL;TYPE=CELL;TYPE=PREF:+${c.number}`);
          vcards.push(`ORG:${c.sourceGroup}`);
          
          if (c.profilePicUrl) {
            vcards.push(`PHOTO;VALUE=URL:${c.profilePicUrl}`);
          }
          
          let noteStr = `Extracted from WhatsApp group: ${c.sourceGroup}`;
          if (c.aboutStatus) noteStr += `\\nBio: ${c.aboutStatus}`;
          vcards.push(`NOTE:${noteStr}`);
          
          vcards.push("END:VCARD");
          i++;
        }
        fileContent = vcards.join("\n");
        mimeType = "text/vcard";
        extension = "vcf";
      }

      // Get the user's own WhatsApp JID (save to self). Prefer the base user JID to avoid Lid errors.
      const myJid = s.client.info?.wid?.user ? `${s.client.info.wid.user}@c.us` : s.client.info?.wid?._serialized;
      if (!myJid) {
        socket.emit("send-to-dm-response", {
          success: false,
          message: "Could not find your WhatsApp JID.",
          fileId,
          groupName,
          chunkIndex,
          chunkSize
        });
        return;
      }

      // Convert fileContent to base64 for in-memory MessageMedia
      let base64Data;
      if (Buffer.isBuffer(fileContent)) {
        base64Data = fileContent.toString("base64");
      } else {
        base64Data = Buffer.from(fileContent, "utf-8").toString("base64");
      }

      let filename = `contacts_${groupName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30)}.${extension}`;
      if (chunkIndex !== undefined && chunkIndex !== null && chunkSize !== undefined && chunkSize !== null) {
        filename = `contacts_${groupName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30)}_Part_${chunkIndex + 1}.${extension}`;
      }
      const media = new MessageMedia(mimeType, base64Data, filename);

      logProgress(
        `📎 Sending .${extension.toUpperCase()} document directly to your DM...`,
        sessionId
      );

      // Send the file as a document directly to JID
      await s.client.sendMessage(myJid, media);

      logProgress(
        `✅ Successfully sent ${contacts.length} contacts from "${groupName}" as .${extension.toUpperCase()} to your WhatsApp DM.`,
        sessionId
      );
      socket.emit("send-to-dm-response", {
        success: true,
        message: "Sent to DM",
        fileId,
        groupName,
        chunkIndex,
        chunkSize
      });
    } catch (error) {
      logProgress(`❌ Send to DM error: ${error.message}`, sessionId);
      socket.emit("send-to-dm-response", {
        success: false,
        message: error.message,
        fileId,
        groupName,
        chunkIndex,
        chunkSize
      });
    }
  });

  // Handle logout request
  socket.on("logout-whatsapp", async () => {
    const sessionId = socket.handshake.query.sessionId;
    const s = getSession(sessionId);
    if (!s || s.clientState === "disconnected" || !s.client) {
      socket.emit("error", "Client is already logged out.");
      return;
    }
    
    logProgress("👋 Logging out current WhatsApp session...", sessionId);
    
    const clientToDestroy = s.client;
    try {
      // Race logout with a 5 second timeout to prevent hanging
      await Promise.race([
        clientToDestroy.logout(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Logout timed out")), 5000))
      ]);
    } catch (err) {
      logProgress(`❌ Logout timeout or error: ${err.message}`, sessionId);
    }

    try {
      await clientToDestroy.destroy();
    } catch (destroyErr) {
      logProgress(`❌ Error destroying client: ${destroyErr.message}`, sessionId);
    }
    
    s.client = null;
    s.clientState = "disconnected";
    io.to(sessionId).emit("status", { state: "disconnected" });
    
    // Instantiate and initialize a fresh client
    initClient(sessionId);
  });

  socket.on("disconnect", () => {
    s.sockets.delete(socket.id);
    s.lastActive = Date.now(); // Start the idle timer from this moment
    console.log(`🔌 UI session disconnected: ${socket.id} (${s.sockets.size} active sockets remaining for session ${sessionId})`);
  });
});

// Debug Upgrade Endpoint
app.get("/api/debug-upgrade", async (req, res) => {
  try {
    let upgradedCount = 0;
    const details = [];
    for (const [id, s] of sessions.entries()) {
      if (s.client && s.client.info && s.client.info.wid) {
        const num = s.client.info.wid.user;
        details.push(num);
        if (supabase) {
          await supabase.from('user_subscriptions').upsert({
            phone_number: num,
            tier: 'unlimited',
            subscription_status: 'active'
          }, { onConflict: 'phone_number' });
          upgradedCount++;
        }
      }
    }
    res.json({ success: true, upgradedCount, phoneNumbers: details });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Secure Download Endpoint
app.get("/download/:fileId", (req, res) => {
  const fileId = req.params.fileId;
  const format = req.query.format || "txt";
  const chunkIndex = req.query.chunkIndex !== undefined ? parseInt(req.query.chunkIndex, 10) : null;
  const chunkSize = req.query.chunkSize !== undefined ? parseInt(req.query.chunkSize, 10) : null;

  // Primary: look up in memory (fresh session)
  let resolvedFilePath = null;
  let resolvedGroupName = "contacts";

  const fileData = activeFiles.get(fileId);
  if (fileData && fs.existsSync(fileData.filePath)) {
    resolvedFilePath = fileData.filePath;
    resolvedGroupName = fileData.groupName;
  } else {
    // Fallback: reconstruct path from disk after server restart (nodemon clears in-memory Map)
    const jsonFallback = path.join(downloadsDir, `contacts_${fileId}.json`);
    const txtFallback = path.join(downloadsDir, `group_numbers_${fileId}.txt`);

    if (fs.existsSync(jsonFallback)) {
      resolvedFilePath = jsonFallback;
      // Read groupName from inside the file — available even after restart
      try {
        const meta = JSON.parse(fs.readFileSync(jsonFallback, "utf-8"));
        resolvedGroupName = meta.groupName || meta.groupNames || fileId;
      } catch (_) {
        resolvedGroupName = fileId;
      }
    } else if (fs.existsSync(txtFallback)) {
      // Legacy plain-text file — serve it directly
      resolvedFilePath = txtFallback;
      res.setHeader("Content-Type", "text/plain");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="contacts_${fileId}.txt"`,
      );
      return res.send(fs.readFileSync(txtFallback, "utf-8"));
    } else {
      return res
        .status(404)
        .send("Download link expired or file not found on disk.");
    }
  }

  try {
    const raw = fs.readFileSync(resolvedFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    let contacts = parsed.contacts || [];

    // Slice contacts if chunk parameters are provided
    if (chunkIndex !== null && chunkSize !== null && !isNaN(chunkIndex) && !isNaN(chunkSize)) {
      const start = chunkIndex * chunkSize;
      const end = start + chunkSize;
      contacts = contacts.slice(start, end);
    }

    // Prefer groupName from inside the JSON (always accurate) over the Map entry
    const nameForFile =
      parsed.groupName || parsed.groupNames || resolvedGroupName;
    const sanitizedName = nameForFile
      .replace(/[^a-zA-Z0-9\-_. ]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 60);

    let fileContent = "";
    let contentType = "text/plain";
    let extension = "txt";
    let sendBuffer = null;

    if (format === "txt") {
      fileContent = contacts.map((c) => `+${c.number}`).join("\n");
      contentType = "text/plain";
      extension = "txt";
    } else if (format === "csv") {
      const headers = [
        "Phone Number",
        "Name",
        "WhatsApp Name",
        "Country",
        "Country Code",
        "Is Business",
        "Is Admin",
        "Is My Contact",
        "Source Group",
        "Profile Picture URL",
        "About Status"
      ];
      const csvRows = [headers.join(",")];

      for (const c of contacts) {
        const row = [
          `+${c.number}`,
          escapeCSV(c.name),
          escapeCSV(c.pushname),
          escapeCSV(c.country),
          escapeCSV(c.countryCode),
          c.isBusiness ? "Yes" : "No",
          c.isAdmin ? "Yes" : "No",
          c.isMyContact ? "Yes" : "No",
          escapeCSV(c.sourceGroup),
          escapeCSV(c.profilePicUrl || ""),
          escapeCSV(c.aboutStatus || "")
        ];
        csvRows.push(row.join(","));
      }

      fileContent = csvRows.join("\n");
      contentType = "text/csv";
      extension = "csv";
    } else if (format === "xlsx") {
      const dataSheet = contacts.map((c) => ({
        "Phone Number": `+${c.number}`,
        Name: c.name,
        "WhatsApp Name": c.pushname,
        Country: c.country,
        "Country Code": c.countryCode,
        "Is Business": c.isBusiness ? "Yes" : "No",
        "Is Admin": c.isAdmin ? "Yes" : "No",
        "Is My Contact": c.isMyContact ? "Yes" : "No",
        "Source Group": c.sourceGroup,
        "Profile Picture URL": c.profilePicUrl || "",
        "About Status": c.aboutStatus || ""
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataSheet);
      XLSX.utils.book_append_sheet(wb, ws, "Contacts");
      sendBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      extension = "xlsx";
    } else if (format === "vcf") {
      const vcards = [];
      let i = 0;
      const startIndex = (chunkIndex !== null && chunkSize !== null && !isNaN(chunkIndex) && !isNaN(chunkSize))
        ? chunkIndex * chunkSize
        : 0;

      for (const c of contacts) {
        const groupNameFirst = c.sourceGroup ? c.sourceGroup.split(";")[0].trim() : "Contact";
        const displayName = `${groupNameFirst} ${startIndex + i + 1}`;
        vcards.push("BEGIN:VCARD");
        vcards.push("VERSION:3.0");
        vcards.push(`N:;${displayName};;;`);
        vcards.push(`FN:${displayName}`);
        vcards.push(`TEL;TYPE=CELL;TYPE=PREF:+${c.number}`);
        vcards.push(`ORG:${c.sourceGroup}`);
        
        if (c.profilePicUrl) {
          vcards.push(`PHOTO;VALUE=URL:${c.profilePicUrl}`);
        }
        
        let noteStr = `Extracted from WhatsApp group: ${c.sourceGroup}`;
        if (c.aboutStatus) noteStr += `\\nBio: ${c.aboutStatus}`;
        vcards.push(`NOTE:${noteStr}`);
        
        vcards.push("END:VCARD");
        i++;
      }
      fileContent = vcards.join("\n");
      contentType = "text/vcard";
      extension = "vcf";
    }

    let downloadName = `${sanitizedName}_contacts.${extension}`;
    if (chunkIndex !== null && chunkSize !== null && !isNaN(chunkIndex) && !isNaN(chunkSize)) {
      downloadName = `${sanitizedName}_contacts_Part_${chunkIndex + 1}.${extension}`;
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName}"`,
    );

    if (sendBuffer) {
      res.send(sendBuffer);
    } else {
      res.send(fileContent);
    }
  } catch (err) {
    console.error("Download error:", err.message);
    res.status(500).send("Error generating export file.");
  }
});

// Periodic cleanup task for expired download files (runs every minute)
setInterval(() => {
  const now = Date.now();
  for (const [fileId, data] of activeFiles.entries()) {
    if (now > data.expiresAt) {
      try {
        if (fs.existsSync(data.filePath)) {
          fs.unlinkSync(data.filePath);
        }
        activeFiles.delete(fileId);
        logProgress(
          `🧹 Cleaned up expired temporary file for session: ${fileId}`,
        );
      } catch (err) {
        console.error(
          `Expired file cleanup error for ${fileId}: ${err.message}`,
        );
      }
    }
  }
}, 60000);

// Next.js Catch-all Route Handler
app.use((req, res) => {
  return handle(req, res);
});

nextApp.prepare().then(() => {
  // Start server
  server.listen(PORT, () => {
    console.log(
      `🚀 WhatsApp Extractor Server with Next.js running at http://localhost:${PORT}`,
    );
  });
});
