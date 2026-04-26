// Event Handler: connection.update
// Description: Handles WhatsApp connection updates, QR code display, and reconnection logic.
// Triggers on connection state changes (open, close, QR required).

const QRCode = require("qrcode");
const { Boom } = require("@hapi/boom");
const { DisconnectReason, delay } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");

let autoResetAttempted = false;

function resolveAuthPath(authPath) {
  if (path.isAbsolute(authPath)) return authPath;
  return path.resolve(process.cwd(), authPath);
}

function resetAuthState(authPath, logger) {
  const targetPath = resolveAuthPath(authPath);
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    logger.warn(`Removed stale auth directory: ${targetPath}`);
    return true;
  } catch (err) {
    logger.error(`Failed to remove auth directory (${targetPath}): ${err}`);
    return false;
  }
}

module.exports = {
  eventName: "connection.update",
  /**
   * Handles connection state changes, QR code display, and reconnection.
   * @param {object} sock - The WhatsApp socket instance.
   * @param {object} logger - Logger for logging info and errors.
   * @param {Function} saveCreds - Function to save credentials.
   * @param {Function} startBot - Function to restart the bot if needed.
   * @param {object} options - Auth and recovery settings.
   * @returns {Function}
   */
  handler: (sock, logger, saveCreds, startBot, options = {}) => async ({ connection, lastDisconnect, qr }) => {
    const authPath = options.authPath || "auth_info";
    const autoResetOnLogout = options.autoResetOnLogout ?? false;
    const restartDelayMs = options.restartDelayMs ?? 3000;

    if (qr) {
      logger.info("Scan the QR below to login:");
      console.info(await QRCode.toString(qr, { type: "terminal", small: true }));
    }

    if (connection === "close") {
      const reasonCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = reasonCode !== DisconnectReason.loggedOut;
      logger.warn(`Connection closed. Code: ${reasonCode}. Reconnecting? ${shouldReconnect}`);

      if (shouldReconnect) {
        await delay(restartDelayMs);
        startBot();
        return;
      }

      if (autoResetOnLogout && !autoResetAttempted) {
        autoResetAttempted = true;
        logger.error("Logged out (401). Resetting local auth state and restarting for re-authentication.");
        const cleared = resetAuthState(authPath, logger);
        if (cleared) {
          await delay(restartDelayMs);
          startBot();
          return;
        }
      }

      if (autoResetOnLogout && autoResetAttempted) {
        logger.error("Logged out again after auth reset. Re-authenticate manually.");
        logger.error(`Delete ${authPath} and start the bot again to scan a new QR.`);
      } else {
        logger.error("Logged out. Please delete auth_info and re-authenticate.");
      }
    } else if (connection === "open") {
      autoResetAttempted = false;
      logger.info("Connected to WhatsApp");
    }
  }
};
