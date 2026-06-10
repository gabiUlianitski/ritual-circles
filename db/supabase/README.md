# Supabase database setup

Apply schema to a **new** Supabase Postgres project:

1. Open **SQL Editor** in the Supabase dashboard.
2. Run `db/schema.sql`.
3. Run each migration in `db/migrations/` in numeric order (003 through 025).

For CLI (requires `psql` and your Supabase URI):

```powershell
$env:DATABASE_URL = "postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
psql $env:DATABASE_URL -f db/schema.sql
Get-ChildItem db/migrations/*.sql | Sort-Object Name | ForEach-Object {
  Write-Host "Applying $($_.Name)..."
  psql $env:DATABASE_URL -f $_.FullName
}
```

Use **Session mode** (port 5432) connection string on Render.  
Use **Transaction mode** (port 6543) only for serverless clients with pgbouncer.
