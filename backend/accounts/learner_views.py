"""Learner Result Tickets dataset.

Builds the dataset consumed by the frontend Learner Result Tickets page from the
live wellbeing database (``self_assessment_quiz_responses`` in the ``wellbeing``
connection). One ticket is produced per learner (grouped by email); the latest
submission wins for each assessment column.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from django.db import connections
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

# DB column name -> (dataset key, is_inverted)
# is_inverted=True means a HIGH raw score = bad (e.g. stress/anxiety)
COLUMN_TO_KEY: dict[str, tuple[str, bool]] = {
    "wellbeing":    ("wellbeingAssessment",   True),
    "psychological":("psychologicalCapital",  False),
    "personality":  ("personalityTraits",     False),
    "career":       ("careerAdaptability",    False),
    "riasec":       ("careerInterests",       False),
    "ei":           ("emotionalIntelligence", False),
    "work":         ("workValues",            False),
    "cognitive":    ("englishCognitive",      False),
    "logical":      ("mathLogical",           False),
    "knowledge":    ("knowledgeAssessment",   False),
    "skills":       ("skillsAssessment",      False),
    "behaviors":    ("behaviorsAssessment",   False),
    "learning_style":("learningStyle",        False),
}

ASSESSMENT_CATEGORIES = {key: None for _, (key, _) in COLUMN_TO_KEY.items()}
TOTAL_ASSESSMENTS = len(COLUMN_TO_KEY)

LEVEL_RANK = {
    "very low": 1, "low": 2, "moderate": 3, "high": 4, "very high": 5,
}


def _as_json(value):
    if value is None or isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return None
    return value


def _humanize(token: str) -> str:
    return token.replace("_", " ").strip().title()


def _rating_from_score(score):
    if score is None:
        return "Not assessed"
    if score >= 4.2:
        return "Excellent"
    if score >= 3.4:
        return "Strong"
    if score >= 2.6:
        return "Moderate"
    if score >= 1.8:
        return "Developing"
    return "Needs Support"


def _parse_datetime(s) -> datetime | None:
    if not s:
        return None
    if isinstance(s, datetime):
        return s
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _extract_assessment_row(col_data: dict, row_updated_at) -> dict | None:
    """Convert a JSON column value into the pseudo-row _build_assessment_result expects."""
    scores = col_data.get("scores") or {}
    if not scores:
        return None

    total_score = col_data.get("total_score")
    if total_score is None:
        # Some columns store overall as overall_X.mean
        for k, v in col_data.items():
            if k.startswith("overall_") and isinstance(v, dict):
                total_score = v.get("mean")
                break

    submitted_at = _parse_datetime(
        col_data.get("submitted_at") or col_data.get("completed_at")
    )

    return {
        "scores": scores,
        "total_score": total_score,
        "submitted_at": submitted_at,
        "updated_at": row_updated_at,
    }


def _build_assessment_result(row, inverted: bool = False) -> dict:
    scores = row["scores"] or {}
    sub_scores: dict[str, float | None] = {}
    strong_areas: list[str] = []
    weak_areas: list[str] = []

    for raw_name, payload in scores.items():
        if not isinstance(payload, dict):
            continue
        mean = payload.get("mean")
        level = str(payload.get("level", "")).strip()
        label = _humanize(raw_name)
        sub_scores[label] = mean

        rank = LEVEL_RANK.get(level.lower())
        if rank is None and mean is not None:
            rank = 5 if mean >= 4.2 else 4 if mean >= 3.4 else 3 if mean >= 2.6 else 2 if mean >= 1.8 else 1
        if rank is not None:
            if inverted:
                if rank <= 2:
                    strong_areas.append(label)
                elif rank >= 4:
                    weak_areas.append(label)
            else:
                if rank >= 4:
                    strong_areas.append(label)
                elif rank <= 2:
                    weak_areas.append(label)

    total = row["total_score"]
    if total is None:
        overall = None
        rating_score = None
    elif inverted:
        overall = round((1 - (total / 5.0)) * 100)
        rating_score = 6 - total
    else:
        overall = round((total / 5.0) * 100)
        rating_score = total

    interpretation_bits = []
    if strong_areas:
        interpretation_bits.append("Strong in " + ", ".join(strong_areas[:3]) + ".")
    if weak_areas:
        interpretation_bits.append("Needs support in " + ", ".join(weak_areas[:3]) + ".")
    interpretation = " ".join(interpretation_bits) or "Assessment completed."

    submitted = row["submitted_at"]
    updated = row["updated_at"]

    return {
        "overallScore": overall,
        "rating": _rating_from_score(rating_score),
        "interpretation": interpretation,
        "subScores": sub_scores,
        "weakAreas": weak_areas,
        "strongAreas": strong_areas,
        "submittedAt": submitted.isoformat() if submitted else None,
        "updatedAt": updated.isoformat() if updated else None,
    }


def _empty_dataset() -> dict:
    dataset: dict = {"learners": [], "careerRecommendations": {}, "skillsToDevelop": {}}
    for _, (key, _) in COLUMN_TO_KEY.items():
        dataset[key] = {}
    return dataset


def build_learner_dataset() -> dict:
    dataset = _empty_dataset()

    assessment_cols = list(COLUMN_TO_KEY.keys())
    col_select = ", ".join(assessment_cols + ["career_recommendations", "skills_to_develop"])

    with connections["wellbeing"].cursor() as cursor:
        cursor.execute(
            f"""
            SELECT id, learner_id, learner_name, learner_email,
                   created_at, updated_at,
                   "Reviewed" AS reviewed, "Status" AS status,
                   {col_select}
            FROM self_assessment_quiz_responses
            ORDER BY updated_at ASC NULLS FIRST
            """
        )
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, record)) for record in cursor.fetchall()]

    learners: dict[str, dict] = {}

    for row in rows:
        email = (row["learner_email"] or "").strip().lower()
        name = (row["learner_name"] or "").strip()
        identity = email or name or f"learner-{row['learner_id']}"
        if not identity:
            continue

        bucket = learners.setdefault(identity, {
            "email": row["learner_email"] or "",
            "name": name or (row["learner_email"] or "Unknown Learner"),
            "categories": {},
            "career": None,
            "career_generated_at": None,
            "lastUpdated": None,
            "reviewStatus": None,
            "ticketStatus": None,
        })

        if name and bucket["name"] in ("", "Unknown Learner"):
            bucket["name"] = name
        if row["learner_email"] and not bucket["email"]:
            bucket["email"] = row["learner_email"]

        row_updated = row.get("updated_at")
        if row_updated and (bucket["lastUpdated"] is None or row_updated > bucket["lastUpdated"]):
            bucket["lastUpdated"] = row_updated

        reviewed_val = (row.get("reviewed") or "").strip()
        if reviewed_val:
            bucket["reviewStatus"] = reviewed_val
        status_val = (row.get("status") or "").strip()
        if status_val:
            bucket["ticketStatus"] = status_val

        # Process each assessment column
        for col_name, (dataset_key, _inverted) in COLUMN_TO_KEY.items():
            col_data = _as_json(row.get(col_name))
            if not col_data or not isinstance(col_data, dict):
                continue

            assessment_row = _extract_assessment_row(col_data, row_updated)
            if assessment_row is None or assessment_row["total_score"] is None:
                continue

            prev = bucket["categories"].get(dataset_key)
            prev_submitted = prev["submitted_at"] if prev else None
            cur_submitted = assessment_row["submitted_at"]
            if prev is None or (cur_submitted and (prev_submitted is None or cur_submitted > prev_submitted)):
                bucket["categories"][dataset_key] = assessment_row

        # Career recommendations
        career_data = _as_json(row.get("career_recommendations"))
        if career_data and isinstance(career_data, dict):
            gen_at = _parse_datetime(career_data.get("generated_at"))
            prev_gen = bucket["career_generated_at"]
            if bucket["career"] is None or (gen_at and (prev_gen is None or gen_at > prev_gen)):
                bucket["career"] = career_data
                bucket["career_generated_at"] = gen_at

    # Emit dataset entries
    for index, (identity, bucket) in enumerate(sorted(learners.items()), start=1):
        ticket_id = f"LR-{index:04d}"
        category_rows = bucket["categories"]

        all_strong: list[str] = []
        all_weak: list[str] = []

        for key, row in category_rows.items():
            _, inverted = next(v for v in COLUMN_TO_KEY.values() if v[0] == key)
            result = _build_assessment_result(row, inverted=inverted)
            dataset[key][ticket_id] = result
            all_strong.extend(result["strongAreas"])
            all_weak.extend(result["weakAreas"])

        # Parse career recommendations from new schema
        career_data = bucket["career"]
        recommendations = []
        if career_data and isinstance(career_data, dict):
            for item in career_data.get("recommendations", []):
                if isinstance(item, dict):
                    recommendations.append({
                        "title": item.get("title", "Recommendation"),
                        "description": item.get("description", ""),
                        "matchReason": item.get("matchReason", ""),
                        "relatedStrengths": [],
                        "areasToImprove": [],
                        "adminNote": "",
                    })
        dataset["careerRecommendations"][ticket_id] = recommendations

        # Skills to develop from career_recommendations column
        skills_raw = career_data.get("skills_to_develop", []) if career_data else []
        if isinstance(skills_raw, str):
            try:
                skills_raw = json.loads(skills_raw)
            except (ValueError, TypeError):
                skills_raw = []
        dataset["skillsToDevelop"][ticket_id] = skills_raw if isinstance(skills_raw, list) else []

        completed = len(category_rows)
        completion = round((completed / TOTAL_ASSESSMENTS) * 100) if TOTAL_ASSESSMENTS else 0

        wellbeing = category_rows.get("wellbeingAssessment")
        risk = "Low"
        if wellbeing is not None:
            wb_total = wellbeing["total_score"] or 0
            if wb_total >= 3.5:
                risk = "High"
            elif wb_total >= 2.8:
                risk = "Moderate"
        if risk == "Low" and len(all_weak) >= 4:
            risk = "Moderate"
        if len(all_weak) >= 7:
            risk = "High"

        def _top(items: list[str], limit: int) -> list[str]:
            seen, out = set(), []
            for item in items:
                if item not in seen:
                    seen.add(item)
                    out.append(item)
                if len(out) >= limit:
                    break
            return out

        recommended_career = recommendations[0]["title"] if recommendations else "Pending Assessment"
        last_updated = bucket["lastUpdated"].date().isoformat() if bucket["lastUpdated"] else ""

        stored_review = (bucket["reviewStatus"] or "").strip()
        reviewer_name = ""
        # Support "Reviewed:Name" format for storing reviewer identity
        if ":" in stored_review:
            parts = stored_review.split(":", 1)
            stored_review = parts[0].strip()
            reviewer_name = parts[1].strip()

        if stored_review.lower() in ("reviewed", "yes", "true", "1"):
            review_status, reviewed_by = "Reviewed", reviewer_name or ""
        elif stored_review and stored_review.lower() not in ("not reviewed", "no", "false", "0"):
            review_status, reviewed_by = stored_review, reviewer_name or ""
        else:
            review_status, reviewed_by = "Not Reviewed", ""

        stored_status = (bucket["ticketStatus"] or "").strip()
        if stored_status:
            overview_status = stored_status
        else:
            overview_status = "Completed" if completion == 100 else "In Progress" if completion > 0 else "Not Started"

        dataset["learners"].append({
            "id": ticket_id,
            "name": bucket["name"],
            "email": bucket["email"],
            "profileStatus": "Active",
            "assessmentCompletion": completion,
            "completedAssessments": completed,
            "totalAssessments": TOTAL_ASSESSMENTS,
            "overallRisk": risk,
            "topStrengths": _top(all_strong, 4) or ["Not enough data"],
            "weakestAreas": _top(all_weak, 4) or ["Not enough data"],
            "recommendedCareer": recommended_career,
            "lastUpdated": last_updated,
            "reviewStatus": review_status,
            "reviewedBy": reviewed_by,
            "ticketStatus": overview_status,
            "flagged": risk == "High",
            "adminNotes": "",
        })

    return dataset


@require_GET
@never_cache
def learner_result_tickets(_request):
    return JsonResponse(build_learner_dataset())


@require_GET
@never_cache
def learner_history(request):
    """Return all submissions for a learner ordered by date.

    Query param: email (required)
    Returns a list of submissions, each with per-assessment overallScore + rating.
    """
    email = (request.GET.get("email") or "").strip()
    if not email:
        return JsonResponse({"error": "email is required."}, status=400)

    assessment_cols = list(COLUMN_TO_KEY.keys())
    col_select = ", ".join(assessment_cols + ["career_recommendations"])

    with connections["wellbeing"].cursor() as cursor:
        cursor.execute(
            f"""
            SELECT id, created_at, updated_at, {col_select}
            FROM self_assessment_quiz_responses
            WHERE lower(learner_email) = lower(%s)
            ORDER BY created_at ASC
            """,
            [email],
        )
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, record)) for record in cursor.fetchall()]

    submissions = []
    for row in rows:
        assessments = {}
        for col_name, (dataset_key, inverted) in COLUMN_TO_KEY.items():
            col_data = _as_json(row.get(col_name))
            if not col_data or not isinstance(col_data, dict):
                continue
            assessment_row = _extract_assessment_row(col_data, row.get("updated_at"))
            if assessment_row is None or assessment_row["total_score"] is None:
                continue
            result = _build_assessment_result(assessment_row, inverted=inverted)
            assessments[dataset_key] = {
                "overallScore": result["overallScore"],
                "rating": result["rating"],
                "subScores": result["subScores"],
                "submittedAt": result["submittedAt"],
            }

        created = row.get("created_at")
        submissions.append({
            "submissionId": row["id"],
            "date": created.date().isoformat() if created else None,
            "assessments": assessments,
        })

    return JsonResponse({"submissions": submissions})


@csrf_exempt
@require_POST
@never_cache
def update_learner_review(request):
    try:
        payload = json.loads(request.body or b"{}")
    except (ValueError, TypeError):
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    email = (payload.get("email") or "").strip()
    if not email:
        return JsonResponse({"error": "email is required."}, status=400)

    sets, params = [], []
    if "reviewStatus" in payload:
        status = (payload.get("reviewStatus") or "").strip() or None
        reviewer = (payload.get("reviewedBy") or "").strip()
        combined = f"{status}:{reviewer}" if status and reviewer else status
        sets.append('"Reviewed" = %s')
        params.append(combined)
    if "ticketStatus" in payload:
        sets.append('"Status" = %s')
        params.append((payload.get("ticketStatus") or "").strip() or None)

    if not sets:
        return JsonResponse({"error": "Nothing to update."}, status=400)

    params.append(email)
    with connections["wellbeing"].cursor() as cursor:
        cursor.execute(
            f"UPDATE self_assessment_quiz_responses SET {', '.join(sets)} "
            f"WHERE lower(learner_email) = lower(%s)",
            params,
        )
        updated = cursor.rowcount

    return JsonResponse({"ok": True, "rowsUpdated": updated})
