/**
 * WhatsApp Bot Entry Point
 * Loads config, commands, events, and starts the bot.
 */
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const config = require("./utils");

// Logging via pino
const logger = pino({
  level: config.logging?.level || "info",
  transport: { target: "pino-pretty" },
});

/**
 * Loads all command modules from the commands directory.
 * @returns {Map}
 */
const commands = new Map();
fs.readdirSync("./commands").forEach((file) => {
  const cmd = require(`./commands/${file}`);
  commands.set(cmd.name, cmd);
});

let activeSocket = null;
const lockFilePath = path.resolve(__dirname, ".bot.lock");
let lockAcquired = false;

function parsePid(text) {
  const value = Number(String(text || "").trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err?.code === "EPERM") return true;
    return false;
  }
}

function releaseSingleInstanceLock() {
  if (!lockAcquired) return;

  try {
    const existingPid = parsePid(fs.readFileSync(lockFilePath, "utf8"));
    if (existingPid === null || existingPid === process.pid) {
      fs.rmSync(lockFilePath, { force: true });
    }
  } catch {
    fs.rmSync(lockFilePath, { force: true });
  }

  lockAcquired = false;
}

function acquireSingleInstanceLock() {
  if (lockAcquired) return true;

  try {
    fs.writeFileSync(lockFilePath, String(process.pid), { flag: "wx" });
    lockAcquired = true;
    return true;
  } catch (err) {
    if (err?.code !== "EEXIST") {
      logger.error({ err }, "Failed to create single-instance lock file");
      return false;
    }

    try {
      const existingPid = parsePid(fs.readFileSync(lockFilePath, "utf8"));
      if (existingPid && isProcessRunning(existingPid)) {
        logger.error(`Another bot process is already running (PID ${existingPid}). Stop it before starting another instance.`);
        return false;
      }

      fs.rmSync(lockFilePath, { force: true });
      fs.writeFileSync(lockFilePath, String(process.pid), { flag: "wx" });
      lockAcquired = true;
      logger.warn("Recovered stale lock file and continued startup.");
      return true;
    } catch (innerErr) {
      logger.error({ err: innerErr }, "Failed to recover single-instance lock file");
      return false;
    }
  }
}

function isTransientConnectionClosedError(err) {
  const statusCode = err?.output?.statusCode;
  return (
    err?.isBoom === true &&
    statusCode === DisconnectReason.connectionClosed &&
    /connection closed/i.test(err?.message || "")
  );
}

process.on("uncaughtException", (err) => {
  if (isTransientConnectionClosedError(err)) {
    logger.warn("Ignored transient Baileys 'Connection Closed' exception during reconnect.");
    return;
  }

  logger.error({ err }, "Uncaught exception");
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  if (isTransientConnectionClosedError(err)) {
    logger.warn("Ignored transient Baileys 'Connection Closed' rejection during reconnect.");
    return;
  }

  logger.error({ err }, "Unhandled promise rejection");
});

process.on("exit", () => {
  releaseSingleInstanceLock();
});

for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
  process.on(signal, () => {
    releaseSingleInstanceLock();
    process.exit(0);
  });
}

/**
 * Loads all event handler modules from the events directory.
 * @returns {Array}
 */
const eventFiles = fs.readdirSync("./events").filter((f) => f.endsWith(".js"));
const eventHandlers = [];
for (const file of eventFiles) {
  const eventModule = require(`./events/${file}`);
  if (eventModule.eventName && typeof eventModule.handler === "function") {
    eventHandlers.push(eventModule);
  }
}

/**
 * Starts the WhatsApp bot and registers event handlers.
 */
async function startBot() {
  const authPath = config.auth?.path || "auth_info";
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Using Baileys v${version.join(".")}, Latest: ${isLatest}`);
  const historySyncEnabled = config.bot?.history ?? false;
  const markOnlineOnConnect = config.bot?.online ?? true;
  const deviceName = config.bot?.deviceName || config.bot?.name || "WhatsApp Bot";
  const browserName = config.bot?.browserName || "Chrome";
  const browserVersion = config.bot?.browserVersion || "120.0.0.0";

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: [deviceName, browserName, browserVersion],
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect,
    syncFullHistory: historySyncEnabled,
    shouldSyncHistoryMessage: () => historySyncEnabled,
  });
  activeSocket = sock;

  // Save login credentials on update
  sock.ev.on("creds.update", saveCreds);

  // Register all event handlers
  for (const { eventName, handler } of eventHandlers) {
    // Pass only the dependencies that the handler expects
    if (eventName === "connection.update") {
      sock.ev.on(
        eventName,
        handler(sock, logger, saveCreds, startBot, {
          authPath,
          autoResetOnLogout: config.auth?.autoResetOnLogout ?? false,
          restartDelayMs: config.auth?.restartDelayMs ?? 3000,
          maxReplacedReconnects: config.auth?.maxReplacedReconnects ?? 3,
          replacedWindowMs: config.auth?.replacedWindowMs ?? 120000,
          replacedReconnectDelayMs: config.auth?.replacedReconnectDelayMs ?? 8000,
          isCurrentSocket: () => activeSocket === sock,
        })
      );
    } else if (eventName === "messages.upsert") {
      sock.ev.on(eventName, handler(sock, logger, commands));
    } else {
      // For future extensibility, just pass sock and logger
      sock.ev.on(eventName, handler(sock, logger));
    }
  }
}

startBot();
