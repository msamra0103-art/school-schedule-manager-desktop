-- This helper belongs to the platform bootstrap and must not be exposed as an API RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
