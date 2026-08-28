'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addMonthlyObjective(
  month: string,
  formData: FormData,
  employeeId: string
) {
  const supabase = await createClient();

  try {
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const targetValue = formData.get('target_value') as string;

    const { error } = await supabase.from('monthly_objectives').insert({
      month,
      objective_type: 'individuel',
      title,
      description: description || null,
      target_value: targetValue ? parseInt(targetValue) : null,
      employee_id: employeeId,
      status: 'en_cours',
    });

    if (error) throw error;

    revalidatePath('/hr/objectives');
    return { success: true };
  } catch (error) {
    console.error('❌ Erreur ajout objectif:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

export async function updateObjectiveProgress(
  objectiveId: string,
  progressValue: number
) {
  const supabase = await createClient();

  try {
    const { error } = await supabase.from('monthly_objectives').update({
      progress_value: progressValue,
    }).eq('id', objectiveId);

    if (error) throw error;

    // Enregistrer la mise à jour
    await supabase.from('objective_updates').insert({
      objective_id: objectiveId,
      progress_value: progressValue,
    });

    revalidatePath('/hr/objectives');
    return { success: true };
  } catch (error) {
    console.error('❌ Erreur mise à jour objectif:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}
