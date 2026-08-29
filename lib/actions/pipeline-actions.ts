"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { initialStatus, STATUS_DEFS, type OrderStatus, type Technique } from "@/lib/pipeline";
import { createYalidineParcel } from "@/lib/yalidine";

interface ItemInput {
  product_name: string;
  color: string;
  size: string;
  quantity: number;
}

interface PrintInput {
  placement: string;
  size_cm: string;
  text_content: string;
}

export async function createPipelineOrder(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let contact_id = String(formData.get("contact_id") ?? "");
  const clientMode = String(formData.get("client_mode") ?? "existing");
  const description = (formData.get("description") as string) || null;
  const technique = String(formData.get("technique") ?? "") as Technique;
  const logo_placement = (formData.get("logo_placement") as string) || null;
  const logo_placement_note = (formData.get("logo_placement_note") as string) || null;
  const logo_source = (formData.get("logo_source") as string) || null;
  const logo_source_value = (formData.get("logo_source_value") as string) || null;
  const requires_flocage = technique === "dtf" && formData.get("requires_flocage") === "on";

  const useYalidine = formData.get("use_yalidine") === "on";
  const yalidineWilaya = String(formData.get("yalidine_wilaya") ?? "").trim();
  const yalidineCommune = String(formData.get("yalidine_commune") ?? "").trim();
  const yalidineAddress = String(formData.get("yalidine_address") ?? "").trim();
  const yalidinePrice = Number(formData.get("yalidine_price") ?? 0);

  if (clientMode === "new") {
    const name = String(formData.get("client_new_name") ?? "").trim();
    if (!name) throw new Error("Le nom du nouveau client est requis.");
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        name,
        phone: (formData.get("client_new_phone") as string) || null,
        type: (formData.get("client_new_type") as string) || "client",
      })
      .select("id")
      .single();
    if (contactError) throw new Error(contactError.message);
    contact_id = contact.id;
  }

  if (!contact_id) throw new Error("Le client est requis.");
  if (!["dtf", "broderie", "aucune"].includes(technique)) throw new Error("Le choix d'impression est requis.");

  const { data: order, error } = await supabase
    .from("pipeline_orders")
    .insert({
      contact_id,
      description,
      technique,
      logo_placement,
      logo_placement_note,
      logo_source,
      logo_source_value,
      requires_flocage,
      status: initialStatus(technique),
      created_by: user?.id ?? null,
    })
    .select("id, number")
    .single();
  if (error) throw new Error(error.message);

  const items = JSON.parse(String(formData.get("items_json") ?? "[]")) as ItemInput[];
  const validItems = items.filter((it) => it.product_name);
  if (validItems.length > 0) {
    await supabase.from("pipeline_order_items").insert(
      validItems.map((it, i) => ({
        pipeline_order_id: order.id,
        product_name: it.product_name,
        color: it.color || null,
        size: it.size || null,
        quantity: Number(it.quantity) || 1,
        position: i,
      }))
    );
  }

  const prints = JSON.parse(String(formData.get("prints_json") ?? "[]")) as PrintInput[];
  const validPrints = prints.filter((p) => p.placement);
  if (validPrints.length > 0) {
    await supabase.from("pipeline_order_prints").insert(
      validPrints.map((p, i) => ({
        pipeline_order_id: order.id,
        placement: p.placement,
        size_cm: p.size_cm || null,
        text_content: p.text_content || null,
        position: i,
      }))
    );
  }

  await uploadPipelineFile(order.id, formData.get("logo") as File | null);

  // Expédition Yalidine choisie dès la création de la commande (demande
  // explicite du propriétaire : plus besoin de repasser par la fiche
  // commande plus tard). Le vrai colis est créé immédiatement — un échec
  // ici (ex: nom de commune mal orthographié) ne doit pas empêcher la
  // commande d'être créée : l'employé peut toujours créer l'expédition
  // manuellement depuis la fiche commande (panneau Yalidine, sert de repli).
  if (useYalidine && yalidineWilaya && yalidineCommune && yalidineAddress && yalidinePrice > 0) {
    try {
      const { data: contact } = await supabase.from("contacts").select("name, phone").eq("id", contact_id).single();
      const [firstname, ...rest] = (contact?.name || "Client").trim().split(/\s+/);
      const productList =
        validItems.length > 0 ? validItems.map((it) => `${it.quantity}× ${it.product_name}`).join(", ") : description || order.number || "Commande Caractère";

      const result = await createYalidineParcel({
        orderId: order.number || order.id,
        firstname,
        familyname: rest.join(" "),
        contactPhone: contact?.phone || "",
        address: yalidineAddress,
        toWilayaName: yalidineWilaya,
        toCommuneName: yalidineCommune,
        productList,
        price: yalidinePrice,
      });

      if (result.tracking) {
        await supabase.from("yalidine_shipments").insert({
          order_id: order.id,
          yalidine_tracking_id: result.tracking,
          status: "pending",
        });
      }
    } catch (e) {
      console.error("Yalidine à la création de la commande — échec :", (e as Error).message);
    }
  }

  revalidatePath("/production", "layout");
  redirect(`/production/${order.id}`);
}

/** Renvoie l'employé (fiche RH) lié au compte actuellement connecté, s'il existe */
async function currentEmployeeId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("employees").select("id").eq("profile_id", user.id).maybeSingle();
  return data?.id ?? null;
}

/**
 * Fait avancer une commande au statut suivant (bouton "Prendre la commande" /
 * "Marquer imprimée" / "Marquer terminée" / "Livrer au client").
 * Si personne n'est encore assigné, assigne automatiquement l'employé connecté.
 */
export async function advancePipelineOrder(orderId: string, fromStatus: OrderStatus, currentAssignee: string | null) {
  const def = STATUS_DEFS[fromStatus];
  if (!def.next) return;

  const supabase = createClient();
  let nextStatus: OrderStatus = def.next;

  // Une impression DTF marquée "requires_flocage" part en file Flocage au
  // lieu de passer directement "prête" — voir la case à cocher du
  // configurateur (Étape 3, technique DTF).
  if (fromStatus === "impression_dtf") {
    const { data: order } = await supabase.from("pipeline_orders").select("requires_flocage").eq("id", orderId).single();
    if (order?.requires_flocage) nextStatus = "attente_flocage";
  }

  const payload: Record<string, unknown> = { status: nextStatus };
  // On repart d'un atelier "vierge" en changeant de file (DTF -> Flocage) :
  // libérer l'assignation précédente pour que l'équipe Flocage la reprenne.
  if (nextStatus === "attente_flocage") {
    payload.assigned_to = null;
  } else if (!currentAssignee) {
    const employeeId = await currentEmployeeId();
    if (employeeId) payload.assigned_to = employeeId;
  }

  const { error } = await supabase.from("pipeline_orders").update(payload).eq("id", orderId);
  if (error) throw new Error(error.message);

  revalidatePath("/production", "layout");
  revalidatePath(`/production/${orderId}`);
}

/** Changement manuel de statut / assignation depuis la fiche détail (admin/commercial) */
export async function setPipelineStatus(orderId: string, status: string, assignedTo?: string | null) {
  const supabase = createClient();
  const payload: Record<string, unknown> = { status };
  if (assignedTo !== undefined) payload.assigned_to = assignedTo || null;

  const { error } = await supabase.from("pipeline_orders").update(payload).eq("id", orderId);
  if (error) throw new Error(error.message);
  revalidatePath("/production", "layout");
  revalidatePath(`/production/${orderId}`);
}

export async function addPipelineNote(id: string, currentStatus: string, formData: FormData) {
  const supabase = createClient();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  const { error } = await supabase.from("pipeline_stage_log").insert({ pipeline_order_id: id, status: currentStatus, note });
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${id}`);
}

export async function deletePipelineOrder(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("pipeline_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/production", "layout");
  redirect("/production");
}

export async function uploadPipelineFile(orderId: string, file: File | null) {
  if (!file || file.size === 0) return;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${orderId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("order-files").upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = supabase.storage.from("order-files").getPublicUrl(path);
  const { error } = await supabase
    .from("pipeline_order_files")
    .insert({ pipeline_order_id: orderId, file_url: pub.publicUrl, file_name: file.name, uploaded_by: user?.id ?? null });
  if (error) throw new Error(error.message);

  revalidatePath(`/production/${orderId}`);
}

export async function deletePipelineFile(orderId: string, fileId: string, fileUrl: string) {
  const supabase = createClient();
  const path = fileUrl.split("/order-files/")[1];
  if (path) await supabase.storage.from("order-files").remove([path]);
  const { error } = await supabase.from("pipeline_order_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function addPipelineItem(orderId: string, formData: FormData) {
  const supabase = createClient();
  const product_name = String(formData.get("product_name") ?? "").trim();
  if (!product_name) return;

  const { error } = await supabase.from("pipeline_order_items").insert({
    pipeline_order_id: orderId,
    product_name,
    color: (formData.get("color") as string) || null,
    size: (formData.get("size") as string) || null,
    quantity: Number(formData.get("quantity")) || 1,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function deletePipelineItem(orderId: string, itemId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("pipeline_order_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function addPipelinePrint(orderId: string, formData: FormData) {
  const supabase = createClient();
  const placement = String(formData.get("placement") ?? "").trim();
  if (!placement) return;

  const { error } = await supabase.from("pipeline_order_prints").insert({
    pipeline_order_id: orderId,
    placement,
    size_cm: (formData.get("size_cm") as string) || null,
    text_content: (formData.get("text_content") as string) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function deletePipelinePrint(orderId: string, printId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("pipeline_order_prints").delete().eq("id", printId);
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${orderId}`);
}

export async function addPipelineFault(orderId: string | null, employeeId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const description = String(formData.get("description") ?? "").trim();
  if (!description || !employeeId) return;

  const { error } = await supabase.from("employee_faults").insert({
    employee_id: employeeId,
    pipeline_order_id: orderId,
    description,
    severity: (formData.get("severity") as string) || "mineure",
    created_by: user?.id ?? null,
  });
  if (error) throw new Error(error.message);

  if (orderId) revalidatePath(`/production/${orderId}`);
  revalidatePath(`/hr/employees/${employeeId}`);
}

export async function deletePipelineFault(employeeId: string, faultId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("employee_faults").delete().eq("id", faultId);
  if (error) throw new Error(error.message);
  revalidatePath(`/hr/employees/${employeeId}`);
}
