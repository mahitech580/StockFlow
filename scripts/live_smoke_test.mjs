import { randomUUID } from "node:crypto";

const base = (process.env.STOCKFLOW_API_BASE_URL || "").replace(/\/+$/, "");
if (!base) throw new Error("STOCKFLOW_API_BASE_URL must be set");
const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
const password = "Sf-" + randomUUID() + "-Long!";
const emailA = "stockflow-ci-" + suffix + "@example.com";
const emailB = "stockflow-ci-" + suffix + "-b@example.com";
const sku = "CI-" + suffix.toUpperCase();
const check = (condition, message) => { if (!condition) throw new Error(message); };
async function call(path, options = {}) {
  const method = options.method || "GET";
  const token = options.token;
  const body = options.body;
  const expected = options.expected === undefined ? 200 : options.expected;
  const headers = new Headers();
  const apiKey = process.env.STOCKFLOW_API_KEY || "";
  if (apiKey) headers.set("apikey", apiKey);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", "Bearer " + token);
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const contentType = response.headers.get("content-type") || "";
  const data = response.status === 204 ? null : contentType.includes("application/json") ? await response.json() : await response.text();
  if (response.status !== expected) throw new Error(method + " " + path + ": expected " + expected + ", received " + response.status + ": " + (typeof data === "string" ? data.slice(0,240) : JSON.stringify(data)));
  return { response, data };
}

const health = await call("/api/health");
check(health.data.status === "ok" && health.data.database === "ok", "Health endpoint did not report a healthy database");
const preflight = await fetch(base + "/api/auth/login", {
  method: "OPTIONS",
  headers: {
    Origin: "https://mahitech580.github.io",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type,authorization",
  },
});
check(preflight.status === 204, "CORS preflight returned " + preflight.status);
check(preflight.headers.get("access-control-allow-origin") === "*", "CORS origin header missing");
check((preflight.headers.get("access-control-allow-headers") || "").toLowerCase().includes("authorization"), "CORS authorization header not allowed");

const a = await call("/api/auth/signup", { method:"POST", expected:201, body:{email:emailA,password,organization_name:"CI " + suffix} });
const tokenA = a.data.access_token;
check(typeof tokenA === "string" && tokenA.length > 20, "Signup did not return a session token");
check(a.data.user.email === emailA, "Signup user email mismatch");
const login = await call("/api/auth/login", {method:"POST",body:{email:emailA,password}});
const tokenLogin = login.data.access_token;
check(typeof tokenLogin === "string", "Login did not return an access token");
const me = await call("/api/me", {token:tokenLogin});
check(me.data.user.email === emailA, "Authenticated user identity mismatch");

const created = await call("/api/products", {
  method:"POST", token:tokenLogin, expected:201,
  body:{name:"Live smoke " + suffix,sku,description:"Disposable live API smoke test",quantity_on_hand:4,cost_price:2.5,selling_price:4.5,low_stock_threshold:null},
});
const item = created.data.item;
check(item.sku === sku && item.quantity_on_hand === 4, "Product creation values mismatch");
await call("/api/products", {
  method:"POST", token:tokenLogin, expected:409,
  body:{name:"Duplicate SKU test",sku,quantity_on_hand:1},
});
const search = await call("/api/products?q=" + encodeURIComponent(sku), {token:tokenLogin});
check(search.data.count === 1 && search.data.items[0].id === item.id, "Product search failed");
const patched = await call("/api/products/" + item.id, {method:"PATCH",token:tokenLogin,body:{quantity_on_hand:10}});
check(patched.data.item.quantity_on_hand === 10, "Product update failed");
const adjusted = await call("/api/products/" + item.id + "/adjust-stock", {method:"POST",token:tokenLogin,body:{delta:-2,note:"Live smoke adjustment"}});
check(adjusted.data.item.quantity_on_hand === 8, "Stock adjustment failed");
await call("/api/settings", {method:"PATCH",token:tokenLogin,body:{default_low_stock_threshold:9}});
const dashboard = await call("/api/dashboard", {token:tokenLogin});
check(dashboard.data.total_products === 1 && dashboard.data.total_units === 8, "Dashboard totals are incorrect");
check(dashboard.data.low_stock_count === 1, "Low-stock threshold setting did not take effect");

const b = await call("/api/auth/signup", {method:"POST",expected:201,body:{email:emailB,password,organization_name:"CI B " + suffix}});
const tokenB = b.data.access_token;
const isolated = await call("/api/products/" + item.id, {token:tokenB,expected:404});
check(isolated.data.detail === "Product not found", "Cross-organization access was not blocked");
const bProducts = await call("/api/products", {token:tokenB});
check(bProducts.data.count === 0, "Organization B can see organization A products");
const bSettings = await call("/api/settings", {token:tokenB});
check(bSettings.data.default_low_stock_threshold === 5, "Settings leaked across organizations");
await call("/api/products/" + item.id, {method:"DELETE",token:tokenLogin,expected:204});
await call("/api/products/" + item.id, {token:tokenLogin,expected:404});

console.log("PASS: live API health + database");
console.log("PASS: browser CORS preflight");
console.log("PASS: signup + login + authenticated identity");
console.log("PASS: create + duplicate SKU rejection + search + update");
console.log("PASS: stock adjustments + dashboard + threshold settings");
console.log("PASS: tenant isolation");
console.log("PASS: product deletion");
console.log("Two disposable CI accounts were created for this one-time run; their data remains isolated in StockFlow.");
