import os
import json
import time
from pathlib import Path

import requests

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


# Spreadsheet ID from the URL
SPREADSHEET_ID = "1K5gdYpM3ULvMZ-5SisQZjXSSdtoT1p3Fl6gS-rxMuCg"

# Group to sheet name mapping (from PHP code)
# Extended to support more groups
GROUP_SHEET_MAPPING = {
    "A": "Level 3 CM",
    "B": "Level 5 LO",
    "C": "Level 5 HRM",
    "D": "Level 5 Business Management",
    "E": "Top-up",
    "PCP": "PCP",  # PCP maps to PCP sheet
    "ME": "ME",    # ME maps to ME sheet  
    "PDF": "PDF",  # PDF maps to PDF sheet
}


def get_service_account_path():
    """Get path to service account JSON file"""
    # Try backend directory first
    backend_dir = Path(settings.BASE_DIR)
    sa_path = backend_dir / "ai-marking-tool-480910-1f3c7a43f500.json"
    
    if sa_path.exists():
        return str(sa_path)
    
    return None


def get_sheets_service():
    """Create authenticated Google Sheets service"""
    sa_path = get_service_account_path()
    
    if not sa_path:
        raise ValueError("Service account file not found")
    
    credentials = service_account.Credentials.from_service_account_file(
        sa_path,
        scopes=['https://www.googleapis.com/auth/spreadsheets']
    )
    
    service = build('sheets', 'v4', credentials=credentials)
    return service


def get_marking_webhook_url(route_key):
    """Resolve the N8N webhook URL for a given sheet/program key."""
    normalized = str(route_key or '').strip().upper().replace('-', '_').replace(' ', '_')
    env_keys = [
        f'N8N_WEBHOOK_URL_{normalized}',
        'N8N_WEBHOOK_URL',
    ]
    for env_key in env_keys:
        value = os.getenv(env_key, '').strip()
        if value:
            return value
    return ''


def trigger_marking_webhook(route_key, payload):
    """Trigger the configured N8N webhook for the mark-evidence workflow."""
    webhook_url = get_marking_webhook_url(route_key)
    if not webhook_url:
        raise ValueError(f"No webhook URL configured for '{route_key}'")

    response = requests.post(
        webhook_url,
        json=payload,
        headers={'Content-Type': 'application/json'},
        timeout=20,
    )
    response.raise_for_status()
    return {
        'webhook_url': webhook_url,
        'status_code': response.status_code,
        'response_text': response.text[:500] if response.text else '',
    }


def get_sheets_list(service, spreadsheet_id):
    """Get list of all sheets in the spreadsheet"""
    try:
        spreadsheet = service.spreadsheets().get(
            spreadsheetId=spreadsheet_id,
            fields='sheets.properties'
        ).execute()
        
        sheets = []
        for sheet in spreadsheet.get('sheets', []):
            props = sheet.get('properties', {})
            sheets.append({
                'title': props.get('title'),
                'sheetId': props.get('sheetId'),
                'index': props.get('index')
            })
        
        return sheets
    except HttpError as e:
        raise ValueError(f"Failed to get sheets list: {e}")


def get_sheet_data(service, spreadsheet_id, range_name):
    """Fetch data from a specific sheet range"""
    try:
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=range_name
        ).execute()
        
        return result.get('values', [])
    except HttpError as e:
        raise ValueError(f"Failed to get sheet data: {e}")


def find_student_in_sheets(service, spreadsheet_id, student_email=None, student_id=None, student_name=None):
    """
    Find student in the spreadsheet and return their row data and sheet info.
    Behavior:
    - If `student_name` is provided, search the specific sheets (PCP, PCP-fanar, ME, MM, MRE)
      in column B (username) and return the matching sheet as the target sheet.
    - Otherwise, fall back to the original email/ID search across all sheets.
    The returned dict includes `student_data`, `group` (if available), `target_sheet`,
    `student_email`, `student_id`, and `program` (if present in the matched row/header).
    """
    if not student_email and not student_id and not student_name:
        raise ValueError("Either student_email, student_id, or student_name is required")

    search_email = student_email.lower().strip() if student_email else None
    search_id = str(student_id).strip() if student_id else None
    search_name = student_name.lower().strip() if student_name else None

    sheets = get_sheets_list(service, spreadsheet_id)

    # 1) If student_id provided, search the specific sheets' column A (index 0)
    target_sheet_names = {s.lower() for s in ["PCP", "PCP-fanar", "ME", "MM", "MRE"]}
    if search_id:
        for sheet in sheets:
            title = sheet.get('title') or ''
            if title.lower() not in target_sheet_names:
                continue

            try:
                rows = get_sheet_data(service, spreadsheet_id, f"{title}!A:Z")
            except:
                continue

            if not rows:
                continue

            # search column A (index 0)
            for i, row in enumerate(rows):
                if len(row) < 1:
                    continue
                try:
                    sid = str(row[0]).strip()
                except Exception:
                    sid = ""
                if not sid:
                    continue
                if sid == search_id or sid == str(search_id):
                    # try to extract program from header row
                    program_value = None
                    header_row = rows[0] if len(rows) > 0 else None
                    if header_row:
                        for idx, h in enumerate(header_row):
                            if isinstance(h, str) and ('program' in h.lower() or 'programme' in h.lower() or 'program name' in h.lower()):
                                if idx < len(row):
                                    program_value = row[idx]
                                break

                    return {
                        'student_data': {
                            'row': row,
                            'row_index': i,
                            'sheet_title': title,
                        },
                        'group': title,
                        'target_sheet': title,
                        'student_email': row[1] if len(row) > 1 else '',
                        'student_id': row[0] if len(row) > 0 else '',
                        'program': program_value,
                    }

    # 2) Name-based search in specific sheets (column B)
    if search_name:
        for sheet in sheets:
            title = sheet.get('title') or ''
            if title.lower() not in target_sheet_names:
                continue

            try:
                rows = get_sheet_data(service, spreadsheet_id, f"{title}!A:Z")
            except:
                continue

            if not rows:
                continue

            # search column B (index 1)
            for i, row in enumerate(rows):
                if len(row) < 2:
                    continue
                try:
                    uname = str(row[1]).lower().strip()
                except Exception:
                    uname = ""
                if not uname:
                    continue
                if uname == search_name or search_name in uname:
                    # try to extract program from header row
                    program_value = None
                    header_row = rows[0] if len(rows) > 0 else None
                    if header_row:
                        for idx, h in enumerate(header_row):
                            if isinstance(h, str) and ('program' in h.lower() or 'programme' in h.lower() or 'program name' in h.lower()):
                                if idx < len(row):
                                    program_value = row[idx]
                                break

                    return {
                        'student_data': {
                            'row': row,
                            'row_index': i,
                            'sheet_title': title,
                        },
                        'group': title,
                        'target_sheet': title,
                        'student_email': row[1] if len(row) > 1 else '',
                        'student_id': row[0] if len(row) > 0 else '',
                        'program': program_value,
                    }

    # 2) Fallback: email/ID search across all sheets (original behavior)
    found_data = None
    found_rows = None
    for sheet in sheets:
        title = sheet.get('title') or ''
        if 'output' in title.lower():
            continue

        try:
            rows = get_sheet_data(service, spreadsheet_id, f"{title}!A:Z")
        except:
            continue

        if not rows or len(rows) < 2:
            continue

        for i, row in enumerate(rows):
            if len(row) < 1:
                continue

            # Skip header row heuristics
            if i == 0 and any(isinstance(cell, str) and cell.lower() in ['email', 'student email', 'id', 'student id', 'name'] for cell in row[:6]):
                continue

            match = False
            if search_email:
                for col_idx in range(min(6, len(row))):
                    cell_value = str(row[col_idx]).lower().strip()
                    if cell_value == search_email:
                        match = True
                        break

            if not match and search_id:
                for col_idx in range(min(2, len(row))):
                    cell_value = str(row[col_idx]).strip()
                    if cell_value == search_id:
                        match = True
                        break

            if match:
                found_data = {
                    'row': row,
                    'row_index': i,
                    'sheet_title': title,
                }
                found_rows = rows
                break

        if found_data:
            break

    if not found_data:
        sheets_searched = [s.get('title') for s in sheets if 'output' not in (s.get('title') or '').lower()]
        raise ValueError(
            f"Student not found in any sheet. Searched for email='{student_email}' or id='{student_id}' or name='{student_name}'. Sheets searched: {', '.join(sheets_searched[:5])}..."
        )

    # Determine target sheet: prefer mapping from group column (index 4), otherwise use the sheet where the student was found
    group = found_data['row'][4] if len(found_data['row']) > 4 else None
    target_sheet_name = None
    if group:
        target_sheet_name = GROUP_SHEET_MAPPING.get(group) or group
        # if mapped target doesn't exist, fallback to found sheet
        if not any(s.get('title') == target_sheet_name for s in sheets):
            target_sheet_name = found_data['sheet_title']
    else:
        target_sheet_name = found_data['sheet_title']

    # Try to extract program from the sheet where the student was found
    program_value = None
    try:
        if found_rows and len(found_rows) > 0:
            header_row = found_rows[0]
            for idx, cell in enumerate(header_row):
                if isinstance(cell, str) and ('program' in cell.lower() or 'programme' in cell.lower() or 'program name' in cell.lower()):
                    if idx < len(found_data['row']):
                        program_value = found_data['row'][idx]
                    break
    except Exception:
        program_value = None

    return {
        'student_data': found_data,
        'group': group,
        'target_sheet': target_sheet_name,
        'student_email': found_data['row'][1] if len(found_data['row']) > 1 else '',
        'student_id': found_data['row'][0] if len(found_data['row']) > 0 else '',
        'program': program_value,
    }
    # Get target sheet based on group mapping
    target_sheet_name = GROUP_SHEET_MAPPING.get(group)
    
    if not target_sheet_name:
        # If no mapping exists, try using the group name directly as sheet name
        target_sheet_name = group
    
    # Verify target sheet exists
    target_exists = any(s['title'] == target_sheet_name for s in sheets)
    if not target_exists:
        available_sheets = [s['title'] for s in sheets if 'output' not in s['title'].lower()]
        raise ValueError(
            f"Target sheet '{target_sheet_name}' for group '{group}' not found. "
            f"Available sheets: {', '.join(available_sheets[:10])}"
        )

    # Try to extract program from the sheet where the student was found
    program_value = None
    try:
        if found_rows and len(found_rows) > 0:
            header_row = found_rows[0]
            program_idx = None
            for idx, cell in enumerate(header_row):
                if isinstance(cell, str) and ('program' in cell.lower() or 'programme' in cell.lower() or 'program name' in cell.lower()):
                    program_idx = idx
                    break

            if program_idx is not None and program_idx < len(found_data['row']):
                program_value = found_data['row'][program_idx]
    except Exception:
        program_value = None

    return {
        'student_data': found_data,
        'group': group,
        'target_sheet': target_sheet_name,
        'student_email': found_data['row'][1] if len(found_data['row']) > 1 else '',
        'student_id': found_data['row'][0] if len(found_data['row']) > 0 else '',
        'program': program_value
    }


def get_student_components(service, spreadsheet_id, student_email=None, student_id=None, student_name=None):
    """
    Main function to get student components from Google Sheets
    Returns component name and evidence data
    """
    # Find student and get group/target sheet
    student_info = find_student_in_sheets(service, spreadsheet_id, student_email, student_id, student_name)
    
    target_sheet = student_info['target_sheet']
    student_email_found = student_info['student_email']
    student_id_found = student_info['student_id']
    
    # Fetch target sheet data
    range_name = f"{target_sheet}!A:Z"
    rows = get_sheet_data(service, spreadsheet_id, range_name)
    
    if not rows:
        raise ValueError(f"No data in target sheet: {target_sheet}")
    
    # Detect component column index (search for 'component' in header)
    component_index = None
    evidence_index = None
    program_index = None
    
    if rows and len(rows) > 0:
        header_row = rows[0]
        for idx, cell in enumerate(header_row):
            if isinstance(cell, str) and 'component' in cell.lower():
                component_index = idx
            if isinstance(cell, str) and 'evidence' in cell.lower():
                evidence_index = idx
            # look for program / programme / program name
            if isinstance(cell, str) and ('program' in cell.lower() or 'programme' in cell.lower()):
                program_index = idx
    
    if component_index is None:
        component_index = 3  # Default fallback
    
    if evidence_index is None:
        evidence_index = 4  # Default fallback
    
    # Determine starting row (skip header if it contains 'component')
    start_row = 0
    if rows and len(rows) > 0 and component_index < len(rows[0]):
        if isinstance(rows[0][component_index], str) and 'component' in rows[0][component_index].lower():
            start_row = 1
    
    # Find the student's row in target sheet
    component_name = None
    evidence_data = None
    program_value = None
    
    for i in range(start_row, len(rows)):
        row = rows[i]
        
        if len(row) < 2:
            continue
        
        row_id = row[0] if len(row) > 0 else ''
        row_email = row[1] if len(row) > 1 else ''
        
        # Match student
        match = False
        if student_email_found and isinstance(row_email, str) and row_email.lower().strip() == student_email_found.lower().strip():
            match = True
        elif student_id_found and str(row_id).strip() == str(student_id_found).strip():
            match = True
        
        if match:
            # Get component name
            if component_index < len(row):
                component_name = row[component_index]
            
            # Get evidence data
            if evidence_index < len(row):
                evidence_data = row[evidence_index]
            # Get program value if available
            if program_index is not None and program_index < len(row):
                program_value = row[program_index]
            
            break
    
    # If component not found in the chosen target sheet, try falling back to
    # the original sheet where the student row was discovered (if available).
    if not component_name:
        try:
            src = student_info.get('student_data') if isinstance(student_info, dict) else None
            if src and isinstance(src, dict):
                src_sheet = src.get('sheet_title')
                src_row = src.get('row')
                if src_sheet and src_row:
                    try:
                        src_rows = get_sheet_data(get_sheets_service(), SPREADSHEET_ID, f"{src_sheet}!A:Z")
                    except Exception:
                        src_rows = None

                    if src_rows and len(src_rows) > 0:
                        # detect indices in source sheet header
                        src_component_idx = None
                        src_evidence_idx = None
                        hdr = src_rows[0]
                        for idx, cell in enumerate(hdr):
                            if isinstance(cell, str) and 'component' in cell.lower():
                                src_component_idx = idx
                            if isinstance(cell, str) and 'evidence' in cell.lower():
                                src_evidence_idx = idx

                        if src_component_idx is not None and src_component_idx < len(src_row):
                            component_name = src_row[src_component_idx]
                        if src_evidence_idx is not None and src_evidence_idx < len(src_row):
                            evidence_data = src_row[src_evidence_idx]

                        # If we found component info in source sheet, use that as the target
                        if component_name:
                            target_sheet = src_sheet
        except Exception:
            pass

    # Build components_parsed: prefer explicit component column, else try to parse Evidence JSON
    components_parsed = None
    if component_name:
        if isinstance(component_name, str):
            try:
                components_parsed = json.loads(component_name)
            except Exception:
                components_parsed = component_name
        else:
            components_parsed = component_name
    else:
        # No explicit component column; attempt to extract components from evidence_data JSON
        components_parsed = []
        if isinstance(evidence_data, str) and evidence_data.strip():
            try:
                parsed_evidence = json.loads(evidence_data)
                if isinstance(parsed_evidence, list):
                    seen = {}
                    for ev in parsed_evidence:
                        if not isinstance(ev, dict):
                            continue
                        comp_id = ev.get('ComponentId') or ev.get('componentId') or ev.get('ComponentID')
                        comp_name = ev.get('ComponentName') or ev.get('componentName') or ev.get('Name') or ev.get('name')
                        if comp_id:
                            key = str(comp_id)
                            if key not in seen:
                                seen[key] = {'componentId': comp_id, 'componentName': comp_name or ''}
                    components_parsed = list(seen.values())
                else:
                    # parsed evidence is not a list; keep as-is
                    components_parsed = parsed_evidence
            except Exception:
                components_parsed = []

    if not components_parsed:
        raise ValueError(f"Component data not found for student in target sheet '{target_sheet}'")
    
    return {
        'student_id': student_id_found,
        'student_email': student_email_found,
        'group': student_info.get('group') or target_sheet,
        'target_sheet': target_sheet,
        'components': components_parsed,
        'evidence': evidence_data,
        'raw_component_name': component_name,
        # prefer program found in the target sheet; fallback to program from the source sheet
        'program': program_value if program_value is not None else student_info.get('program')
    }


class GetStudentComponentsView(APIView):
    """
    API endpoint to fetch student components from Google Sheets
    GET /api/accounts/student-components/?student_email=xxx@xxx.com
    or
    GET /api/accounts/student-components/?student_id=1234
    """
    # Allow anonymous access when running in DEBUG for local testing (no token required).
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]
    
    def get(self, request):
        student_email = request.GET.get('student_email', '').strip()
        student_id = request.GET.get('student_id', '').strip()
        student_name = request.GET.get('student_name', '').strip()
        debug = request.GET.get('debug', '').strip() in ['1', 'true', 'yes']

        if not student_email and not student_id and not student_name:
            return Response(
                {'error': 'Either student_email, student_id, or student_name is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Get authenticated Sheets service
            service = get_sheets_service()
            
            # Fetch student components
            result = get_student_components(
                service,
                SPREADSHEET_ID,
                student_email=student_email if student_email else None,
                student_id=student_id if student_id else None,
                student_name=student_name if student_name else None,
            )

            # If debug requested, include internal matching info
            if debug:
                debug_info = {
                    'requested': {
                        'student_email': student_email,
                        'student_id': student_id,
                        'student_name': student_name,
                    },
                    'result_keys': list(result.keys()) if isinstance(result, dict) else None,
                    'target_sheet': result.get('target_sheet') if isinstance(result, dict) else None,
                    'program': result.get('program') if isinstance(result, dict) else None,
                }
                return Response({
                    'success': True,
                    'data': result,
                    'debug': debug_info,
                })
            
            return Response({
                'success': True,
                'data': result
            })
            
        except ValueError as e:
            if debug:
                try:
                    svc = get_sheets_service()
                    student_info_dbg = find_student_in_sheets(
                        svc,
                        SPREADSHEET_ID,
                        student_email=student_email if student_email else None,
                        student_id=student_id if student_id else None,
                        student_name=student_name if student_name else None,
                    )

                    target = student_info_dbg.get('target_sheet') if isinstance(student_info_dbg, dict) else None
                    target_header = None
                    target_row = None
                    header_error = None

                    if target:
                        try:
                            rows_t = get_sheet_data(svc, SPREADSHEET_ID, f"{target}!A:Z")
                            if rows_t and len(rows_t) > 0:
                                target_header = rows_t[0]
                                # try to find student row in target sheet
                                for idx, r in enumerate(rows_t):
                                    if idx == 0:
                                        continue
                                    # match by id or email or name
                                    try:
                                        if student_id and len(r) > 0 and str(r[0]).strip() == str(student_id):
                                            target_row = r
                                            break
                                        if student_email and len(r) > 1 and str(r[1]).lower().strip() == student_email.lower().strip():
                                            target_row = r
                                            break
                                        if student_name and len(r) > 1 and student_name.lower().strip() in str(r[1]).lower().strip():
                                            target_row = r
                                            break
                                    except Exception:
                                        continue
                        except Exception as ex:
                            header_error = str(ex)

                    # source sheet info
                    source_info = None
                    try:
                        sd = student_info_dbg.get('student_data') if isinstance(student_info_dbg, dict) else None
                        if sd:
                            source_info = {
                                'sheet': sd.get('sheet_title'),
                                'row_index': sd.get('row_index'),
                                'row': sd.get('row'),
                            }
                    except Exception:
                        source_info = None

                    debug_payload = {
                        'requested': {
                            'student_email': student_email,
                            'student_id': student_id,
                            'student_name': student_name,
                        },
                        'student_info': student_info_dbg,
                        'target_header': target_header,
                        'target_row': target_row,
                        'source_info': source_info,
                        'header_error': header_error,
                    }

                    return Response({'error': str(e), 'debug': debug_payload}, status=status.HTTP_404_NOT_FOUND)
                except Exception as ex:
                    return Response({'error': str(e), 'debug_error': str(ex)}, status=status.HTTP_404_NOT_FOUND)

            return Response(
                {'error': str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': f'Failed to fetch student components: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class MarkEvidenceView(APIView):
    """
    API endpoint to mark evidence by submitting to processing sheet
    and waiting for results from output sheet
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        Mark evidence - submit to processing sheet and poll for results
        
        Expected payload:
        {
            "student_id": "...",
            "student_email": "...",
            "group": "PCP",
            "evidence_id": 15009,
            "evidence_name": "...",
            "evidence_url": "...",
            "evidence_status": "PendingAssessment",
            "evidence_created_date": "2025-11-16T15:46:14.556909Z",
            "component_id": 19129,
            "components": [{"componentId": 19129, "componentName": "Managing Portfolios"}]
        }
        """
        # Extract data from request
        student_id = request.data.get('student_id')
        student_email = request.data.get('student_email')
        student_name = request.data.get('student_name', student_email)
        group = request.data.get('target_sheet') or request.data.get('group') or request.data.get('program')
        evidence_id = request.data.get('evidence_id')
        evidence_name = request.data.get('evidence_name')
        evidence_url = request.data.get('evidence_url')
        evidence_status = request.data.get('evidence_status')
        evidence_created_date = request.data.get('evidence_created_date')
        component_id = request.data.get('component_id')
        components = request.data.get('components', [])
        
        # Validate required fields
        if not all([student_id, evidence_id, component_id]) or not group:
            missing = []
            if not student_id:
                missing.append('student_id')
            if not group:
                missing.append('target_sheet|group|program')
            if not evidence_id:
                missing.append('evidence_id')
            if not component_id:
                missing.append('component_id')
            return Response(
                {'error': f"Missing required fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Get authenticated Sheets service
            service = get_sheets_service()
            
            # Find component name from components array
            component_name = "Unknown Component"
            if isinstance(components, list):
                for comp in components:
                    comp_id = comp.get('componentId') or comp.get('ComponentId')
                    comp_name = comp.get('componentName') or comp.get('ComponentName')
                    if comp_id == component_id and comp_name:
                        component_name = comp_name
                        break
            elif isinstance(components, str):
                # Try to parse if it's a JSON string
                try:
                    components_list = json.loads(components)
                    for comp in components_list:
                        comp_id = comp.get('componentId') or comp.get('ComponentId')
                        comp_name = comp.get('componentName') or comp.get('ComponentName')
                        if comp_id == component_id and comp_name:
                            component_name = comp_name
                            break
                except:
                    pass
            
            # Get processing sheet name
            processing_sheet = f"{group} processing sheet"
            
            # Prepare row data for processing sheet
            # Columns: UserId, UserName, ComponentId, ComponentName, EvidenceId, 
            #          EvidenceName, EvidenceUrl, EvidenceStatus, EvidenceCreatedDate
            row_data = [
                str(student_id),
                str(student_name),
                str(component_id),
                str(component_name),
                str(evidence_id),
                str(evidence_name),
                str(evidence_url),
                str(evidence_status),
                str(evidence_created_date),
            ]
            
            # Append to processing sheet
            append_range = f"'{processing_sheet}'!A:I"
            body = {
                'values': [row_data]
            }
            
            result = service.spreadsheets().values().append(
                spreadsheetId=SPREADSHEET_ID,
                range=append_range,
                valueInputOption='RAW',
                insertDataOption='INSERT_ROWS',
                body=body
            ).execute()

            webhook_payload = {
                'student_id': str(student_id),
                'student_name': str(student_name),
                'student_email': str(student_email or ''),
                'target_sheet': str(group),
                'group': str(group),
                'program': str(request.data.get('program') or group),
                'evidence_id': str(evidence_id),
                'evidence_name': str(evidence_name),
                'evidence_url': str(evidence_url),
                'evidence_status': str(evidence_status),
                'evidence_created_date': str(evidence_created_date),
                'component_id': str(component_id),
                'component_name': str(component_name),
                'processing_sheet': processing_sheet,
                'output_sheet': f"{group} Output",
                'sheet_append_result': result,
            }

            webhook_result = trigger_marking_webhook(group, webhook_payload)
            
            # Poll output sheet for results
            output_sheet = f"{group} Output"
            max_polls = 20  # Poll for up to 60 seconds (20 * 3s)
            poll_interval = 3  # seconds
            
            marking_result = None
            for poll_count in range(max_polls):
                time.sleep(poll_interval)
                
                # Read output sheet
                try:
                    output_range = f"'{output_sheet}'!A:Z"
                    output_result = service.spreadsheets().values().get(
                        spreadsheetId=SPREADSHEET_ID,
                        range=output_range
                    ).execute()
                    
                    output_rows = output_result.get('values', [])
                    if not output_rows:
                        continue
                    
                    # First row is headers
                    headers = output_rows[0] if output_rows else []
                    
                    # Find evidence_id column (usually column E - EvidenceId)
                    evidence_id_col = -1
                    for idx, header in enumerate(headers):
                        if header.lower() in ['evidenceid', 'evidence_id', 'evidence id']:
                            evidence_id_col = idx
                            break
                    
                    if evidence_id_col == -1:
                        continue
                    
                    # Search for matching evidence_id in output sheet
                    for row in output_rows[1:]:  # Skip header row
                        if len(row) > evidence_id_col:
                            row_evidence_id = str(row[evidence_id_col])
                            if row_evidence_id == str(evidence_id):
                                # Found result - build result object
                                marking_result = {}
                                for idx, header in enumerate(headers):
                                    if idx < len(row):
                                        marking_result[header] = row[idx]
                                break
                    
                    if marking_result:
                        break
                        
                except HttpError as e:
                    # Output sheet might not exist yet
                    if poll_count < max_polls - 1:
                        continue
                    else:
                        raise
            
            if marking_result:
                return Response({
                    'success': True,
                    'message': 'Evidence marked successfully',
                    'webhook_triggered': True,
                    'webhook': webhook_result,
                    'data': marking_result
                })
            else:
                return Response({
                    'success': False,
                    'message': 'Evidence submitted but marking result not ready yet. Please check later.',
                    'webhook_triggered': True,
                    'webhook': webhook_result,
                    'data': {
                        'submitted': True,
                        'processing_sheet': processing_sheet,
                        'output_sheet': output_sheet,
                        'evidence_id': evidence_id
                    }
                })
            
        except HttpError as e:
            return Response(
                {'error': f'Google Sheets API error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except requests.RequestException as e:
            return Response(
                {'error': f'Failed to trigger marking webhook: {str(e)}'},
                status=status.HTTP_502_BAD_GATEWAY
            )
        except Exception as e:
            return Response(
                {'error': f'Failed to mark evidence: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PollMarkingReportView(APIView):
    """Poll an output sheet for a completed marking report."""
    permission_classes = [AllowAny] if settings.DEBUG else [IsAuthenticated]

    def get(self, request):
        evidence_id = request.GET.get('evidence_id', '').strip()
        group = request.GET.get('group', '').strip()
        program = request.GET.get('program', '').strip()

        if not evidence_id:
            return Response(
                {'error': 'evidence_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        route_key = group or program
        if not route_key:
            return Response(
                {'error': 'group or program is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        output_sheet = self._resolve_output_sheet(route_key)
        if not output_sheet:
            return Response(
                {'error': f"Unable to resolve output sheet for '{route_key}'"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            service = get_sheets_service()
            output_range = f"'{output_sheet}'!A:Z"
            output_result = service.spreadsheets().values().get(
                spreadsheetId=SPREADSHEET_ID,
                range=output_range
            ).execute()

            output_rows = output_result.get('values', [])
            if not output_rows:
                return Response({'found': False, 'output_sheet': output_sheet, 'data': None})

            headers = output_rows[0]
            evidence_id_col = -1
            for idx, header in enumerate(headers):
                header_text = str(header).strip().lower()
                if header_text in ['evidenceid', 'evidence_id', 'evidence id']:
                    evidence_id_col = idx
                    break

            if evidence_id_col == -1:
                evidence_id_col = next((i for i, header in enumerate(headers) if 'evidence' in str(header).lower() and 'id' in str(header).lower()), -1)

            if evidence_id_col == -1:
                return Response({'found': False, 'output_sheet': output_sheet, 'data': None})

            for row in output_rows[1:]:
                if len(row) <= evidence_id_col:
                    continue
                if str(row[evidence_id_col]).strip() != str(evidence_id):
                    continue

                payload = {}
                for idx, header in enumerate(headers):
                    if idx < len(row):
                        payload[str(header)] = row[idx]

                marking_report = self._extract_marking_report(payload)
                if marking_report is not None:
                    payload['marking_report'] = marking_report

                return Response({
                    'found': True,
                    'output_sheet': output_sheet,
                    'data': payload,
                })

            return Response({'found': False, 'output_sheet': output_sheet, 'data': None})
        except HttpError as e:
            return Response(
                {'error': f'Google Sheets API error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return Response(
                {'error': f'Failed to poll marking report: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _resolve_output_sheet(self, route_key):
        normalized = route_key.strip().lower().replace('-', '_').replace(' ', '_')
        if normalized in ['pcp', 'pcp_fanar', 'me', 'mm', 'mre']:
            env_key = f"OUTPUT_SHEET_{normalized.upper()}"
            return os.getenv(env_key) or f"{route_key} output"

        for key, value in GROUP_SHEET_MAPPING.items():
            if str(key).strip().lower() == normalized:
                env_key = f"OUTPUT_SHEET_{str(key).upper().replace('-', '_')}"
                return os.getenv(env_key) or f"{value} output"

        return os.getenv(f"OUTPUT_SHEET_{normalized.upper()}") or f"{route_key} output"

    def _extract_marking_report(self, payload):
        for key, value in payload.items():
            key_text = str(key).strip().lower().replace('_', '')
            if key_text in ['markingreport', 'report', 'ai_feedback', 'aifeedback']:
                return value
        return None
