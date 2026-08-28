'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Envoyer un message entre employés
 */
export async function sendEmployeeMessage(payload: {
  recipientId: string;
  content: string;
}) {
  const supabase = await createClient();

  try {
    // Récupérer l'utilisateur actuel
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      throw new Error('Non authentifié');
    }

    // Récupérer l'employé actuel
    const { data: sender, error: senderError } = await supabase
      .from('employees')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .single();

    if (senderError || !sender) {
      throw new Error('Employé non trouvé');
    }

    // Insérer le message
    const { data, error } = await supabase
      .from('employee_messages')
      .insert({
        sender_id: sender.id,
        recipient_id: payload.recipientId,
        content: payload.content,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Erreur insertion message: ${error.message}`);
    }

    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('❌ Erreur envoi message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

/**
 * Récupérer les messages entre deux employés
 */
export async function getConversation(recipientId: string) {
  const supabase = await createClient();

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      throw new Error('Non authentifié');
    }

    const { data: sender } = await supabase
      .from('employees')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .single();

    if (!sender) {
      throw new Error('Employé non trouvé');
    }

    // Récupérer les messages
    const { data: messages, error } = await supabase
      .from('employee_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${sender.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${sender.id})`
      )
      .order('created_at');

    if (error) {
      throw new Error(`Erreur récupération messages: ${error.message}`);
    }

    // Marquer comme lus
    await supabase
      .from('employee_messages')
      .update({ is_read: true })
      .eq('recipient_id', sender.id)
      .eq('sender_id', recipientId)
      .eq('is_read', false);

    return { success: true, messages };
  } catch (error) {
    console.error('❌ Erreur récupération conversation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      messages: [],
    };
  }
}

/**
 * Récupérer les conversations récentes
 */
export async function getRecentConversations() {
  const supabase = await createClient();

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      throw new Error('Non authentifié');
    }

    const { data: sender } = await supabase
      .from('employees')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .single();

    if (!sender) {
      throw new Error('Employé non trouvé');
    }

    // Récupérer les messages récents
    const { data: messages, error } = await supabase
      .from('employee_messages')
      .select(
        `
        id,
        sender_id,
        recipient_id,
        content,
        is_read,
        created_at,
        sender:employees!sender_id(id, first_name, last_name, color),
        recipient:employees!recipient_id(id, first_name, last_name, color)
      `
      )
      .or(`sender_id.eq.${sender.id},recipient_id.eq.${sender.id}`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(`Erreur récupération: ${error.message}`);
    }

    // Grouper par conversation
    const conversationMap = new Map<string, any>();
    messages?.forEach((msg: any) => {
      const otherUserId =
        msg.sender_id === sender.id ? msg.recipient_id : msg.sender_id;
      if (!conversationMap.has(otherUserId)) {
        const otherUser =
          msg.sender_id === sender.id ? msg.recipient : msg.sender;
        conversationMap.set(otherUserId, {
          id: otherUserId,
          employee: otherUser,
          lastMessage: msg.content,
          lastMessageTime: msg.created_at,
          unread: msg.is_read === false && msg.recipient_id === sender.id,
        });
      }
    });

    return {
      success: true,
      conversations: Array.from(conversationMap.values()),
    };
  } catch (error) {
    console.error('❌ Erreur récupération conversations:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      conversations: [],
    };
  }
}
