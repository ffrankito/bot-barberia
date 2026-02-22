import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { logger } from '../lib/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

function getAccessToken(): string {
  const token = isProduction
    ? process.env.MP_ACCESS_TOKEN_PROD
    : process.env.MP_ACCESS_TOKEN_TEST;

  if (!token || token.startsWith('APP_USR-tu-') || token.startsWith('TEST-tu-')) {
    throw new Error(
      `Mercado Pago access token no configurado para entorno '${isProduction ? 'production' : 'test'}'. ` +
      `Configurá MP_ACCESS_TOKEN_${isProduction ? 'PROD' : 'TEST'} en el .env`
    );
  }
  return token;
}

// FIX: Lazy initialization — no crashea al importar, solo al usar
let _mpClient: MercadoPagoConfig | null = null;
let _paymentClient: Payment | null = null;
let _preferenceClient: Preference | null = null;

function getMpClient(): MercadoPagoConfig {
  if (!_mpClient) {
    const accessToken = getAccessToken();
    _mpClient = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 5000 },
    });
    logger.info({ environment: isProduction ? 'production' : 'test' }, '💳 Mercado Pago client initialized');
  }
  return _mpClient;
}

export function getPaymentClient(): Payment {
  if (!_paymentClient) {
    _paymentClient = new Payment(getMpClient());
  }
  return _paymentClient;
}

export function getPreferenceClient(): Preference {
  if (!_preferenceClient) {
    _preferenceClient = new Preference(getMpClient());
  }
  return _preferenceClient;
}

// Mantener exports compatibles con código existente
export const paymentClient = new Proxy({} as Payment, {
  get(_target, prop) {
    return (getPaymentClient() as any)[prop];
  }
});

export const preferenceClient = new Proxy({} as Preference, {
  get(_target, prop) {
    return (getPreferenceClient() as any)[prop];
  }
});