# GlamHop Returns & Exchange

A production-ready embedded Shopify app built to manage customer returns and exchanges with a premium, luxury customer-facing portal and a full merchant management panel.

## Tech Stack
- **Framework**: Shopify Remix App (React + TypeScript)
- **Design System**: Shopify Polaris (Merchant Admin) + Minimal luxury custom UI (Customer Storefront)
- **Database & ORM**: PostgreSQL + Prisma
- **Hosting Compatibility**: Vercel & Node.js

---

## Folder Structure
- `app/`: Primary application logic.
  - `components/`: Reusable components (e.g. `GlamHopOrderCard.tsx`, `CustomerPortalLayout.tsx`).
  - `routes/`: Routing definition for Shopify Auth, Admin Views (`/app/...`), and Customer Storefront Proxy (`/app/proxy`).
  - `styles/`: Stylesheets including `portal.css` for custom storefront branding.
  - `shopify.server.ts`: Shopify SDK instance config.
  - `db.server.ts`: Prisma database client.
- `prisma/`: Database schemas and migrations.
- `shopify.app.toml`: App config and scope mapping.
- `vercel.json`: Deployment script.

---

## Local Development Setup

### 1. Prerequisite Settings
Copy `.env.example` to `.env` and fill in the values:
```bash
cp .env.example .env
```
Ensure you have a local or cloud PostgreSQL instance running and set the `DATABASE_URL` appropriately.

### 2. Install Dependencies
Run npm install in the project directory:
```bash
npm install
```

### 3. Setup Database Schema
Execute database migrations and client generation:
```bash
npm run setup
```

### 4. Run Development Server
Startup the Shopify development environment:
```bash
npm run dev
```

---

## Deployment to Vercel

1. Connect your GitHub repository to Vercel.
2. In Vercel, set your environment variables:
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `SHOPIFY_APP_URL`
   - `DATABASE_URL` (production database URL)
3. Deploy! Vercel will automatically run the build step specified in `vercel.json`.
