-- PhotoFlow Auth V2: add a top-level Super Admin role.
-- Kept separate because PostgreSQL enum values must be committed before use.
alter type public.app_role add value if not exists 'super_admin' before 'owner';
