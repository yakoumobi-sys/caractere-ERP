-- Valeurs par défaut des réglages (n'écrase jamais une valeur existante)
insert into erp.settings(key, value) values
  ('company', '{"name":"Caractère","legal_name":"À renseigner","activity":"Personnalisation textile — DTF, broderie, flocage","address":"Aïn Benian, Alger","phone":"À renseigner","email":"","nif":"À renseigner","nis":"À renseigner","rc":"À renseigner","ai":"À renseigner","rib":"À renseigner","logo_url":"/logo-caractere.svg"}'),
  ('legal_mentions', '"Documents à valider : mentions légales à compléter à partir des documents de référence Caractère."'),
  ('tva_enabled', '"true"'),
  ('tva_rate', '19'),
  ('ref_prefix', '"CAR"'),
  ('prefix_devis', '"DEV"'),
  ('prefix_facture', '"FAC"'),
  ('prefix_bl', '"BL"'),
  ('prefix_recu', '"REC"'),
  ('default_deposit_pct', '50'),
  ('default_promised_days', '7'),
  ('quote_validity_days', '15'),
  ('quote_followup_days', '3'),
  ('reactivation_days', '90'),
  ('characterized_max_width_cm', '30'),
  ('loyalty_offer_text', '"Au prochain achat, vous aurez un T-shirt caractérisé gratuit."'),
  ('loyalty_photo_url', '"/tshirt-caracterise.svg"'),
  ('loyalty_on_counter', '"false"'),
  ('loyalty_min_order', '0'),
  ('whatsapp_templates', '{"nouveau_prospect":"Bonjour {prenom}, ici {commercial} de Caractère (Aïn Benian). Merci pour votre intérêt ! Pouvez-vous m''envoyer votre logo pour une simulation gratuite ?","devis_sans_reponse":"Bonjour {prenom}, je reviens vers vous concernant le devis {ref}. Avez-vous des questions ? Je peux l''ajuster si besoin.","reactivation":"Bonjour {prenom}, ça fait un moment ! Nous avons de nouveaux modèles chez Caractère. Un projet de textile personnalisé en vue ?","incident_livraison":"Bonjour {prenom}, le livreur Yalidine n''a pas pu vous remettre votre colis {ref}. Quand êtes-vous disponible ?","retour_colis":"Bonjour {prenom}, votre colis {ref} nous est revenu. Souhaitez-vous une nouvelle livraison ou un retrait à l''atelier ?","solde":"Bonjour {prenom}, votre commande {ref} est prête. Reste à régler : {solde}.","remboursement":"Bonjour {prenom}, nous revenons vers vous pour le remboursement de la commande {ref}.","pret":"Bonjour {prenom}, votre commande {ref} est prête ! Vous pouvez passer la récupérer à l''atelier Caractère d''Aïn Benian.","autre":"Bonjour {prenom}, ici {commercial} de Caractère."}')
on conflict (key) do nothing;
