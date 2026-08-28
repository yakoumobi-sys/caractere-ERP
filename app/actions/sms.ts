'use server';

import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

interface SMSPayload {
  orderId: string;
  customerId: string;
  customerPhone: string;
  stage: 'production' | 'ready_for_shipment' | 'in_transit' | 'arrived_wilaya' | 'delivered' | 'delivery_failed_1' | 'delivery_failed_2' | 'delivery_failed_3' | 'delivery_failed_final';
  orderNumber?: string;
  trackingUrl?: string;
  supportPhone?: string;
}

/**
 * Envoyer un SMS au client via Twilio
 */
export async function sendOrderSMS(payload: SMSPayload) {
  const supabase = await createClient();

  try {
    // 1. Récupérer le template SMS
    const { data: template, error: templateError } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('stage', payload.stage)
      .single();

    if (templateError || !template) {
      throw new Error(`Template SMS non trouvé pour stage: ${payload.stage}`);
    }

    // 2. Construire le message
    let message = template.message_template
      .replace('{{order_number}}', payload.orderNumber || 'CMD-' + payload.orderId.slice(0, 8))
      .replace('{{tracking_url}}', payload.trackingUrl || 'https://yalidine.com')
      .replace('{{support_phone}}', payload.supportPhone || '+213 XXX XXX XXX');

    // 3. Enregistrer en DB avant envoi (pending)
    const { data: smsRecord, error: insertError } = await supabase
      .from('sms_delivery')
      .insert({
        order_id: payload.orderId,
        customer_phone: payload.customerPhone,
        stage: payload.stage,
        message: message,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Erreur DB SMS: ${insertError.message}`);
    }

    // 4. Envoyer via Twilio
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) {
      console.warn('⚠️ Twilio non configuré, SMS enregistré comme "sent" en mode demo');
      // En demo, marquer comme envoyé
      await supabase
        .from('sms_delivery')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', smsRecord.id);
      return { success: true, mode: 'demo', smsId: smsRecord.id };
    }

    // Formatage numéro Algérie
    const formattedPhone = payload.customerPhone.startsWith('+')
      ? payload.customerPhone
      : payload.customerPhone.startsWith('0')
        ? '+213' + payload.customerPhone.slice(1)
        : '+213' + payload.customerPhone;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: TWILIO_PHONE,
        To: formattedPhone,
        Body: message,
      }).toString(),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Twilio error: ${result.message || 'Unknown error'}`);
    }

    // 5. Mettre à jour le record SMS avec le SID Twilio
    await supabase
      .from('sms_delivery')
      .update({
        status: 'sent',
        twilio_sid: result.sid,
        sent_at: new Date().toISOString(),
      })
      .eq('id', smsRecord.id);

    return {
      success: true,
      smsId: smsRecord.id,
      twilioSid: result.sid,
    };
  } catch (error) {
    console.error('❌ Erreur envoi SMS:', error);

    // Enregistrer l'erreur en DB
    const supabase = await createClient();
    await supabase
      .from('sms_delivery')
      .insert({
        order_id: payload.orderId,
        customer_phone: payload.customerPhone,
        stage: payload.stage,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

/**
 * Envoyer un SMS automatique lors du changement de stage
 */
export async function triggerStageSMS(
  orderId: string,
  newStage: string,
  orderData?: { number?: string; customer_phone?: string }
) {
  const supabase = await createClient();

  // Récupérer les infos commande si pas fournies
  let order = orderData;
  if (!order) {
    const { data } = await supabase
      .from('pipeline_orders')
      .select('order_number, customer_phone, id')
      .eq('id', orderId)
      .single();

    order = {
      number: data?.order_number,
      customer_phone: data?.customer_phone,
    };
  }

  if (!order?.customer_phone) {
    console.warn(`⚠️ Pas de numéro client pour commande ${orderId}`);
    return { success: false, error: 'Numéro client manquant' };
  }

  return sendOrderSMS({
    orderId,
    customerId: orderId, // À adapter selon structure
    customerPhone: order.customer_phone,
    stage: newStage as SMSPayload['stage'],
    orderNumber: order.number,
  });
}

/**
 * Webhook Twilio pour mettre à jour le statut de livraison
 */
export async function handleTwilioWebhook(twilioSid: string, status: string) {
  const supabase = await createClient();

  const smsStatusMap: Record<string, string> = {
    delivered: 'sent',
    failed: 'failed',
    undelivered: 'undelivered',
    queued: 'pending',
  };

  const mappedStatus = smsStatusMap[status] || 'pending';

  await supabase
    .from('sms_delivery')
    .update({
      status: mappedStatus,
      sent_at: mappedStatus === 'sent' ? new Date().toISOString() : undefined,
    })
    .eq('twilio_sid', twilioSid);

  return { success: true, status: mappedStatus };
}

/**
 * Envoyer SMS de retry livraison
 */
export async function sendDeliveryRetryNotification(
  orderId: string,
  attemptNumber: 1 | 2 | 3,
  customerPhone: string
) {
  const stageMap = {
    1: 'delivery_failed_1',
    2: 'delivery_failed_2',
    3: 'delivery_failed_3',
  } as const;

  return sendOrderSMS({
    orderId,
    customerId: orderId,
    customerPhone,
    stage: stageMap[attemptNumber] as SMSPayload['stage'],
  });
}
