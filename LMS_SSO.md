# Inclusion dashboard / LMS sign-in

The LMS sidebar opens **Inclusion System** for Super Admin and **Inclusion Ticket
System** for coaches. The dashboard redirects to LMS sign-in, then exchanges a
browser-bound, single-use assertion for its existing JWT session. Super Admin
access maps to `qa`; coach access maps to `coach`. Other access grants are denied
by the LMS backend, including when opening the link directly.

Existing dashboard accounts are linked by a unique, case-insensitive email on
first sign-in; subsequent sign-ins use the stable LMS account ID. Existing user
IDs and legacy coach mappings are retained. New users receive an unusable local
password. Disabled and ambiguous accounts are rejected. Current Inclusion
caseloads continue to resolve by verified email.

## Local configuration

Local environment files are configured with matching generated SSO secrets:

| Application | Setting | Local value |
| --- | --- | --- |
| Dashboard backend | `LMS_SSO_ENABLED` | `true` |
| Dashboard backend | `LMS_BASE_URL` | `http://localhost:3000` |
| Dashboard backend | `LMS_SSO_SECRET` | Same secret as LMS `INCLUSION_SSO_SECRET` |
| LMS backend | `INCLUSION_SSO_CALLBACK_URL` | `http://localhost:5174/login/lms/callback` |
| LMS frontend | `VITE_INCLUSION_URL` | `http://localhost:5174` |
| Dashboard frontend | `VITE_API_ORIGIN`, `VITE_AUTH_BACKEND_ORIGIN` | `http://127.0.0.1:8001` |
| Dashboard frontend | `VITE_DEV_PORT` | `5174` |

Restart the LMS backend and frontend after changing their environment files.
Keep the existing LMS backend on port 8000 and frontend on port 3000.

From `admin_dashboard/backend`:

```powershell
.venv/Scripts/python.exe manage.py runserver 127.0.0.1:8001
```

From `admin_dashboard/frontend`:

```powershell
npm run dev
```

Open the dashboard through the LMS sidebar or `http://localhost:5174/login`.
The callback and starting page must use the same origin (do not interchange
`localhost` and `127.0.0.1` for the dashboard frontend).

## Deployment

If `inclusion_state` keeps changing on the **admin** hostname, sign-in is looping.
The state belongs on the LMS `/login` URL. Verify the deployed dashboard's
`LMS_BASE_URL` is the LMS origin below, without `/login`, and verify the LMS
callback is `/login/lms/callback` on admin (not `/login`). Restart the backend
services after environment changes. New guards reject same-dashboard destinations
and incoming state on the dashboard login page rather than repeatedly starting SSO.

Production URLs are configured as the code defaults. Local `.env` overrides
remain local so development does not bounce into an undeployed production build.
On the deployed services, set these exact values (replace any old localhost values):

```dotenv
# Dashboard backend environment
LMS_SSO_ENABLED=true
LMS_BASE_URL=https://lms.kentbusinesscollege.org
# LMS backend environment
INCLUSION_SSO_CALLBACK_URL=https://admin.kentbusinesscollege.net/login/lms/callback
# LMS frontend production build environment
VITE_INCLUSION_URL=https://admin.kentbusinesscollege.net
```

The dashboard's checked-in frontend production environment already sets
`VITE_API_ORIGIN=https://admin.kentbusinesscollege.net`.

Set the same strong
secret (at least 32 characters) in their backend environments. Do not expose the
secret in any `VITE_` variable. Build the LMS frontend with `VITE_INCLUSION_URL`
set to the public dashboard origin. Configure SPA fallback for
`/login/lms/callback`, and route `/auth/lms/*/` API requests to the dashboard
backend. The new callback deliberately lives outside `/auth/` so a reverse
proxy forwarding `/auth/` to Django cannot intercept it. Vite also serves the
legacy `/auth/lms/callback` URL as a frontend page for existing local links.
Always restart sign-in from `/login` after an expired/failed attempt.

For Nginx, the existing SPA fallback must cover `/login/lms/callback`:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

Rebuild/redeploy both frontends and restart both backends after setting production
environment values. Local edits do not update the running public services.
Restrict production CORS to the dashboard origin.

Apply `python manage.py migrate accounts` on the dashboard database. Migration
`0002_lms_sso` adds the stable account link and single-use login-attempt table;
it has already been applied to the currently configured dashboard database.

When SSO is enabled, the old dashboard password, Microsoft login and JWT
password-obtain endpoints reject new sign-ins. Existing JWT sessions retain
their normal lifetime and refresh behavior; this change does not implement
cross-application logout or immediate revocation of existing sessions.

## Isolated backend checks

```powershell
# Dashboard backend: in-memory SQLite, no .env or remote databases
.venv/Scripts/python.exe manage.py test accounts.test_lms_sso --settings=server.settings_test --noinput

# LMS backend: SQLite settings, database-free SSO and mocked Graph error checks
.venv/Scripts/python.exe manage.py test login.tests_inclusion_sso login.tests_safeguarding_sso coach_api.tests_errors --settings=config.settings_sqlite_test --testrunner=django.test.runner.DiscoverRunner --noinput
```

LMS frontend checks: `npm run test:teams` and the InclusionSignIn,
SafeguardingSignIn, InclusionLinks, and SidebarExternalLinks Vitest suites.
No live Microsoft meetings or invitations are needed for these checks.

## Verification in this workspace

Callback routing follow-up: `node scripts/test-inclusion-callback.mjs` from the
LMS frontend passed seven browser scenarios against the running dashboard Vite
server (new and legacy callbacks for QA/coach, plus missing browser verifier).
Auth completion responses are mocked: these checks prove SPA routing, token
exchange handling and final navigation, not a real user's production session.
The follow-up also passed both builds, 13 LMS frontend feature tests, 10 dashboard
backend tests, 12 LMS/backend Graph-error tests and the 92-test Teams baseline.
Focused lint passed for the Vite config, navigation and browser regression script;
App.tsx still reports the existing responsive-sidebar effect lint issue.

Earlier full-project checks and their limitations:

- Dashboard isolated backend suite: 10 passed; migration consistency check passed.
- LMS SSO and mocked coach/Graph error suites: 12 passed.
- LMS Inclusion/Safeguarding sign-in and external-navigation suites: 19 passed.
- Teams frontend baseline: 92 passed before and after the LMS edits.
- Both frontend builds passed. Dashboard TypeScript and focused lint for the new
  login component and Vite configuration passed after the final component edit.
- Real headless Edge confirmed that an anonymous dashboard visit redirects to
  LMS sign-in with browser-bound state. Dashboard config returned 200; the LMS
  authorization endpoint loaded its configured secret and rejected invalid state.
- Full LMS type-check failed with 20 errors in other files. Full lint failed in
  both projects. WorkspaceSidebar tests finished with 78 passes and two failures
  in employer-page secondary navigation. These unrelated checks remain unresolved.
- Full PostgreSQL session/ownership integration suites were not run: they need
  an isolated, verified PostgreSQL fixture environment. The live databases were
  not used for mutating test suites. Authenticated end-to-end sign-in and live
  Teams operations were not exercised.
