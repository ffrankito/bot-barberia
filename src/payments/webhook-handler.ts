import { Request, Response } from 'express';
import { paymentClient } from './mercadopago-client.js';
import { supabase } from '../lib/supabase.js';
import { sendWhatsAppMessage } from '../whatsapp/sender.js';
import { logger } from '../lib/logger.js';

export async function handleMercadoPagoWebhook(req: Request, res: Response) {
  try {
    const { type, data } = req.body;

    logger.info({ type, data }, '💳 Webhook de Mercado Pago recibido');

    // Solo procesar notificaciones de pagos
    if (type !== 'payment') {
      logger.debug({ type }, 'Tipo de notificación ignorado');
      return res.sendStatus(200);
    }

    if (!data?.id) {
      logger.warn('Webhook sin payment ID');
      return res.sendStatus(400);
    }

    // Obtener información del pago desde Mercado Pago
    const payment = await paymentClient.get({ id: data.id });

    logger.info({
      paymentId: payment.id,
      status: payment.status,
      externalReference: payment.external_reference,
    }, '💳 Información del pago obtenida');

    const appointmentId = payment.external_reference;

    if (!appointmentId) {
      logger.warn({ paymentId: payment.id }, 'Pago sin external_reference');
      return res.sendStatus(200);
    }

    // Buscar el pago en nuestra DB
    const { data: paymentRecord, error: paymentError } = await supabase
      .from('payments')
      .select('*, appointments!inner(*, clients!inner(phone, name), services!inner(name))')
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (paymentError || !paymentRecord) {
      logger.error({ error: paymentError, appointmentId }, '❌ Pago no encontrado en DB');
      return res.sendStatus(404);
    }

    // Actualizar estado según lo que reporta Mercado Pago
    let newStatus: string;
    let shouldNotify = false;

    switch (payment.status) {
      case 'approved':
        newStatus = 'paid';
        shouldNotify = true;
        break;
      case 'rejected':
      case 'cancelled':
        newStatus = 'failed';
        shouldNotify = true;
        break;
      case 'refunded':
        newStatus = 'refunded';
        shouldNotify = true;
        break;
      case 'pending':
      case 'in_process':
        newStatus = 'pending';
        break;
      default:
        logger.warn({ status: payment.status }, 'Estado de pago desconocido');
        newStatus = 'pending';
    }

    // Actualizar en DB
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: newStatus,
        mp_payment_id: payment.id?.toString(),
        payment_method: payment.payment_type_id,
        paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
      })
      .eq('id', paymentRecord.id);

    if (updateError) {
      logger.error({ error: updateError }, '❌ Error actualizando pago');
      return res.sendStatus(500);
    }

    logger.info({ 
      paymentId: paymentRecord.id,
      newStatus 
    }, '✅ Pago actualizado en DB');

    // Notificar al cliente por WhatsApp si es necesario
    if (shouldNotify && paymentRecord.appointments?.clients?.phone) {
      const client = paymentRecord.appointments.clients;
      const service = paymentRecord.appointments.services;

      let message = '';

      if (newStatus === 'paid') {
        message = 
          `✅ *¡Pago confirmado!*\n\n` +
          `Hola ${client.name}! Recibimos tu pago de $${payment.transaction_amount}.\n\n` +
          `📅 Servicio: ${service.name}\n` +
          `🕐 Tu turno está confirmado.\n\n` +
          `¡Te esperamos!`;
      } else if (newStatus === 'failed') {
        message =
          `❌ *Pago rechazado*\n\n` +
          `Hola ${client.name}, hubo un problema con tu pago.\n\n` +
          `Por favor intentá nuevamente o contactanos para ayudarte.`;
      } else if (newStatus === 'refunded') {
        message =
          `💰 *Reembolso procesado*\n\n` +
          `Hola ${client.name}, tu reembolso de $${payment.transaction_amount} ha sido procesado.\n\n` +
          `Recibirás el dinero en los próximos días según tu medio de pago.`;
      }

      if (message) {
        await sendWhatsAppMessage(client.phone, message);
        logger.info({ phone: client.phone, status: newStatus }, '📤 Notificación enviada');
      }
    }

    res.sendStatus(200);

  } catch (error: any) {
    logger.error({ error: error.message }, '❌ Error en webhook de MP');
    res.sendStatus(500);
  }
}