import { validateRequest, validateRequestWithBody } from 'twilio';
import { createAdminClient } from '@/lib/supabase/admin';

/** Authenticated provider callback; no browser session is available here. */
export async function POST(request: Request) {
  const signature = request.headers.get('x-twilio-signature');
  if (!signature) return Response.json({ error: 'Signature manquante' }, { status: 401 });
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return Response.json({ error: 'Configuration serveur' }, { status: 503 });

  try {
    const raw = await request.text();
    // Behind a proxy, configure the exact externally registered callback URL.
    // Never derive the signed URL from the caller-controlled Origin header.
    const incoming = new URL(request.url);
    const url = process.env.TWILIO_WEBHOOK_URL || request.url;
    const callback = new URL(url);
    callback.search = incoming.search;
    const signedUrl = callback.toString();
    const json = request.headers.get('content-type')?.includes('application/json');
    let params: Record<string, string>;
    let valid: boolean;
    if (json) {
      try { params = JSON.parse(raw); }
      catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }); }
      valid = validateRequestWithBody(token, signature, signedUrl, raw);
    } else if (request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) {
      params = Object.fromEntries(new URLSearchParams(raw));
      valid = validateRequest(token, signature, signedUrl, params);
    } else {
      return Response.json({ error: 'Format non pris en charge' }, { status: 415 });
    }
    if (!valid) return Response.json({ error: 'Signature invalide' }, { status: 401 });
    if (!params || typeof params.MessageSid !== 'string' || typeof params.MessageStatus !== 'string'
      || !params.MessageSid || !params.MessageStatus) {
      return Response.json({ error: 'MessageSid et MessageStatus requis' }, { status: 400 });
    }
    const statuses: Record<string, string> = {
      queued: 'pending', accepted: 'pending', sending: 'pending', sent: 'pending',
      delivered: 'sent', failed: 'failed', undelivered: 'undelivered',
    };
    const status = statuses[params.MessageStatus];
    if (!status) return Response.json({ error: 'Statut non pris en charge' }, { status: 400 });
    const { data, error } = await createAdminClient().from('sms_delivery')
      .update({ status, ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}) })
      .eq('twilio_sid', params.MessageSid).select('id');
    if (error) {
      console.error('Twilio callback database update failed:', error.code);
      return Response.json({ error: 'Erreur de mise à jour' }, { status: 500 });
    }
    return Response.json({ success: true, updated: data.length });
  } catch {
    return Response.json({ error: 'Erreur webhook' }, { status: 500 });
  }
}
