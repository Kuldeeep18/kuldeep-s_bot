module.exports = {
  name: "help",
  description: "List available commands.",
  async execute(sock, from, args, context = {}) {
    const prefix = context.prefix || "!";
    const commandList = context.commandList || [];
    const lines = commandList.map(
      (command) => `${prefix}${command.name} - ${command.description}`
    );

    await sock.sendMessage(from, {
      text: ["Available commands:", ...lines].join("\n"),
    });
  },
};
