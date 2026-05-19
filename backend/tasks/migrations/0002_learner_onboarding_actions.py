from django.db import migrations

SQL_UP = """
ALTER TABLE learner_inclusiveness_reports
    ADD COLUMN IF NOT EXISTS notes JSONB DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
"""

SQL_DOWN = """
ALTER TABLE learner_inclusiveness_reports
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS evidence,
    DROP COLUMN IF EXISTS status;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(SQL_UP, SQL_DOWN),
    ]
