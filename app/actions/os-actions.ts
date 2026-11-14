"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const systems = ["sales", "marketing", "delivery", "finance", "hiring"] as const;
const priorityStatuses = ["a_faire", "en_cours", "bloque", "termine"] as const;
const campaignChannels = ["meta", "instagram", "facebook", "tiktok", "linkedin", "email", "autre"] as const;
const campaignStatuses = ["active", "pause", "terminee"] as const;
const candidateStages = ["nouveau", "entretien", "test", "offre", "embauche", "refuse"] as const;

const short = (max: number) => z.string().trim().min(3).max(max);
const money = z.coerce.number().finite().min(0).max(999999999999);
const quantity = z.coerce.number().int().min(0).max(100000000);
const idSchema = z.string().uuid();

function val(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

async function admin() {
  const profile = await getCurrentProfile();
  if (!profile?.id || !profile.is_active || profile.role !== "admin") {
    throw new Error("Accès refusé : direction uniquement.");
  }
  return { profile, db: createClient() };
}

function finish(error: unknown, ok: string) {
  if (error) redirect("/os?error=database");
  revalidatePath("/os");
  redirect("/os?ok=" + encodeURIComponent(ok));
}

export async function createOsPriority(form: FormData) {
  const { profile, db } = await admin();
  const parsed = z.object({
    system: z.enum(systems),
    title: short(160),
    owner_name: z.string().trim().max(100),
    due_date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  }).safeParse({
    system: val(form, "system"),
    title: val(form, "title"),
    owner_name: val(form, "owner_name"),
    due_date: val(form, "due_date"),
  });
  if (!parsed.success) redirect("/os?error=validation");
  const { system, title, owner_name, due_date } = parsed.data;
  const { error } = await db.from("os_priorities").insert({
    system, title, owner_name, due_date: due_date || null, created_by: profile.id,
  });
  finish(error, "priority");
}

export async function setOsPriorityStatus(form: FormData) {
  const { db } = await admin();
  const parsed = z.object({ id: idSchema, status: z.enum(priorityStatuses) }).safeParse({
    id: val(form, "id"), status: val(form, "status"),
  });
  if (!parsed.success) redirect("/os?error=validation");
  const { error } = await db.from("os_priorities")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id);
  finish(error, "priority");
}

export async function createOsCampaign(form: FormData) {
  const { profile, db } = await admin();
  const parsed = z.object({
    name: short(160),
    channel: z.enum(campaignChannels),
  }).safeParse({ name: val(form, "name"), channel: val(form, "channel") });
  if (!parsed.success) redirect("/os?error=validation");
  const { error } = await db.from("os_campaigns").insert({
    ...parsed.data, created_by: profile.id,
  });
  finish(error, "campaign");
}

export async function setOsCampaignMetrics(form: FormData) {
  const { db } = await admin();
  const parsed = z.object({
    id: idSchema,
    status: z.enum(campaignStatuses),
    spend_dzd: money,
    leads: quantity,
    quotes: quantity,
    orders: quantity,
    revenue_dzd: money,
  }).safeParse({
    id: val(form, "id"),
    status: val(form, "status"),
    spend_dzd: val(form, "spend_dzd"),
    leads: val(form, "leads"),
    quotes: val(form, "quotes"),
    orders: val(form, "orders"),
    revenue_dzd: val(form, "revenue_dzd"),
  });
  if (!parsed.success) redirect("/os?error=validation");
  const { id, ...fields } = parsed.data;
  const { error } = await db.from("os_campaigns")
    .update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  finish(error, "campaign");
}

export async function createOsCandidate(form: FormData) {
  const { profile, db } = await admin();
  const parsed = z.object({
    full_name: short(120),
    position: z.string().trim().min(2).max(120),
    next_action: z.string().trim().max(300),
  }).safeParse({
    full_name: val(form, "full_name"),
    position: val(form, "position"),
    next_action: val(form, "next_action"),
  });
  if (!parsed.success) redirect("/os?error=validation");
  const { error } = await db.from("os_candidates").insert({
    ...parsed.data, created_by: profile.id,
  });
  finish(error, "candidate");
}

export async function setOsCandidateStage(form: FormData) {
  const { db } = await admin();
  const parsed = z.object({
    id: idSchema,
    stage: z.enum(candidateStages),
    next_action: z.string().trim().max(300),
  }).safeParse({
    id: val(form, "id"),
    stage: val(form, "stage"),
    next_action: val(form, "next_action"),
  });
  if (!parsed.success) redirect("/os?error=validation");
  const { id, ...fields } = parsed.data;
  const { error } = await db.from("os_candidates")
    .update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  finish(error, "candidate");
}
