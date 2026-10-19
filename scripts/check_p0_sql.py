"""Parse both rollout migrations using PostgreSQL grammar; do not execute SQL."""
from pathlib import Path
from pglast import parse_sql, parse_plpgsql

for path in sorted(Path("supabase/migrations").glob("20261019*_p0_*.sql")):
    statements = parse_sql(path.read_text())
    parse_plpgsql(path.read_text())
    allowed = {"CreateFunctionStmt", "GrantStmt", "AlterTableStmt", "IndexStmt"}
    assert statements, f"Empty migration: {path}"
    for statement in statements:
        kind = type(statement.stmt).__name__
        assert kind in allowed, f"Unexpected top-level operation {kind}: {path}"
    print(f"PASS {path}: {len(statements)} additive definition/grant statements")
