"""Read-only current membership, enriched with existing student analytics."""
from collections import defaultdict
import json
import hashlib
import logging

from django.conf import settings
from django.db import connections, DatabaseError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Profile

logger = logging.getLogger(__name__)


def normalise(value):
    return str(value or "").strip().lower()


def build_caseloads(learners, coaches, owner_mappings, profiles):
    """Never use an old assignment as membership or a Learner UUID as Aptem ID."""
    by_email, by_aptem = {}, {}
    for coach in coaches:
        students = coach.get("students") or []
        if isinstance(students, str):
            students = json.loads(students)
        for student in students:
            if not isinstance(student, dict):
                continue
            email = normalise(student.get("Email") or student.get("email"))
            aptem = str(student.get("ID") or student.get("id") or "")
            if email:
                by_email[email] = student
            if aptem:
                by_aptem[aptem] = student

    candidates = defaultdict(set)
    for coach_id, email in [*owner_mappings, *profiles]:
        if coach_id is not None and normalise(email):
            candidates[str(coach_id)].add(normalise(email))
    groups = {}
    for learner in learners:
        coach_email = normalise(learner["coach_email"])
        if not coach_email:
            continue
        group = groups.setdefault(coach_email, {
            "coach_email": coach_email, "coach_name": learner["coach_name"] or "",
            # Presentation-only ID for a coach without legacy analytics/tasks.
            "display_id": -int(hashlib.sha256(coach_email.encode()).hexdigest()[:12], 16),
            "coach_ids": [], "students": [],
        })
        email = normalise(learner["email"])
        aptem = str(learner["aptem_id"] or "")
        previous = by_email.get(email) or by_aptem.get(aptem) or {}
        student = {
            **previous,
            "ID": aptem or previous.get("ID") or previous.get("id") or "",
            "learner_id": str(learner["id"]),
            "FullName": learner["full_name"] or previous.get("FullName") or "",
            "Email": learner["email"] or "",
            "coach_email": coach_email,
            "coach_name": learner["coach_name"] or "",
        }
        # This legacy field describes membership, not historical authorship.
        student.pop("CaseOwnerId", None)
        group["students"].append(student)

    for coach in coaches:
        coach_id = str(coach["case_owner_id"])
        emails = candidates[coach_id]
        # Prefer an unambiguous ID/email mapping. Resolve demo accounts sharing
        # an ID only when exactly one candidate owns learners in the new source.
        active_candidates = emails & groups.keys()
        email = next(iter(emails)) if len(emails) == 1 else (
            next(iter(active_candidates)) if len(active_candidates) == 1 else None
        )
        if email is None and not emails:
            matches = [key for key, group in groups.items()
                       if normalise(coach.get("case_owner"))
                       and normalise(group["coach_name"]) == normalise(coach["case_owner"])]
            email = matches[0] if len(matches) == 1 else None
        if email in groups:
            groups[email]["coach_ids"].append(coach_id)
    return list(groups.values())


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def coach_caseloads(request):
    role = normalise(getattr(getattr(request.user, "profile", None), "role", ""))
    if role not in {"qa", "coach"}:
        return Response({"detail": "Forbidden"}, status=403)
    if "learners" not in settings.DATABASES:
        return Response({"detail": "Learner database is not configured."}, status=503)
    try:
        with connections["learners"].cursor() as cursor:
            sql = '''SELECT id, full_name, email, coach_name, coach_email, aptem_id
                     FROM "Learner"."learners"'''
            params = []
            if role == "coach":
                sql += " WHERE lower(trim(coach_email)) = %s"
                params.append(normalise(request.user.email))
            cursor.execute(sql + " ORDER BY full_name, id", params)
            columns = [column[0] for column in cursor.description]
            learners = [dict(zip(columns, row)) for row in cursor.fetchall()]
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT case_owner_id, case_owner, students FROM public.coaches_data")
            coaches = [dict(zip(["case_owner_id", "case_owner", "students"], row))
                       for row in cursor.fetchall()]
            cursor.execute('SELECT DISTINCT case_owner_id, "OwnerEmail" FROM public.kbc_users_data')
            mappings = cursor.fetchall()
        profiles = list(Profile.objects.filter(role="coach").values_list("coach_id", "user__email"))
        groups = build_caseloads(learners, coaches, mappings, profiles)
        response = Response({"groups": groups})
        response["Cache-Control"] = "no-store"
        return response
    except DatabaseError:
        logger.exception("Unable to read current caseload membership")
        return Response({"detail": "Current caseload is temporarily unavailable."}, status=503)
