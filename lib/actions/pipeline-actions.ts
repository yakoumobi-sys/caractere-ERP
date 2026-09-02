"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { initialStatus, STATUS_DEFS, type OrderStatus, type Technique } from "@/lib/pipeline";
import { createYalidineParcel } from "@/lib/yalidine";
import { recordInitialPayment } from "@/lib/actions/payment-actions";

interface ItemInput {
  /** Fiche catalogue choisie dans le configurateur. Le nom reste enregistré à
   *  côté : la commande garde trace de ce qui a été vendu même si la fiche est
   *  renommée ou retirée par la suite. */
  product_id?: string;
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

/**
 * Synchronise les articles d'une commande vers la base de produits.
 * Ajoute automatiquement les nouveaux produits s'ils n'existent pas.
 *
 * PERF OPTIMISÉE: Utilise batch queries au lieu de boucles N+1.
 * Avant: 10 articles = 10+ requêtes
 * Après: 10 articles = 1-2 requêtes
 */
async function syncArticlesToProducts(supabase: any, items: ItemInput[]) {
  const validItems = items.filter((it) => it.product_name?.trim());
  if (validItems.length === 0) return;

  try {
    const productNames = validItems.map((it) => it.product_name.trim());

    // ✅ BATCH QUERY #1: Récupérer tous les produits existants en une seule requête
    const { data: existingProducts, error: selectError } = await supabase
      .from("products")
      .select("id, name")
      .in("name", productNames);

    if (selectError) {
      console.error("Erreur lors de la recherche des produits:", selectError);
      return;
    }

    const existingNames = new Set(
      existingProducts?.map((p: { id: string; name: string }) => p.name.trim().toLowerCase()) ?? []
    );

    // Un seul produit par nom, même si la commande contient plusieurs lignes du
    // même article : l'ancienne version créait un doublon par ligne (cinq
    // « TSHIRT » identiques pour une commande de cinq t-shirts).
    const seen = new Set<string>();
    const productsToCreate = validItems
      .filter((it) => {
        const key = it.product_name.trim().toLowerCase();
        if (existingNames.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((it, idx) => {
        const productName = it.product_name.trim();
        const sku = `AUTO-${productName
          .toLowerCase()
          .replace(/\s+/g, "-")
          .slice(0, 20)}-${Date.now()}-${idx}`;

        return {
          name: productName,
          sku,
          unit: "unité",
          sale_price: 0,
          purchase_cost: 0,
          tax_rate: 20,
          track_inventory: true,
          is_active: true,
        };
      });

    // ✅ BATCH QUERY #2: Insérer tous les nouveaux produits en une seule requête
    if (productsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from("products")
        .insert(productsToCreate);

      if (insertError) {
        console.error("Erreur lors de la création des produits:", insertError);
      } else {
        console.log(`✅ ${productsToCreate.length} produits créés automatiquement`);
      }
    }
  } catch (err) {
    console.error("Erreur inattendue lors de la synchronisation des produits:", err);
    // Ne pas lever l'erreur pour ne pas bloquer la création de la commande
  }
}

/** Résultat renvoyé au formulaire : un message d'erreur affichable, ou rien. */
export interface OrderFormState {
  error: string | null;
}

/**
 * Crée la commande depuis le configurateur.
 *
 * Les erreurs sont RENVOYÉES, pas levées : une exception dans une action
 * serveur remplace la page par l'écran d'erreur de Next.js et fait perdre
 * toute la saisie — le commercial devait tout retaper, et concluait que
 * « la commande ne se crée pas ». Ici le formulaire reste à l'écran avec la
 * raison exacte.
 */
export async function createPipelineOrder(
  _prevState: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  let orderId: string;

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let contact_id = String(formData.get("contact_id") ?? "").trim();
    const clientMode = String(formData.get("client_mode") ?? "existing");
    const description = (formData.get("description") as string) || null;
    const technique = String(formData.get("technique") ?? "") as Technique;
    const logo_placement = (formData.get("logo_placement") as string) || null;
    const logo_placement_note = (formData.get("logo_placement_note") as string) || null;
    const logo_source = (formData.get("logo_source") as string) || null;
    const logo_source_value = (formData.get("logo_source_value") as string) || null;
    const requires_flocage = technique === "dtf" && formData.get("requires_flocage") === "on";
    const orderTotal = Number(formData.get("order_total") ?? 0);
    const initialPayment = Number(formData.get("initial_payment") ?? 0);

    const useYalidine = formData.get("use_yalidine") === "on";
    const yalidineWilayaId = Number(formData.get("yalidine_wilaya") ?? 0);
    const yalidineCommune = String(formData.get("yalidine_commune") ?? "").trim();
    const yalidineAddress = String(formData.get("yalidine_address") ?? "").trim();
    const yalidinePrice = Number(formData.get("yalidine_price") ?? 0);

    // Compte désactivé : toutes les policies RLS commencent par
    // is_active_user(), l'insertion échouerait plus bas sur un message
    // technique ("new row violates row-level security policy"). On le dit
    // franchement, c'est la seule chose que l'employé peut faire remonter.
    if (!user) return { error: "Session expirée — reconnectez-vous puis réessayez." };
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active, role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile && !profile.is_active) {
      return {
        error:
          "Votre compte est désactivé : vous ne pouvez pas créer de commande. " +
          "Demandez à l'administrateur de le réactiver (Paramètres > Utilisateurs).",
      };
    }
    if (profile?.role === "readonly") {
      return {
        error:
          "Votre compte est en lecture seule : vous ne pouvez pas créer de commande. " +
          "Demandez à l'administrateur de vous attribuer un rôle (Paramètres > Utilisateurs).",
      };
    }

    if (clientMode === "new") {
      const name = String(formData.get("client_new_name") ?? "").trim();
      if (!name) return { error: "Le nom du nouveau client est requis." };
      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          name,
          phone: (formData.get("client_new_phone") as string) || null,
          type: (formData.get("client_new_type") as string) || "client",
        })
        .select("id")
        .single();
      if (contactError) return { error: `Impossible de créer le client : ${contactError.message}` };
      contact_id = contact.id;
    }

    if (!contact_id) {
      return {
        error:
          "Aucun client sélectionné. Tapez le nom puis touchez le client dans la liste " +
          "(le nom saisi ne suffit pas), ou utilisez « + Nouveau client ».",
      };
    }
    if (!["dtf", "broderie", "aucune"].includes(technique)) {
      return { error: "Le choix d'impression est requis." };
    }

    // Les articles sont validés AVANT d'écrire quoi que ce soit : la commande
    // était auparavant insérée en premier, si bien qu'un formulaire soumis sans
    // article (le clavier mobile envoie « entrée » = submit) créait une commande
    // vide, impossible à traiter en atelier.
    let items: ItemInput[];
    try {
      items = JSON.parse(String(formData.get("items_json") ?? "[]")) as ItemInput[];
    } catch {
      items = [];
    }
    const validItems = items.filter((it) => it.product_name?.trim());
    if (validItems.length === 0) {
      return {
        error:
          "Aucun article retenu. Dans l'étape « Articles », touchez l'article dans la liste " +
          "ou « + Créer … dans le stock » : le texte tapé dans la recherche n'est pas enregistré.",
      };
    }

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
        order_total: orderTotal > 0 ? orderTotal : null,
        initial_payment: initialPayment > 0 ? initialPayment : 0,
        payment_status: initialPayment > 0 ? (initialPayment >= orderTotal ? "paid" : "partial") : "unpaid",
        status: initialStatus(technique),
        created_by: user.id,
      })
      .select("id, number")
      .single();
    if (error) return { error: `Impossible de créer la commande : ${error.message}` };

    await syncArticlesToProducts(supabase, validItems);

    const { error: itemsError } = await supabase.from("pipeline_order_items").insert(
      validItems.map((it, i) => ({
        pipeline_order_id: order.id,
        product_id: it.product_id || null,
        product_name: it.product_name.trim(),
        color: it.color?.trim() || null,
        size: it.size?.trim() || null,
        quantity: Number(it.quantity) || 1,
        position: i,
      }))
    );
    if (itemsError) {
      // Pas de commande orpheline : on annule plutôt que de laisser une ligne
      // vide en production.
      await supabase.from("pipeline_orders").delete().eq("id", order.id);
      return { error: `Erreur lors de la création des articles : ${itemsError.message}` };
    }

    let prints: PrintInput[];
    try {
      prints = JSON.parse(String(formData.get("prints_json") ?? "[]")) as PrintInput[];
    } catch {
      prints = [];
    }
    const validPrints = prints.filter((p) => p.placement);
    if (validPrints.length > 0) {
      const { error: printsError } = await supabase.from("pipeline_order_prints").insert(
        validPrints.map((p, i) => ({
          pipeline_order_id: order.id,
          placement: p.placement,
          size_cm: p.size_cm || null,
          text_content: p.text_content || null,
          position: i,
        }))
      );
      // La commande existe déjà : un détail d'impression manquant se rattrape
      // depuis la fiche, il ne doit pas faire perdre la commande.
      if (printsError) {
        console.error("Impressions non enregistrées :", printsError.message);
      }
    }

    // Idem : le logo se renvoie depuis la fiche commande, la commande reste.
    try {
      await uploadPipelineFile(order.id, formData.get("logo") as File | null);
    } catch (e) {
      console.error("Logo non enregistré :", (e as Error).message);
    }

    // Enregistrer le versement initial s'il y en a un
    if (initialPayment > 0) {
      try {
        await recordInitialPayment(order.id, initialPayment, contact_id);
      } catch (e) {
        console.error("Erreur lors de l'enregistrement du versement initial:", (e as Error).message);
        // Ne pas lever l'erreur — la commande est créée de toute façon
      }
    }

    // Expédition Yalidine choisie dès la création de la commande (demande
    // explicite du propriétaire : plus besoin de repasser par la fiche
    // commande plus tard). Le vrai colis est créé immédiatement — un échec
    // ici (ex: commune mal orthographiée) ne doit pas empêcher la
    // commande d'être créée : l'employé peut toujours créer l'expédition
    // manuellement depuis la fiche commande (panneau Yalidine, sert de repli).
    if (useYalidine && yalidineWilayaId && yalidineCommune && yalidineAddress && yalidinePrice > 0) {
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
          toWilayaId: yalidineWilayaId,
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

    orderId = order.id;
  } catch (err) {
    console.error("Création de commande — échec inattendu :", err);
    return { error: `Erreur inattendue : ${(err as Error).message}` };
  }

  // Hors du try : redirect() lève volontairement une exception interne
  // (NEXT_REDIRECT) que le catch prendrait pour un échec de création.
  revalidatePath("/production", "layout");
  revalidatePath("/dashboard", "layout");
  redirect(`/production/${orderId}`);
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
  if (!def.next) {
    throw new Error(`Aucun statut suivant pour "${fromStatus}"`);
  }

  const supabase = createClient();
  let nextStatus: OrderStatus = def.next;

  // Une impression DTF marquée "requires_flocage" part en file Flocage au
  // lieu de passer directement "prête" — voir la case à cocher du
  // configurateur (Étape 3, technique DTF).
  if (fromStatus === "impression_dtf") {
    const { data: order, error: orderError } = await supabase
      .from("pipeline_orders")
      .select("requires_flocage")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      throw new Error(`Erreur lors de la recherche de la commande: ${orderError.message}`);
    }

    if (order?.requires_flocage) {
      nextStatus = "attente_flocage";
    }
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
  if (error) {
    throw new Error(`Erreur lors de la mise à jour du statut: ${error.message}`);
  }

  revalidatePath("/production", "layout");
  revalidatePath("/dashboard", "layout");
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
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/production/${orderId}`);
}

export async function addPipelineNote(id: string, currentStatus: string, formData: FormData) {
  const supabase = createClient();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  const { error } = await supabase.from("pipeline_stage_log").insert({ pipeline_order_id: id, status: currentStatus, note });
  if (error) throw new Error(error.message);
  revalidatePath(`/production/${id}`);
  revalidatePath("/dashboard", "layout");
}

export async function deletePipelineOrder(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("pipeline_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/production", "layout");
  revalidatePath("/dashboard", "layout");
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
