"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export async function createClaim(
  orderId: string,
  contactId: string,
  issueType: string,
  description: string,
  priority: string = "normal"
) {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  if (!profile?.id || !["admin", "manager"].includes(profile.role || "")) {
    throw new Error("Permission refusée");
  }

  const { error } = await supabase.from("claims").insert({
    pipeline_order_id: orderId,
    contact_id: contactId,
    issue_type: issueType,
    description: description.trim(),
    priority,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/claims");
  revalidatePath(`/production/${orderId}`);
}

export async function updateClaimStatus(claimId: string, status: string, resolution?: string) {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  if (!profile?.id || !["admin", "manager"].includes(profile.role || "")) {
    throw new Error("Permission refusée");
  }

  const updateData: any = { status };
  if (status === "resolved" || status === "closed") {
    updateData.resolved_at = new Date().toISOString();
    if (resolution) updateData.resolution = resolution.trim();
  }

  const { error } = await supabase.from("claims").update(updateData).eq("id", claimId);

  if (error) throw new Error(error.message);
  revalidatePath("/claims");
}

export async function assignClaim(claimId: string, employeeId: string | null) {
  const supabase = createClient();
  const profile = await getCurrentProfile();
  if (!profile?.id || !["admin", "manager"].includes(profile.role || "")) {
    throw new Error("Permission refusée");
  }

  const { error } = await supabase.from("claims").update({ assigned_to: employeeId }).eq("id", claimId);

  if (error) throw new Error(error.message);
  revalidatePath("/claims");
}
