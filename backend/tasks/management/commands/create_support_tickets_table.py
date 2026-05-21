from django.core.management.base import BaseCommand
from django.db import connections


CREATE_SQL = """
CREATE TABLE IF NOT EXISTS support_tickets (
    id                  BIGSERIAL PRIMARY KEY,
    wellbeing_record_id BIGINT,
    ticket_type         TEXT,
    full_name           TEXT,
    email               TEXT,
    subject             TEXT,
    details             TEXT,
    urgency             TEXT,
    preferred_contact   TEXT,
    status              TEXT,
    notes               JSONB DEFAULT '[]'::jsonb,
    evidence            JSONB DEFAULT '[]'::jsonb,
    created_at          TIMESTAMP WITH TIME ZONE,
    updated_at          TIMESTAMP WITH TIME ZONE,
    created_by          TEXT,
    days_to_close       INTEGER,
    submitted_by        TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_wellbeing_record_id
    ON support_tickets (wellbeing_record_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
    ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
    ON support_tickets (created_at DESC);
"""

# Columns added after the initial table creation — safe to run on existing tables
ALTER_COLUMNS = [
    "ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS submitted_by TEXT;",
    "ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS days_to_close INTEGER;",
    "ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS notes JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS preferred_contact TEXT;",
    "ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS created_by TEXT;",
    "ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;",
    "ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_owner TEXT;",
]


class Command(BaseCommand):
    help = (
        "Creates the support_tickets table in the wellbeing database if it does not exist, "
        "and adds any missing columns to an existing table."
    )

    def handle(self, *args, **options):
        db = "wellbeing"
        try:
            with connections[db].cursor() as cursor:
                # Create table (no-op if already exists)
                cursor.execute(CREATE_SQL)
                # Add any columns that may be missing on older table versions
                for stmt in ALTER_COLUMNS:
                    cursor.execute(stmt)
            self.stdout.write(self.style.SUCCESS(
                "support_tickets table is ready (all columns present) in the 'wellbeing' database."
            ))
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"Failed: {exc}"))
