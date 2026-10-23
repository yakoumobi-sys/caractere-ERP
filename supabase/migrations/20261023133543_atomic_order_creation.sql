-- One transaction for client, order, lines, print instructions and initial receipt.
-- INVOKER: existing RLS and financial guards continue to apply.
alter table public.pipeline_orders add column if not exists creation_request_id uuid unique;
alter table public.pipeline_orders add column if not exists creation_payload jsonb;
create or replace function public.create_pipeline_order_atomic(p_request_id uuid, p_payload jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_contact uuid; v_existing jsonb; v_total numeric; v_payment numeric;
 v_item jsonb; v_product public.products; v_qty numeric; v_position integer := 0; v_tech text;
begin
 if auth.uid() is null or not public.is_active_user() or public.current_role() not in ('admin','manager','sales','accounting','atelier') then
   raise exception 'Accès refusé';
 end if;
 if p_request_id is null then raise exception 'Identifiant de requête requis'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select id,creation_payload into v_id,v_existing from public.pipeline_orders where creation_request_id=p_request_id and created_by=auth.uid();
 if found then
   if v_existing is distinct from p_payload then raise exception 'Cette requête a déjà créé une autre commande'; end if;
   return v_id;
 end if;
 v_total := (p_payload->>'order_total')::numeric;
 v_payment := coalesce((p_payload->>'initial_payment')::numeric,0);
 if v_total is null or v_total <= 0 or v_total::text in ('NaN','Infinity','-Infinity') or v_payment < 0 or v_payment > v_total or v_payment::text in ('NaN','Infinity','-Infinity') then
   raise exception 'Montant ou versement invalide';
 end if;
 if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')=0 then raise exception 'Articles requis'; end if;
 v_tech := p_payload->>'technique';
 if v_tech is null or v_tech not in ('dtf','broderie','aucune') then raise exception 'Technique invalide'; end if;
 for v_item in select value from jsonb_array_elements(p_payload->'items') loop
   v_qty := (v_item->>'quantity')::numeric;
   if coalesce(trim(v_item->>'product_name'),'')='' or v_qty is null or v_qty<=0 or v_qty<>trunc(v_qty) or v_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'Article ou quantité invalide'; end if;
   if nullif(v_item->>'product_id','') is not null then
     select * into v_product from public.products where id=(v_item->>'product_id')::uuid and is_active;
     if not found then raise exception 'Article catalogue indisponible'; end if;
     select sum((value->>'quantity')::numeric) into v_qty from jsonb_array_elements(p_payload->'items') where value->>'product_id'=v_item->>'product_id';
     if v_qty < v_product.minimum_quantity then raise exception 'Minimum % pièces pour %',v_product.minimum_quantity,v_product.name; end if;
   end if;
 end loop;
 if p_payload->>'client_mode'='new' then
   if coalesce(trim(p_payload->>'client_new_name'),'')='' then raise exception 'Nom client requis'; end if;
   insert into public.contacts(name,phone,type) values(trim(p_payload->>'client_new_name'),nullif(p_payload->>'client_new_phone',''),coalesce(nullif(p_payload->>'client_new_type',''),'client')::public.contact_type) returning id into v_contact;
 else
   v_contact := nullif(p_payload->>'contact_id','')::uuid;
   if v_contact is null then raise exception 'Client requis'; end if;
 end if;
 insert into public.pipeline_orders(contact_id,description,technique,logo_placement,logo_placement_note,logo_source,logo_source_value,requires_flocage,order_total,initial_payment,payment_status,status,created_by,creation_request_id,creation_payload)
 values(v_contact,p_payload->>'description',v_tech,p_payload->>'logo_placement',p_payload->>'logo_placement_note',p_payload->>'logo_source',p_payload->>'logo_source_value',coalesce((p_payload->>'requires_flocage')::boolean,false),v_total,v_payment,'unpaid',case v_tech when 'dtf' then 'attente_dtf' when 'broderie' then 'attente_broderie' else 'attente_gros' end,auth.uid(),p_request_id,p_payload) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_payload->'items') loop
   insert into public.pipeline_order_items(pipeline_order_id,product_id,product_name,color,size,quantity,position)
   values(v_id,nullif(v_item->>'product_id','')::uuid,trim(v_item->>'product_name'),nullif(v_item->>'color',''),nullif(v_item->>'size',''),(v_item->>'quantity')::numeric,v_position);
   v_position := v_position+1;
 end loop;
 v_position := 0;
 for v_item in select value from jsonb_array_elements(coalesce(p_payload->'prints','[]')) loop
   insert into public.pipeline_order_prints(pipeline_order_id,placement,size_cm,text_content,position)
   values(v_id,v_item->>'placement',v_item->>'size_cm',v_item->>'text_content',v_position);
   v_position := v_position+1;
 end loop;
 if v_payment > 0 then
   insert into public.order_payments(pipeline_order_id,amount,payment_method,notes,recorded_by,request_id)
   values(v_id,v_payment,'cash','Versement initial',auth.uid(),p_request_id);
 end if;
 return v_id;
end $$;
revoke all on function public.create_pipeline_order_atomic(uuid,jsonb) from public,anon;
grant execute on function public.create_pipeline_order_atomic(uuid,jsonb) to authenticated;
