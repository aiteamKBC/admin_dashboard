from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="profile", name="lms_account_id",
            field=models.BigIntegerField(blank=True, null=True, unique=True),
        ),
        migrations.CreateModel(name="LMSLoginAttempt", fields=[
            ("state", models.CharField(max_length=64, primary_key=True, serialize=False)),
            ("expires_at", models.DateTimeField(db_index=True)),
        ]),
    ]
