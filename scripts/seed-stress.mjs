#!/usr/bin/env node
/**
 * Stress-test seed script — generates large volumes of realistic data
 * for the Truss dashboard and API.
 *
 * Usage: node scripts/seed-stress.mjs
 *        npm run seed:stress
 */
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createDemoSchema, fakeEmbedding } from "../apps/api/src/lib/demo/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set."); process.exit(1); }

// ── Data arrays for realistic generation ──
const FIRST = ["James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda","David","Elizabeth","William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Sarah","Charles","Karen","Chris","Lisa","Daniel","Nancy","Matt","Betty","Mark","Sandra","Donald","Ashley","Steven","Dorothy","Paul","Kimberly","Andrew","Emily","Joshua","Donna","Kenneth","Michelle","Kevin","Carol","Brian","Amanda","George","Melissa","Timothy","Deborah","Ronald","Stephanie","Edward","Rebecca","Jason","Sharon","Jeffrey","Laura","Ryan","Cynthia","Jacob","Kathleen","Gary","Amy","Nicholas","Angela","Eric","Shirley","Jonathan","Anna","Stephen","Brenda","Larry","Pamela","Justin","Emma","Scott","Nicole","Brandon","Helen","Benjamin","Samantha","Samuel","Katherine","Gregory","Christine","Alexander","Debra","Frank","Rachel","Patrick","Carolyn","Raymond","Janet","Jack","Catherine","Dennis","Maria","Jerry","Heather","Tyler","Diane","Aaron","Ruth","Jose","Julie","Adam","Olivia","Nathan","Joyce","Henry","Virginia"];
const LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts","Chen","Kim","Patel","Singh","Zhang","Liu","Wang","Park","Tanaka","Nakamura","Okafor","Ibrahim","Ali","Khan","Gupta","Das","Sharma","Kumar","Yamamoto","Suzuki"];
const DOMAINS = ["acme.io","globex.com","initech.co","umbrella.org","stark.dev","wayne.io","oscorp.net","cyberdyne.ai","soylent.co","weyland.corp"];
const ROLES = ["admin","editor","viewer","viewer","viewer","editor","viewer","viewer"];
const ORDER_STATUSES = ["pending","confirmed","shipped","delivered","delivered","delivered","cancelled"];
const NOTIF_TYPES = ["order","promo","system","review","order","system","promo","order"];
const NOTIF_TITLES = ["Order shipped","Flash sale: 20% off","Password changed","Thanks for your review","Order delivered","Welcome aboard","New arrivals","Refund processed"];
const USER_AGENTS = ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0","Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0","Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Firefox/121.0","Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1) Safari/605.1","Mozilla/5.0 (iPad; CPU OS 17_2) Safari/605.1"];
const REVIEW_BODIES = ["Absolutely love this product!","Solid build quality and fast shipping.","Good value for the price.","Decent product, instructions unclear.","Outstanding support.","Works as described, clean design.","A bit overpriced but quality justifies it.","Perfect addition to my setup.","Delivery issues but product is excellent.","Great for the price point.","Not what I expected. Returning.","Five stars! Exactly what I needed.","Comfortable and well-made.","Color slightly different from photos.","Fast delivery, great packaging.","Bought as a gift, recipient loves it.","Sturdy construction, feels premium.","Easy to set up, under 10 minutes.","Best purchase this year.","Does what it says, fair product."];
const PRODUCT_ADJS = ["Premium","Ultra","Pro","Essential","Classic","Eco","Smart","Elite","Slim","Compact"];
const PRODUCT_NOUNS = ["Keyboard","Mouse","Monitor","Headset","Webcam","Speaker","Charger","Hub","Stand","Lamp","Chair","Desk","Mat","Cable","Dock","Mic","Router","Switch","Tablet","Display"];
const CATEGORIES_L1 = ["Electronics","Furniture","Accessories","Clothing","Sports","Kitchen","Books","Health","Toys","Garden"];
const CATEGORIES_L2 = ["Input Devices","Audio","Video","Desks","Seating","Cables","Lighting","Outdoor","Indoor","Tools"];
const CATEGORIES_L3 = ["Mechanical","Wireless","Wired","Ergonomic","Gaming","Professional","Travel","Portable","Heavy-Duty","Mini"];

const SAVED_QUERY_PATTERNS = [
  "SELECT COUNT(*) FROM demo_users WHERE role = 'admin'",
  "SELECT p.name, p.price FROM demo_products p ORDER BY p.price DESC LIMIT 10",
  "SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*) FROM demo_orders GROUP BY month ORDER BY month",
  "SELECT u.name, COUNT(o.id) AS orders FROM demo_users u JOIN demo_orders o ON o.user_id = u.id GROUP BY u.id ORDER BY orders DESC LIMIT 20",
  "SELECT category, AVG(price)::numeric(10,2) AS avg_price FROM demo_products GROUP BY category ORDER BY avg_price DESC",
  "SELECT status, COUNT(*) FROM demo_orders GROUP BY status ORDER BY count DESC",
  "SELECT p.name, AVG(r.rating)::numeric(3,1) FROM demo_products p JOIN demo_reviews r ON r.product_id = p.id GROUP BY p.id ORDER BY avg DESC LIMIT 10",
  "SELECT * FROM demo_products WHERE price BETWEEN 50 AND 150 ORDER BY created_at DESC",
  "WITH monthly AS (SELECT DATE_TRUNC('month', created_at) m, SUM(total) rev FROM demo_orders GROUP BY m) SELECT * FROM monthly ORDER BY m",
  "SELECT u.name, STRING_AGG(DISTINCT p.category, ', ') FROM demo_users u JOIN demo_orders o ON o.user_id=u.id JOIN demo_order_items oi ON oi.order_id=o.id JOIN demo_products p ON p.id=oi.product_id GROUP BY u.id LIMIT 15",
];

const WEBHOOK_TABLES = ["demo_users","demo_orders","demo_products","demo_reviews","demo_categories","demo_wishlists","demo_notifications","demo_sessions","demo_order_items","demo_addresses"];
const WEBHOOK_EVENTS = ["INSERT","UPDATE","DELETE","INSERT","INSERT","UPDATE"];
const AUDIT_ACTIONS = ["table.created","query.executed","api_key.created","webhook.created","backup.created","branch.created","index.created","extension.enabled","auth.identity.created","storage.object.uploaded","settings.updated","auth.session.created","keto.tuple.create","hydra.client.create"];
const AUDIT_RESOURCES = ["table","sql","api_key","webhook","backup","branch","index","extension","identity","storage","settings","session","relation_tuple","oauth2_client"];

const SIX_MONTHS_MS = 180 * 86400000;
const now = Date.now();

// ── Helpers ──
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randDate(rangeMs = SIX_MONTHS_MS) { return new Date(now - Math.random() * rangeMs).toISOString(); }
function normalPrice() { const u1 = Math.random(), u2 = Math.random(); return Math.max(1, Math.min(999, 49.99 + Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2)*80)).toFixed(2); }
function zipfRating() { const r = Math.random(); if (r < 0.38) return 5; if (r < 0.65) return 4; if (r < 0.82) return 3; if (r < 0.93) return 2; return 1; }
function esc(s) { return s.replace(/'/g, "''"); }

// ── Batch insert helper ──
async function batchInsert(pool, table, columns, rows, batchSize = 1000) {
  const t0 = Date.now();
  const colStr = columns.join(", ");
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const vals = [];
    const params = [];
    let idx = 1;
    for (const row of chunk) {
      const placeholders = row.map(() => `$${idx++}`);
      vals.push(`(${placeholders.join(",")})`);
      params.push(...row);
    }
    await pool.query(`INSERT INTO ${table} (${colStr}) VALUES ${vals.join(",")} ON CONFLICT DO NOTHING`, params);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  Seeding ${table}... ${rows.length}/${rows.length} done (${elapsed}s)`);
  return rows.length;
}

// ══════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const totalStart = Date.now();
const counts = {};

try {
  console.log("=== Truss Stress-Test Seed ===\n");

  // 1. Create schema tables
  console.log("[1/3] Creating demo schema tables...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { hasVector } = await createDemoSchema(client);
    await client.query("COMMIT");
    console.log(`  Schema ready (pgvector: ${hasVector})\n`);
  } finally { client.release(); }

  // Check pgvector
  let hasVector = false;
  try { await pool.query("SELECT 'test'::vector(3)"); hasVector = true; } catch {}

  // 2. Seed public demo tables
  console.log("[2/3] Seeding public demo tables...");

  // -- Users (5000) --
  const userRows = [];
  const usedEmails = new Set();
  for (let i = 1; i <= 5000; i++) {
    const first = pick(FIRST), last = pick(LAST);
    let email;
    do { email = `${first.toLowerCase()}.${last.toLowerCase()}${randInt(1,9999)}@${pick(DOMAINS)}`; } while (usedEmails.has(email));
    usedEmails.add(email);
    userRows.push([i, `${first} ${last}`, email, pick(ROLES), randDate()]);
  }
  counts.users = await batchInsert(pool, "public.demo_users", ["id","name","email","role","created_at"], userRows);
  await pool.query("SELECT setval('demo_users_id_seq', 5000, true)");

  // -- Categories (500: 10 L1 + 100 L2 + 390 L3) --
  const catRows = [];
  let catId = 1;
  const l1Ids = [], l2Ids = [];
  for (const name of CATEGORIES_L1) {
    catRows.push([catId, name, name.toLowerCase().replace(/\s+/g, "-"), `Top-level: ${name}`, null, randDate()]);
    l1Ids.push(catId++);
  }
  for (let i = 0; i < 100; i++) {
    const name = `${pick(CATEGORIES_L2)} ${i + 1}`;
    catRows.push([catId, name, name.toLowerCase().replace(/\s+/g, "-") + `-${catId}`, `Subcategory ${i}`, pick(l1Ids), randDate()]);
    l2Ids.push(catId++);
  }
  while (catId <= 500) {
    const name = `${pick(CATEGORIES_L3)} ${pick(CATEGORIES_L2)} ${catId}`;
    catRows.push([catId, name, `cat-${catId}`, `Leaf category ${catId}`, pick(l2Ids), randDate()]);
    catId++;
  }
  counts.categories = await batchInsert(pool, "public.demo_categories", ["id","name","slug","description","parent_id","created_at"], catRows);
  await pool.query("SELECT setval('demo_categories_id_seq', 500, true)");

  // -- Products (2000) --
  const prodRows = [];
  for (let i = 1; i <= 2000; i++) {
    const name = `${pick(PRODUCT_ADJS)} ${pick(PRODUCT_NOUNS)} ${i}`;
    const desc = `High-quality ${name.toLowerCase()} with advanced features and durable construction.`;
    const row = [i, name, desc, normalPrice(), pick(CATEGORIES_L1), randInt(0, 500), randDate()];
    if (hasVector) row.push(fakeEmbedding(i));
    prodRows.push(row);
  }
  const prodCols = hasVector
    ? ["id","name","description","price","category","stock","created_at","embedding"]
    : ["id","name","description","price","category","stock","created_at"];
  // For vector columns, need custom insert
  if (hasVector) {
    const t0 = Date.now();
    for (let i = 0; i < prodRows.length; i += 500) {
      const chunk = prodRows.slice(i, i + 500);
      const vals = [], params = [];
      let idx = 1;
      for (const row of chunk) {
        const emb = row.pop();
        const placeholders = row.map(() => `$${idx++}`);
        placeholders.push(`$${idx++}::vector`);
        vals.push(`(${placeholders.join(",")})`);
        params.push(...row, emb);
      }
      await pool.query(`INSERT INTO public.demo_products (${prodCols.join(",")}) VALUES ${vals.join(",")} ON CONFLICT DO NOTHING`, params);
    }
    console.log(`  Seeding public.demo_products... 2000/2000 done (${((Date.now()-t0)/1000).toFixed(1)}s)`);
    counts.products = 2000;
  } else {
    counts.products = await batchInsert(pool, "public.demo_products", prodCols, prodRows, 500);
  }
  await pool.query("SELECT setval('demo_products_id_seq', 2000, true)");

  // -- Orders (10000) --
  const orderRows = [];
  for (let i = 1; i <= 10000; i++) {
    const total = normalPrice();
    orderRows.push([i, randInt(1, 5000), pick(ORDER_STATUSES), total, randDate()]);
  }
  counts.orders = await batchInsert(pool, "public.demo_orders", ["id","user_id","status","total","created_at"], orderRows);
  await pool.query("SELECT setval('demo_orders_id_seq', 10000, true)");

  // -- Order items (25000) --
  const oiRows = [];
  let oiId = 1;
  // Distribute ~2.5 items per order on average
  for (let orderId = 1; orderId <= 10000; orderId++) {
    const itemCount = randInt(1, 5);
    for (let j = 0; j < itemCount && oiId <= 25000; j++) {
      oiRows.push([oiId++, orderId, randInt(1, 2000), randInt(1, 5), normalPrice()]);
    }
  }
  counts.order_items = await batchInsert(pool, "public.demo_order_items", ["id","order_id","product_id","quantity","unit_price"], oiRows);
  await pool.query(`SELECT setval('demo_order_items_id_seq', ${oiRows.length}, true)`);

  // -- Reviews (8000) --
  const revRows = [];
  for (let i = 1; i <= 8000; i++) {
    const body = pick(REVIEW_BODIES);
    revRows.push([i, randInt(1, 5000), randInt(1, 2000), zipfRating(), body, randDate()]);
  }
  // Insert with to_tsvector
  {
    const t0 = Date.now();
    for (let i = 0; i < revRows.length; i += 1000) {
      const chunk = revRows.slice(i, i + 1000);
      const vals = [], params = [];
      let idx = 1;
      for (const [id, uid, pid, rating, body, cat] of chunk) {
        vals.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},to_tsvector('english',$${idx-1}),$${idx++})`);
        params.push(id, uid, pid, rating, body, cat);
      }
      await pool.query(`INSERT INTO public.demo_reviews (id,user_id,product_id,rating,body,ts_vector,created_at) VALUES ${vals.join(",")} ON CONFLICT DO NOTHING`, params);
    }
    console.log(`  Seeding public.demo_reviews... 8000/8000 done (${((Date.now()-t0)/1000).toFixed(1)}s)`);
  }
  counts.reviews = 8000;
  await pool.query("SELECT setval('demo_reviews_id_seq', 8000, true)");

  // -- Wishlists (3000) --
  const wlRows = [];
  const wlSet = new Set();
  let wlId = 1;
  while (wlId <= 3000) {
    const uid = randInt(1, 5000), pid = randInt(1, 2000), key = `${uid}-${pid}`;
    if (wlSet.has(key)) continue;
    wlSet.add(key);
    wlRows.push([wlId++, uid, pid, randDate()]);
  }
  counts.wishlists = await batchInsert(pool, "public.demo_wishlists", ["id","user_id","product_id","added_at"], wlRows);
  await pool.query("SELECT setval('demo_wishlists_id_seq', 3000, true)");

  // -- Notifications (5000) --
  const notRows = [];
  for (let i = 1; i <= 5000; i++) {
    const ti = randInt(0, NOTIF_TITLES.length - 1);
    notRows.push([i, randInt(1, 5000), NOTIF_TYPES[ti], NOTIF_TITLES[ti], `Notification body #${i}`, Math.random() > 0.4, randDate()]);
  }
  counts.notifications = await batchInsert(pool, "public.demo_notifications", ["id","user_id","type","title","body","read","created_at"], notRows);
  await pool.query("SELECT setval('demo_notifications_id_seq', 5000, true)");

  // -- Sessions (1000) --
  const sessRows = [];
  for (let i = 1; i <= 1000; i++) {
    const created = new Date(now - Math.random() * 30 * 86400000);
    sessRows.push([i, randInt(1, 5000), `${randInt(10,220)}.${randInt(0,255)}.${randInt(0,255)}.${randInt(1,254)}`, pick(USER_AGENTS), created.toISOString(), new Date(created.getTime() + 24 * 3600000).toISOString()]);
  }
  counts.sessions = await batchInsert(pool, "public.demo_sessions", ["id","user_id","ip_address","user_agent","created_at","expires_at"], sessRows);
  await pool.query("SELECT setval('demo_sessions_id_seq', 1000, true)");

  // 3. Seed truss_internal tables
  console.log("\n[3/3] Seeding truss_internal tables...");

  // -- Saved queries (50) --
  const sqRows = [];
  for (let i = 1; i <= 50; i++) {
    sqRows.push([`stress-sq-${i}`, `Stress Query ${i}`, SAVED_QUERY_PATTERNS[(i - 1) % SAVED_QUERY_PATTERNS.length] + ` /* variant ${i} */`, "public", "{stress}", "demo"]);
  }
  counts.saved_queries = await batchInsert(pool, "truss_internal.saved_queries", ["id","name","sql_text","schema_name","tags","tenant_id"], sqRows);

  // -- Webhooks (30) --
  const whRows = [];
  for (let i = 1; i <= 30; i++) {
    whRows.push([`stress-wh-${i}`, `Stress Hook ${i}`, "public", pick(WEBHOOK_TABLES), `{${pick(WEBHOOK_EVENTS)}}`, `https://hooks.example.com/stress/${i}`, '{"Content-Type":"application/json"}', `secret-${i}`, Math.random() > 0.2, "demo"]);
  }
  counts.webhooks = await batchInsert(pool, "truss_internal.webhooks", ["id","name","table_schema","table_name","events","url","headers","secret","active","tenant_id"], whRows);

  // -- Webhook logs (100) --
  const wlgRows = [];
  for (let i = 0; i < 100; i++) {
    const whId = `stress-wh-${randInt(1, 30)}`;
    const status = Math.random() > 0.2 ? 200 : pick([400, 500, 502, 503]);
    wlgRows.push([whId, pick(WEBHOOK_EVENTS), '{"table":"demo_orders","record":{"id":1}}', status, status === 200 ? '{"ok":true}' : '{"error":"fail"}', randInt(20, 800), randDate(30 * 86400000)]);
  }
  counts.webhook_logs = await batchInsert(pool, "truss_internal.webhook_logs", ["webhook_id","event_type","payload","status_code","response_body","latency_ms","created_at"], wlgRows);

  // -- Feature flags (20) --
  const flagKeys = ["dark-mode-v3","new-checkout","ai-recommendations","beta-dashboard","advanced-search","rate-limiter","websocket-v2","live-preview","multi-tenancy","audit-v2","cdn-optimization","lazy-loading","ssr-mode","edge-functions","vector-search","graphql-api","cron-scheduler","email-templates-v2","webhook-retries","usage-analytics"];
  const flagRows = [];
  for (let i = 0; i < 20; i++) {
    const type = ["boolean","string","number"][i % 3];
    const variants = type === "boolean" ? '{"on":true,"off":false}' : type === "string" ? '{"control":"default","variant-a":"new"}' : '{"low":"10","high":"100"}';
    flagRows.push([`stress-${flagKeys[i]}`, flagKeys[i], `Stress flag: ${flagKeys[i]}`, type, variants, "off", i % 3 === 0 ? "ENABLED" : "DISABLED", "demo", randDate()]);
  }
  counts.feature_flags = await batchInsert(pool, "truss_internal.feature_flags", ["flag_key","name","description","flag_type","variants","default_variant","state","tenant_id","created_at"], flagRows);

  // -- Audit logs (200) --
  const auditRows = [];
  for (let i = 0; i < 200; i++) {
    const ai = i % AUDIT_ACTIONS.length;
    auditRows.push(["stress@truss.dev", AUDIT_ACTIONS[ai], AUDIT_RESOURCES[ai], `stress-resource-${i}`, "{}", randDate(), "demo"]);
  }
  counts.audit_logs = await batchInsert(pool, "truss_internal.audit_logs", ["actor","action","resource_type","resource_id","payload","created_at","tenant_id"], auditRows);

  // -- Branches (10) --
  const branchStatuses = ["active","active","active","active","active","active","deleted","deleted","merging","active"];
  const brRows = [];
  for (let i = 1; i <= 10; i++) {
    brRows.push([`stress-branch-${i}`, "truss", `truss_br_stress_${i}`, `stress/branch-${i}`, branchStatuses[i-1], randInt(24, 168), randDate(60*86400000), "demo"]);
  }
  counts.branches = await batchInsert(pool, "truss_internal.branches", ["id","parent_db","branch_db","label","status","ttl_hours","created_at","tenant_id"], brRows);

  // -- Backups (15) --
  const bkStatuses = ["completed","completed","completed","completed","completed","completed","completed","completed","completed","completed","completed","completed","running","failed","failed"];
  const bkRows = [];
  for (let i = 1; i <= 15; i++) {
    const st = bkStatuses[i - 1];
    const created = randDate(30 * 86400000);
    const completed = st === "completed" ? new Date(new Date(created).getTime() + randInt(60, 600) * 1000).toISOString() : null;
    bkRows.push([`stress-backup-${i}`, `truss_stress_${i}.sql.gz`, st === "completed" ? randInt(500000, 50000000) : 0, st, created, completed, "demo"]);
  }
  counts.backups = await batchInsert(pool, "truss_internal.backups", ["id","filename","size_bytes","status","created_at","completed_at","tenant_id"], bkRows);

  // ── Summary ──
  const totalSec = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log("\n=== Seed Complete ===");
  console.log(`Total time: ${totalSec}s\n`);
  console.log("Row counts:");
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(20)} ${String(count).padStart(7)}`);
  }
  console.log();

} catch (err) {
  console.error("Seed failed:", err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  await pool.end();
}
