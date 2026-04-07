#!/usr/bin/env node
import { startServer } from './server.js';

startServer().catch((error) => {
  console.error('Failed to start Invariance MCP server:', error);
  process.exit(1);
});
