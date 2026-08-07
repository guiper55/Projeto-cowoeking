-- ===================================================================
-- Agenda de Consultório — Schema completo (estado final)
-- Use este único script para configurar o banco de dados de um
-- cliente NOVO. Cole no SQL Editor do Supabase e clique em "Run".
-- (Não é necessário rodar schema.sql + migration_2/3/4 separadamente
-- — este arquivo já reúne o resultado final de todos eles.)
-- ===================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- PERFIS (psicólogos e administradores, ligados ao login do Supabase)
-- ---------------------------------------------------------------
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel text not null check (papel in ('psicologo','admin')) default 'psicologo',
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- SALAS
-- Ajuste os valores abaixo conforme o número de salas do cliente
-- ---------------------------------------------------------------
create table salas (
  id text primary key,
  nome text not null
);
insert into salas (id, nome) values ('sala1','Sala 1'), ('sala2','Sala 2');

-- ---------------------------------------------------------------
-- CONFIGURAÇÕES (valor da hora/reserva)
-- Ajuste o valor inicial conforme combinado com o cliente
-- ---------------------------------------------------------------
create table configuracoes (
  chave text primary key,
  valor numeric not null
);
insert into configuracoes (chave, valor) values ('valor_hora', 80);

-- ---------------------------------------------------------------
-- RESERVAS
-- ---------------------------------------------------------------
create table reservas (
  id uuid primary key default gen_random_uuid(),
  psicologo_id uuid not null references perfis(id) on delete cascade,
  sala_id text not null references salas(id),
  data date not null,
  hora int not null check (hora between 0 and 23),
  valor_hora numeric not null,
  criado_em timestamptz not null default now(),
  unique (sala_id, data, hora)
);

-- ---------------------------------------------------------------
-- BLOQUEIOS PONTUAIS (um horário específico, único ou recorrente semanal)
-- ---------------------------------------------------------------
create table bloqueios (
  id uuid primary key default gen_random_uuid(),
  sala_id text not null references salas(id),
  data date not null,
  hora int not null check (hora between 0 and 23),
  motivo text,
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now(),
  unique (sala_id, data, hora)
);

-- ---------------------------------------------------------------
-- BLOQUEIOS POR PERÍODO (dia inteiro ou horário específico;
-- todos os dias do período, ou só um dia da semana recorrente)
-- ---------------------------------------------------------------
create table bloqueios_periodo (
  id uuid primary key default gen_random_uuid(),
  sala_id text not null references salas(id),
  data_inicio date not null,
  data_fim date,                 -- null = até ser desbloqueado
  recorrencia text not null default 'diario' check (recorrencia in ('diario','semanal')),
  hora_inicio int check (hora_inicio between 0 and 23),   -- null junto com hora_fim = dia inteiro
  hora_fim int check (hora_fim between 0 and 23),
  motivo text,
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- FUNÇÕES AUXILIARES
-- ---------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql security definer set search_path = public
as $$
  select exists (select 1 from perfis where id = auth.uid() and papel = 'admin');
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', 'Sem nome'),
    coalesce(new.raw_user_meta_data->>'papel', 'psicologo')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------
-- SEGURANÇA (RLS)
-- ---------------------------------------------------------------
alter table perfis enable row level security;
alter table salas enable row level security;
alter table configuracoes enable row level security;
alter table reservas enable row level security;
alter table bloqueios enable row level security;
alter table bloqueios_periodo enable row level security;

create policy "ver perfis" on perfis for select using (auth.role() = 'authenticated');
create policy "admin altera perfis" on perfis for update using (is_admin());

create policy "ver salas" on salas for select using (auth.role() = 'authenticated');

create policy "ver configuracoes" on configuracoes for select using (auth.role() = 'authenticated');
create policy "admin altera configuracoes" on configuracoes for update using (is_admin());

create policy "ver reservas" on reservas for select using (auth.role() = 'authenticated');

create policy "criar minha reserva" on reservas
for insert with check (
  auth.uid() = psicologo_id
  and not exists (
    select 1 from bloqueios b
    where b.sala_id = reservas.sala_id and b.data = reservas.data and b.hora = reservas.hora
  )
  and not exists (
    select 1 from bloqueios_periodo p
    where p.sala_id = reservas.sala_id
      and reservas.data >= p.data_inicio
      and (p.data_fim is null or reservas.data <= p.data_fim)
      and (p.recorrencia = 'diario' or extract(dow from reservas.data) = extract(dow from p.data_inicio))
      and (
        (p.hora_inicio is null and p.hora_fim is null)
        or (reservas.hora between p.hora_inicio and p.hora_fim)
      )
  )
);

create policy "cancelar reserva" on reservas
for delete using (
  (
    auth.uid() = psicologo_id
    and (data::timestamp + make_interval(hours => hora)) - now() > interval '24 hours'
  )
  or is_admin()
);

create policy "ver bloqueios" on bloqueios for select using (auth.role() = 'authenticated');
create policy "admin cria bloqueios" on bloqueios for insert with check (is_admin());
create policy "admin remove bloqueios" on bloqueios for delete using (is_admin());

create policy "ver bloqueios_periodo" on bloqueios_periodo for select using (auth.role() = 'authenticated');
create policy "admin cria bloqueios_periodo" on bloqueios_periodo for insert with check (is_admin());
create policy "admin remove bloqueios_periodo" on bloqueios_periodo for delete using (is_admin());
