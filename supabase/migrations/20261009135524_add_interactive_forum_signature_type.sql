alter table public.profiles
  add column if not exists signature_type text not null default 'image';

alter table public.profiles
  drop constraint if exists profiles_signature_type_check;

alter table public.profiles
  add constraint profiles_signature_type_check
  check (signature_type in ('image','interactive'));

update public.profiles
set signature_type = 'image'
where signature_type is null
   or signature_type not in ('image','interactive');
