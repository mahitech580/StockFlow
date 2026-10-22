# Start Here — StockFlow MVP v0.1

## Windows setup

Run these commands from PowerShell in the extracted project folder:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
python db.py
uvicorn app:app --reload
```

Open the app at http://127.0.0.1:8000 and API docs at http://127.0.0.1:8000/api/docs.

If PowerShell blocks environment activation, run this in the same terminal and retry activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## Verify

In a second terminal, activate the environment and run the isolated test suite:

```powershell
pytest -q
```

With the app still running in the first terminal, run the live HTTP workflow check:

```powershell
python smoke_test.py
```

The smoke test creates disposable test accounts and products. Run it only against a fresh local/test database, not a production workspace.

## Before deployment

Set `APP_ENV=production` and provide a unique random `SECRET_KEY` of at least 32 characters. Configure `DATABASE_URL` for your managed database. Never commit `.env` or a local database. Verify the deployed health endpoint at `/api/health`.

## Demo flow

1. Sign up with an email, password, and organization name.
2. Add a product with quantity 3 and no custom threshold.
3. Confirm it appears under low stock when the default threshold is 5.
4. Change the default threshold to 2 and confirm the product is no longer marked low.
5. Log in as a second organization and confirm the first organization's product is not visible.
