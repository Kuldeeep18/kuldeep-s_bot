/**
 * Loads command modules from this directory and registers aliases.
 */
const fs = require("fs");
const path = require("path");

function isValidCommand(command) {
  return (
    command &&
    typeof command.name === "string" &&
    command.name.trim() &&
    typeof command.execute === "function"
  );
}

function loadCommands() {
  const registry = new Map();
  const commandFiles = fs
    .readdirSync(__dirname)
    .filter((file) => file.endsWith(".js") && file !== "command-registry.js");

  for (const file of commandFiles) {
    const command = require(path.join(__dirname, file));
    if (!isValidCommand(command)) {
      continue;
    }

    const primaryName = command.name.trim().toLowerCase();
    registry.set(primaryName, command);

    for (const alias of command.aliases || []) {
      if (typeof alias !== "string" || !alias.trim()) {
        continue;
      }
      registry.set(alias.trim().toLowerCase(), command);
    }
  }

  return registry;
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

const commands = loadCommands();

module.exports = {
  commands,
  listCommands,
};
