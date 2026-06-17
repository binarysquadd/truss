/**
 * Demo Schema — CREATE TABLE + index definitions for the demo e-commerce schema.
 * 14 tables with 18+ FK relationships, self-referencing categories, many-to-many joins.
 */

// Generate a deterministic pseudo-random embedding (not truly random, but varied per product)
export function fakeEmbedding(seed) {
  const values = [];
  let x = seed * 1.61803398875;
  for (let i = 0; i < 384; i++) {
    x = Math.sin(x * (i + 1) * 0.7) * 0.5;
    values.push(Number(x.toFixed(6)));
  }
  return `[${values.join(",")}]`;
}

/** Create all demo tables + indexes. Returns { hasVector } */
export async function createDemoSchema(client) {
  // Try to enable pgvector — use SAVEPOINT so failure doesn't abort the transaction
  let hasVector = false;
  try {
    await client.query("SAVEPOINT vector_check");
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    hasVector = true;
  } catch {
    await client.query("ROLLBACK TO SAVEPOINT vector_check");
    console.warn("Demo seed: pgvector not available — skipping embedding column");
  }

  // ── Core tables ──

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_users (
      id serial PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      role text NOT NULL DEFAULT 'viewer',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_categories (
      id serial PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      description text,
      parent_id integer REFERENCES public.demo_categories(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_products (
      id serial PRIMARY KEY,
      name text NOT NULL,
      description text,
      price numeric(10,2) NOT NULL DEFAULT 0,
      category text NOT NULL DEFAULT 'General',
      stock integer NOT NULL DEFAULT 0,
      ${hasVector ? "embedding vector(384)," : ""}
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_product_categories (
      product_id integer NOT NULL REFERENCES public.demo_products(id),
      category_id integer NOT NULL REFERENCES public.demo_categories(id),
      PRIMARY KEY (product_id, category_id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_product_images (
      id serial PRIMARY KEY,
      product_id integer NOT NULL REFERENCES public.demo_products(id),
      url text NOT NULL,
      alt_text text,
      position integer NOT NULL DEFAULT 0
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_addresses (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES public.demo_users(id),
      label text NOT NULL DEFAULT 'home',
      street text NOT NULL,
      city text NOT NULL,
      state text,
      zip text,
      country text NOT NULL DEFAULT 'US',
      is_default boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_orders (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES public.demo_users(id),
      address_id integer REFERENCES public.demo_addresses(id),
      status text NOT NULL DEFAULT 'pending',
      total numeric(10,2) NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_order_items (
      id serial PRIMARY KEY,
      order_id integer NOT NULL REFERENCES public.demo_orders(id),
      product_id integer NOT NULL REFERENCES public.demo_products(id),
      quantity integer NOT NULL DEFAULT 1,
      unit_price numeric(10,2) NOT NULL DEFAULT 0
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_coupons (
      id serial PRIMARY KEY,
      code text NOT NULL UNIQUE,
      discount_pct integer NOT NULL CHECK (discount_pct BETWEEN 1 AND 100),
      valid_from timestamptz NOT NULL DEFAULT now(),
      valid_until timestamptz,
      max_uses integer NOT NULL DEFAULT 0,
      used_count integer NOT NULL DEFAULT 0
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_order_coupons (
      order_id integer NOT NULL REFERENCES public.demo_orders(id),
      coupon_id integer NOT NULL REFERENCES public.demo_coupons(id),
      PRIMARY KEY (order_id, coupon_id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_reviews (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES public.demo_users(id),
      product_id integer NOT NULL REFERENCES public.demo_products(id),
      rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
      body text,
      ts_vector tsvector,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_wishlists (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES public.demo_users(id),
      product_id integer NOT NULL REFERENCES public.demo_products(id),
      added_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, product_id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_notifications (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES public.demo_users(id),
      type text NOT NULL DEFAULT 'info',
      title text NOT NULL,
      body text,
      read boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.demo_sessions (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES public.demo_users(id),
      ip_address text NOT NULL,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )
  `);

  // ── Indexes ──

  await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_reviews_fts ON public.demo_reviews USING gin(ts_vector)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_orders_user ON public.demo_orders(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_order_items_order ON public.demo_order_items(order_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_reviews_product ON public.demo_reviews(product_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_addresses_user ON public.demo_addresses(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_notifications_user ON public.demo_notifications(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_sessions_user ON public.demo_sessions(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_wishlists_user ON public.demo_wishlists(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_categories_parent ON public.demo_categories(parent_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_product_images_product ON public.demo_product_images(product_id)`);

  if (hasVector) {
    try {
      await client.query("SAVEPOINT hnsw_idx");
      await client.query(`CREATE INDEX IF NOT EXISTS idx_demo_products_embedding ON public.demo_products USING hnsw(embedding vector_cosine_ops)`);
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT hnsw_idx");
    }
  }

  return { hasVector };
}
