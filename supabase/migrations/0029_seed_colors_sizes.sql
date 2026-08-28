-- Seed données: Couleurs et Tailles populaires

-- Couleurs populaires pour vêtements personnalisés
insert into public.product_colors (color, hex_value) values
  ('Noir', '#000000'),
  ('Blanc', '#FFFFFF'),
  ('Rouge', '#FF0000'),
  ('Bleu roi', '#4169E1'),
  ('Bleu nuit', '#001F3F'),
  ('Bleu pétrole', '#0A3D62'),
  ('Gris', '#808080'),
  ('Rose bonbon', '#FF69B4'),
  ('Rose fuchsia', '#FF1493'),
  ('Vert pomme', '#7FBF00'),
  ('Vert bouteille', '#1B4332')
on conflict (color) do nothing;

-- Tailles standards pour vêtements
insert into public.product_sizes (size, category) values
  ('S', 'Standard'),
  ('M', 'Standard'),
  ('L', 'Standard'),
  ('XL', 'Standard'),
  ('XXL', 'Standard'),
  ('XXXL', 'Standard')
on conflict (size) do nothing;
