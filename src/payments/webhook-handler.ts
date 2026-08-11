import { Request, Response } from 'express';
import { paymentClient } from './mercadopago-client.js';
import { queryOne, query } from '../lib/db.js';
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

    // Buscar el pago en nuestra DB, junto con el turno, cliente y servicio
    const paymentRecord = await queryOne<any>(
      `SELECT p.id, c.phone AS client_phone, c.name AS client_name, s.name AS service_name
       FROM payments p
       JOIN appointments a ON a.id = p.appointment_id
       JOIN clients c ON c.id = a.client_id
       JOIN services s ON s.id = a.service_id
       WHERE p.appointment_id = $1
       ORDER BY p.created_at DESC
       LIMIT 1`,
      [appointmentId]
    );

    if (!paymentRecord) {
      logger.error({ appointmentId }, '❌ Pago no encontrado en DB');
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
    try {
      await query(
        `UPDATE payments SET status = $1, mp_payment_id = $2, payment_method = $3, paid_at = $4
         WHERE id = $5`,
        [
          newStatus,
          payment.id?.toString(),
          payment.payment_type_id,
          newStatus === 'paid' ? new Date().toISOString() : null,
          paymentRecord.id,
        ]
      );
    } catch (updateError: any) {
      logger.error({ error: updateError }, '❌ Error actualizando pago');
      return res.sendStatus(500);
    }

    logger.info({
      paymentId: paymentRecord.id,
      newStatus
    }, '✅ Pago actualizado en DB');

    // Notificar al cliente por WhatsApp si es necesario
    if (shouldNotify && paymentRecord.client_phone) {
      let message = '';

      if (newStatus === 'paid') {
        message =
          `✅ *¡Pago confirmado!*\n\n` +
          `Hola ${paymentRecord.client_name}! Recibimos tu pago de $${payment.transaction_amount}.\n\n` +
          `📅 Servicio: ${paymentRecord.service_name}\n` +
          `🕐 Tu turno está confirmado.\n\n` +
          `¡Te esperamos!`;
      } else if (newStatus === 'failed') {
        message =
          `❌ *Pago rechazado*\n\n` +
          `Hola ${paymentRecord.client_name}, hubo un problema con tu pago.\n\n` +
          `Por favor intentá nuevamente o contactanos para ayudarte.`;
      } else if (newStatus === 'refunded') {
        message =
          `💰 *Reembolso procesado*\n\n` +
          `Hola ${paymentRecord.client_name}, tu reembolso de $${payment.transaction_amount} ha sido procesado.\n\n` +
          `Recibirás el dinero en los próximos días según tu medio de pago.`;
      }

      if (message) {
        await sendWhatsAppMessage(paymentRecord.client_phone, message);
        logger.info({ phone: paymentRecord.client_phone, status: newStatus }, '📤 Notificación enviada');
      }
    }

    res.sendStatus(200);

  } catch (error: any) {
    logger.error({ error: error.message }, '❌ Error en webhook de MP');
    res.sendStatus(500);
  }
}
