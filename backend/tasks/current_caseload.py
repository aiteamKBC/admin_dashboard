"""Current membership from Learner; historical wellbeing records stay untouched."""
import hashlib
import re
from collections import defaultdict

from django.db import connections
from django.db.models import Q, JSONField
from django.db.models.expressions import RawSQL
from django.db.models.functions import Lower, Trim

from .models import WellbeingSafeguardingMonitoringSystem

SUMMARY_FIELDS = (
    "id", "learner_email", "learner_name", "coach_email", "coach_name", "programme",
    "risk_level", "total_score", "emotional_stress_resilience_score",
    "personal_wellbeing_protective_factors_score", "provider_culture_support_score",
    "safeguarding_vulnerability_score", "trigger_count",
)

# Keep legacy string entries intact for the tolerant Python parser. Object
# entries need only dates/risk for the dashboard; answers stay in the database.
HISTORY_SUMMARY_SQL = """
    (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(entry) = 'object'
        THEN jsonb_build_object('submitted_at', entry->'submitted_at',
             'date', entry->'date', 'timestamp', entry->'timestamp',
             'risk_level', entry->'risk_level') ELSE entry END), '[]'::jsonb)
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(history_json::jsonb) = 'array'
          THEN history_json::jsonb ELSE '[]'::jsonb END) AS entry)
"""


def normalise(value):
    return str(value or "").strip().lower()


def read_roster(coach_email=""):
    with connections["learners"].cursor() as cursor:
        sql = '''SELECT id, full_name, email, aptem_id, coach_name, coach_email, programme
                 FROM "Learner"."learners"'''
        params = []
        if coach_email:
            sql += " WHERE lower(trim(coach_email)) = %s"
            params.append(normalise(coach_email))
        cursor.execute(sql + " ORDER BY full_name, id", params)
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def merge_monitoring(roster, records):
    by_email = {normalise(row.learner_email): row for row in records if normalise(row.learner_email)}
    by_id = {str(row.id): row for row in records}
    result, seen = [], set()
    for member in roster:
        old = by_email.get(normalise(member["email"])) or by_id.get(str(member["aptem_id"]))
        # Copy the model data, never save an assignment over a historical record.
        values = {field.attname: old.__dict__[field.attname]
                  for field in old._meta.concrete_fields if field.attname in old.__dict__} if old is not None else {}
        if old is not None and "_history_summary" in old.__dict__:
            values["history_json"] = old.__dict__["_history_summary"]
        if old is None:
            values["id"] = -int(hashlib.sha256(str(member["id"]).encode()).hexdigest()[:12], 16)
        if values["id"] in seen:
            continue
        seen.add(values["id"])
        values.update(learner_name=member["full_name"] or values.get("learner_name"),
                      learner_email=member["email"] or values.get("learner_email"),
                      coach_name=member["coach_name"], coach_email=normalise(member["coach_email"]),
                      programme=member["programme"] or values.get("programme"))
        result.append(WellbeingSafeguardingMonitoringSystem(**values))
    return result


def current_monitoring_rows(coach_email="", *, fields=None, compact_history=False):
    roster = read_roster(coach_email)
    emails = {normalise(row["email"]) for row in roster if normalise(row["email"])}
    ids = [row["aptem_id"] for row in roster if row["aptem_id"] is not None]
    qs = (WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing")
                   .annotate(current_email=Lower(Trim("learner_email")))
                   .filter(Q(current_email__in=emails) | Q(id__in=ids)).order_by("id"))
    if fields is not None:
        qs = qs.only(*(set(fields) | {"id", "learner_email"}))
    if compact_history:
        qs = qs.defer("history_json").annotate(
            _history_summary=RawSQL(HISTORY_SUMMARY_SQL, [], output_field=JSONField())
        )
    records = list(qs)
    return merge_monitoring(roster, records)


def current_assignment(learner):
    roster = read_roster()
    email = normalise(learner.learner_email)
    matches = [row for row in roster if email and normalise(row["email"]) == email]
    if not matches:
        matches = [row for row in roster if row["aptem_id"] is not None
                   and str(row["aptem_id"]) == str(learner.id)]
    owners = {normalise(row["coach_email"]) for row in matches}
    if len(owners) != 1:
        return {"coach_name": "", "coach_email": ""}
    return {"coach_name": matches[0]["coach_name"] or "", "coach_email": owners.pop()}


def inclusion_assignment_index():
    """Index current owners, including legacy monitoring IDs used by reports."""
    by_email, by_id = defaultdict(set), defaultdict(set)
    for row in read_roster():
        owner = (normalise(row["coach_email"]), row["coach_name"] or "")
        if normalise(row["email"]):
            by_email[normalise(row["email"])].add(owner)
        if row["aptem_id"] is not None:
            by_id[str(row["aptem_id"])].add(owner)
    records = (WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing")
               .annotate(current_email=Lower(Trim("learner_email")))
               .filter(current_email__in=list(by_email)).values_list("id", "current_email"))
    for record_id, email in records:
        by_id[str(record_id)].update(by_email[email])
    return by_email, by_id


def inclusion_assignment(report, index):
    by_email, by_id = index
    get = report.get if isinstance(report, dict) else lambda key: getattr(report, key, None)
    candidates = set()
    for field in ("learner_email", "academic_email"):
        candidates = by_email.get(normalise(get(field)), set())
        if candidates:
            break
    if not candidates:
        candidates = by_id.get(str(get("learner_id")), set())
    if not candidates:
        for email in re.split(r"[,;\s]+", str(get("previous_emails") or "")):
            candidates = candidates | by_email.get(normalise(email), set())
    emails = {email for email, _ in candidates}
    if len(emails) != 1 or not next(iter(emails)):
        return None
    email = next(iter(emails))
    name = sorted(name for _, name in candidates if name)
    return {"coach_email": email, "coach_name": name[0] if name else email}
