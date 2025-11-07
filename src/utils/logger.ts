const STORAGE_KEY = 'sleekfinance.logs';

type LogEntry = {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
};

const readLog = (): LogEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch (error) {
    console.error('Unable to read log store', error);
    return [];
  }
};

const writeLog = (entries: LogEntry[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-200)));
  } catch (error) {
    console.error('Unable to persist log store', error);
  }
};

const appendLog = (level: LogEntry['level'], message: string, context?: Record<string, unknown>) => {
  const entry: LogEntry = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    level,
    message,
    context,
    timestamp: new Date().toISOString()
  };
  const existing = readLog();
  existing.push(entry);
  writeLog(existing);
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  logger(`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`, context ?? {});
};

export const logInfo = (message: string, context?: Record<string, unknown>) =>
  appendLog('info', message, context);

export const logWarn = (message: string, context?: Record<string, unknown>) =>
  appendLog('warn', message, context);

export const logError = (message: string, context?: Record<string, unknown>) =>
  appendLog('error', message, context);

export const readLogs = () => readLog();

export const clearLogs = () => writeLog([]);
