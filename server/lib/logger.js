const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function currentLevel() {
  const name = (process.env.LOG_LEVEL || "info").toLowerCase();
  return LEVELS[name] !== undefined ? LEVELS[name] : LEVELS.info;
}

function timestamp() {
  return new Date().toISOString();
}

function emit(level, message, meta) {
  if (LEVELS[level] > currentLevel()) return;
  const prefix = `${timestamp()} [coord] [${level.toUpperCase()}]`;
  const suffix = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
  const line = `${prefix} ${message}${suffix}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

module.exports = {
  error: (message, meta) => emit("error", message, meta),
  warn: (message, meta) => emit("warn", message, meta),
  info: (message, meta) => emit("info", message, meta),
  debug: (message, meta) => emit("debug", message, meta),
};
