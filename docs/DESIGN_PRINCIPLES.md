# Design, SEO & Copywriting Principles

Canonical reference for all design psychology, SEO strategy, copywriting rules, and brand voice guidelines used across Truss marketing surfaces (landing page, docs, social, waitlist comms).

---

## 1. Design Psychology Principles

### 1.1 AIDA Flow

**Definition:** Attention -> Interest -> Desire -> Action. A persuasion framework that sequences content to move readers from awareness to conversion.

**How we apply it:**
- Every section on the landing page maps to exactly ONE AIDA phase. No section serves two phases.
- Hero = Attention (headline + subhead hook the reader)
- Ticker + Platform (bento grid) = Interest (show the full stack)
- Compare (dossier cards) + Pricing math = Desire (prove value, create urgency)
- Pricing plans + Waitlist CTA = Action (convert)

**Current section order:** Hero -> Ticker -> Platform -> Compare -> Pricing -> FAQ -> Waitlist -> Footer.

**Rule:** Never reorder sections in a way that breaks the AIDA sequence. Every addition must slot into the correct phase.

### 1.2 Rule of One

**Definition:** Each section makes ONE distinct argument. Redundant sections dilute every copy that makes the same point.

**How we apply it:**
- The Compare section is the ONLY place we directly compare against competitors. No other section should repeat "we have more features than X."
- The Pricing section argues value-for-money. It does not re-argue feature completeness.
- The Platform section shows breadth. It does not argue price.
- If a new section is proposed, ask: "Does any existing section already make this argument?" If yes, fold it in or replace -- never duplicate.

### 1.3 Peak-End Rule

**Definition:** People judge an experience based on its most intense moment (peak) and how it ends. The "peak" section should be the most visually impactful.

**How we apply it:**
- The dossier comparison cards are the peak -- animated bar fills, dot matrices, visual scoring. Maximum visual density.
- The waitlist section is the "end" -- clean, simple, memorable. A single input field with no distractions.
- Never bury the peak in the middle of low-contrast sections. It should visually "pop" relative to neighbors.

### 1.4 Cognitive Load

**Definition:** Every section costs attention budget. Remove anything that doesn't add NEW information the reader hasn't already absorbed.

**How we apply it:**
- The ticker repeats feature names from the platform grid, but serves a different purpose (ambient scanning vs. deliberate reading). This is acceptable.
- FAQ answers questions the page body doesn't cover (technical depth, competitor specifics). It doesn't restate hero copy.
- If two sections convey identical information in different formats, one must go.

### 1.5 Von Restorff Effect (Isolation Effect)

**Definition:** The thing that looks visually different from its surroundings gets remembered.

**How we apply it:**
- The hero module card in the bento grid spans 2 columns + 2 rows and has a left border accent. It is the only card that looks different.
- The Truss dossier column has a top border accent + tinted background (`--pop-soft`). It visually separates from competitor columns.
- The "Popular" badge on the Pro pricing tier uses the same isolation principle.
- Primary CTAs use solid dark/accent fills; secondary CTAs use ghost outlines. Never give both the same weight.

### 1.6 F-Pattern Scanning

**Definition:** Users scan web pages in an F-shape -- across the top, then down the left edge. Critical content should be placed along these axes.

**How we apply it:**
- Section labels (mono uppercase) sit at the top-left of every section, catching the horizontal scan.
- Section titles follow immediately below, catching the vertical scan.
- Feature names in the bento grid start from top-left. The hero card occupies the top-left corner.
- Pricing tiers read left to right, cheapest first (scanning entry point is always the lowest commitment).

### 1.7 Hick's Law

**Definition:** The time to make a decision increases with the number of choices. Fewer options = faster conversion.

**How we apply it:**
- Hero has exactly 2 CTAs: "Get Early Access" (primary) + "See the full stack" (secondary). Maximum 2.
- Each pricing tier has one CTA button. No dropdown menus, no "compare plans" toggle.
- The waitlist form has one field (email) and one button. No name, no company, no dropdown.
- Navigation has 4 content links + 2 action links. Under 7 items total.

### 1.8 Social Proof Proximity

**Definition:** Trust signals are most effective when placed near decision points (before the user is asked to commit).

**How we apply it:**
- The Compare section (social proof via competitor data) appears BEFORE Pricing (the decision point).
- The "do the math" cost comparison appears within the Pricing section itself, right before CTAs.
- FAQ (addressing objections) appears after Pricing, serving as a safety net before the final Waitlist CTA.
- Future testimonials or user counts should go between Compare and Pricing, or within Pricing.

### 1.9 Curiosity Gap

**Definition:** Headlines should create a gap between what users know and what they want to know, compelling them to read further.

**How we apply it:**
- Hero headline: "Your entire backend. One platform. Already wired." -- The reader knows they need a backend; the gap is "how can it already be wired?"
- Compare headline: "Same shopping list, different carts." -- Creates curiosity about what the differences actually are.
- Pricing headline: "Simple pricing. No feature jail." -- Implies competitors have feature jail, reader wants to know what that means.

### 1.10 Loss Aversion

**Definition:** People are more motivated by avoiding loss than achieving gain. Frame around what users are missing or losing, not just what they gain.

**How we apply it:**
- "No billing surprises" (loss: unexpected charges)
- "No feature jail" (loss: being locked out of capabilities you need)
- "No vendor lock-in" (loss: inability to leave)
- "No pausing" (loss: Supabase pauses inactive projects)
- "Skip the $70/mo vector database bill" (loss: money wasted on separate services)
- The DIY stack cost breakdown ($145+/mo) makes the reader feel the loss of paying more elsewhere.

### 1.11 Anchoring Effect

**Definition:** The first number a person sees sets the reference point for all subsequent numbers.

**How we apply it:**
- The DIY stack total ($145+/mo) appears BEFORE the Truss Pro price ($29/mo). The high anchor makes $29 feel like a bargain.
- Pricing tiers are ordered cheapest ($9) to most expensive ($299). The low anchor makes even Business tier feel reasonable.

### 1.12 Progressive Disclosure

**Definition:** Show only what's needed at each step. Details are available on demand, not forced upfront.

**How we apply it:**
- FAQ uses `<details>` elements -- questions are visible, answers are hidden until clicked.
- Feature descriptions in the bento grid are 1-2 sentences. Full documentation lives elsewhere.
- Pricing specs show key numbers only. Detailed plan comparison is deferred to the dashboard/docs.

---

## 2. Copywriting Principles

### 2.1 Developer-Focused Voice

Write for developers who have shipped production systems. They can smell marketing fluff.

**Rules:**
- Use technical terms correctly. "RBAC" not "role-based security features." "HMAC-signed webhooks" not "secure webhooks."
- Name real technologies: PostgreSQL, pgvector, Ory Kratos, MinIO, HNSW indexes. Developers trust specificity.
- Show, don't tell. List concrete capabilities rather than abstract benefits.
- Never explain what a developer already knows. Don't define "PostgreSQL" or "OAuth2."

### 2.2 "Boring Infrastructure" Positioning

Truss is not revolutionary. It is the reliable, complete backend you should have had from day one.

**Rules:**
- Position reliability as the feature. "Already wired" > "cutting-edge."
- Emphasize what's included over what's innovative. Completeness is the differentiator.
- Use phrases like: "zero assembly required," "ships on day one," "every feature above? live and clickable."
- The subtext is: "You've been wasting time stitching together 5 services. Stop."

### 2.3 Anti-Hype Tone

**Never use:**
- "Revolutionary," "game-changing," "next-generation," "disruptive"
- "AI-powered" (unless describing an actual AI feature like pgvector similarity search)
- "Blazing fast," "lightning fast," "incredibly powerful"
- "World-class," "best-in-class," "enterprise-grade" (unless substantiated)
- Exclamation marks in headlines or body copy

**Do use:**
- Understated confidence: "It just works," "already wired," "zero assembly required"
- Scribble annotations (Caveat font) for personality: "^ yes, all of it," "we checked," "finally."
- Dry humor: "your weekend" / "your sanity" as line items in the DIY cost breakdown
- Direct address: "your backend," "your database," "you'd rather build products"

### 2.4 Specificity Over Adjectives

Every claim should be verifiable. Replace adjectives with facts.

**Examples:**
- BAD: "Comprehensive authentication solution"
- GOOD: "Social login, passwordless, MFA, sessions, SSO"
- BAD: "Powerful database features"
- GOOD: "Monaco editor, query history, ERD visualizer, branching, backups, point-in-time recovery"
- BAD: "Affordable pricing"
- GOOD: "$29/mo" (with $145+ DIY comparison)

### 2.5 Competitor Differentiation Without Negativity

We compare. We do not trash-talk.

**Rules:**
- Present factual feature comparisons. "has" vs "missing" -- binary, verifiable.
- Let the data speak. The dot matrix and bar fills do the arguing, not the copy.
- Acknowledge competitor strengths. Supabase gets credit for what it has.
- Never say "better than." Say "includes X, which [competitor] does not."

### 2.6 Scribble Voice (Caveat Font Annotations)

**Rules:**
- Used sparingly -- max 1-2 per major section.
- Always short: 2-6 words. Never a full sentence.
- Tone: wry, knowing, slightly conspiratorial.
- Examples: "^ yes, all of it," "we checked," "finally," "even the $9 one"
- Never use for critical information. Scribbles are commentary, not content.

---

## 3. SEO & Technical

### 3.1 Target Keywords

**Tier 1 — High volume, high intent:**

| Keyword | Est. Monthly Volume |
|---------|-------------------|
| supabase alternative | 3,000-5,000 |
| firebase alternative | 5,000-8,000 |
| open source backend platform | 1,500-2,500 |
| backend as a service | 1,000-2,000 |
| appwrite alternative | 500-1,000 |

**Tier 2 — Medium volume, high conversion:**

| Keyword | Est. Monthly Volume |
|---------|-------------------|
| supabase alternative open source | 1,500-2,500 |
| neon alternative | 500-800 |
| pocketbase alternative | 400-700 |
| managed database platform | 500-1,000 |
| postgres backend as a service | 400-800 |

**Tier 3 — Long-tail:** supabase vs appwrite vs firebase, open source auth + database, ory kratos dashboard, postgres realtime subscriptions, baas with fine-grained permissions, database branching, supabase billing problems

**Placement strategy:**
- **Title tag**: brand + primary keyword (<60 chars)
- **H1**: conversion-focused (doesn't need to match title exactly)
- **H2s**: pack competitor/feature keywords naturally
- **Body text**: weave in "open-source backend", "postgres platform", etc.
- **FAQ**: each question targets a long-tail query
- **Footer**: keyword-dense summary paragraph + GitHub link (backlink signal)

### 3.2 Meta Tags

Every public page needs:

| Tag | Rule |
|-----|------|
| `<title>` | Under 60 chars, brand + primary keyword |
| `meta description` | 150-160 chars, features + competitor mentions |
| `link canonical` | Always production domain (prevent CF Pages duplicates) |
| `og:image` | 1200x630px (TODO: create og-image.png) |
| `twitter:card` | summary_large_image |
| `robots` | `index, follow, max-image-preview:large, max-snippet:-1` |
| `theme-color` | `#9f1239` |

**Canonical URL is critical on CF Pages** — it can serve `usetruss.dev`, `www.usetruss.dev`, `*.pages.dev`, trailing-slash variants. Without canonical, Google sees duplicates.

### 3.3 Schema Markup (JSON-LD)

Three schemas on the landing page:
1. **SoftwareApplication** — name, description, featureList, offers, author
2. **FAQPage** — each Q&A as Question/Answer entity (helps passage-based ranking)
3. **WebSite** — name, url, description

Future: Organization, Product (per pricing tier), HowTo (self-hosting guide), BreadcrumbList.

### 3.4 Semantic HTML

1. Use `<header>`, `<main>`, `<footer>`, `<nav>`, `<section>` landmarks
2. Heading hierarchy: h1 → h2 (per section) → h3. Never skip levels.
3. `<nav>` gets `aria-label` ("Main navigation", "Footer navigation")
4. Forms/inputs get `aria-label`
5. Use `<details>/<summary>` for FAQ (native accordion, accessible)
6. Use `<strong>` and `<em>` for key phrases (3-5 per page max)

### 3.5 Core Web Vitals

| Metric | Target | Risk | Mitigation |
|--------|--------|------|------------|
| LCP | < 2.5s | Low (text h1) | `font-display: swap` on Google Fonts |
| INP | < 200ms | Low (static page) | `{ passive: true }` on scroll listeners |
| CLS | < 0.1 | Medium (font swap) | Set explicit heights on animated elements (ticker) |

### 3.6 Page Speed Rules (Landing Page)

- No JavaScript frameworks. Vanilla JS only.
- No external CSS libraries.
- Inline CSS and SVG. No image requests.
- Google Fonts with `preconnect` + `display=swap`.
- Target: <100KB total, <1s LCP, 0 CLS.

### 3.7 Cloudflare Pages Headers

All apps have `_headers` files with security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy).

### 3.8 Files to Maintain

- `www/robots.txt` — `Allow: /`, points to sitemap
- `www/sitemap.xml` — one `<url>` per page, update `<lastmod>` on changes

---

## 4. Brand Voice

### 4.1 Tone

**Confident, technical, slightly irreverent.**

We state what the product does without hedging. We use correct terminology. We add personality through scribble annotations and dry humor, not corporate language.

### 4.2 What We Say vs. What We Don't Say

| We say | We don't say |
|--------|-------------|
| "Backend platform built on open-source infra" | "Cloud-native infrastructure solution" |
| "Already wired" | "Seamlessly integrated" |
| "No billing surprises" | "Cost-effective pricing model" |
| "$29/mo" | "Competitive pricing" |
| "Docker Compose" | "Containerized deployment solution" |
| "pg_dump always works" | "Standard-compliant data export" |
| Specific numbers (14/14, $145+, 2K MAU) | Vague superlatives ("many," "powerful," "fast") |

### 4.3 Naming Conventions

**Landing page:** Domain names only. Sell the capability, not the tool.

| Technical | Landing Page |
|-----------|-------------|
| Ory Kratos | "Enterprise Auth" / "Authentication" |
| Ory Keto | "Fine-Grained Permissions" / "Authorization" |
| Ory Hydra | "OAuth2 / OpenID Connect" |
| MinIO | "S3 Object Storage" |
| pgvector | "pgvector" (lowercase, as the extension is named) |

**Exception:** FAQ answers use technical names for SEO (developers search for "Ory Kratos dashboard").

**Absolute prohibition:** Never use "Zanzibar" in any user-facing context.

### 4.4 Visual Design Language (Landing Page)

**Typography:** DM Serif Display (headlines), DM Sans (body), JetBrains Mono (code), Caveat (scribbles)

**Colors:** `--bg: #faf9f6` (warm off-white), `--pop: #9f1239` (brand wine), `--ink: #1a1a1a`, `--rule: #ddd9d0`

**Layout:** Max 920px, 28px padding, 80px section rhythm, no full-bleed sections

**Rules:** No hero images (SVG only), no gradients on backgrounds, no shadows except scrolled topbar, border-radius max 12px

---

## 5. Anti-Patterns (Things We Explicitly Avoid)

1. **Feature jail** in our own product. Every plan gets every feature.
2. **Surprise billing.** Hard limits, no metered overages (except opt-in on Business).
3. **Corporate SaaS voice.** No "solutions," "leverage," "synergy," "ecosystem."
4. **Emoji in marketing.** Typographic symbols or Caveat scribbles instead.
5. **Stock photography.** SVG illustrations or nothing.
6. **Autoplay video.** User-initiated only.
7. **Cookie consent banners.** No third-party tracking on landing page.
8. **Pop-ups or exit-intent overlays.** Waitlist form is inline.
9. **Social proof we don't have.** No fake numbers or testimonials.
10. **Free tier.** No free tier — not VC funded. Managed starts at $9. Live demo available for evaluation.
