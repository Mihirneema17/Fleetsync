
// No 'server-only' because no 'fs' during this temporary test
// No import fs from 'fs';
// No import path from 'path';
import { format } from 'date-fns';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: any;
  stack?: string;
  source?: 'SERVER' | 'CLIENT_CONSOLE_ONLY';
}

function writeToConsole(entry: Omit<LogEntry, 'timestamp' | 'source'>, clientContext: boolean = false) {
  const logEntry: LogEntry = {
    timestamp: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
    source: clientContext ? 'CLIENT_CONSOLE_ONLY' : 'SERVER',
    ...entry,
  };

  const logString = `${logEntry.timestamp} [${logEntry.source}] [${logEntry.level}] ${logEntry.message}`;
  
  let detailsOutput = '';
  if (logEntry.details) {
    try {
      detailsOutput = ` Details: ${JSON.stringify(logEntry.details, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2)}`;
    } catch (e) {
      detailsOutput = ' Details: [Could not stringify details]';
    }
  }
  
  const stackString = logEntry.stack ? ` Stack: ${logEntry.stack}` : '';

  if (logEntry.level === 'ERROR') {
    console.error(logString + detailsOutput + stackString);
  } else if (logEntry.level === 'WARN') {
    console.warn(logString + detailsOutput);
  } else if (process.env.NODE_ENV === 'development' && logEntry.level === 'DEBUG') {
    console.debug(logString + detailsOutput);
  } else if (logEntry.level === 'INFO') {
    console.log(logString + detailsOutput);
  }
}

export const logger = {
  info: (message: string, details?: any) => {
    writeToConsole({ level: 'INFO', message, details });
  },
  warn: (message: string, details?: any) => {
    writeToConsole({ level: 'WARN', message, details });
  },
  error: (message: string, error?: any, details?: any) => {
    const entryData: Omit<LogEntry, 'timestamp' | 'source'> = {
      level: 'ERROR',
      message,
      details,
    };
    if (error instanceof Error) {
      entryData.message = `${message}: ${error.message}`;
      entryData.stack = error.stack;
    } else if (typeof error === 'string') {
      entryData.message = `${message}: ${error}`;
    } else if (error) {
      // Ensure error object itself is captured if it's not an Error instance or string
      const currentDetails = entryData.details ? { ...entryData.details } : {};
      currentDetails.errorContext = error;
      entryData.details = currentDetails;
    }
    writeToConsole(entryData);
  },
  debug: (message: string, details?: any) => {
    if (process.env.NODE_ENV === 'development') {
        writeToConsole({ level: 'DEBUG', message, details });
    }
  },
  client: { // This is a server-side logger, but mimicking the structure for simplicity during test
    info: (message: string, details?: any) => {
      writeToConsole({ level: 'INFO', message, details }, true);
    },
    warn: (message: string, details?: any) => {
      writeToConsole({ level: 'WARN', message, details }, true);
    },
    error: (message: string, error?: any, details?: any) => {
       const entryData: Omit<LogEntry, 'timestamp' | 'source'> = {
        level: 'ERROR',
        message,
        details,
      };
      if (error instanceof Error) {
        entryData.message = `${message}: ${error.message}`;
        entryData.stack = error.stack;
      } else if (typeof error === 'string') {
        entryData.message = `${message}: ${error}`;
      } else if (error) {
        const currentDetails = entryData.details ? { ...entryData.details } : {};
        currentDetails.errorContext = error;
        entryData.details = currentDetails;
      }
      writeToConsole(entryData, true);
    },
  }
};
