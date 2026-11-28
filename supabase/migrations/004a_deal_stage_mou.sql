-- Run this file ALONE first. The new enum value cannot be used until it is committed.
alter type deal_stage add value if not exists 'mou_sent' before 'partner_confirmed';
notify pgrst, 'reload schema';