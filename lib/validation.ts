import { z } from "zod";

/** Schémas de validation réutilisables */
export const schemas = {
  // Auth
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
  fullName: z.string().min(2, "Le nom est requis").max(100),

  // CRM
  contactName: z.string().min(2, "Le nom du contact doit faire au moins 2 caractères").max(100),
  phone: z.string().regex(/^[\d\s\-\+\(\)]+$/, "Numéro invalide").optional().or(z.literal("")),
  optionalEmail: z.string().email().optional().or(z.literal("")),

  // Documents
  documentStatus: z.enum(["brouillon", "valide", "facturee", "payee", "livree"]),
  quantity: z.coerce.number().min(1, "La quantité doit être au moins 1"),
  price: z.coerce.number().min(0, "Le prix ne peut pas être négatif"),
  taxRate: z.coerce.number().min(0).max(100),

  // Production
  techniqueType: z.enum(["dtf", "broderie", "none"]),
  productionStatus: z.enum(["reception", "commercial", "atelier", "flocage", "controle", "prete", "livree"]),

  // Inventory
  sku: z.string().min(2, "Le SKU est requis").max(50),
  productName: z.string().min(2, "Le nom du produit est requis").max(200),
};

/** Formulaire Auth */
export const signUpSchema = z.object({
  email: schemas.email,
  password: schemas.password,
  full_name: schemas.fullName,
});

export const signInSchema = z.object({
  email: schemas.email,
  password: schemas.password,
});

/** Formulaire Contact */
export const contactFormSchema = z.object({
  name: schemas.contactName,
  phone: schemas.phone,
  email: schemas.optionalEmail,
  type: z.enum(["client", "prospect", "fournisseur", "autre"]),
  company_name: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
});

/** Formulaire Document (Devis, Commande, Facture, etc.) */
export const documentLineSchema = z.object({
  product_id: z.string().uuid().nullable(),
  description: z.string().optional(),
  quantity: schemas.quantity,
  price: schemas.price,
  tax_rate: schemas.taxRate,
});

export const documentFormSchema = z.object({
  contact_id: z.string().uuid("Client requis"),
  status: schemas.documentStatus,
  notes: z.string().optional(),
  lines_json: z.string().refine(
    (v) => {
      try {
        const lines = JSON.parse(v);
        return Array.isArray(lines) && lines.length > 0;
      } catch {
        return false;
      }
    },
    "Au moins une ligne est requise"
  ),
});

/** Formulaire Production Order */
export const productionOrderSchema = z.object({
  contact_id: z.string().uuid("Client requis"),
  client_mode: z.enum(["existing", "new"]),
  client_new_name: z.string().optional(),
  client_new_phone: z.string().optional(),
  client_new_type: z.enum(["client", "prospect", "fournisseur", "autre"]).optional(),
  description: z.string().max(1000).optional(),
  technique: z.enum(["dtf", "broderie", "none"]),
  logo_placement: z.string().optional(),
  logo_source: z.string().optional(),
});
