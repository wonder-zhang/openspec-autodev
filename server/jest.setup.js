// Keep coordination logger quiet during unit tests (routes still run).
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "error";
