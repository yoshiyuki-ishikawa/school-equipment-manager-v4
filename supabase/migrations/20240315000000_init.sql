-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 1. School (学校)
create table public.schools (
  id uuid primary key default uuid_generate_v4(),
  name varchar not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Location (設置場所)
create table public.locations (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name varchar not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Equipment (備品台帳)
create table public.equipments (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references public.schools(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  asset_id varchar not null,
  name varchar not null,
  status varchar not null default 'in_use',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(school_id, asset_id)
);

-- 4. Inspection (点検履歴)
create table public.inspections (
  id uuid primary key default uuid_generate_v4(),
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  inspected_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Row Level Security (RLS) Setup
alter table public.schools enable row level security;
alter table public.locations enable row level security;
alter table public.equipments enable row level security;
alter table public.inspections enable row level security;

-- Policies (Simplified for MVP: Allow all for authenticated users)
-- 本来は user_id に紐づく school_id や jwt claim の制約を組み込みますが、
-- 初期実装を最速・最小で動かすため全認証済みユーザーに一時許可します。
create policy "Enable all access for authenticated users on schools" on public.schools for all to authenticated using (true) with check (true);
create policy "Enable all access for authenticated users on locations" on public.locations for all to authenticated using (true) with check (true);
create policy "Enable all access for authenticated users on equipments" on public.equipments for all to authenticated using (true) with check (true);
create policy "Enable all access for authenticated users on inspections" on public.inspections for all to authenticated using (true) with check (true);

-- Insert Dummy Data for Development
insert into public.schools (id, name) values ('00000000-0000-0000-0000-111111111111', 'テスト第一小学校');

insert into public.locations (id, school_id, name) values 
('00000000-0000-0000-0000-222222222222', '00000000-0000-0000-0000-111111111111', '理科室'),
('00000000-0000-0000-0000-222222222223', '00000000-0000-0000-0000-111111111111', '職員室');

insert into public.equipments (id, school_id, location_id, asset_id, name, status) values 
('00000000-0000-0000-0000-333333333333', '00000000-0000-0000-0000-111111111111', '00000000-0000-0000-0000-222222222222', 'A1001', '上皿天秤', 'in_use'),
('00000000-0000-0000-0000-333333333334', '00000000-0000-0000-0000-111111111111', '00000000-0000-0000-0000-222222222223', 'B2005', '執務机', 'in_use');
