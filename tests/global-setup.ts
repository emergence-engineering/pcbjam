import * as fs from 'fs';
import * as path from 'path';

/**
 * Global setup for Playwright tests.
 * Cleans the logs directory before each test run to prevent stale logs.
 */
export default async function globalSetup() {
  const logsDir = path.join(__dirname, 'logs');

  if (fs.existsSync(logsDir)) {
    // Remove all files in logs directory
    for (const file of fs.readdirSync(logsDir)) {
      const filePath = path.join(logsDir, file);
      // Only remove files, not subdirectories
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    }
    console.log(`[global-setup] Cleaned ${logsDir}`);
  }
}
