# StockFlow MVP v0.1

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
