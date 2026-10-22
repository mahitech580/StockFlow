# Phase 1 acceptance checklist

StockFlow MVP v0.1 intentionally targets the scope-reduced six-hour MVP, not an enterprise inventory suite.

## Authentication and tenant boundaries
- [x] Signup accepts email, password and organization name.
- [x] Signup creates a workspace and links its owner.
- [x] Passwords are stored as salted PBKDF2-SHA256 hashes.
- [x] Login issues a signed, expiring bearer token.
- [x] Product reads and writes are scoped in the database query by organization.
- [x] A product SKU is unique within one organization and may be reused in another.

## Inventory
- [x] Create, list, search, view, edit and delete products.
- [x] Require product name, SKU and non-negative integer quantity.
- [x] Support optional description, cost price, selling price and threshold.
- [x] Confirm delete in the user interface.
- [x] Edit quantity directly and optionally adjust stock by a signed unit delta and note.
- [x] Store only the latest stock note/updater/timestamp; no movement ledger.

## Dashboard and settings
- [x] Show product count, sum of units on hand, and low-stock count.
- [x] Show low-stock items with name, SKU, quantity and effective threshold.
- [x] Treat quantity less than or equal to the custom threshold as low stock.
- [x] Fall back to the organization's default threshold when product threshold is blank.
- [x] Store the default threshold per organization and validate it as a non-negative integer.

## Local quality checks
- [x] Pytest coverage for authentication, CRUD, input validation, thresholds and tenant isolation.
- [x] Static frontend assets served by FastAPI.
- [x] Postman collection for the main API workflow.
- [x] GitHub Actions workflow for Python compilation, JavaScript syntax and tests.
- [x] Local SQLite; SQLAlchemy URL configuration also supports MySQL and PostgreSQL.

## Out of scope by design
No staff/invites/RBAC, multi-warehouse, variants, categories, product-specific images, channel integrations, orders, purchase orders, suppliers, email alerts, CSV imports, billing, payment flows, charts or advanced reporting.

## Before final submission
- [ ] Run the app locally from a fresh clone.
- [ ] Review the source and be ready to explain the implementation and design trade-offs.
- [ ] Verify the GitHub Actions run is green.
- [ ] Configure a production-grade secret and confirm database persistence in the hosting environment.
- [ ] Deploy the app and test the deployed URL and health endpoint.
- [ ] Submit the live URL with the assessment materials.
