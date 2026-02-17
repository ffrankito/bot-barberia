import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { logger } from '../lib/logger.js';

const isProduction = process.env.NODE_ENV === 'production';
const accessToken = isProduction 
  ? process.env.MP_ACCESS_TOKEN_PROD 
  : process.env.MP_ACCESS_TOKEN_TEST;

if (!accessToken) {
  throw new Error('Mercado Pago access token no configurado');
}

logger.info({ 
  environment: isProduction ? 'production' : 'test' 
}, '💳 Mercado Pago client initialized');

export const mpClient = new MercadoPagoConfig({ 
  accessToken,
  options: {
    timeout: 5000,
  }
});

export const paymentClient = new Payment(mpClient);
export const preferenceClient = new Preference(mpClient);