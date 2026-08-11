import { z } from 'zod';
import { preferenceClient } from './mercadopago-client.js';
import { query, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const CreatePaymentSchema = z.object({
  appointment_id: z.string().uuid(),
  amount: z.number().positive(),
  description: z.string(),
});

export interface CreatePaymentInput {
  appointment_id: string;
  amount: number;
  description: string; // ej: "Turno: Corte de pelo - 2026-02-20 16:00"
}

export interface CreatePaymentOutput {
  success: boolean;
  payment_id?: string;
  payment_url?: string;
  error?: string;
}

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput> {
  // Validar input
  const validation = CreatePaymentSchema.safeParse(input);
  if (!validation.success) {
    const errors = validation.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
    logger.error({ errors }, '❌ Validación de pago fallida');
    return { success: false, error: `Datos inválidos: ${errors}` };
  }

  try {
    // Crear preferencia en Mercado Pago (versión simplificada)
    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: input.appointment_id,
            title: input.description,
            quantity: 1,
            unit_price: input.amount,
            currency_id: 'ARS',
          }
        ],
        external_reference: input.appointment_id,
        notification_url: `${process.env.BASE_URL}/api/webhooks/mercadopago`,
      }
    });

    if (!preference.id || !preference.init_point) {
      logger.error({ preference }, '❌ Mercado Pago no devolvió preferencia válida');
      return { success: false, error: 'Error creando preferencia de pago' };
    }

    logger.info({
      preferenceId: preference.id,
      appointmentId: input.appointment_id
    }, '✅ Preferencia de MP creada');

    // Guardar en base de datos
    const payment = await queryOne<{ id: string }>(
      `INSERT INTO payments (appointment_id, mp_preference_id, payment_url, amount, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [input.appointment_id, preference.id, preference.init_point, input.amount]
    );

    if (!payment) {
      logger.error('❌ Error guardando pago en DB');
      return { success: false, error: 'Error guardando información de pago' };
    }

    // Actualizar appointment con referencia al pago
    await query(
      `UPDATE appointments SET payment_id = $1 WHERE id = $2`,
      [payment.id, input.appointment_id]
    );

    logger.info({
      paymentId: payment.id,
      appointmentId: input.appointment_id
    }, '✅ Pago guardado en DB');

    return {
      success: true,
      payment_id: payment.id,
      payment_url: preference.init_point,
    };

  } catch (error: any) {
    logger.error({ error: error.message }, '❌ Error creando pago');
    return {
      success: false,
      error: `Error con Mercado Pago: ${error.message}`
    };
  }
}
