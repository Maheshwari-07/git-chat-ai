create extension if not exists vector;

create table public.repos (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  owner text not null,
  name text not null,
  branch text not null default 'main',
  file_count int not null default 0,
  chunk_count int not null default 0,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  unique (owner, name, branch)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  file_path text not null,
  content text not null,
  embedding vector(3072) not null,
  created_at timestamptz not null default now()
);

create index documents_repo_id_idx on public.documents(repo_id);
create index documents_embedding_idx
  on public.documents using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

grant all on public.repos to service_role;
grant all on public.documents to service_role;

alter table public.repos enable row level security;
alter table public.documents enable row level security;

create or replace function public.match_documents(
  query_embedding vector(3072),
  match_repo_id uuid,
  match_count int default 5
)
returns table (id uuid, file_path text, content text, similarity float)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.file_path, d.content,
         1 - (d.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) as similarity
  from public.documents d
  where d.repo_id = match_repo_id
  order by d.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  limit match_count;
$$;

revoke all on function public.match_documents(vector, uuid, int) from public, anon, authenticated;
grant execute on function public.match_documents(vector, uuid, int) to service_role;