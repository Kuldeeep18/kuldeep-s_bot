module.exports = {
  name: "poll",
  description: "Create a poll. Usage: >poll Question? Option1; Option2; Option3",
  async execute(sock, from, args, context = {}) {
    const prefix = context.prefix || "!";
    if (!args.length) {
      await sock.sendMessage(from, {
        text: `Usage: ${prefix}poll Question? Option1; Option2; Option3`,
      });
      return;
    }

    const input = args.join(" ").trim();
    const questionMarkIndex = input.indexOf("?");
    if (questionMarkIndex === -1) {
      await sock.sendMessage(from, {
        text: "Please include a question ending with '?' and options separated by ';'.",
      });
      return;
    }

    const question = input.slice(0, questionMarkIndex + 1).trim();
    const options = input
      .slice(questionMarkIndex + 1)
      .split(";")
      .map((option) => option.trim())
      .filter(Boolean);

    if (options.length < 2) {
      await sock.sendMessage(from, {
        text: "Please provide at least two options separated by ';'.",
      });
      return;
    }

    await sock.sendMessage(from, {
      poll: {
        name: question,
        values: options,
      },
    });
  },
};
