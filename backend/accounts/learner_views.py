"""Learner Result Tickets dataset.

Builds the dataset consumed by the frontend Learner Result Tickets page from the
live wellbeing database (``self_assessment_quiz_responses`` in the ``wellbeing``
connection). One ticket is produced per learner (grouped by email); the latest
submission with real scores wins for each assessment category.
"""
from __future__ import annotations

import json
from datetime import datetime

from django.db import connections
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

# Frontend dataset key -> (display label, snake aliases that map to it).
# assessment_type values in the DB are messy (mixed case, duplicates), so every
# raw value is lower-cased and looked up here.
ASSESSMENT_CATEGORIES = {
    "wellbeingAssessment": ("Wellbeing Assessment", {"wellbeing", "wellbeing assessment"}),
    "psychologicalCapital": ("Psychological Capital", {"psychological", "psychological capital"}),
    "personalityTraits": ("Personality Traits", {"personality", "personality traits"}),
    "careerAdaptability": ("Career Adaptability", {"career adaptability", "career_adaptability"}),
    "careerInterests": ("Career Interests (RIASEC)", {"career interests (riasec)", "career_interests_riasec", "career interests"}),
    "emotionalIntelligence": ("Emotional Intelligence", {"emotional intelligence (ei)", "emotional_intelligence", "emotional intelligence"}),
    "workValues": ("Work Values", {"work values", "work_values"}),
    "englishCognitive": ("English & Cognitive Skills", {"english", "english & cognitive skills", "english cognitive"}),
    "mathLogical": ("Mathematics & Logical Skills", {"mathematics", "math", "mathematics & logical skills", "math logical"}),
    "knowledgeAssessment": ("Knowledge Assessment", {"knowledge assessment", "knowledge_assessment"}),
    "skillsAssessment": ("Skills Assessment", {"skills assessment", "skills_assessment"}),
    "behaviorsAssessment": ("Behaviors Assessment", {"behaviours assessment", "behaviors assessment", "behaviors_assessment", "behaviours", "behaviors"}),
    "learningStyle": ("Learning Style", {"learning style", "learning_style"}),
}

# Build a flat alias -> dataset-key lookup.
ALIAS_TO_KEY: dict[str, str] = {}
for key, (_label, aliases) in ASSESSMENT_CATEGORIES.items():
    for alias in aliases:
        ALIAS_TO_KEY[alias] = key

CAREER_PATH_ALIASES = {"career_path", "career path", "career recommendations", "career_recommendations"}

TOTAL_ASSESSMENTS = len(ASSESSMENT_CATEGORIES)

# Map textual level -> numeric rank used for strong/weak derivation.
LEVEL_RANK = {
    "very low": 1, "low": 2, "moderate": 3, "high": 4, "very high": 5,
}


def _as_json(value):
    """jsonb columns may arrive already-parsed (dict/list) or as a raw string
    depending on the cursor; normalise to a Python object."""
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
    """A 1-5 mean -> a coarse rating label."""
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


def _build_assessment_result(row, inverted: bool = False) -> dict:
    """Convert one DB row (scores jsonb + total_score + timestamps) into the
    AssessmentResult shape the frontend expects.

    ``inverted`` is used for the wellbeing assessment, where a HIGH score on a
    dimension (stress, anxiety, depression) signals concern rather than strength.
    """
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
            high_is_good = rank >= 4
            low_is_bad = rank <= 2
            if inverted:
                # High distress = concern; low distress = doing well.
                if low_is_bad:
                    strong_areas.append(label)
                elif high_is_good:
                    weak_areas.append(label)
            else:
                if high_is_good:
                    strong_areas.append(label)
                elif low_is_bad:
                    weak_areas.append(label)

    total = row["total_score"]
    # Store overall as a 0-100 percentage (means are on a 1-5 scale). For an
    # inverted (distress) assessment, invert so a high distress total reads as a
    # low wellbeing score.
    if total is None:
        overall = None
        rating_score = None
    elif inverted:
        overall = round((1 - (total / 5.0)) * 100)
        rating_score = 6 - total  # flip onto the 1-5 rating scale
    else:
        overall = round((total / 5.0) * 100)
        rating_score = total

    interpretation_bits = []
    if strong_areas:
        interpretation_bits.append("Strong in " + ", ".join(strong_areas[:3]) + ".")
    if weak_areas:
        interpretation_bits.append("Needs support in " + ", ".join(weak_areas[:3]) + ".")
    interpretation = " ".join(interpretation_bits) or "Assessment completed."

    return {
        "overallScore": overall,
        "rating": _rating_from_score(rating_score),
        "interpretation": interpretation,
        "subScores": sub_scores,
        "weakAreas": weak_areas,
        "strongAreas": strong_areas,
        "submittedAt": row["submitted_at"].isoformat() if row["submitted_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


def _parse_career_recommendations(scores) -> list[dict]:
    """career_path rows store recommendations as a JSON string in
    scores.career_recommendations."""
    if not scores:
        return []
    raw = scores.get("career_recommendations")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            return []
    if not isinstance(raw, list):
        return []

    recommendations = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        recommendations.append({
            "title": item.get("title", "Recommendation"),
            "description": item.get("description", ""),
            "matchReason": item.get("matchReason", item.get("match_reason", "")),
            "relatedStrengths": item.get("relatedStrengths", item.get("related_strengths", [])) or [],
            "areasToImprove": item.get("areasToImprove", item.get("areas_to_improve", [])) or [],
            "adminNote": item.get("adminNote", item.get("admin_note", "")),
        })
    return recommendations


def _empty_dataset() -> dict:
    dataset = {"learners": [], "careerRecommendations": {}}
    for key in ASSESSMENT_CATEGORIES:
        dataset[key] = {}
    return dataset


def build_learner_dataset() -> dict:
    """Query the wellbeing DB and assemble the full LearnerDataset."""
    dataset = _empty_dataset()

    with connections["wellbeing"].cursor() as cursor:
        cursor.execute(
            """
            SELECT learner_id, learner_name, learner_email, assessment_type,
                   scores, total_score, submitted_at, updated_at
            FROM self_assessment_quiz_responses
            ORDER BY submitted_at ASC
            """
        )
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, record)) for record in cursor.fetchall()]

    # Normalise jsonb (some cursors return it as a raw string).
    for row in rows:
        row["scores"] = _as_json(row["scores"]) or {}

    # Group rows per learner (keyed by email, falling back to name).
    # learners[email] = {meta, categories: {key: best_row}, career: best_row}
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
            "lastUpdated": None,
        })
        # Keep the friendliest name / email we encounter.
        if name and bucket["name"] in ("", "Unknown Learner"):
            bucket["name"] = name
        if row["learner_email"] and not bucket["email"]:
            bucket["email"] = row["learner_email"]

        submitted = row["submitted_at"]
        if submitted and (bucket["lastUpdated"] is None or submitted > bucket["lastUpdated"]):
            bucket["lastUpdated"] = submitted

        raw_type = (row["assessment_type"] or "").strip().lower()

        if raw_type in CAREER_PATH_ALIASES:
            prev = bucket["career"]
            if prev is None or (submitted and submitted > prev["submitted_at"]):
                bucket["career"] = row
            continue

        key = ALIAS_TO_KEY.get(raw_type)
        if key is None:
            continue

        # Skip empty stub submissions (no scores / no total).
        has_data = bool(row["scores"]) and row["total_score"] is not None
        if not has_data:
            continue

        prev = bucket["categories"].get(key)
        if prev is None or (submitted and submitted > prev["submitted_at"]):
            bucket["categories"][key] = row

    # Emit dataset entries.
    for index, (identity, bucket) in enumerate(sorted(learners.items()), start=1):
        ticket_id = f"LR-{index:04d}"
        category_rows = bucket["categories"]

        all_strong: list[str] = []
        all_weak: list[str] = []

        for key, row in category_rows.items():
            result = _build_assessment_result(row, inverted=(key == "wellbeingAssessment"))
            dataset[key][ticket_id] = result
            all_strong.extend(result["strongAreas"])
            all_weak.extend(result["weakAreas"])

        recommendations = _parse_career_recommendations(
            bucket["career"]["scores"] if bucket["career"] else None
        )
        dataset["careerRecommendations"][ticket_id] = recommendations

        completed = len(category_rows)
        completion = round((completed / TOTAL_ASSESSMENTS) * 100) if TOTAL_ASSESSMENTS else 0

        # Risk: driven primarily by the wellbeing assessment, escalated by the
        # overall count of weak areas.
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

        # Dedup while preserving order; cap the headline lists.
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
            "reviewStatus": "Not Reviewed",
            "reviewedBy": "",
            "ticketStatus": "Completed" if completion == 100 else "In Progress" if completion > 0 else "Not Started",
            "flagged": risk == "High",
            "adminNotes": "",
        })

    return dataset


@require_GET
@never_cache
def learner_result_tickets(_request):
    """Return the live learner-result dataset consumed by the
    Learner Result Tickets page."""
    return JsonResponse(build_learner_dataset())
