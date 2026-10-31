-- Beast Royale Clash schema (optional persistent layer).
-- Apply in the Supabase SQL editor or CLI. Enable Realtime on rooms/matches if used.
-- The live Node game server remains authoritative for combat.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  nickname text not null check (char_length(nickname) between 2 and 18),
  is_guest boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists player_stats (
  player_id uuid primary key references profiles(id) on delete cascade,
  matches_played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  kills int not null default 0,
  damage_dealt int not null default 0,
  damage_taken int not null default 0,
  specials_used int not null default 0,
  rounds_survived int not null default 0,
  best_placement int not null default 99,
  win_streak int not null default 0,
  best_win_streak int not null default 0,
  xp int not null default 0,
  level int not null default 1,
  cosmetics text[] not null default array['frame_thorn','title_cub'],
  equipped_frame text not null default 'frame_thorn',
  equipped_title text not null default 'title_cub',
  updated_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid not null references profiles(id),
  status text not null default 'lobby',
  settings jsonb not null default '{}',
  match_id uuid,
  spectators_allowed boolean not null default true,
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now()
);

create table if not exists room_members (
  room_id uuid references rooms(id) on delete cascade,
  player_id uuid references profiles(id) on delete cascade,
  nickname text not null,
  is_host boolean not null default false,
  is_spectator boolean not null default false,
  ready boolean not null default false,
  animal_id text,
  team_id text,
  connected boolean not null default true,
  last_seen timestamptz not null default now(),
  primary key (room_id, player_id)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  mode text not null,
  seed bigint not null,
  result text not null default 'none',
  winner_ids uuid[] not null default '{}',
  state jsonb not null default '{}',
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists match_participants (
  match_id uuid references matches(id) on delete cascade,
  player_id uuid references profiles(id),
  animal_id text not null,
  team_id text,
  kills int not null default 0,
  damage_dealt int not null default 0,
  placement int,
  xp_awarded int not null default 0,
  awarded boolean not null default false,
  primary key (match_id, player_id)
);

create table if not exists submitted_actions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  round int not null,
  player_id uuid not null,
  action_id text not null,
  payload jsonb not null,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (match_id, round, action_id)
);

create table if not exists round_results (
  match_id uuid references matches(id) on delete cascade,
  round int not null,
  recap jsonb not null,
  resolved_at timestamptz not null default now(),
  primary key (match_id, round)
);

create table if not exists alliances (
  match_id uuid references matches(id) on delete cascade,
  a uuid not null,
  b uuid not null,
  active boolean not null default false,
  primary key (match_id, a, b)
);

create table if not exists status_effects (
  match_id uuid not null,
  player_id uuid not null,
  status_id text not null,
  duration int not null,
  stacks int not null default 1,
  primary key (match_id, player_id, status_id)
);

create table if not exists loot_inventory (
  match_id uuid not null,
  player_id uuid not null,
  item_id text not null,
  charges int not null default 1,
  primary key (match_id, player_id, item_id)
);

create table if not exists battle_logs (
  id bigint generated always as identity primary key,
  match_id uuid not null,
  round int not null,
  kind text not null,
  body text not null,
  private_to uuid[],
  created_at timestamptz not null default now()
);

create table if not exists daily_challenges (
  id text primary key,
  day date not null,
  title text not null,
  metric text not null,
  target int not null,
  xp int not null
);

create table if not exists challenge_progress (
  player_id uuid references profiles(id) on delete cascade,
  challenge_id text references daily_challenges(id) on delete cascade,
  progress int not null default 0,
  completed boolean not null default false,
  primary key (player_id, challenge_id)
);

create table if not exists match_awards (
  match_id uuid not null,
  player_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

create index if not exists rooms_activity_idx on rooms (last_activity);
create index if not exists matches_room_idx on matches (room_id);
create index if not exists stats_wins_idx on player_stats (wins desc);
create index if not exists stats_kills_idx on player_stats (kills desc);
create index if not exists stats_xp_idx on player_stats (xp desc);

alter table profiles enable row level security;
alter table player_stats enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table matches enable row level security;
alter table match_participants enable row level security;
alter table submitted_actions enable row level security;
alter table round_results enable row level security;
alter table alliances enable row level security;
alter table status_effects enable row level security;
alter table loot_inventory enable row level security;
alter table battle_logs enable row level security;
alter table daily_challenges enable row level security;
alter table challenge_progress enable row level security;
alter table match_awards enable row level security;

-- Hidden moves: clients cannot select submitted_actions.
create policy "no client actions" on submitted_actions for all using (false) with check (false);

create policy "public leaderboard stats" on player_stats for select using (true);
create policy "own profile" on profiles for select using (auth.uid() = user_id or is_guest);
create policy "own stats update via server" on player_stats for all using (false) with check (false);
create policy "read public rooms" on rooms for select using (true);
create policy "read members" on room_members for select using (true);
create policy "read match public" on matches for select using (true);
create policy "read participants" on match_participants for select using (true);
create policy "read recap" on round_results for select using (true);
create policy "read public logs" on battle_logs for select using (private_to is null or auth.uid() = any (private_to));
create policy "read challenges" on daily_challenges for select using (true);
create policy "own challenge progress" on challenge_progress for select using (
  player_id in (select id from profiles where user_id = auth.uid())
);

-- Cleanup abandoned rooms (run via cron / nightly)
-- delete from rooms where last_activity < now() - interval '45 minutes' and status in ('lobby','ended');
