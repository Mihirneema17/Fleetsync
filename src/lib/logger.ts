
import "server-only"; // Ensures this module is only used on the server
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';

const LOG_DIR = path.join(process.cwd(), '.logs');
const SERVER_LOG_FILE = path.join(LOG_DIR, 'app_server.log');
const CLIENT_LOG_FILE = path.join(LOG_DIR, 'app_client.log'); // For future client-side logging

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create log directory:', err);
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
  const detailsString = logEntry.details ? `\n  Details: ${JSON.stringify(logEntry.details, null, 2)}` : '';
  const stackString = logEntry.stack ? `\n  Stack: ${logEntry.stack}` : '';

  const fullLog = `${logString}${detailsString}${stackString}\n`;

  // Output to console
  if (logEntry.level === 'ERROR') {
    console.error(logString, logEntry.details || '', logEntry.stack || '');
  } else if (logEntry.level === 'WARN') {
    console.warn(logString, logEntry.details || '');
  } else {
    console.log(logString, logEntry.details || '');
  }

  // Append to file
  try {
    fs.appendFileSync(logFile, fullLog, 'utf8');
  } catch (err) {
    console.error(`Failed to write to log file ${logFile}:`, err);
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
      entry.message = `${message}: ${error.message}`; // Prepend original message to error's message
      entry.stack = error.stack;
    } else if (typeof error === 'string') {
      entry.message = `${message}: ${error}`;
    } else if (error) {
      // If error is an object but not an Error instance, put it in details
      entry.details = { ...(details || {}), errorContext: error };
    }
    writeLog(SERVER_LOG_FILE, entry);
  },
  debug: (message: string, details?: any) => {
    // Debug logs could be conditional based on an env variable e.g. process.env.NODE_ENV === 'development'
    writeLog(SERVER_LOG_FILE, { level: 'DEBUG', message, details });
  },
  client: { // Namespace for logs coming from the client via API
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

// Example initial log to confirm logger is active
logger.info('Server logger initialized.');
