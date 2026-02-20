import { sendAppointmentReminders } from './appointment-reminders.js';
import { logger } from '../lib/logger.js';

/**
 * Ejecuta todos los jobs programados
 */
export async function runScheduledJobs() {
  logger.info('🔄 Ejecutando jobs programados...');
  
  try {
    // Enviar recordatorios de turnos
    await sendAppointmentReminders();
    
    logger.info('✅ Jobs completados exitosamente');
  } catch (error: any) {
    logger.error({ error: error.message }, '❌ Error ejecutando jobs');
  }
}

/**
 * Inicia el scheduler con intervalo configurable
 */
export function startScheduler(intervalMinutes: number = 60) {
  logger.info({ intervalMinutes }, '⏰ Iniciando scheduler de jobs');
  
  // Ejecutar inmediatamente al iniciar
  runScheduledJobs();
  
  // Luego ejecutar cada X minutos
  setInterval(() => {
    runScheduledJobs();
  }, intervalMinutes * 60 * 1000);
}