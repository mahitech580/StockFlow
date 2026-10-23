import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS", "Access-Control-Max-Age": "600" };
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const int = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
async function body(req: Request): Promise<Record<string, any>> {
  try { const v = await req.json(); if (!v || typeof v !== "object" || Array.isArray(v)) fail(422, "Send a JSON object"); return v; }
  catch (e) { if (e instanceof ApiError) throw e; fail(400, "Invalid JSON request"); }
}
function pathOf(url: URL) { const p = url.pathname; const i = p.indexOf("/stockflow-api"); return i < 0 ? p : p.slice(i + "/stockflow-api".length) || "/"; }
async function userOf(req: Request) {
  const header = req.headers.get("authorization") || "";
  if (!/^Bearer\s+/i.test(header)) fail(401, "Please log in to continue");
  const { data, error } = await db.auth.getUser(header.replace(/^Bearer\s+/i, "").trim());
  if (error || !data.user) fail(401, "Session expired. Please log in again.");
  const { data: profile, error: pe } = await db.from("stockflow_profiles").select("user_id,email,organization_id").eq("user_id", data.user.id).maybeSingle();
  if (pe) fail(500, "Could not load your workspace profile");
  if (!profile) fail(401, "Workspace profile not found");
  const { data: org, error: oe } = await db.from("organizations").select("id,name").eq("id", profile.organization_id).maybeSingle();
  if (oe || !org) fail(401, "Workspace not found");
  const { data: settings } = await db.from("organization_settings").select("default_low_stock_threshold").eq("organization_id", org.id).maybeSingle();
  return { id: data.user.id, email: profile.email, organization_id: org.id, organization_name: org.name, default_low_stock_threshold: settings?.default_low_stock_threshold ?? 5, is_demo: profile.email.startsWith('stockflow-demo-') };
}
function product(row: any, u: any) { const threshold = row.low_stock_threshold ?? u.default_low_stock_threshold; return { ...row, effective_low_stock_threshold: threshold, is_low_stock: row.quantity_on_hand <= threshold }; }
async function rows(u: any) {
  const { data, error } = await db.from("products").select("*").eq("organization_id", u.organization_id).order("updated_at", { ascending: false }).order("name", { ascending: true });
  if (error) fail(500, "Could not load products"); return data || [];
}
async function getProduct(id: string, u: any) {
  if (!/^\d+$/.test(id)) fail(404, "Product not found");
  const { data, error } = await db.from("products").select("*").eq("organization_id", u.organization_id).eq("id", id).maybeSingle();
  if (error) fail(500, "Could not load product"); if (!data) fail(404, "Product not found"); return data;
}
function productInput(b: any, partial = false) {
  const fields = ["name","sku","description","quantity_on_hand","cost_price","selling_price","low_stock_threshold"];
  for (const k of Object.keys(b)) if (!fields.includes(k)) fail(422, "Unexpected field: " + k);
  if (partial && Object.keys(b).length === 0) fail(422, "Provide at least one field to update");
  const out: any = {};
  if ("name" in b) { out.name = str(b.name); if (!out.name || out.name.length > 120) fail(422, "Product name must be 1–120 characters"); } else if (!partial) fail(422, "Name is required");
  if ("sku" in b) { out.sku = str(b.sku).toUpperCase(); if (!/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(out.sku)) fail(422, "Enter a valid SKU"); } else if (!partial) fail(422, "SKU is required");
  if ("description" in b) { out.description = b.description === null ? null : str(b.description) || null; if (out.description && out.description.length > 2000) fail(422, "Description is too long"); }
  if ("quantity_on_hand" in b) { if (!int(b.quantity_on_hand) || b.quantity_on_hand < 0 || b.quantity_on_hand > 2000000000) fail(422, "Quantity must be a non-negative whole number"); out.quantity_on_hand = b.quantity_on_hand; } else if (!partial) out.quantity_on_hand = 0;
  for (const k of ["cost_price","selling_price"]) { if (k in b) { const v = b[k]; if (v === null) out[k] = null; else if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1000000000) fail(422, k + " must be a non-negative number"); else out[k] = v; } else if (!partial) out[k] = null; }
  if ("low_stock_threshold" in b) { const v = b.low_stock_threshold; if (v === null) out.low_stock_threshold = null; else if (!int(v) || v < 0 || v > 2000000000) fail(422, "Threshold must be a non-negative whole number"); else out.low_stock_threshold = v; } else if (!partial) out.low_stock_threshold = null;
  return out;
}
async function demoPassword(sessionId: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionId + ":" + serviceKey));
  const hex = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  return "Sf!" + hex.slice(0, 52) + "x9";
}
async function openDemoSession(sessionIdRaw: unknown) {
  const sessionId = str(sessionIdRaw).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sessionId)) {
    fail(422, "Refresh the page and try demo access again");
  }
  const email = "stockflow-demo-" + sessionId.replaceAll("-", "") + "@example.com";
  const password = await demoPassword(sessionId);
  const { data: existing, error: lookupError } = await db.from("stockflow_demo_sessions")
    .select("user_id,organization_id").eq("demo_session_id", sessionId).maybeSingle();
  if (lookupError) fail(500, "Could not load your demo workspace");
  let userId = existing?.user_id as string | undefined;
  let organizationId = existing?.organization_id as string | undefined;
  if (!existing) {
    const { data: created, error: createError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !created.user) fail(500, "Could not create your isolated demo session. Please retry.");
    userId = created.user.id;
    try {
      const { data: org, error: orgError } = await db.from("organizations")
        .insert({ name: "StockFlow Demo " + sessionId.slice(0, 6).toUpperCase() }).select("id,name").single();
      if (orgError || !org) throw new Error("organization creation failed");
      organizationId = org.id;
      const { error: settingsError } = await db.from("organization_settings")
        .insert({ organization_id: organizationId, default_low_stock_threshold: 5 });
      if (settingsError) throw new Error("settings creation failed");
      const { error: profileError } = await db.from("stockflow_profiles")
        .insert({ user_id: userId, organization_id: organizationId, email });
      if (profileError) throw new Error("profile creation failed");
      const { error: mappingError } = await db.from("stockflow_demo_sessions")
        .insert({ demo_session_id: sessionId, user_id: userId, organization_id: organizationId });
      if (mappingError) throw new Error("demo session mapping failed");
    } catch (_) {
      if (organizationId) await db.from("organizations").delete().eq("id", organizationId);
      await db.auth.admin.deleteUser(userId);
      fail(500, "Could not initialize your demo workspace. Please retry.");
    }
  }
  const { data: session, error: loginError } = await authClient.auth.signInWithPassword({ email, password });
  if (loginError || !session.session || !session.user) fail(500, "Could not open your demo session. Please retry.");
  const { data: organization } = await db.from("organizations").select("id,name").eq("id", organizationId).single();
  return {
    access_token: session.session.access_token,
    token_type: "bearer",
    user: {
      id: userId,
      email,
      organization_id: organizationId,
      organization_name: organization?.name ?? "StockFlow Demo",
      is_demo: true,
    },
  };
}

async function rollbackSignup(userId: string, organizationId?: string) {
  let cleanupFailed = false;
  if (organizationId) {
    try {
      const { error } = await db.from("stockflow_profiles").delete().eq("user_id", userId);
      if (error) cleanupFailed = true;
    } catch (_) { cleanupFailed = true; }
    try {
      const { error } = await db.from("organization_settings").delete().eq("organization_id", organizationId);
      if (error) cleanupFailed = true;
    } catch (_) { cleanupFailed = true; }
    try {
      const { error } = await db.from("organizations").delete().eq("id", organizationId);
      if (error) cleanupFailed = true;
    } catch (_) { cleanupFailed = true; }
  }
  try {
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) cleanupFailed = true;
  } catch (_) { cleanupFailed = true; }
  if (cleanupFailed) {
    console.error("StockFlow signup rollback was incomplete; manual cleanup may be required.");
  }
}

async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, {status:204,headers:cors});
  const urlObj = new URL(req.url); const path = pathOf(urlObj); const method = req.method.toUpperCase();
  if (method === "POST" && path === "/api/auth/demo") {
    const b = await body(req);
    return json(await openDemoSession(b.session_id), 201);
  }
  if (method === "GET" && path === "/api/health") {
    const { error } = await db.from("organizations").select("id").limit(1);
    if (error) fail(503, "Database connection is unavailable");
    return json({status:"ok",service:"stockflow",database:"ok"});
  }
  if (method === "POST" && path === "/api/auth/signup") {
    const b = await body(req); const email = str(b.email).toLowerCase(); const password = typeof b.password === "string" ? b.password : ""; const name = str(b.organization_name);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail(422, "Enter a valid email address");
    if (password.trim().length === 0 || password.length < 8 || password.length > 128) fail(422, "Password must be 8–128 characters");
    if (name.length < 2 || name.length > 80) fail(422, "Organization name must be 2–80 characters");
    const { data: created, error: createError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !created.user) { if (/already|registered|exists/i.test(createError?.message || "")) fail(409, "An account with this email already exists"); fail(400, "Could not create your account. Please check the details."); }
    const { data: org, error: orgError } = await db.from("organizations").insert({name}).select("id,name").single();
    if (orgError || !org) {
      await rollbackSignup(created.user.id);
      fail(500, "Could not initialize your workspace. Please try registering again.");
    }
    const { error: settingsError } = await db.from("organization_settings").insert({organization_id:org.id,default_low_stock_threshold:5});
    if (settingsError) {
      await rollbackSignup(created.user.id, org.id);
      fail(500, "Could not initialize workspace settings. Please try registering again.");
    }
    const { error: profileError } = await db.from("stockflow_profiles").insert({user_id:created.user.id,organization_id:org.id,email});
    if (profileError) {
      await rollbackSignup(created.user.id, org.id);
      fail(500, "Could not create your workspace profile. Please try registering again.");
    }
    const { data: session, error: signInError } = await authClient.auth.signInWithPassword({email,password});
    if (signInError || !session.session) {
      await rollbackSignup(created.user.id, org.id);
      fail(500, "Could not start your session. Please try registering again.");
    }
    return json({access_token:session.session.access_token,token_type:"bearer",user:{id:created.user.id,email,organization_id:org.id,organization_name:org.name}},201);
  }
  if (method === "POST" && path === "/api/auth/login") {
    const b = await body(req); const email = str(b.email).toLowerCase(); const password = typeof b.password==="string"?b.password:"";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length>128) fail(422,"Enter a valid email and password");
    const {data,error}=await authClient.auth.signInWithPassword({email,password});
    if(error||!data.user||!data.session) fail(401,"Email or password is incorrect");
    const u=await userOf(new Request(req.url,{headers:{authorization:"Bearer "+data.session.access_token}}));
    return json({access_token:data.session.access_token,token_type:"bearer",user:{id:u.id,email:u.email,organization_id:u.organization_id,organization_name:u.organization_name}});
  }
  if (method === "GET" && path === "/api/me") { const u=await userOf(req); return json({user:{id:u.id,email:u.email,organization_id:u.organization_id,organization_name:u.organization_name,is_demo:u.is_demo}}); }
  if (method === "GET" && path === "/api/dashboard") {
    const u=await userOf(req); const all=(await rows(u)).map(r=>product(r,u)); const low=all.filter(r=>r.is_low_stock).sort((a,b)=>a.quantity_on_hand-b.quantity_on_hand||a.name.localeCompare(b.name));
    return json({total_products:all.length,total_units:all.reduce((s,r)=>s+r.quantity_on_hand,0),low_stock_count:low.length,default_low_stock_threshold:u.default_low_stock_threshold,low_stock_items:low.slice(0,8),recent_products:all.slice(0,6)});
  }
  if (method === "GET" && path === "/api/products") {
    const u=await userOf(req); const all=await rows(u); const q=(urlObj.searchParams.get("q")||"").slice(0,120).trim().toLowerCase();
    const found=all.filter(r=>!q||String(r.name).toLowerCase().includes(q)||String(r.sku).toLowerCase().includes(q)).map(r=>product(r,u));
    return json({items:found,count:found.length});
  }
  const m=path.match(/^\/api\/products\/(\d+)(?:\/(adjust-stock))?$/);
  if (m) {
    const id=m[1]; const u=await userOf(req);
    if(method==="GET"&&!m[2]) return json({item:product(await getProduct(id,u),u)});
    if(method==="POST"&&m[2]==="adjust-stock") {
      const b=await body(req); const delta=b.delta; const note=str(b.note);
      if(!int(delta)||delta===0||Math.abs(delta)>2000000000) fail(422,"Enter a non-zero whole-number adjustment");
      if(note.length<3||note.length>300) fail(422,"Add a short reason for this adjustment");
      const old=await getProduct(id,u); const next=old.quantity_on_hand+delta;
      if(next<0||next>2000000000) fail(422,"Stock quantity would be outside the supported range");
      const {data,error}=await db.from("products").update({quantity_on_hand:next,last_stock_note:note,last_updated_by:u.id,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",u.organization_id).eq("quantity_on_hand",old.quantity_on_hand).select("*").maybeSingle();
      if(error) fail(500,"Could not update stock"); if(!data) fail(409,"Stock changed in another request. Refresh and try again.");
      return json({item:product(data,u),message:"Stock adjusted successfully"});
    }
    if(method==="PATCH"&&!m[2]) {
      const b=await body(req); const values=productInput(b,true); await getProduct(id,u);
      const {data,error}=await db.from("products").update({...values,last_updated_by:u.id,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",u.organization_id).select("*").single();
      if(error) { if(error.code==="23505") fail(409,"This SKU is already used by your organization"); fail(400,"Could not update product"); }
      return json({item:product(data,u)});
    }
    if(method==="DELETE"&&!m[2]) {
      await getProduct(id,u); const {error}=await db.from("products").delete().eq("id",id).eq("organization_id",u.organization_id);
      if(error) fail(500,"Could not delete product"); return new Response(null,{status:204,headers:{...cors,"Cache-Control":"no-store"}});
    }
  }
  if(method==="POST"&&path==="/api/products") {
    const u=await userOf(req); const values=productInput(await body(req));
    const {data,error}=await db.from("products").insert({...values,organization_id:u.organization_id,last_updated_by:u.id}).select("*").single();
    if(error){if(error.code==="23505")fail(409,"This SKU is already used by your organization");fail(400,"Could not create product");}
    return json({item:product(data,u)},201);
  }
  if(method==="GET"&&path==="/api/settings") { const u=await userOf(req); return json({organization_name:u.organization_name,default_low_stock_threshold:u.default_low_stock_threshold}); }
  if(method==="PATCH"&&path==="/api/settings") {
    const u=await userOf(req); const b=await body(req); const t=b.default_low_stock_threshold;
    if(!int(t)||t<0||t>2000000000)fail(422,"Threshold must be a non-negative whole number");
    const {error}=await db.from("organization_settings").upsert({organization_id:u.organization_id,default_low_stock_threshold:t,updated_at:new Date().toISOString()});
    if(error)fail(500,"Could not save settings");return json({organization_name:u.organization_name,default_low_stock_threshold:t,message:"Settings saved successfully"});
  }
  fail(404,"Endpoint not found");
}
Deno.serve(async(req:Request)=>{try{return await handle(req);}catch(e){if(e instanceof ApiError)return json({detail:e.message},e.status);console.error("StockFlow API failure:",e instanceof Error?e.message:"unknown");return json({detail:"Something went wrong. Please try again."},500);}});
