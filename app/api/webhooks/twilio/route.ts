import { handleTwilioWebhook } from '@/app/actions/sms';
import crypto from 'crypto';

/**
 * Webhook Twilio pour les statuts SMS
 * POST /api/webhooks/twilio
 *
 * SÉCURITÉ: Valide la signature Twilio pour s'assurer que le webhook vient de Twilio
 * et non d'une source externe malveillante.
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Récupérer la signature Twilio du header
    const twilioSignature = request.headers.get('x-twilio-signature');
    if (!twilioSignature) {
      console.warn('⚠️ Webhook Twilio rejeté: signature manquante');
      return Response.json({ error: 'Signature manquante' }, { status: 401 });
    }

    // Récupérer le body brut pour valider la signature
    const bodyText = await request.text();
    let body: { MessageSid?: string; MessageStatus?: string };

    try {
      body = JSON.parse(bodyText);
    } catch {
      console.warn('⚠️ Webhook Twilio rejeté: JSON invalide');
      return Response.json({ error: 'JSON invalide' }, { status: 400 });
    }

    const { MessageSid, MessageStatus } = body;

    if (!MessageSid || !MessageStatus) {
      console.warn('⚠️ Webhook Twilio rejeté: champs manquants', { MessageSid: !!MessageSid, MessageStatus: !!MessageStatus });
      return Response.json(
        { error: 'MessageSid et MessageStatus requis' },
        { status: 400 }
      );
    }

    // Valider la signature Twilio
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.error('❌ TWILIO_AUTH_TOKEN non configuré');
      return Response.json({ error: 'Configuration serveur' }, { status: 500 });
    }

    // Construire l'URL pour la validation (telle que Twilio l'a utilisée)
    const baseUrl = request.headers.get('origin') || 'https://caractere-erp.vercel.app';
    const url = `${baseUrl}/api/webhooks/twilio`;

    // Twilio validation: HMAC-SHA1 de URL + body
    const hash = crypto
      .createHmac('sha1', twilioAuthToken)
      .update(url + bodyText, 'utf8')
      .digest('base64');

    if (hash !== twilioSignature) {
      console.error('❌ Webhook Twilio rejeté: signature invalide', {
        expected: hash,
        received: twilioSignature,
        timestamp: new Date().toISOString()
      });
      return Response.json({ error: 'Signature invalide' }, { status: 401 });
    }

    // Signature valide — traiter le webhook
    console.log('✅ Webhook Twilio validé', { MessageSid, MessageStatus, processingTime: `${Date.now() - startTime}ms` });

    const result = await handleTwilioWebhook(MessageSid, MessageStatus);

    return Response.json({
      success: true,
      messageSid: MessageSid,
      status: MessageStatus,
      updated: result,
    });
  } catch (error) {
    console.error('❌ Erreur webhook Twilio:', {
      message: error instanceof Error ? error.message : 'Erreur inconnue',
      timestamp: new Date().toISOString(),
      processingTime: `${Date.now() - startTime}ms`
    });
    return Response.json(
      { error: error instanceof Error ? error.message : 'Erreur webhook' },
      { status: 500 }
    );
  }
}
