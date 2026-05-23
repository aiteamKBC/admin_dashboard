from django.db import migrations


SQL_UP = """
DO $$
BEGIN
    IF to_regclass('learner_inclusiveness_reports') IS NOT NULL THEN
        ALTER TABLE learner_inclusiveness_reports
            ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
"""

SQL_DOWN = """
DO $$
BEGIN
    IF to_regclass('learner_inclusiveness_reports') IS NOT NULL THEN
        ALTER TABLE learner_inclusiveness_reports
            DROP COLUMN IF EXISTS is_archived;
    END IF;
END $$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0002_learner_onboarding_actions"),
    ]

    operations = [
        migrations.RunSQL(SQL_UP, SQL_DOWN),
    ]
