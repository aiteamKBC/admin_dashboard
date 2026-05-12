import os
import re
from datetime import datetime, timedelta
from urllib.parse import quote

import requests
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


def _parse_iso_duration_minutes(dur: str) -> int:
    if not dur or dur in ("PT0S", "P0D", ""):
        return 30
    h = re.search(r"(\d+)H", dur)
    m = re.search(r"(\d+)M", dur)
    total = (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)
    return total if total > 0 else 30


def _get_booking_token() -> str:
    tenant_id = os.getenv("BOOKING_TENANT_ID", "").strip()
    client_id = os.getenv("BOOKING_CLIENT_ID", "").strip()
    client_secret = os.getenv("BOOKING_CLIENT_SECRET", "").strip()

    if not all([tenant_id, client_id, client_secret]):
        raise ValueError("Booking credentials not configured (BOOKING_TENANT_ID / CLIENT_ID / CLIENT_SECRET)")

    resp = requests.post(
        f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        },
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


class BookingServicesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business_id = os.getenv("BOOKING_BUSINESS_ID", "").strip()
        try:
            token = _get_booking_token()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        resp = requests.get(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/services",
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
        if not resp.ok:
            return Response({"detail": resp.text[:500]}, status=status.HTTP_502_BAD_GATEWAY)

        services = resp.json().get("value", [])
        return Response([{"id": s["id"], "displayName": s["displayName"]} for s in services])


class BookingStaffView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business_id = os.getenv("BOOKING_BUSINESS_ID", "").strip()
        service_id = request.query_params.get("service_id", "").strip()

        try:
            token = _get_booking_token()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        headers = {"Authorization": f"Bearer {token}"}

        # Get staff IDs assigned to this service
        allowed_ids: set | None = None
        if service_id:
            r_svc = requests.get(
                f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/services/{quote(service_id, safe='')}",
                headers=headers, timeout=20,
            )
            if r_svc.ok:
                ids = r_svc.json().get("staffMemberIds") or []
                if ids:
                    allowed_ids = set(ids)

        # Get all staff members for the business
        r_staff = requests.get(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/staffMembers",
            headers=headers, timeout=20,
        )
        if not r_staff.ok:
            return Response({"detail": r_staff.text[:500]}, status=status.HTTP_502_BAD_GATEWAY)

        staff = r_staff.json().get("value", [])
        result = [
            {"id": s["id"], "displayName": s.get("displayName") or s.get("emailAddress", "Unknown")}
            for s in staff
            if allowed_ids is None or s["id"] in allowed_ids
        ]
        return Response(result)


class BookingAvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business_id = os.getenv("BOOKING_BUSINESS_ID", "").strip()
        service_id = request.query_params.get("service_id", "").strip()
        date_str = request.query_params.get("date", "").strip()

        if not service_id or not date_str:
            return Response({"detail": "service_id and date are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token = _get_booking_token()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        headers = {"Authorization": f"Bearer {token}"}

        # Get service details (staff IDs + duration) — fall back gracefully if not found
        r_svc = requests.get(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/services/{quote(service_id, safe='')}",
            headers=headers,
            timeout=20,
        )
        if not r_svc.ok:
            return Response({"slots": [f"{h:02d}:{m:02d}" for h in range(8, 18) for m in (0, 30)], "duration": 60, "fallback": True})

        svc = r_svc.json()
        staff_ids = svc.get("staffMemberIds", [])
        duration_min = _parse_iso_duration_minutes(svc.get("defaultDuration", "PT60M"))
        slot_interval = _parse_iso_duration_minutes(
            svc.get("schedulingPolicy", {}).get("timeSlotInterval", "PT30M")
        )

        try:
            date = datetime.fromisoformat(date_str)
        except ValueError:
            return Response({"detail": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)

        day_start = date.replace(hour=8, minute=0, second=0, microsecond=0)
        day_end = date.replace(hour=18, minute=0, second=0, microsecond=0)

        def _business_hours_slots():
            slots, cur = [], day_start
            while cur + timedelta(minutes=duration_min) <= day_end:
                slots.append(cur.strftime("%H:%M"))
                cur += timedelta(minutes=slot_interval)
            return slots

        if not staff_ids:
            return Response({"slots": _business_hours_slots(), "duration": duration_min})

        avail_body = {
            "staffIds": staff_ids,
            "startDateTime": {"dateTime": day_start.isoformat(), "timeZone": "Europe/London"},
            "endDateTime": {"dateTime": day_end.isoformat(), "timeZone": "Europe/London"},
        }
        r_avail = requests.post(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/getStaffAvailability",
            json=avail_body,
            headers={**headers, "Content-Type": "application/json"},
            timeout=30,
        )

        if not r_avail.ok:
            return Response({"slots": _business_hours_slots(), "duration": duration_min, "fallback": True})

        slots_set: set = set()
        for staff in r_avail.json().get("staffAvailabilityItems", []):
            for window in staff.get("availabilityItems", []):
                if window.get("status") != "available":
                    continue
                try:
                    w_start = datetime.fromisoformat(window["startDateTime"]["dateTime"].rstrip("Z").split("+")[0])
                    w_end = datetime.fromisoformat(window["endDateTime"]["dateTime"].rstrip("Z").split("+")[0])
                    cur = w_start
                    while cur + timedelta(minutes=duration_min) <= w_end:
                        slots_set.add(cur.strftime("%H:%M"))
                        cur += timedelta(minutes=slot_interval)
                except Exception:
                    continue

        if not slots_set:
            return Response({"slots": _business_hours_slots(), "duration": duration_min, "fallback": True})

        return Response({"slots": sorted(slots_set), "duration": duration_min})


class BookingFixServiceView(APIView):
    """Patch the Safeguarding service scheduling policy so bookings work."""
    permission_classes = []  # allow from browser for one-time setup

    def post(self, request):
        business_id = os.getenv("BOOKING_BUSINESS_ID", "").strip()
        service_id = os.getenv("BOOKING_SERVICE_ID", "").strip()

        try:
            token = _get_booking_token()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        patch_body = {
            "defaultDuration": "PT60M",
            "isLocationOnline": False,
            "schedulingPolicy": {
                "timeSlotInterval": "PT30M",
                "minimumLeadTime": "PT0S",
                "maximumAdvance": "P365D",
                "sendConfirmationsToOwner": False,
                "allowStaffSelection": False,
                "isMeetingInviteToCustomersEnabled": False,
            },
        }

        resp = requests.patch(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/services/{quote(service_id, safe='')}",
            json=patch_body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=20,
        )

        if resp.ok:
            return Response({"detail": "Service updated successfully. Bookings should now work."})

        try:
            err = resp.json()
        except Exception:
            err = resp.text[:500]
        return Response({"detail": "Failed to update service", "error": err}, status=status.HTTP_502_BAD_GATEWAY)


class BookingPublishView(APIView):
    """Publish the booking business so it accepts appointments via API."""
    permission_classes = []

    def post(self, request):
        business_id = os.getenv("BOOKING_BUSINESS_ID", "").strip()

        try:
            token = _get_booking_token()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Check current published status
        r_get = requests.get(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}",
            headers=headers, timeout=20,
        )
        is_published = r_get.json().get("isPublished") if r_get.ok else "unknown"

        # Publish the business
        r_pub = requests.post(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/publish",
            headers=headers, timeout=20,
        )

        return Response({
            "was_published": is_published,
            "publish_status": r_pub.status_code,
            "publish_ok": r_pub.ok,
            "detail": "Published successfully" if r_pub.ok else r_pub.text[:500],
        })


class BookingTestCreateView(APIView):
    """Try booking on a fresh test service to isolate whether the issue is with Safeguarding specifically."""
    permission_classes = []

    def post(self, request):
        business_id = os.getenv("BOOKING_BUSINESS_ID", "").strip()

        try:
            token = _get_booking_token()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Step 1: create a temporary test service
        svc_body = {
            "displayName": "API Test Service (delete me)",
            "defaultDuration": "PT60M",
            "isLocationOnline": False,
            "isHiddenFromCustomers": True,
            "schedulingPolicy": {
                "timeSlotInterval": "PT30M",
                "minimumLeadTime": "PT0S",
                "maximumAdvance": "P365D",
                "allowStaffSelection": False,
                "sendConfirmationsToOwner": False,
                "isMeetingInviteToCustomersEnabled": False,
            },
        }
        r_svc = requests.post(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/services",
            json=svc_body, headers=headers, timeout=20,
        )
        if not r_svc.ok:
            return Response({"step": "create_service", "status": r_svc.status_code, "error": r_svc.text[:500]})

        test_service_id = r_svc.json().get("id")

        # Step 2: try to create an appointment on this new service
        test_start = datetime.utcnow() + timedelta(days=1)
        test_start = test_start.replace(hour=10, minute=0, second=0, microsecond=0)
        test_end = test_start + timedelta(hours=1)

        appt_body = {
            "@odata.type": "#microsoft.graph.bookingAppointment",
            "serviceId": test_service_id,
            "staffMemberIds": [],
            "start": {"dateTime": test_start.isoformat(), "timeZone": "UTC"},
            "end": {"dateTime": test_end.isoformat(), "timeZone": "UTC"},
            "optOutOfCustomerEmail": True,
            "smsNotificationsEnabled": False,
            "customers": [{"@odata.type": "#microsoft.graph.bookingCustomerInformation", "name": "Test"}],
        }
        r_appt = requests.post(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/appointments",
            json=appt_body, headers=headers, timeout=30,
        )
        result = {
            "test_service_id": test_service_id,
            "appointment_status": r_appt.status_code,
        }
        try:
            result["appointment_response"] = r_appt.json()
        except Exception:
            result["appointment_response"] = r_appt.text[:500]

        # Step 3: clean up - delete the test service
        requests.delete(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/services/{quote(test_service_id, safe='')}",
            headers=headers, timeout=20,
        )

        return Response(result)


class BookingDiagnosticView(APIView):
    permission_classes = []

    def get(self, request):
        business_id = os.getenv("BOOKING_BUSINESS_ID", "").strip()
        service_id = os.getenv("BOOKING_SERVICE_ID", "").strip()
        results = {"business_id": business_id, "service_id": service_id}

        try:
            token = _get_booking_token()
            results["auth"] = "ok"
        except Exception as exc:
            results["auth"] = f"FAILED: {exc}"
            return Response(results)

        headers = {"Authorization": f"Bearer {token}"}

        # Test 1: list all businesses
        r1 = requests.get(
            "https://graph.microsoft.com/v1.0/solutions/bookingBusinesses",
            headers=headers, timeout=20,
        )
        results["list_businesses_status"] = r1.status_code
        if r1.ok:
            businesses = r1.json().get("value", [])
            results["businesses"] = [{"id": b.get("id"), "displayName": b.get("displayName")} for b in businesses]
        else:
            results["list_businesses_error"] = r1.text[:500]

        # Test 2: get the specific business
        r2 = requests.get(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}",
            headers=headers, timeout=20,
        )
        results["get_business_status"] = r2.status_code
        if not r2.ok:
            results["get_business_error"] = r2.text[:500]

        # Test 3: get services for this business
        r3 = requests.get(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/services",
            headers=headers, timeout=20,
        )
        results["list_services_status"] = r3.status_code
        if r3.ok:
            services = r3.json().get("value", [])
            results["services"] = [{"id": s.get("id"), "displayName": s.get("displayName")} for s in services]
        else:
            results["list_services_error"] = r3.text[:500]

        # Test 4: get service details (staff members, scheduling policy)
        r4 = requests.get(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/services/{service_id}",
            headers=headers, timeout=20,
        )
        results["service_details_status"] = r4.status_code
        if r4.ok:
            svc = r4.json()
            results["service_details"] = {
                "displayName": svc.get("displayName"),
                "staffMemberIds": svc.get("staffMemberIds"),
                "isLocationOnline": svc.get("isLocationOnline"),
                "isHiddenFromCustomers": svc.get("isHiddenFromCustomers"),
                "schedulingPolicy": svc.get("schedulingPolicy"),
            }
        else:
            results["service_details_error"] = r4.text[:500]

        # Test 5: try POST with actual staff from service
        staff_ids = r4.json().get("staffMemberIds", []) if r4.ok else []
        from datetime import datetime, timedelta
        test_start = datetime.utcnow() + timedelta(days=1)
        test_start = test_start.replace(hour=10, minute=0, second=0, microsecond=0)
        test_end = test_start + timedelta(minutes=30)
        test_body = {
            "serviceId": service_id,
            "staffMemberIds": staff_ids,
            "start": {"dateTime": test_start.isoformat(), "timeZone": "Europe/London"},
            "end": {"dateTime": test_end.isoformat(), "timeZone": "Europe/London"},
            "customers": [],
        }
        r5 = requests.post(
            f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/appointments",
            json=test_body,
            headers={**headers, "Content-Type": "application/json"},
            timeout=30,
        )
        results["test_post_status"] = r5.status_code
        results["test_post_staff_used"] = staff_ids
        try:
            results["test_post_response"] = r5.json()
        except Exception:
            results["test_post_response"] = r5.text[:1000]

        return Response(results)


class CreateBookingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        business_id = os.getenv("BOOKING_BUSINESS_ID", "").strip()
        service_id = (request.data.get("service_id", "") or "").strip() or os.getenv("BOOKING_SERVICE_ID", "").strip()

        if not business_id or not service_id:
            return Response(
                {"detail": "Booking service not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        date = request.data.get("date", "").strip()
        time = request.data.get("time", "").strip()
        duration = int(request.data.get("duration", 60))
        customer_name = request.data.get("customer_name", "").strip()
        customer_email = request.data.get("customer_email", "").strip()
        notes = request.data.get("notes", "").strip()
        staff_member_id = (request.data.get("staff_member_id", "") or "").strip()

        if not date or not time:
            return Response(
                {"detail": "date and time are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Keep time as-is (UK local time) — sent with timeZone "GMT Standard Time"
            # so Microsoft interprets it directly as UK time, no conversion needed
            start_dt = datetime.fromisoformat(f"{date}T{time}:00")
        except ValueError:
            return Response(
                {"detail": "Invalid date or time format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        end_dt = start_dt + timedelta(minutes=duration)

        try:
            token = _get_booking_token()
        except Exception as exc:
            return Response(
                {"detail": f"Could not authenticate with booking service: {exc}"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        headers_auth = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Use selected staff member if provided, otherwise fetch from service
        if staff_member_id:
            staff_ids = [staff_member_id]
        else:
            staff_ids = []
            r_svc = requests.get(
                f"https://graph.microsoft.com/v1.0/solutions/bookingBusinesses/{quote(business_id, safe='')}/services/{quote(service_id, safe='')}",
                headers=headers_auth,
                timeout=20,
            )
            if r_svc.ok:
                staff_ids = r_svc.json().get("staffMemberIds") or []

        customer_entry: dict = {
            "@odata.type": "#microsoft.graph.bookingCustomerInformation",
            "name": customer_name or "Student",
        }
        if customer_email:
            customer_entry["emailAddress"] = customer_email
        if notes:
            customer_entry["notes"] = notes

        body = {
            "@odata.type": "#microsoft.graph.bookingAppointment",
            "serviceId": service_id,
            "staffMemberIds": staff_ids,
            "customerTimeZone": "GMT Standard Time",
            "isLocationOnline": True,
            "optOutOfCustomerEmail": False,
            "smsNotificationsEnabled": False,
            "startDateTime": {"dateTime": start_dt.isoformat(), "timeZone": "GMT Standard Time"},
            "endDateTime": {"dateTime": end_dt.isoformat(), "timeZone": "GMT Standard Time"},
            "additionalInformation": notes or "",
            "customers": [customer_entry],
        }
        print(f"[BOOKING] Sending payload: {body}")

        def _post(api_version: str):
            return requests.post(
                f"https://graph.microsoft.com/{api_version}/solutions/bookingBusinesses/{quote(business_id, safe='')}/appointments",
                json=body,
                headers=headers_auth,
                timeout=30,
            )

        resp = _post("v1.0")
        print(f"[BOOKING] v1.0 status={resp.status_code}")

        if resp.ok:
            data = resp.json()
            return Response(
                {
                    "reservationConfirmed": True,
                    "id": data.get("id") or data.get("eventId"),
                    "selfServiceAppointmentId": data.get("selfServiceAppointmentId"),
                    "joinWebUrl": data.get("joinWebUrl") or data.get("joinUrl"),
                },
                status=status.HTTP_201_CREATED,
            )

        # v1.0 failed — return pending (request is recorded in case notes)
        try:
            err = resp.json().get("error", {})
        except Exception:
            err = {}
        print(f"[BOOKING] v1.0 failed: {resp.status_code} {err.get('code', '')} {err.get('message', '')}")
        return Response(
            {"reservationConfirmed": False, "status": "pending"},
            status=status.HTTP_202_ACCEPTED,
        )
