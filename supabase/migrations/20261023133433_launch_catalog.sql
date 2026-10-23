-- Catalogue fourni par Moka le 23 octobre 2026. Aucun stock ni coût inventé.
alter table public.products add column if not exists quantity_prices jsonb;
alter table public.products add column if not exists minimum_quantity integer not null default 1 check (minimum_quantity > 0);
alter table public.products add column if not exists quote_required boolean not null default false;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='CAR-TS-PREMIUM';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('T-shirt Premium')) > 1 then
     raise exception 'Catalogue ambigu : T-shirt Premium';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('T-shirt Premium');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('CAR-TS-PREMIUM','T-shirt Premium',2100,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=2100, quantity_prices='[{"min": 1, "price": 2100}, {"min": 20, "price": 1950}, {"min": 50, "price": 1750}]'::jsonb,
 minimum_quantity=1,quote_required=false where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='CAR-TS-MEDIUM';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('T-shirt Medium')) > 1 then
     raise exception 'Catalogue ambigu : T-shirt Medium';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('T-shirt Medium');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('CAR-TS-MEDIUM','T-shirt Medium',1950,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=1950, quantity_prices='[{"min": 1, "price": 1950}, {"min": 20, "price": 1750}, {"min": 50, "price": 1550}]'::jsonb,
 minimum_quantity=1,quote_required=false where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='CAR-TS-EVENTS';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('T-shirt Events')) > 1 then
     raise exception 'Catalogue ambigu : T-shirt Events';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('T-shirt Events');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('CAR-TS-EVENTS','T-shirt Events',750,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=750, quantity_prices='[{"min": 50, "price": 750}]'::jsonb,
 minimum_quantity=50,quote_required=false where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='POLO-STD';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('Polo Personnalisé')) > 1 then
     raise exception 'Catalogue ambigu : Polo Personnalisé';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('Polo Personnalisé');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('POLO-STD','Polo Personnalisé',2350,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=2350, quantity_prices='[{"min": 1, "price": 2350}, {"min": 20, "price": 2050}, {"min": 50, "price": 1950}]'::jsonb,
 minimum_quantity=1,quote_required=false where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='CAR-GIL-PREMIUM';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('Gilet Premium')) > 1 then
     raise exception 'Catalogue ambigu : Gilet Premium';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('Gilet Premium');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('CAR-GIL-PREMIUM','Gilet Premium',2750,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=2750, quantity_prices='[{"min": 1, "price": 2750}, {"min": 20, "price": 2550}, {"min": 50, "price": 2350}]'::jsonb,
 minimum_quantity=1,quote_required=false where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='CAR-GIL-MEDIUM';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('Gilet Medium')) > 1 then
     raise exception 'Catalogue ambigu : Gilet Medium';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('Gilet Medium');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('CAR-GIL-MEDIUM','Gilet Medium',2500,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=2500, quantity_prices='[{"min": 1, "price": 2500}, {"min": 20, "price": 2350}, {"min": 50, "price": 2150}]'::jsonb,
 minimum_quantity=1,quote_required=false where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='CAR-CASQUETTE';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('Casquette personnalisée')) > 1 then
     raise exception 'Catalogue ambigu : Casquette personnalisée';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('Casquette personnalisée');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('CAR-CASQUETTE','Casquette personnalisée',1500,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=1500, quantity_prices='[{"min": 1, "price": 1500}, {"min": 20, "price": 1150}, {"min": 50, "price": 950}]'::jsonb,
 minimum_quantity=1,quote_required=false where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='TOTE-STD';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('Tote Bag personnalisé')) > 1 then
     raise exception 'Catalogue ambigu : Tote Bag personnalisé';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('Tote Bag personnalisé');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('TOTE-STD','Tote Bag personnalisé',950,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=950, quantity_prices='[{"min": 1, "price": 950}, {"min": 20, "price": 750}, {"min": 50, "price": 600}]'::jsonb,
 minimum_quantity=1,quote_required=false where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='CAR-GIL-JAUNE';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('Gilet jaune personnalisé')) > 1 then
     raise exception 'Catalogue ambigu : Gilet jaune personnalisé';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('Gilet jaune personnalisé');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('CAR-GIL-JAUNE','Gilet jaune personnalisé',750,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=750, quantity_prices='[{"min": 1, "price": 750}, {"min": 20, "price": 750}, {"min": 50, "price": 750}]'::jsonb,
 minimum_quantity=1,quote_required=false where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='CAR-TABLIER';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('Tablier personnalisé')) > 1 then
     raise exception 'Catalogue ambigu : Tablier personnalisé';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('Tablier personnalisé');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('CAR-TABLIER','Tablier personnalisé',1200,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=1200, quantity_prices='[{"min": 1, "price": 1200}, {"min": 20, "price": 1200}, {"min": 50, "price": 1200}]'::jsonb,
 minimum_quantity=1,quote_required=false where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='CAR-GIL-ROUGE';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('Gilet de travail rouge')) > 1 then
     raise exception 'Catalogue ambigu : Gilet de travail rouge';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('Gilet de travail rouge');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('CAR-GIL-ROUGE','Gilet de travail rouge',0,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=0, quantity_prices='[]'::jsonb,
 minimum_quantity=1,quote_required=true where id=pid;
end $$;
do $$ declare pid uuid; begin
 select id into pid from public.products where sku='CAR-COMBINAISON';
 if pid is null then
   if (select count(*) from public.products where lower(trim(name))=lower('Combinaison de travail')) > 1 then
     raise exception 'Catalogue ambigu : Combinaison de travail';
   end if;
   select id into pid from public.products where lower(trim(name))=lower('Combinaison de travail');
 end if;
 if pid is null then
   insert into public.products(sku,name,sale_price,unit,tax_rate,track_inventory,is_active)
   values('CAR-COMBINAISON','Combinaison de travail',0,'unité',0,true,true) returning id into pid;
 end if;
 update public.products set sale_price=0, quantity_prices='[]'::jsonb,
 minimum_quantity=1,quote_required=true where id=pid;
end $$;
