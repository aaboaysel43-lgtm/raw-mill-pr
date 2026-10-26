-- Raw Mill PR: run this once in Supabase SQL Editor AFTER the initial schema and CSV import.
-- This grants authenticated users access. Create only trusted users in Supabase Authentication.
-- Do not enable public sign-up unless you intentionally want open registration.

begin;

-- Protect every table with RLS; allow signed-in users only.
drop policy if exists "authenticated read spare parts" on public.spare_parts;
create policy "authenticated read spare parts" on public.spare_parts
for select to authenticated using (true);
drop policy if exists "authenticated insert spare parts" on public.spare_parts;
create policy "authenticated insert spare parts" on public.spare_parts
for insert to authenticated with check (true);
drop policy if exists "authenticated update spare parts" on public.spare_parts;
create policy "authenticated update spare parts" on public.spare_parts
for update to authenticated using (true) with check (true);

drop policy if exists "authenticated read movements" on public.stock_movements;
create policy "authenticated read movements" on public.stock_movements
for select to authenticated using (true);
drop policy if exists "authenticated insert movements" on public.stock_movements;
create policy "authenticated insert movements" on public.stock_movements
for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "authenticated read requests" on public.pr_requests;
create policy "authenticated read requests" on public.pr_requests
for select to authenticated using (true);
drop policy if exists "authenticated insert requests" on public.pr_requests;
create policy "authenticated insert requests" on public.pr_requests
for insert to authenticated with check (requested_by = auth.uid());
drop policy if exists "authenticated update requests" on public.pr_requests;
create policy "authenticated update requests" on public.pr_requests
for update to authenticated using (true) with check (true);
drop policy if exists "authenticated delete requests" on public.pr_requests;
create policy "authenticated delete requests" on public.pr_requests
for delete to authenticated using (true);

drop policy if exists "authenticated read request items" on public.pr_request_items;
create policy "authenticated read request items" on public.pr_request_items
for select to authenticated using (true);
drop policy if exists "authenticated insert request items" on public.pr_request_items;
create policy "authenticated insert request items" on public.pr_request_items
for insert to authenticated with check (exists (
  select 1 from public.pr_requests r
  where r.id = request_id and r.requested_by = auth.uid()
));
drop policy if exists "authenticated update request items" on public.pr_request_items;
create policy "authenticated update request items" on public.pr_request_items
for update to authenticated using (true) with check (true);
drop policy if exists "authenticated delete request items" on public.pr_request_items;
create policy "authenticated delete request items" on public.pr_request_items
for delete to authenticated using (exists (
  select 1 from public.pr_requests r
  where r.id = request_id and r.requested_by = auth.uid()
));

commit;
