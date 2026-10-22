# StockFlow MVP v0.1

[![StockFlow CI](https://github.com/mahitech580/StockFlow/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/mahitech580/StockFlow/actions/workflows/test.yml)

A scope-reduced, multi-tenant SaaS inventory management app for the Phase 1 six-hour MVP assessment.

## Scope

- Owner signup and login with hashed passwords and signed expiring tokens
- Organization creation during signup and server-side organization-scoped data access
- Product create, list, search, edit and delete with delete confirmation
- SKU uniqueness per organization
- Dashboard totals for product count and units in stock, plus low-stock products
- Product-level threshold with organization default fallback
- Minimal settings page for the default low-stock threshold
- SQLite for local development; SQLAlchemy URL configuration supports MySQL
- Pytest suite and a Postman collection
- Render/Docker configuration for deployment

## Out of scope

No staff/invites/roles, multi-warehouse, variants, integrations, orders, purchase orders, email notifications, CSV import, billing, advanced analytics, or detailed stock-movement ledger.

## Run locally (Windows PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
python db.py
uvicorn app:app --reload
```

Open http://127.0.0.1:8000. API documentation is available at http://127.0.0.1:8000/api/docs.

## Tests

```powershell
pytest -q
```

## Configuration

Copy `.env.example` to `.env` and set a strong, unique `SECRET_KEY` before using a deployed environment. Never commit `.env` or database files.

## Implementation stack

Python, FastAPI, SQLAlchemy, Pydantic, HTML, CSS, vanilla JavaScript, SQLite/MySQL, Pytest, and Postman.

## Deployment

StockFlow is a **FastAPI web service**, not a static-only website. Deploy it as a Python web service so the UI and `/api/*` routes run on the same origin. GitHub Pages can publish static files but cannot run the FastAPI API.

The committed `render.yaml` configures a Render web service and prompts for `DATABASE_URL` at initial Blueprint creation. Provide a PostgreSQL connection string for a **separate StockFlow database**. Do not point this app at another project's database and never commit credentials.

Render's free PostgreSQL plan has a 1 GB limit, is limited to one active free database per workspace, and expires after 30 days. If your workspace already uses its free database, use a separate external Postgres provider or choose a paid database plan only after reviewing the cost. The app's free web service can also spin down when idle; first requests may take longer.

After deployment:
1. Confirm the service deploy reaches the `live` state.
2. Check `https://YOUR-SERVICE.onrender.com/api/health`.
3. Sign up with a new test email, add a product, and verify the dashboard totals and low-stock behavior.
4. Restart or redeploy only after confirming your database is external and durable, not a local SQLite file on an ephemeral filesystem.
