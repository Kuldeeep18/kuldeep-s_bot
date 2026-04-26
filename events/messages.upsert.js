const config = require("./../utils");
const { isApiEnabled, requestOpenRouter } = require("../services/openrouter");

const prefix = config.bot?.prefix || "!";
const apiPrefix = "/";

function extractText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  );
}

function listCommands(commands) {
  const unique = new Map();
  for (const command of commands.values()) {
    const key = command.name.trim().toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, command);
    }
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function safeSendText(sock, to, text, logger) {
  try {
    await sock.sendMessage(to, { text });
    return true;
  } catch (err) {
    logger?.warn(`Failed to send message to ${to}: ${err.message || err}`);
    return false;
  }
}

module.exports = {
  eventName: "messages.upsert",
  handler: (sock, logger, commands) => async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) {
      return;
    }

    const from = msg.key.remoteJid;
    const text = extractText(msg.message).trim();
    if (!text) {
      return;
    }

    if (text.startsWith(apiPrefix)) {
      const userQuery = text.slice(apiPrefix.length).trim();
      if (!userQuery) {
        return;
      }

      if (!isApiEnabled()) {
        await safeSendText(sock, from, "API replies are disabled by configuration.", logger);
        return;
      }

      logger.info(`Received API query from ${from}`);
      const { reply, reason } = await requestOpenRouter(userQuery, logger);

      if (reply) {
        await safeSendText(sock, from, reply, logger);
        logger.info(`API response sent to ${from}`);
        return;
      }

      const failureMessage =
        reason === "timeout"
          ? "API timed out. Please try again in a moment."
          : "Sorry, I couldn't process that request. Please try again.";
      await safeSendText(sock, from, failureMessage, logger);
      return;
    }

    if (!text.startsWith(prefix)) {
      return;
    }

    const withoutPrefix = text.slice(prefix.length).trim();
    if (!withoutPrefix) {
      return;
    }

    const [cmdNameRaw, ...args] = withoutPrefix.split(/\s+/);
    const cmdName = cmdNameRaw.toLowerCase();
    const command = commands.get(cmdName);

    logger.info(`Received command '${cmdName}' from ${from}`);

    if (!command) {
      await safeSendText(
        sock,
        from,
        `Unknown command: ${prefix}${cmdName}\nType ${prefix}help to see all commands.`,
        logger
      );
      return;
    }

    try {
      await command.execute(sock, from, args, {
        rawText: text,
        cmdName,
        prefix,
        msg,
        logger,
        commandList: listCommands(commands),
      });
      logger.info(`Command executed: ${cmdName}`);
    } catch (err) {
      logger.error(`Command error (${cmdName}): ${err}`);
      await safeSendText(sock, from, "Error while executing command.", logger);
    }
  },
};
