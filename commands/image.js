const config = require("../utils");

module.exports = {
  name: "image",
  description: "Send an image.",
  async execute(sock, from) {
    const imageUrl = config.bot?.imageUrl || "";
    if (!imageUrl) {
      await sock.sendMessage(from, {
        text: "Image URL is not configured. Set bot.imageUrl in bot.yml.",
      });
      return;
    }

    await sock.sendMessage(from, {
      image: { url: imageUrl },
      caption: "Here is an image.",
    });
  },
};
