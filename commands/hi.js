module.exports = {
  name: "hi",
  description: "Say hello.",
  aliases: ["hello"],
  async execute(sock, from) {
    await sock.sendMessage(from, { text: "Hello! I am your bot." });
  },
};
