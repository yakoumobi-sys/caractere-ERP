import { handleTwilioWebhook } from '@/app/actions/sms';

/**
 * Webhook Twilio pour les statuts SMS
 * POST /api/webhooks/twilio
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { MessageSid, MessageStatus } = body;

    if (!MessageSid || !MessageStatus) {
      return Response.json(
        { error: 'MessageSid et MessageStatus requis' },
        { status: 400 }
      );
    }

    const result = await handleTwilioWebhook(MessageSid, MessageStatus);

    return Response.json({
      success: true,
      messageSid: MessageSid,
      status: MessageStatus,
      updated: result,
    });
  } catch (error) {
    console.error('❌ Erreur webhook Twilio:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Erreur webhook' },
      { status: 500 }
    );
  }
}
