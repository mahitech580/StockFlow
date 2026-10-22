"""End-to-end HTTP smoke test for a running StockFlow instance.

Run with:
    python smoke_test.py

The script uses only the Python standard library and creates disposable test
accounts/products in the configured instance. Point STOCKFLOW_BASE_URL at a
test deployment only; do not run this against production customer data.
"""
from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.request
from typing import Any

BASE_URL = os.getenv("STOCKFLOW_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT_SECONDS = 10
RUN_ID = secrets.token_hex(5).upper()
EMAIL_A = f"smoke-{RUN_ID.lower()}-a@example.test"
EMAIL_B = f"smoke-{RUN_ID.lower()}-b@example.test"
PASSWORD = "Smoke-test-password-2026!"
SKU = f"SMOKE-{RUN_ID}"


def request(
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    token: str | None = None,
) -> tuple[int, Any]:
    headers = {"Accept": "application/json"}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE_URL + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            raw = response.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise AssertionError(f"Could not reach {BASE_URL}{path}: {exc}") from exc

    if not raw:
        return status, None
    content_type = ""
    try:
        content_type = response.headers.get("Content-Type", "")  # type: ignore[possibly-undefined]
    except UnboundLocalError:
        pass
    if "json" in content_type.lower() or raw.lstrip().startswith((b"{", b"[")):
        try:
            return status, json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    return status, raw.decode("utf-8", errors="replace")


def expect_status(status: int, expected: int, path: str, data: Any = None) -> None:
    if status != expected:
        raise AssertionError(f"{path}: expected HTTP {expected}, got {status}: {data!r}")


def api(method: str, path: str, *, payload=None, token=None, expected=200):
    status, data = request(method, path, payload=payload, token=token)
    expect_status(status, expected, path, data)
    return data


def signup(email: str, organization_name: str) -> tuple[str, dict[str, Any]]:
    data = api(
        "POST",
        "/api/auth/signup",
        payload={
            "email": email,
            "password": PASSWORD,
            "organization_name": organization_name,
        },
        expected=201,
    )
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == email
    assert data["user"]["organization_name"] == organization_name
    assert data["access_token"]
    return data["access_token"], data["user"]


def main() -> None:
    print(f"StockFlow HTTP smoke test: {BASE_URL}")
    health = api("GET", "/api/health")
    assert health == {"status": "ok", "service": "stockflow", "database": "ok"}
    assert "StockFlow" in api("GET", "/")
    assert "theme-toggle" in api("GET", "/").lower()
    assert ".main-panel" in api("GET", "/style.css")
    assert "function renderDashboard" in api("GET", "/script.js")
    print("PASS: health endpoint and frontend assets")

    status, _ = request("GET", "/api/products")
    expect_status(status, 401, "/api/products without a token")
    token_a, user_a = signup(EMAIL_A, f"Smoke Store A {RUN_ID}")
    logged_in = api("POST", "/api/auth/login", payload={"email": EMAIL_A, "password": PASSWORD})
    token_a = logged_in["access_token"]
    api("GET", "/api/me", token=token_a)
    print("PASS: signup, login, authenticated identity")

    product = api(
        "POST",
        "/api/products",
        token=token_a,
        expected=201,
        payload={
            "name": "HTTP Smoke Product",
            "sku": SKU,
            "description": "Disposable CI smoke-test record",
            "quantity_on_hand": 3,
            "cost_price": 10.5,
            "selling_price": 18.0,
            "low_stock_threshold": None,
        },
    )["item"]
    product_id = product["id"]
    assert product["organization_id"] == user_a["organization_id"]
    assert product["effective_low_stock_threshold"] == 5
    assert product["is_low_stock"] is True
    duplicate = request(
        "POST",
        "/api/products",
        token=token_a,
        payload={"name": "Duplicate SKU", "sku": SKU.lower(), "quantity_on_hand": 1},
    )
    expect_status(duplicate[0], 409, "duplicate SKU in the same organization", duplicate[1])
    results = api("GET", f"/api/products?q={SKU.lower()}", token=token_a)
    assert results["count"] == 1 and results["items"][0]["id"] == product_id
    print("PASS: product creation, SKU uniqueness, normalized search")

    dashboard = api("GET", "/api/dashboard", token=token_a)
    assert dashboard["total_products"] == 1
    assert dashboard["total_units"] == 3
    assert dashboard["low_stock_count"] == 1
    row = dashboard["low_stock_items"][0]
    assert (row["name"], row["sku"], row["quantity_on_hand"], row["effective_low_stock_threshold"]) == (
        "HTTP Smoke Product", SKU, 3, 5
    )
    api("PATCH", "/api/settings", token=token_a, payload={"default_low_stock_threshold": 2})
    assert api("GET", "/api/products", token=token_a)["items"][0]["is_low_stock"] is False
    api("PATCH", f"/api/products/{product_id}", token=token_a, payload={"quantity_on_hand": 2})
    assert api("GET", f"/api/products/{product_id}", token=token_a)["item"]["is_low_stock"] is True
    print("PASS: dashboard totals and threshold fallback/equality")

    adjusted = api(
        "POST",
        f"/api/products/{product_id}/adjust-stock",
        token=token_a,
        expected=200,
        payload={"delta": 2, "note": "Smoke test delivery"},
    )["item"]
    assert adjusted["quantity_on_hand"] == 4
    assert adjusted["last_stock_note"] == "Smoke test delivery"
    too_low = request(
        "POST",
        f"/api/products/{product_id}/adjust-stock",
        token=token_a,
        payload={"delta": -99, "note": "Invalid test change"},
    )
    expect_status(too_low[0], 422, "stock cannot become negative", too_low[1])
    print("PASS: stock adjustment and quantity bounds")

    token_b, user_b = signup(EMAIL_B, f"Smoke Store B {RUN_ID}")
    assert user_a["organization_id"] != user_b["organization_id"]
    assert api("GET", "/api/products", token=token_b)["count"] == 0
    status, missing = request("GET", f"/api/products/{product_id}", token=token_b)
    expect_status(status, 404, "cross-organization product detail", missing)
    same_sku_other_org = api(
        "POST",
        "/api/products",
        token=token_b,
        expected=201,
        payload={"name": "Tenant B Product", "sku": SKU, "quantity_on_hand": 8},
    )["item"]
    assert same_sku_other_org["organization_id"] == user_b["organization_id"]
    api("PATCH", "/api/settings", token=token_b, payload={"default_low_stock_threshold": 9})
    assert api("GET", "/api/settings", token=token_a)["default_low_stock_threshold"] == 2
    assert api("GET", "/api/settings", token=token_b)["default_low_stock_threshold"] == 9
    print("PASS: organization isolation and per-organization SKU uniqueness/settings")

    api("DELETE", f"/api/products/{product_id}", token=token_a, expected=204)
    assert api("GET", "/api/products", token=token_a)["count"] == 0
    assert api("GET", "/api/products", token=token_b)["count"] == 1
    api("DELETE", f"/api/products/{same_sku_other_org['id']}", token=token_b, expected=204)
    print("PASS: delete confirmation API endpoint and tenant-scoped persistence")
    print("SUCCESS: all StockFlow HTTP smoke checks passed")


if __name__ == "__main__":
    main()
