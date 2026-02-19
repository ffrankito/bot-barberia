import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

// Helper para logging estructurado
export function logMessage(phone: string, message: string, direction: 'incoming' | 'outgoing') {
  logger.info({
    phone,
    message: message.substring(0, 100), // Truncar para logs
    direction,
  }, `${direction === 'incoming' ? '📥' : '📤'} Message`);
}

export function logError(error: any, context?: string) {
  logger.error({
    error: error.message || error,
    stack: error.stack,
    context,
  }, '❌ Error occurred');
}

export function logSession(phone: string, action: 'create' | 'update' | 'clear', state?: string) {
  logger.debug({
    phone,
    action,
    state,
  }, '🔄 Session action');
}