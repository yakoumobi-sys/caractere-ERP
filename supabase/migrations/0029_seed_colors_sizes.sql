-- Seed données: Couleurs et Tailles populaires

-- Couleurs populaires pour vêtements personnalisés
insert into public.product_colors (color, hex_value) values
  ('Noir', '#000000'),
  ('Blanc', '#FFFFFF'),
  ('Gris clair', '#D3D3D3'),
  ('Gris foncé', '#505050'),
  ('Bleu marine', '#001F3F'),
  ('Bleu ciel', '#0074D9'),
  ('Bleu électrique', '#00B0FF'),
  ('Vert olive', '#556B2F'),
  ('Vert sapin', '#1B4332'),
  ('Rouge vif', '#FF4136'),
  ('Rose', '#FF69B4'),
  ('Orange', '#FF851B'),
  ('Jaune', '#FFDC00'),
  ('Marron', '#8B4513'),
  ('Violet', '#9C27B0'),
  ('Indigo', '#4527A0'),
  ('Turquoise', '#00CED1')
on conflict (color) do nothing;

-- Tailles standards pour vêtements
insert into public.product_sizes (size, category) values
  ('XS', 'Standard'),
  ('S', 'Standard'),
  ('M', 'Standard'),
  ('L', 'Standard'),
  ('XL', 'Standard'),
  ('XXL', 'Standard'),
  ('XXXL', 'Standard'),
  ('6M', 'Enfant'),
  ('12M', 'Enfant'),
  ('2T', 'Enfant'),
  ('3T', 'Enfant'),
  ('4T', 'Enfant'),
  ('5T', 'Enfant'),
  ('One Size', 'Unique'),
  ('Personnalisé', 'Autre')
on conflict (size) do nothing;
