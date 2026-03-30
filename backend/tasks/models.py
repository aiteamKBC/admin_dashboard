from django.db import models

# Create your models here.
# import uuid

class CoachData(models.Model):
    # id
    case_owner_id = models.IntegerField(primary_key=True)
    # json
    tasks = models.JSONField(null=True, blank=True, default=list)

    class Meta:
        db_table = "coaches_data"
        managed = False

    def __str__(self):
        return str(self.case_owner_id)
