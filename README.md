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

Run the isolated test suite:

```powershell
pytest -q
```

With StockFlow running in a separate terminal, run the end-to-end HTTP smoke check against a **disposable test database/account only**:

```powershell
python smoke_test.py
```

The smoke test creates two temporary accounts and products. Do not point it at a production workspace containing customer data.

## Configuration

Copy `.env.example` to `.env` and set a strong, unique `SECRET_KEY` before using a deployed environment. Never commit `.env` or database files.

## Implementation stack

Python, FastAPI, SQLAlchemy, Pydantic, HTML, CSS, vanilla JavaScript, SQLite/MySQL, Pytest, and Postman.

## Deployment

The current Render configuration uses `STOCKFLOW_API_MODE=supabase`: Render serves the StockFlow HTML/CSS/JavaScript, while sign-up, login, demo sessions, products, dashboard, and settings use the configured Supabase Edge Function and its persistent Postgres database. This mode deliberately does **not** require a second Render database; it does not use the in-memory SQLite engine for customer data. `/api/health` verifies that the UI host is up, and other local `/api/*` routes return `503` so the application cannot silently use an empty local database.

`render.yaml` sets the Supabase API origin and mode. The publishable Supabase key in `index.html` is intended for browser use; never place a Supabase service-role key or database password in the HTML, JavaScript, or GitHub. The Edge Function keeps its service key server-side and scopes every product/settings operation to the authenticated user's organization.

The alternate standalone FastAPI backend remains available by setting `STOCKFLOW_API_MODE=fastapi`. In that mode, production must have a strong unique `SECRET_KEY` and a durable external `DATABASE_URL` (Postgres or MySQL); SQLite on Render's ephemeral filesystem is rejected intentionally. Do not connect StockFlow to the unrelated ORBIT database. The free Render web service can spin down while inactive, so the first visit after idle may take longer.

After deployment, verify the Render service is `Live`, check `/api/health`, and then test new signup, login with the same credentials, wrong-password feedback, product create/edit/search/delete, dashboard totals, low-stock thresholds, demo isolation, and a second organization's data isolation. The live API smoke workflow exercises the Supabase API with throwaway accounts and products.
