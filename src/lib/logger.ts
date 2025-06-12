
import "server-only"; // Ensures this module is only used on the server
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';

const LOG_DIR = path.join(process.cwd(), '.logs');
const SERVER_LOG_FILE = path.join(LOG_DIR, 'app_server.log');
const CLIENT_LOG_FILE = path.join(LOG_DIR, 'app_client.log');

let canWriteToFile = true; // Assume true initially

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    console.error('Logger: Failed to create log directory. Logging to file will be disabled.', err);
    canWriteToFile = false; // Disable file logging if dir creation fails
  }
}

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: any;
  stack?: string;
  source?: 'SERVER' | 'CLIENT';
}

function writeLog(logFile: string, entry: Omit<LogEntry, 'timestamp' | 'source'>) {
  const logEntry: LogEntry = {
    timestamp: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
    source: logFile === SERVER_LOG_FILE ? 'SERVER' : 'CLIENT',
    ...entry,
  };

  const logString = `${logEntry.timestamp} [${logEntry.source}] [${logEntry.level}] ${logEntry.message}`;
  const detailsString = logEntry.details ? `\n  Details: ${JSON.stringify(logEntry.details, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2)}` : '';
  const stackString = logEntry.stack ? `\n  Stack: ${logEntry.stack}` : '';

  const fullLog = `${logString}${detailsString}${stackString}\n`;

  // Output to console
  if (logEntry.level === 'ERROR') {
    console.error(logString, logEntry.details || '', logEntry.stack || '');
  } else if (logEntry.level === 'WARN') {
    console.warn(logString, logEntry.details || '');
  } else if (process.env.NODE_ENV === 'development' && logEntry.level === 'DEBUG') { // Only log DEBUG in dev
    console.debug(logString, logEntry.details || '');
  } else if (logEntry.level === 'INFO') {
    console.log(logString, logEntry.details || '');
  }

  // Append to file, only if enabled and possible
  if (canWriteToFile && (logFile === SERVER_LOG_FILE || logFile === CLIENT_LOG_FILE)) {
    try {
      fs.appendFileSync(logFile, fullLog, 'utf8');
    } catch (err) {
      // Avoid infinite loop if console.error itself calls logger.error
      console.error(`Logger: Failed to write to log file ${logFile}. Further file logging might be disabled. Error:`, err);
      // Disable further attempts for this specific file or globally if it's a persistent issue
      if (logFile === SERVER_LOG_FILE || logFile === CLIENT_LOG_FILE) { // Check to be sure
         // canWriteToFile = false; // Could disable globally, or have per-file flags
      }
    }
  }
}

export const logger = {
  info: (message: string, details?: any) => {
    writeLog(SERVER_LOG_FILE, { level: 'INFO', message, details });
  },
  warn: (message: string, details?: any) => {
    writeLog(SERVER_LOG_FILE, { level: 'WARN', message, details });
  },
  error: (message: string, error?: any, details?: any) => {
    const entry: Omit<LogEntry, 'timestamp' | 'source'> = {
      level: 'ERROR',
      message,
      details,
    };
    if (error instanceof Error) {
      entry.message = `${message}: ${error.message}`;
      entry.stack = error.stack;
    } else if (typeof error === 'string') {
      entry.message = `${message}: ${error}`;
    } else if (error) {
      entry.details = { ...(details || {}), errorContext: error };
    }
    writeLog(SERVER_LOG_FILE, entry);
  },
  debug: (message: string, details?: any) => {
    if (process.env.NODE_ENV === 'development') { // Only log debug messages in development
        writeLog(SERVER_LOG_FILE, { level: 'DEBUG', message, details });
    }
  },
  client: {
    info: (message: string, details?: any) => {
      writeLog(CLIENT_LOG_FILE, { level: 'INFO', message, details });
    },
    warn: (message: string, details?: any) => {
      writeLog(CLIENT_LOG_FILE, { level: 'WARN', message, details });
    },
    error: (message: string, error?: any, details?: any) => {
       const entry: Omit<LogEntry, 'timestamp' | 'source'> = {
        level: 'ERROR',
        message,
        details,
      };
      if (error instanceof Error) {
        entry.message = `${message}: ${error.message}`;
        entry.stack = error.stack;
      } else if (typeof error === 'string') {
        entry.message = `${message}: ${error}`;
      } else if (error) {
        entry.details = { ...(details || {}), errorContext: error };
      }
      writeLog(CLIENT_LOG_FILE, entry);
    },
  }
};
