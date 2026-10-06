-- SporTakip AI — veritabanı şeması (yalnızca yapı, veri içermez)
-- Supabase / PostgreSQL 17

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ============================================================
-- Tablolar
-- ============================================================

create table public.profiles (
  id uuid not null,
  phone_e164 text not null,
  full_name text,
  timezone text default 'Europe/Istanbul' not null,
  calorie_goal integer default 2600 not null,
  protein_goal integer default 200 not null,
  carbs_goal integer default 280 not null,
  fat_goal integer default 80 not null,
  current_weight numeric(5,2),
  height integer,
  goal text,
  activity_level text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  water_goal_ml integer default 2500,
  onboarding_step integer default -1 not null,
  supplements text,
  training_program text,
  cardio_activity text,
  daily_message_count integer default 0,
  daily_message_date date,
  program_start_date date,
  program_cycle_length integer,
  age integer,
  height_cm numeric,
  gender text,
  activity_multiplier numeric,
  goal_type text,
  daily_research_count integer default 0,
  daily_research_date date,
  plan text default 'free' not null,
  premium_until date,
  daily_photo_count integer default 0 not null,
  daily_photo_date date,
  delete_requested_at timestamptz,
  pending_meal jsonb,
  pending_meal_at timestamptz,
  pending_action jsonb,
  pending_action_at timestamptz,
  constraint profiles_pkey primary key (id),
  constraint profiles_phone_e164_key unique (phone_e164),
  constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade,
  constraint profiles_activity_level_check check (activity_level in ('sedanter','hafif_aktif','orta_aktif','cok_aktif')),
  constraint profiles_goal_check check (goal in ('lose_weight','maintain','gain_muscle')),
  constraint profiles_plan_check check (plan in ('free','premium')),
  constraint profiles_calorie_goal_check check (calorie_goal > 0),
  constraint profiles_protein_goal_check check (protein_goal > 0),
  constraint profiles_carbs_goal_check check (carbs_goal > 0),
  constraint profiles_fat_goal_check check (fat_goal > 0),
  constraint profiles_current_weight_check check (current_weight > 0),
  constraint profiles_height_check check (height > 0)
);

create table public.foods (
  id uuid default gen_random_uuid() not null,
  name text not null,
  name_search text,
  brand text,
  category text,
  calories_per_100g numeric(8,2) not null,
  protein_per_100g numeric(8,2) default 0 not null,
  carbs_per_100g numeric(8,2) default 0 not null,
  fat_per_100g numeric(8,2) default 0 not null,
  fiber_per_100g numeric(8,2) default 0 not null,
  source text default 'local_db' not null,
  is_verified boolean default false not null,
  user_id uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint foods_pkey primary key (id),
  constraint foods_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint foods_calories_per_100g_check check (calories_per_100g >= 0),
  constraint foods_protein_per_100g_check check (protein_per_100g >= 0),
  constraint foods_carbs_per_100g_check check (carbs_per_100g >= 0),
  constraint foods_fat_per_100g_check check (fat_per_100g >= 0),
  constraint foods_fiber_per_100g_check check (fiber_per_100g >= 0),
  constraint foods_source_check check (source in ('local_db','usda','manual','ai_estimate'))
);

create table public.food_portions (
  id uuid default gen_random_uuid() not null,
  food_id uuid not null,
  unit_name text not null,
  grams numeric(8,2) not null,
  notes text,
  created_at timestamptz default now() not null,
  constraint food_portions_pkey primary key (id),
  constraint food_portions_food_id_unit_name_key unique (food_id, unit_name),
  constraint food_portions_food_id_fkey foreign key (food_id) references public.foods(id) on delete cascade,
  constraint food_portions_grams_check check (grams > 0)
);

create table public.meals (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  meal_type text not null,
  local_date date not null,
  total_calories numeric(8,2) default 0 not null,
  total_protein numeric(8,2) default 0 not null,
  total_carbs numeric(8,2) default 0 not null,
  total_fat numeric(8,2) default 0 not null,
  notes text,
  source text default 'whatsapp' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint meals_pkey primary key (id),
  constraint meals_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint meals_meal_type_check check (meal_type in ('breakfast','lunch','dinner','snack','drink')),
  constraint meals_source_check check (source in ('whatsapp','dashboard','api'))
);

create table public.meal_items (
  id uuid default gen_random_uuid() not null,
  meal_id uuid not null,
  food_id uuid,
  food_name_snapshot text not null,
  quantity numeric(8,2) not null,
  unit text not null,
  grams_resolved numeric(8,2) not null,
  calories numeric(8,2) not null,
  protein numeric(8,2) not null,
  carbs numeric(8,2) not null,
  fat numeric(8,2) not null,
  confidence text default 'high' not null,
  created_at timestamptz default now() not null,
  constraint meal_items_pkey primary key (id),
  constraint meal_items_meal_id_fkey foreign key (meal_id) references public.meals(id) on delete cascade,
  constraint meal_items_food_id_fkey foreign key (food_id) references public.foods(id) on delete set null,
  constraint meal_items_quantity_check check (quantity > 0),
  constraint meal_items_grams_resolved_check check (grams_resolved > 0),
  constraint meal_items_calories_check check (calories >= 0),
  constraint meal_items_protein_check check (protein >= 0),
  constraint meal_items_carbs_check check (carbs >= 0),
  constraint meal_items_fat_check check (fat >= 0),
  constraint meal_items_confidence_check check (confidence in ('high','medium','low'))
);

create table public.message_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  whatsapp_message_id text not null,
  direction text not null,
  message_type text,
  raw_message jsonb,
  intent text,
  processed boolean default false not null,
  error text,
  created_at timestamptz default now() not null,
  constraint message_logs_pkey primary key (id),
  constraint message_logs_whatsapp_message_id_key unique (whatsapp_message_id),
  constraint message_logs_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint message_logs_direction_check check (direction in ('inbound','outbound'))
);

create table public.weight_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  weight numeric(5,2) not null,
  local_date date not null,
  notes text,
  created_at timestamptz default now() not null,
  constraint weight_logs_pkey primary key (id),
  constraint weight_logs_user_id_local_date_key unique (user_id, local_date),
  constraint weight_logs_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint weight_logs_weight_check check (weight > 0 and weight < 500)
);

create table public.water_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  amount_ml integer not null,
  local_date date not null,
  source text default 'whatsapp',
  created_at timestamptz default now() not null,
  constraint water_logs_pkey primary key (id),
  constraint water_logs_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint water_logs_amount_ml_check check (amount_ml > 0)
);

create table public.supplement_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  supplement_name text not null,
  amount text,
  local_date date not null,
  taken_at timestamptz default now() not null,
  source text default 'whatsapp',
  created_at timestamptz default now() not null,
  constraint supplement_logs_pkey primary key (id),
  constraint supplement_logs_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table public.workout_sessions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  local_date date not null,
  session_type text default 'weights',
  notes text,
  source text default 'whatsapp',
  created_at timestamptz default now() not null,
  constraint workout_sessions_pkey primary key (id),
  constraint workout_sessions_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table public.workout_exercises (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  exercise_name text not null,
  sets integer,
  reps text,
  weight_kg numeric,
  duration_min integer,
  notes text,
  calories_burned numeric,
  created_at timestamptz default now() not null,
  constraint workout_exercises_pkey primary key (id),
  constraint workout_exercises_session_id_fkey foreign key (session_id) references public.workout_sessions(id) on delete cascade
);

create table public.workout_programs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  day_number integer not null,
  day_label text not null,
  exercises jsonb default '[]'::jsonb not null,
  created_at timestamptz default now(),
  constraint workout_programs_pkey primary key (id),
  constraint workout_programs_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table public.body_measurements (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  local_date date not null,
  waist_cm numeric,
  chest_cm numeric,
  arm_cm numeric,
  created_at timestamptz default now() not null,
  constraint body_measurements_pkey primary key (id),
  constraint body_measurements_user_id_local_date_key unique (user_id, local_date),
  constraint body_measurements_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

-- ============================================================
-- İndeksler
-- ============================================================

create index idx_foods_name_trgm on public.foods using gin (name_search gin_trgm_ops);
create index idx_foods_user_id on public.foods (user_id) where user_id is not null;
create index idx_meals_user_date on public.meals (user_id, local_date);
create index idx_meal_items_meal_id on public.meal_items (meal_id);
create index idx_message_logs_unprocessed on public.message_logs (created_at) where processed = false;
create index idx_weight_user_date on public.weight_logs (user_id, local_date);
create index idx_water_logs_user_date on public.water_logs (user_id, local_date);
create index idx_supplement_logs_user_date on public.supplement_logs (user_id, local_date);
create index idx_workout_sessions_user_date on public.workout_sessions (user_id, local_date);
create index idx_workout_exercises_session on public.workout_exercises (session_id);
create index idx_body_measurements_user_date on public.body_measurements (user_id, local_date);

-- ============================================================
-- View'lar
-- ============================================================

create or replace view public.v_daily_totals as
select user_id,
       local_date,
       coalesce(sum(total_calories), 0)::numeric(10,2) as total_calories,
       coalesce(sum(total_protein), 0)::numeric(10,2)  as total_protein,
       coalesce(sum(total_carbs), 0)::numeric(10,2)    as total_carbs,
       coalesce(sum(total_fat), 0)::numeric(10,2)      as total_fat,
       count(*)::integer                               as meal_count
from public.meals
group by user_id, local_date;

create or replace view public.v_daily_water as
select user_id,
       local_date,
       sum(amount_ml) as total_ml,
       count(*)       as log_count
from public.water_logs
group by user_id, local_date;

-- ============================================================
-- Fonksiyonlar
-- ============================================================

-- Türkçe karakter ve kesme işaretlerinden arındırılmış arama alanı
create or replace function public.fn_foods_set_name_search()
returns trigger language plpgsql as $$
begin
  new.name_search := regexp_replace(lower(unaccent(new.name)), '[''’`´]', '', 'g');
  return new;
end;
$$;

create or replace function public.fn_update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigram tabanlı, sıralaması ayarlanmış besin arama
create or replace function public.search_food(search_term text, user_id_param uuid default null)
returns table(id uuid, name text, calories_per_100g numeric, protein_per_100g numeric,
              carbs_per_100g numeric, fat_per_100g numeric, fiber_per_100g numeric, user_id uuid)
language sql stable as $$
  with t as (
    select
      regexp_replace(lower(unaccent(search_term)), '[''’`´]', '', 'g') as term,
      regexp_replace(regexp_replace(lower(unaccent(search_term)), '[''’`´]', '', 'g'),
                     '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') as rx
  )
  select f.id, f.name, f.calories_per_100g, f.protein_per_100g,
         f.carbs_per_100g, f.fat_per_100g, f.fiber_per_100g, f.user_id
  from public.foods f, t
  where (f.user_id is null or f.user_id = user_id_param)
    and (f.name_search % t.term or f.name_search ilike '%' || t.term || '%')
  order by
    case when f.user_id = user_id_param then 0 else 1 end,
    case
      when f.name_search = t.term then 0
      when f.name_search ~ ('^' || t.rx || '([^a-z0-9]|$)') then 1
      when f.name_search like t.term || '%' then 2
      when f.name_search ~ ('\m' || t.rx || '\M') then 3
      else 4
    end,
    similarity(f.name_search, t.term) desc
  limit 5;
$$;

create or replace function public.get_food_portion(food_id_param uuid, unit_name_param text)
returns numeric language sql stable as $$
  select grams from public.food_portions
  where food_id = food_id_param and lower(unit_name) = lower(unit_name_param)
  limit 1;
$$;

create or replace function public.find_user_by_phone(phone text)
returns table(user_id uuid, calorie_goal integer, protein_goal integer)
language sql stable as $$
  select id, calorie_goal, protein_goal from public.profiles where phone_e164 = phone limit 1;
$$;

create or replace function public.try_decode_base64(p text)
returns bytea language plpgsql immutable as $$
begin
  return decode(p, 'base64');
exception when others then
  return null;
end $$;

-- Hesap silme akışı: kullanıcının mesaj loglarını temizler (yalnızca service role)
create or replace function public.delete_message_logs_for_phone(p_phone text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_count integer;
begin
  if length(v_digits) < 10 then
    return 0;
  end if;
  delete from public.message_logs
  where whatsapp_message_id like 'wamid.%'
    and position(convert_to(v_digits, 'UTF8')
                 in coalesce(public.try_decode_base64(substring(whatsapp_message_id from 7)), ''::bytea)) > 0;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Hesap silme akışı için (yalnızca service role)
create or replace function public.get_auth_user_id_by_email(p_email text)
returns uuid language sql security definer set search_path to 'auth', 'public' as $$
  select id from auth.users where email = p_email limit 1
$$;

revoke execute on function public.delete_message_logs_for_phone(text) from public, anon, authenticated;
revoke execute on function public.get_auth_user_id_by_email(text) from public, anon, authenticated;

-- ============================================================
-- Trigger'lar
-- ============================================================

create trigger trg_foods_name_search before insert or update of name on public.foods
  for each row execute function public.fn_foods_set_name_search();
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.fn_update_updated_at();
create trigger trg_foods_updated_at before update on public.foods
  for each row execute function public.fn_update_updated_at();
create trigger trg_meals_updated_at before update on public.meals
  for each row execute function public.fn_update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles          enable row level security;
alter table public.foods             enable row level security;
alter table public.food_portions     enable row level security;
alter table public.meals             enable row level security;
alter table public.meal_items        enable row level security;
alter table public.message_logs      enable row level security;
alter table public.weight_logs       enable row level security;
alter table public.water_logs        enable row level security;
alter table public.supplement_logs   enable row level security;
alter table public.workout_sessions  enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_programs  enable row level security;
alter table public.body_measurements enable row level security;

create policy "profiles: kendi profilini gör" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: kendi profilini güncelle" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "foods: global ve kendi ürünlerini gör" on public.foods
  for select using (user_id is null or user_id = auth.uid());
create policy "foods: kişisel ürün ekle" on public.foods
  for insert with check (user_id = auth.uid());
create policy "foods: kendi ürününü güncelle" on public.foods
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "foods: kendi ürününü sil" on public.foods
  for delete using (user_id = auth.uid());

create policy "food_portions: ilgili porsiyonları gör" on public.food_portions
  for select using (exists (select 1 from public.foods f
    where f.id = food_portions.food_id and (f.user_id is null or f.user_id = auth.uid())));
create policy "food_portions: kendi ürününe porsiyon ekle" on public.food_portions
  for insert with check (exists (select 1 from public.foods f
    where f.id = food_portions.food_id and f.user_id = auth.uid()));
create policy "food_portions: kendi ürününün porsiyonunu sil" on public.food_portions
  for delete using (exists (select 1 from public.foods f
    where f.id = food_portions.food_id and f.user_id = auth.uid()));

create policy "meals: sadece kendi öğünleri" on public.meals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meal_items: kendi öğünlerinin öğeleri" on public.meal_items
  for all using (exists (select 1 from public.meals m where m.id = meal_items.meal_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.meals m where m.id = meal_items.meal_id and m.user_id = auth.uid()));

create policy "message_logs: kendi mesajlarını gör" on public.message_logs
  for select using (user_id = auth.uid());

create policy "weight_logs: sadece kendi kilo kayıtları" on public.weight_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users can view own water logs" on public.water_logs
  for select using (auth.uid() = user_id);
create policy "Users can insert own water logs" on public.water_logs
  for insert with check (auth.uid() = user_id);

create policy "Users can view own supplement logs" on public.supplement_logs
  for select using (auth.uid() = user_id);
create policy "Users can insert own supplement logs" on public.supplement_logs
  for insert with check (auth.uid() = user_id);

create policy "Users can view own workout sessions" on public.workout_sessions
  for select using (auth.uid() = user_id);
create policy "Users can insert own workout sessions" on public.workout_sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can view own workout exercises" on public.workout_exercises
  for select using (exists (select 1 from public.workout_sessions ws
    where ws.id = workout_exercises.session_id and ws.user_id = auth.uid()));
create policy "Users can insert own workout exercises" on public.workout_exercises
  for insert with check (exists (select 1 from public.workout_sessions ws
    where ws.id = workout_exercises.session_id and ws.user_id = auth.uid()));

create policy "body_measurements: sadece kendi ölçümleri" on public.body_measurements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
