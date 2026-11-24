-- OYLA 03. Optional, repeatable shared catalog seed. Does not create any learner or research records.
begin;

select pg_advisory_xact_lock(29870926, 14350801);

with starter (id, title, description, category, difficulty) as (
  values
    ('b4717341-e013-49a1-b87c-bdd5d249a981'::uuid, 'Python Fundamentals',
     'Build confidence with variables, loops, and functions.', 'Programming', 'beginner'::public.oyla_difficulty),
    ('27682214-a33f-4c97-974e-6b6298fdca91'::uuid, 'Data Structures & Algorithms',
     'Explore ways to organize data and solve problems.', 'Computer Science', 'intermediate'::public.oyla_difficulty),
    ('2f1326b5-138b-4a33-8d9d-303597c8013a'::uuid, 'Critical Thinking',
     'Evaluate evidence and make well-reasoned decisions.', 'Core Skills', 'beginner'::public.oyla_difficulty)
)
insert into public.courses (id, title, description, category, difficulty)
select id, title, description, category, difficulty
from starter s
where not exists (select 1 from public.courses c where lower(btrim(c.title)) = lower(s.title))
on conflict (id) do nothing;

commit;
