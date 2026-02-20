import { supabase } from '../lib/supabase.js';
import { sendWhatsAppMessage } from '../whatsapp/sender.js';
import { logger } from '../lib/logger.js';

/**
 * Envía recordatorios de turnos que son en las próximas 24 horas
 */
export async function sendAppointmentReminders() {
  logger.info('⏰ Iniciando envío de recordatorios...');

  try {
    // Calcular ventana de tiempo: turnos entre 23 y 25 horas desde ahora
    const now = new Date();
    const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    // Buscar turnos pendientes sin recordatorio enviado
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        starts_at,
        reminder_sent,
        client_id,
        service_id
      `)
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .gte('starts_at', in23Hours.toISOString())
      .lte('starts_at', in25Hours.toISOString());

    if (error) {
      logger.error({ error }, '❌ Error buscando turnos para recordatorios');
      return;
    }

    if (!appointments || appointments.length === 0) {
      logger.info('ℹ️ No hay turnos para enviar recordatorios');
      return;
    }

    logger.info({ count: appointments.length }, `📋 Encontrados ${appointments.length} turnos para recordar`);

    // Enviar recordatorio a cada turno
    for (const apt of appointments) {
      try {
        // Obtener datos del cliente
        const { data: client } = await supabase
          .from('clients')
          .select('phone, name')
          .eq('id', apt.client_id)
          .single();

        if (!client) {
          logger.warn({ appointmentId: apt.id }, 'Cliente no encontrado');
          continue;
        }

        // Obtener datos del servicio
        const { data: service } = await supabase
          .from('services')
          .select('name, price')
          .eq('id', apt.service_id)
          .single();

        if (!service) {
          logger.warn({ appointmentId: apt.id }, 'Servicio no encontrado');
          continue;
        }
        
        // Formatear fecha y hora
        const aptDate = new Date(apt.starts_at);
        const dateStr = aptDate.toLocaleDateString('es-AR', { 
          weekday: 'long', 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
        const timeStr = aptDate.toLocaleTimeString('es-AR', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        const message = 
          `🔔 *Recordatorio de turno*\n\n` +
          `Hola ${client.name}! 👋\n\n` +
          `Mañana tenés turno:\n` +
          `📅 ${dateStr}\n` +
          `🕐 ${timeStr}\n` +
          `✂️ ${service.name}\n` +
          `💰 $${service.price}\n\n` +
          `¿Confirmás tu asistencia?\n` +
          `Respondé *SI* para confirmar o *NO* para cancelar.`;

        // Enviar WhatsApp
        await sendWhatsAppMessage(client.phone, message);

        // Marcar como enviado
        await supabase
          .from('appointments')
          .update({
            reminder_sent: true,
            reminder_sent_at: new Date().toISOString()
          })
          .eq('id', apt.id);

        logger.info({ 
          appointmentId: apt.id,
          phone: client.phone 
        }, '✅ Recordatorio enviado');

        // Esperar 1 segundo entre mensajes para no saturar
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        logger.error({ 
          error: error.message,
          appointmentId: apt.id 
        }, '❌ Error enviando recordatorio individual');
        // Continuar con el siguiente aunque uno falle
      }
    }

    logger.info({ sent: appointments.length }, '✅ Recordatorios completados');

  } catch (error: any) {
    logger.error({ error: error.message }, '❌ Error general en recordatorios');
  }
}