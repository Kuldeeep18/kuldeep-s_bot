const config = require("../utils");

module.exports = {
  name: "time",
  description: "Get the current server time.",
  async execute(sock, from) {
    const locale = config.bot?.locale || undefined;
    const timeZone = config.bot?.timezone || undefined;
    const now = new Date().toLocaleString(locale, timeZone ? { timeZone } : undefined);
    await sock.sendMessage(from, { text: `Current server time: ${now}` });
  },
};
