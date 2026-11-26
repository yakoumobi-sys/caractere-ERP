import { test, expect, type Page } from "@playwright/test";

const maquette = {
  name: "maquette.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
};

async function login(page: Page, name: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
}
const NAV: Record<string, string[]> = {
  "Karim Haddad": ["/clients", "/ventes", "/commandes", "/atelier", "/stock", "/caisse", "/reglages"],
  "Sara Benali": ["/clients", "/ventes", "/commandes", "/atelier", "/stock"],
  "Nadia Cherif": ["/clients", "/commandes", "/stock", "/caisse", "/caisse/reversements"],
  "Amine Floqueur": ["/commandes", "/atelier", "/stock"],
  "Lina Contrôle": ["/commandes", "/atelier", "/stock", "/stock/achats"],
};

for (const [who, pages] of Object.entries(NAV)) {
  test(`écrans accessibles — ${who}`, async ({ page }) => {
    await login(page, who);
    for (const p of pages) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBeLessThan(400);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.getByText(/Application error|Unhandled Runtime Error/)).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${p} : pas de défilement horizontal`).toBeLessThanOrEqual(1);
    }
  });
}

test("droits : l'atelier ne voit ni la caisse ni les montants", async ({ page }) => {
  await login(page, "Amine Floqueur");
  await page.goto("/caisse");
  await expect(page).toHaveURL(/refus=cash/);
  await page.goto("/clients");
  await expect(page).toHaveURL(/refus=clients_view/);
  await page.goto("/commandes?q=CSAB");
  await page.goto("/commandes?vue=a_produire");
  await page.getByText("Club Sportif Aïn Benian").first().click();
  await expect(page.getByRole("heading", { name: /Commande CAR-/ })).toBeVisible();
  await expect(page.getByText("Règlement", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/ DA/)).toHaveCount(0);
});

test("floqueur → contrôleur : première pièce puis série", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "modifie les données de démo : exécuté une seule fois, sur mobile");
  await login(page, "Amine Floqueur");
  const card = page.locator("div.rounded-xl", { hasText: "Club Sportif Aïn Benian" }).filter({ hasText: "Flocage à la presse" }).first();
  await expect(card.getByText("→ Contrôler la première pièce")).toBeVisible();
  await expect(card.getByText(/En attente de validation/)).toBeVisible();
  await login(page, "Lina Contrôle");
  const c2 = page.locator("div.rounded-xl", { hasText: "Club Sportif Aïn Benian" }).filter({ hasText: "Flocage à la presse" }).first();
  await c2.getByRole("button", { name: "Valider la 1re pièce" }).click();
  // validée : la tâche quitte la file « 1res pièces à valider » du contrôleur
  await expect(page.locator("div.rounded-xl", { hasText: "Club Sportif Aïn Benian" }).filter({ hasText: "Valider la 1re pièce" })).toHaveCount(0);
  await login(page, "Amine Floqueur");
  const c3 = page.locator("div.rounded-xl", { hasText: "Club Sportif Aïn Benian" }).filter({ hasText: "Flocage à la presse" }).first();
  await expect(c3.getByText("→ Produire la série")).toBeVisible();
  await c3.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.goto("/atelier?poste=controle");
  await expect(page.locator("div.rounded-xl", { hasText: "Club Sportif Aïn Benian" }).filter({ hasText: "Contrôle" }).first()).toBeVisible();
});

test("commercial : recherche par téléphone et fiche client", async ({ page }) => {
  await login(page, "Sara Benali");
  await expect(page.getByText(/À contacter aujourd'hui/)).toBeVisible();
  await expect(page.getByText("Devis sans réponse").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp prérempli" }).first()).toHaveAttribute("href", /wa\.me\/213/);
  await page.getByPlaceholder(/Téléphone, nom, référence/).fill("0555 12 34 56");
  await page.getByPlaceholder(/Téléphone, nom, référence/).press("Enter");
  await page.getByRole("link", { name: /Club Sportif Aïn Benian/ }).first().click();
  await expect(page.getByRole("heading", { name: "Club Sportif Aïn Benian" })).toBeVisible();
  await expect(page.getByText(/Commandes \(1\)/)).toBeVisible();
  await page.goto("/recherche?q=YAL-DEMO-0003");
  await expect(page.getByText(/Rayan Merabet/)).toBeVisible();
});

test("création de prospect : doublon signalé avant création", async ({ page }) => {
  await login(page, "Sara Benali");
  await page.goto("/clients/nouveau");
  await page.getByLabel("Nom *").fill("Test doublon");
  await page.getByLabel(/Téléphone/).fill("+213 555 12 34 56");
  await expect(page.getByText("Doublon possible :")).toBeVisible();
  await expect(page.getByText(/même numéro/)).toBeVisible();
});

test("caisse et reversements Yalidine", async ({ page }) => {
  await login(page, "Nadia Cherif");
  await page.goto("/caisse");
  await expect(page.getByText("Espèces attendues").first()).toBeVisible();
  await page.goto("/caisse/reversements");
  await expect(page.getByText("YAL-DEMO-0002")).toBeVisible();
  await page.goto("/caisse?vue=reglements");
  await expect(page.getByText("Encaissé par Yalidine").first()).toBeVisible();
});

test("carte Privilège publique", async ({ page }) => {
  await login(page, "Sara Benali");
  await page.goto("/clients?vue=fideles");
  await page.getByText("Karima Saadi").click();
  const href = await page.getByRole("link", { name: "Lien individuel de la carte" }).getAttribute("href");
  await page.context().clearCookies();
  await page.goto(href!);
  await expect(page.getByText("Au prochain achat, vous aurez un T-shirt caractérisé gratuit.")).toBeVisible();
  await expect(page.getByAltText("T-shirt caractérisé")).toBeVisible();
  await expect(page.getByText("0550")).toHaveCount(0);
});

test("document imprimable : bon de livraison", async ({ page }) => {
  await login(page, "Sara Benali");
  await page.goto("/ventes?vue=documents");
  await page.getByRole("link", { name: /^BL-/ }).first().click();
  await expect(page.getByText("Bon de livraison", { exact: true })).toBeVisible();
  await expect(page.getByText(/Réf\. commande/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimer / PDF" })).toBeVisible();
});

test("parcours de vente par l'interface : devis → commande → BAT → acompte → confirmation", async ({ page }) => {
  await login(page, "Sara Benali");
  await page.goto("/clients?q=Corniche");
  await page.getByText("Restaurant La Corniche").first().click();
  await page.getByRole("link", { name: "Nouveau devis" }).click();
  await page.getByLabel("Article").selectOption({ label: "POLO-PIQ · Polo piqué 220g" });
  await page.getByLabel("M", { exact: true }).fill("5");
  await page.getByLabel("L", { exact: true }).fill("3");
  await page.getByRole("checkbox", { name: "Broderie" }).check();
  await page.getByLabel("Prestation HT / pièce").fill("500");
  await page.getByRole("button", { name: "Enregistrer le devis" }).click();
  await expect(page.getByRole("heading", { name: /Devis CAR-/ })).toBeVisible();
  const ref = (await page.getByRole("heading", { name: /Devis CAR-/ }).textContent())!.replace("Devis ", "");
  await expect(page.getByText(/TTC 16 184 DA/)).toBeVisible(); // 8 × 1700 HT + 19 %
  await page.getByRole("button", { name: /Devis accepté/ }).click();
  await expect(page).toHaveURL(/\/commandes\?creation=ok$/);
  await page.getByRole("article").filter({ hasText: ref }).getByRole("link").click();
  await expect(page.getByRole("heading", { name: `Commande ${ref}` })).toBeVisible();
  await expect(page.getByText("→ Envoyer le BAT au client")).toBeVisible();
  await page.getByRole("combobox").filter({ hasText: "BAT envoyé au client" }).selectOption("valide");
  await page.getByRole("button", { name: "Enregistrer le BAT" }).click();
  await expect(page.getByText("BAT mis à jour.")).toBeVisible();
  await page.getByPlaceholder("Ex. Accord WhatsApp du 16/11").fill("Accord WhatsApp");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).first().click();
  await expect(page.getByText(/Preuve d'accord enregistrée/).first()).toBeVisible();
  await page.getByRole("button", { name: "Confirmer la commande" }).click();
  await expect(page.getByText(/Acompte insuffisant/)).toBeVisible();
  await page.getByRole("button", { name: "Encaisser l'acompte" }).click();
  await expect(page.getByText(/Paiement enregistré/).first()).toBeVisible();
  await page.getByRole("button", { name: "Confirmer la commande" }).click();
  await expect(page.getByText("→ Préparer le fichier")).toBeVisible();
  await expect(page.getByRole("link", { name: "Broder" })).toBeVisible();
});

test("remise au retrait → carte Privilège, et vente comptoir", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "modifie les données de démo");
  await login(page, "Sara Benali");
  await page.goto("/commandes?q=Iron Gym");
  await page.getByText("Salle de sport Iron Gym").first().click();
  await expect(page.getByText("→ Prévenir le client : commande prête au retrait")).toBeVisible();
  await expect(page.getByRole("link", { name: "Prévenir sur WhatsApp" })).toHaveAttribute("href", /wa\.me\/213555334455/);
  await page.getByRole("button", { name: "Créer le colis et le bon de livraison" }).click();
  await expect(page.getByText("Colis 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remis au client (retrait)" }).click();
  await expect(page.getByText("Retirée").first()).toBeVisible();
  await page.getByRole("link", { name: "Salle de sport Iron Gym" }).click();
  await expect(page.getByText("Carte Caractère Privilège")).toBeVisible();
  await expect(page.getByText("T-shirt caractérisé à offrir")).toBeVisible();

  await login(page, "Nadia Cherif");
  await page.goto("/commandes/nouvelle?mode=comptoir");
  await page.getByPlaceholder("Filtrer les articles en stock…").fill("CASQ");
  await page.getByRole("button", { name: /Casquette coton Noir U/ }).click();
  await page.getByRole("button", { name: "Encaisser et remettre" }).click();
  await expect(page.getByText(/Vente enregistrée/)).toBeVisible();
  await expect(page.getByText("Retirée").first()).toBeVisible();
});

test("commande directe DTF et flocage : sélectionner le client en conservant la saisie", async ({ page }) => {
  await login(page, "Sara Benali");
  await page.goto("/commandes/nouvelle");
  await page.getByLabel("Libellé").fill("Polo fourni");
  await page.getByLabel("M", { exact: true }).fill("2");
  await page.getByLabel("Prix vêtement HT").fill("2750");
  await page.getByRole("checkbox", { name: "DTF", exact: true }).check();
  await page.getByRole("checkbox", { name: "Flocage", exact: true }).check();
  const submit = page.getByRole("button", { name: "Créer la commande" });
  const search = page.getByPlaceholder("Nom du client ou téléphone");
  await submit.click();
  await expect(search).toBeFocused();
  await search.fill("Corniche");
  const client = page.getByRole("button", { name: /Restaurant La Corniche/ });
  await expect(client).toBeVisible();
  await expect(page.getByLabel("Prix vêtement HT")).toHaveValue("2750");
  await client.click();
  const promisedDay = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await page.getByText("Délai, acompte et livraison").click();
  await page.getByLabel("Date promise").fill(promisedDay);
  await page.getByLabel("Ajouter des photos").setInputFiles(maquette);
  await submit.click();
  await expect(page).toHaveURL(/\/commandes\?creation=ok$/);
  await expect(page.getByRole("status")).toHaveText("Commande ajoutée à la liste d’aujourd’hui.");
  const today = page.getByRole("region").filter({ has: page.getByRole("heading", { name: /^Aujourd’hui/ }) });
  const order = today.getByRole("article").filter({ hasText: "Polo fourni" }).first();
  await expect(order.getByText("Enregistrée", { exact: true })).toBeVisible();
  const promisedLabel = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Algiers" }).format(new Date(promisedDay));
  await expect(order.getByText(`· promis le ${promisedLabel}`, { exact: true })).toBeVisible();
  await order.getByRole("link").click();
  await expect(page.getByRole("heading", { name: /Commande CAR-/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmer la commande" })).toBeVisible();
  await expect(page.getByRole("img", { name: maquette.name })).toBeVisible();
  await expect(page.getByText("Polo fourni").first()).toBeVisible();
  await expect(page.getByText(/6\s?545 DA/).first()).toBeVisible();
});

test("commande directe DTF : le devis converti suit la même liste du jour et garde sa photo", async ({ page }) => {
  await login(page, "Sara Benali");
  await page.goto("/clients?q=Corniche");
  await page.getByText("Restaurant La Corniche").first().click();
  await page.getByRole("link", { name: "Nouveau devis" }).click();
  await page.getByLabel("Libellé").fill("Polo avec maquette");
  await page.getByLabel("M", { exact: true }).fill("1");
  await page.getByLabel("Prix vêtement HT").fill("1500");
  await page.getByRole("checkbox", { name: "DTF", exact: true }).check();
  await page.getByRole("button", { name: "Enregistrer le devis" }).click();
  const heading = page.getByRole("heading", { name: /Devis CAR-/ });
  await expect(heading).toBeVisible();
  const ref = (await heading.textContent())!.replace("Devis ", "");
  await page.getByLabel("Ajouter des photos").setInputFiles(maquette);
  await page.getByRole("button", { name: /Devis accepté/ }).click();
  await expect(page).toHaveURL(/\/commandes\?creation=ok$/);
  const today = page.getByRole("region").filter({ has: page.getByRole("heading", { name: /^Aujourd’hui/ }) });
  const order = today.getByRole("article").filter({ hasText: ref });
  await expect(order.getByText("Enregistrée", { exact: true })).toBeVisible();
  await order.getByRole("link").click();
  await expect(page.getByRole("heading", { name: `Commande ${ref}` })).toBeVisible();
  await expect(page.getByRole("img", { name: maquette.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmer la commande" })).toBeVisible();
});

test("vente directe : nouveau client et commande depuis le tableau de bord", async ({ page }, info) => {
  await login(page, "Sara Benali");
  const name = `Atelier Test ${info.project.name} ${Date.now()}`;
  await page.getByRole("link", { name: "Nouvelle commande", exact: true }).click();
  await page.getByPlaceholder("Nom du client ou téléphone").fill(name);
  await page.getByLabel("Libellé").fill("Polo personnalisé");
  await page.getByLabel("M", { exact: true }).fill("2");
  await page.getByLabel("Prix vêtement HT").fill("2750");
  await page.getByRole("button", { name: "Créer la commande" }).click();
  await expect(page).toHaveURL(/\/commandes\?creation=ok$/);
  const order = page.getByRole("article").filter({ hasText: name }).getByRole("link");
  await expect(order).toBeVisible();
  const orderPath = await order.getAttribute("href");
  await page.goto("/ventes");
  const sale = page.getByRole("link", { name: new RegExp(name) });
  await expect(sale).toHaveCount(1);
  await expect(sale).toHaveAttribute("href", orderPath);
  await sale.click();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});

test("transaction de caisse : entrée puis sortie avec motif", async ({ page }, info) => {
  await login(page, "Nadia Cherif");
  await page.goto("/caisse");
  for (const [kind, amount] of [["entree", "1250.50"], ["depense", "250"]]) {
    const reason = `Test ${kind} ${info.project.name} ${Date.now()}`;
    await page.getByRole("link", { name: "Nouvelle transaction" }).click();
    await page.getByLabel("Type de transaction").selectOption(kind);
    await page.getByLabel("Montant (DA)").fill(amount);
    await page.getByLabel("Motif").fill(reason);
    await page.getByRole("button", { name: "Enregistrer la transaction" }).click();
    await expect(page.getByText("Transaction enregistrée.")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: reason });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(kind === "entree" ? /1\s?250,5 DA/ : /[-−]250 DA/);
  }
});
