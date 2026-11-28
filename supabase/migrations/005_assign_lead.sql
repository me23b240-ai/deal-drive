create or replace function public.assign_lead(p_candidate uuid, p_owner uuid, p_bet text)
returns uuid language plpgsql as $f$
declare
  c lead_candidates%rowtype;
  v_init uuid;
  v_brand uuid;
  v_fest uuid;
  v_comm numeric := 0;
begin
  select * into c from lead_candidates where id = p_candidate for update;
  if not found then raise exception 'Lead not found'; end if;
  if c.status <> 'new' then raise exception 'This lead is already %', c.status; end if;
  if not exists (select 1 from team_members where id = p_owner and event_id = c.event_id and role = 'member') then
    raise exception 'Unknown coordinator';
  end if;
  select id into v_init from campaigns where event_id = c.event_id and kind = 'initiative' and source_id = p_bet;
  if c.peer_sponsor_id is not null then
    select peer_fest_id into v_fest from peer_fest_sponsors where id = c.peer_sponsor_id;
  end if;
  if c.source_channel = 'agency' or c.signal_tag = 'agency' then v_comm := 15; end if;

  insert into brands(event_id, name, industry, sector, owner_id, crm_status, source_channel, signal_tag,
                     initiative_id, agency_commission_pct, peer_fest_id, peer_sponsor_id)
  values (c.event_id, c.brand_name, c.sector, c.sector, p_owner, 'to_contact', c.source_channel, c.signal_tag,
          v_init, v_comm, v_fest, c.peer_sponsor_id)
  returning id into v_brand;

  if c.contact_name is not null or c.contact_email is not null then
    insert into contacts(brand_id, name, job_title, email)
    values (v_brand, coalesce(c.contact_name, 'Contact'), c.contact_title, c.contact_email);
  end if;

  update lead_candidates set status = 'assigned', assigned_brand_id = v_brand where id = c.id;
  return v_brand;
end $f$;

notify pgrst, 'reload schema';