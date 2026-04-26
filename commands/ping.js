module.exports = {
  name: "ping",
  description: "Check bot response time.",
  async execute(sock, from) {
    const start = Date.now();
    await sock.sendMessage(from, { text: "Pong!" });
    const latency = Date.now() - start;
    await sock.sendMessage(from, { text: `Response time: ${latency}ms` });
  },
};
