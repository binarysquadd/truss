/**
 * Demo Data — Sample data arrays and insert functions for the public schema.
 */

import { fakeEmbedding } from "./schema.js";

// ── Data arrays ──

export const DEMO_USERS = [
  { name: "Alice Chen", email: "alice.chen@acme.io", role: "admin" },
  { name: "Bob Martinez", email: "bob.martinez@acme.io", role: "editor" },
  { name: "Carol Williams", email: "carol.w@acme.io", role: "viewer" },
  { name: "Dave Kim", email: "dave.kim@acme.io", role: "admin" },
  { name: "Eve Johnson", email: "eve.j@acme.io", role: "editor" },
  { name: "Frank Nakamura", email: "frank.n@acme.io", role: "viewer" },
  { name: "Grace Liu", email: "grace.liu@acme.io", role: "editor" },
  { name: "Hank Patel", email: "hank.p@acme.io", role: "admin" },
  { name: "Iris Okafor", email: "iris.o@acme.io", role: "viewer" },
  { name: "Jack Thompson", email: "jack.t@acme.io", role: "editor" },
  { name: "Karen Singh", email: "karen.s@acme.io", role: "viewer" },
  { name: "Leo Fernandez", email: "leo.f@acme.io", role: "admin" },
  { name: "Mia Zhang", email: "mia.z@acme.io", role: "editor" },
  { name: "Noah Brown", email: "noah.b@acme.io", role: "viewer" },
  { name: "Olivia Davis", email: "olivia.d@acme.io", role: "editor" },
  { name: "Paul Rivera", email: "paul.r@acme.io", role: "admin" },
  { name: "Quinn Hayes", email: "quinn.h@acme.io", role: "viewer" },
  { name: "Ruby Tanaka", email: "ruby.t@acme.io", role: "editor" },
  { name: "Sam Walker", email: "sam.w@acme.io", role: "viewer" },
  { name: "Tara Mitchell", email: "tara.m@acme.io", role: "admin" },
  { name: "Uma Kapoor", email: "uma.k@acme.io", role: "editor" },
  { name: "Victor Reyes", email: "victor.r@acme.io", role: "viewer" },
  { name: "Wendy Park", email: "wendy.p@acme.io", role: "editor" },
  { name: "Xander Scott", email: "xander.s@acme.io", role: "admin" },
  { name: "Yara Hoffman", email: "yara.h@acme.io", role: "viewer" },
];

export const DEMO_PRODUCTS = [
  { name: "Wireless Keyboard", description: "Mechanical wireless keyboard with RGB backlight and hot-swappable switches.", price: 89.99, category: "Electronics", stock: 142 },
  { name: "Standing Desk", description: "Electric height-adjustable standing desk with memory presets and cable management.", price: 449.00, category: "Furniture", stock: 38 },
  { name: "Noise-Canceling Headphones", description: "Over-ear headphones with adaptive ANC and 30-hour battery life.", price: 279.99, category: "Electronics", stock: 67 },
  { name: "Ergonomic Mouse", description: "Vertical ergonomic mouse with adjustable DPI and thumb rest.", price: 59.99, category: "Electronics", stock: 203 },
  { name: "Monitor Arm", description: "Gas-spring single monitor arm supporting up to 32 inch displays.", price: 129.00, category: "Accessories", stock: 91 },
  { name: "Desk Lamp", description: "LED desk lamp with adjustable color temperature and brightness.", price: 45.99, category: "Accessories", stock: 175 },
  { name: "Webcam 4K", description: "Ultra-HD webcam with auto-focus, built-in mic, and privacy shutter.", price: 119.99, category: "Electronics", stock: 54 },
  { name: "Cable Management Kit", description: "Under-desk cable tray with velcro ties and adhesive clips.", price: 24.99, category: "Accessories", stock: 312 },
  { name: "Laptop Stand", description: "Aluminum laptop stand with ventilation and adjustable angle.", price: 39.99, category: "Accessories", stock: 168 },
  { name: "Mesh Office Chair", description: "Full-mesh ergonomic office chair with lumbar support and headrest.", price: 599.00, category: "Furniture", stock: 22 },
  { name: "USB-C Hub", description: "7-in-1 USB-C hub with HDMI, ethernet, SD card, and USB-A ports.", price: 49.99, category: "Electronics", stock: 287 },
  { name: "Whiteboard", description: "Magnetic glass whiteboard 48x36 inches with marker tray.", price: 189.00, category: "Furniture", stock: 45 },
  { name: "Blue Light Glasses", description: "Anti-blue-light glasses with clear lenses and lightweight titanium frame.", price: 34.99, category: "Accessories", stock: 410 },
  { name: "Desk Mat", description: "Extended desk mat with stitched edges, waterproof PU leather, 900x400mm.", price: 29.99, category: "Accessories", stock: 234 },
  { name: "Portable Charger", description: "20000mAh power bank with 65W USB-C PD and dual output.", price: 69.99, category: "Electronics", stock: 156 },
];

const DEMO_CATEGORIES = [
  { id: 1, name: "Electronics", slug: "electronics", description: "Computers, peripherals, and gadgets", parent_id: null },
  { id: 2, name: "Furniture", slug: "furniture", description: "Desks, chairs, and office furniture", parent_id: null },
  { id: 3, name: "Accessories", slug: "accessories", description: "Small add-ons and peripherals", parent_id: null },
  { id: 4, name: "Input Devices", slug: "input-devices", description: "Keyboards, mice, and controllers", parent_id: 1 },
  { id: 5, name: "Audio", slug: "audio", description: "Headphones, speakers, and mics", parent_id: 1 },
  { id: 6, name: "Video", slug: "video", description: "Webcams, monitors, and displays", parent_id: 1 },
  { id: 7, name: "Desks", slug: "desks", description: "Standing and traditional desks", parent_id: 2 },
  { id: 8, name: "Seating", slug: "seating", description: "Office chairs and stools", parent_id: 2 },
  { id: 9, name: "Desk Accessories", slug: "desk-accessories", description: "Lamps, mats, and organizers", parent_id: 3 },
  { id: 10, name: "Cables & Hubs", slug: "cables-hubs", description: "USB hubs, cable kits, and docks", parent_id: 3 },
];

// Map products to categories (product_id → [category_ids])
const PRODUCT_CATEGORY_MAP = [
  [1, [1, 4]], [2, [2, 7]], [3, [1, 5]], [4, [1, 4]], [5, [3, 9]],
  [6, [3, 9]], [7, [1, 6]], [8, [3, 10]], [9, [3, 9]], [10, [2, 8]],
  [11, [1, 10]], [12, [2]], [13, [3]], [14, [3, 9]], [15, [1, 10]],
];

const DEMO_COUPONS = [
  { id: 1, code: "WELCOME10", discount_pct: 10, daysAgoFrom: 30, daysAgoUntil: -30, max_uses: 100, used_count: 43 },
  { id: 2, code: "SUMMER20", discount_pct: 20, daysAgoFrom: 14, daysAgoUntil: -7, max_uses: 50, used_count: 12 },
  { id: 3, code: "VIP30", discount_pct: 30, daysAgoFrom: 60, daysAgoUntil: -90, max_uses: 10, used_count: 10 },
  { id: 4, code: "FLASH15", discount_pct: 15, daysAgoFrom: 3, daysAgoUntil: -1, max_uses: 200, used_count: 87 },
  { id: 5, code: "LOYALTY25", discount_pct: 25, daysAgoFrom: 45, daysAgoUntil: null, max_uses: 0, used_count: 0 },
];

const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

const REVIEW_BODIES = [
  "Absolutely love this product! Quality exceeded my expectations.",
  "Solid build quality and fast shipping. Would buy again.",
  "Good value for the price. Minor cosmetic imperfections but works great.",
  "Decent product but the instructions could be clearer.",
  "Outstanding customer support when I had questions about setup.",
  "Works exactly as described. Clean design and easy to use.",
  "A bit overpriced compared to competitors but the quality justifies it.",
  "Perfect addition to my home office setup. Highly recommended.",
  "Had some issues with delivery but the product itself is excellent.",
  "Great for the price point. Durable and well-designed.",
  "Not what I expected based on the description. Returning it.",
  "Five stars! This is exactly what I needed for my workflow.",
  "Comfortable and well-made. Using it daily for over a month now.",
  "The color was slightly different from the photos but still looks good.",
  "Fast delivery, great packaging, and the product works perfectly.",
  "Bought this as a gift and the recipient loves it.",
  "Sturdy construction. Feels premium without the premium price tag.",
  "Easy to set up, took me less than 10 minutes out of the box.",
  "Would give 6 stars if I could. Best purchase this year.",
  "It does what it says. Nothing more, nothing less. Fair product.",
  "Upgraded from an older model and the difference is night and day.",
  "Battery life is impressive. Easily lasts a full work day.",
  "Sleek design that fits perfectly with my desk aesthetic.",
  "Minor quality control issue but customer service resolved it quickly.",
  "Been using it for three months with zero complaints.",
  "The ergonomic design really does make a difference over long hours.",
  "Shipping was delayed but the product was worth the wait.",
  "Excellent build quality. You can tell they put thought into this.",
  "Returned my first one due to a defect but the replacement is flawless.",
  "Simple, effective, and reasonably priced. What more could you want?",
];

const NOTIFICATION_TEMPLATES = [
  { type: "order", title: "Order shipped", body: "Your order #{{id}} has been shipped and is on its way." },
  { type: "promo", title: "Flash sale: 20% off", body: "Don't miss our flash sale on electronics — ends tonight!" },
  { type: "system", title: "Password changed", body: "Your password was changed successfully. If this wasn't you, contact support." },
  { type: "review", title: "Thanks for your review", body: "Your review for {{product}} has been published." },
  { type: "order", title: "Order delivered", body: "Your order #{{id}} has been delivered. Enjoy!" },
  { type: "system", title: "Welcome to Acme", body: "Your account is set up. Start exploring our catalog." },
  { type: "promo", title: "New arrivals", body: "Check out this week's new products in our store." },
  { type: "order", title: "Refund processed", body: "Your refund for order #{{id}} has been processed." },
];

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0",
  "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15",
  "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15",
];

// ── Insert functions ──

export async function insertDemoData(client, hasVector) {
  // Users
  for (let i = 0; i < DEMO_USERS.length; i++) {
    const u = DEMO_USERS[i];
    const createdAt = new Date(Date.now() - (90 - i * 3) * 86400000).toISOString();
    await client.query(
      `INSERT INTO public.demo_users (id, name, email, role, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [i + 1, u.name, u.email, u.role, createdAt]
    );
  }
  await client.query(`SELECT setval('demo_users_id_seq', 25, true)`);

  // Categories (hierarchical)
  for (const c of DEMO_CATEGORIES) {
    await client.query(
      `INSERT INTO public.demo_categories (id, name, slug, description, parent_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [c.id, c.name, c.slug, c.description, c.parent_id]
    );
  }
  await client.query(`SELECT setval('demo_categories_id_seq', 10, true)`);

  // Products
  for (let i = 0; i < DEMO_PRODUCTS.length; i++) {
    const p = DEMO_PRODUCTS[i];
    if (hasVector) {
      await client.query(
        `INSERT INTO public.demo_products (id, name, description, price, category, stock, embedding) VALUES ($1, $2, $3, $4, $5, $6, $7::vector) ON CONFLICT DO NOTHING`,
        [i + 1, p.name, p.description, p.price, p.category, p.stock, fakeEmbedding(i + 1)]
      );
    } else {
      await client.query(
        `INSERT INTO public.demo_products (id, name, description, price, category, stock) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [i + 1, p.name, p.description, p.price, p.category, p.stock]
      );
    }
  }
  await client.query(`SELECT setval('demo_products_id_seq', 15, true)`);

  // Product ↔ Category (many-to-many)
  for (const [productId, catIds] of PRODUCT_CATEGORY_MAP) {
    for (const catId of catIds) {
      await client.query(
        `INSERT INTO public.demo_product_categories (product_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [productId, catId]
      );
    }
  }

  // Product images (2-3 per product)
  let imgId = 1;
  for (let p = 1; p <= 15; p++) {
    const count = 2 + (p % 2); // 2 or 3 images per product
    for (let pos = 0; pos < count; pos++) {
      await client.query(
        `INSERT INTO public.demo_product_images (id, product_id, url, alt_text, position) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [imgId, p, `https://images.example.com/products/${p}/${pos === 0 ? "main" : `angle-${pos}`}.webp`, `${DEMO_PRODUCTS[p - 1].name} - ${pos === 0 ? "Main" : `Angle ${pos}`}`, pos]
      );
      imgId++;
    }
  }
  await client.query(`SELECT setval('demo_product_images_id_seq', ${imgId - 1}, true)`);

  // Addresses (1-2 per user, first 15 users)
  let addrId = 1;
  const cities = ["San Francisco", "Austin", "Seattle", "New York", "Chicago", "Denver", "Portland", "Boston"];
  const states = ["CA", "TX", "WA", "NY", "IL", "CO", "OR", "MA"];
  for (let u = 1; u <= 15; u++) {
    const count = 1 + (u % 2);
    for (let a = 0; a < count; a++) {
      const ci = (u + a) % cities.length;
      await client.query(
        `INSERT INTO public.demo_addresses (id, user_id, label, street, city, state, zip, country, is_default) VALUES ($1, $2, $3, $4, $5, $6, $7, 'US', $8) ON CONFLICT DO NOTHING`,
        [addrId, u, a === 0 ? "home" : "work", `${100 + addrId} ${a === 0 ? "Main" : "Market"} St`, cities[ci], states[ci], `${90000 + addrId}`, a === 0]
      );
      addrId++;
    }
  }
  await client.query(`SELECT setval('demo_addresses_id_seq', ${addrId - 1}, true)`);

  // Coupons
  for (const c of DEMO_COUPONS) {
    const from = new Date(Date.now() - c.daysAgoFrom * 86400000).toISOString();
    const until = c.daysAgoUntil != null ? new Date(Date.now() - c.daysAgoUntil * 86400000).toISOString() : null;
    await client.query(
      `INSERT INTO public.demo_coupons (id, code, discount_pct, valid_from, valid_until, max_uses, used_count) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [c.id, c.code, c.discount_pct, from, until, c.max_uses, c.used_count]
    );
  }
  await client.query(`SELECT setval('demo_coupons_id_seq', 5, true)`);

  // Precompute first address ID per user (matches the sequential insert above)
  const firstAddressForUser = {};
  let _aid = 1;
  for (let u = 1; u <= 15; u++) {
    firstAddressForUser[u] = _aid;
    _aid += 1 + (u % 2); // 2 addrs for odd users, 1 for even
  }

  // Orders (40 rows, now with address_id)
  for (let i = 0; i < 40; i++) {
    const userId = (i % 25) + 1;
    const addressId = firstAddressForUser[userId] || null;
    const status = ORDER_STATUSES[i % ORDER_STATUSES.length];
    const createdAt = new Date(Date.now() - (60 - i) * 86400000).toISOString();
    // Calculate total from items below
    const productId = (i % 15) + 1;
    const quantity = (i % 4) + 1;
    const total = (quantity * DEMO_PRODUCTS[productId - 1].price).toFixed(2);
    await client.query(
      `INSERT INTO public.demo_orders (id, user_id, address_id, status, total, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [i + 1, userId, addressId, status, total, createdAt]
    );
  }
  await client.query(`SELECT setval('demo_orders_id_seq', 40, true)`);

  // Order items (1-3 items per order)
  let itemId = 1;
  for (let o = 1; o <= 40; o++) {
    const itemCount = 1 + (o % 3);
    for (let j = 0; j < itemCount; j++) {
      const productId = ((o + j) % 15) + 1;
      const qty = (j % 3) + 1;
      await client.query(
        `INSERT INTO public.demo_order_items (id, order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [itemId, o, productId, qty, DEMO_PRODUCTS[productId - 1].price]
      );
      itemId++;
    }
  }
  await client.query(`SELECT setval('demo_order_items_id_seq', ${itemId - 1}, true)`);

  // Order ↔ Coupon (apply coupons to ~12 orders)
  for (let o = 1; o <= 12; o++) {
    const couponId = ((o - 1) % 5) + 1;
    await client.query(
      `INSERT INTO public.demo_order_coupons (order_id, coupon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [o, couponId]
    );
  }

  // Reviews (30 rows)
  for (let i = 0; i < 30; i++) {
    const userId = (i % 25) + 1;
    const productId = (i % 15) + 1;
    const rating = (i % 5) + 1;
    const body = REVIEW_BODIES[i % REVIEW_BODIES.length];
    const createdAt = new Date(Date.now() - (45 - i) * 86400000).toISOString();
    await client.query(
      `INSERT INTO public.demo_reviews (id, user_id, product_id, rating, body, ts_vector, created_at)
       VALUES ($1, $2, $3, $4, $5, to_tsvector('english', $5), $6) ON CONFLICT DO NOTHING`,
      [i + 1, userId, productId, rating, body, createdAt]
    );
  }
  await client.query(`SELECT setval('demo_reviews_id_seq', 30, true)`);

  // Wishlists (20 entries)
  let wlId = 1;
  for (let u = 1; u <= 10; u++) {
    for (let j = 0; j < 2; j++) {
      const productId = ((u + j * 7) % 15) + 1;
      await client.query(
        `INSERT INTO public.demo_wishlists (id, user_id, product_id, added_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [wlId, u, productId, new Date(Date.now() - (20 - wlId) * 86400000).toISOString()]
      );
      wlId++;
    }
  }
  await client.query(`SELECT setval('demo_wishlists_id_seq', ${wlId - 1}, true)`);

  // Notifications (24 entries — 3 per first 8 users)
  let notifId = 1;
  for (let u = 1; u <= 8; u++) {
    for (let j = 0; j < 3; j++) {
      const tmpl = NOTIFICATION_TEMPLATES[(u + j) % NOTIFICATION_TEMPLATES.length];
      await client.query(
        `INSERT INTO public.demo_notifications (id, user_id, type, title, body, read, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [notifId, u, tmpl.type, tmpl.title, tmpl.body.replace("{{id}}", String(u)).replace("{{product}}", DEMO_PRODUCTS[u % 15].name), j > 0, new Date(Date.now() - (30 - notifId) * 3600000).toISOString()]
      );
      notifId++;
    }
  }
  await client.query(`SELECT setval('demo_notifications_id_seq', ${notifId - 1}, true)`);

  // Sessions (15 entries)
  for (let i = 1; i <= 15; i++) {
    const userId = (i % 25) + 1;
    const ua = USER_AGENTS[i % USER_AGENTS.length];
    const ip = `192.168.1.${100 + i}`;
    const created = new Date(Date.now() - i * 3600000);
    const expires = new Date(created.getTime() + 24 * 3600000);
    await client.query(
      `INSERT INTO public.demo_sessions (id, user_id, ip_address, user_agent, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [i, userId, ip, ua, created.toISOString(), expires.toISOString()]
    );
  }
  await client.query(`SELECT setval('demo_sessions_id_seq', 15, true)`);
}
