# Everlasting Profit Tracker

Real-time profit dashboard pulling live data from Shopify + Meta, with per-product COGS tracking.

## How It Works

1. **Products** - You add products with their COGS breakdown (product cost, box, card, packing bag, shipping, COD fee, etc.)
2. **Shopify API** - Pulls order data (prepaid/COD split, quantities, revenue per product)
3. **Meta API** - Pulls ad spend (total spend, CPP, campaign breakdown)
4. **Profit Engine** - Calculates profit per product using the same logic as your spreadsheet

## Deploy to Vercel (Step by Step)

### Step 1: Push to GitHub

```bash
cd everlasting-profit
git init
git add .
git commit -m "Initial commit"
```

Then create a repo on GitHub called `everlasting-profit` and:

```bash
git remote add origin https://github.com/hellodeeep/everlasting-profit.git
git branch -M main
git push -u origin main
```

### Step 2: Set Up Supabase

1. Go to your existing Supabase project (or create new)
2. Open **SQL Editor**
3. Paste the contents of `supabase/migration.sql` and run it
4. Copy your project URL and anon key from **Settings > API**

### Step 3: Create Shopify Custom App

1. Go to Shopify Admin > **Settings** > **Apps and sales channels** > **Develop apps**
2. Click **Create an app**, name it "Profit Tracker"
3. Configure Admin API scopes: `read_orders`
4. Install the app and copy the **Admin API access token** (starts with `shpat_`)

### Step 4: Get Meta Marketing API Token

1. Go to [Meta Business Settings](https://business.facebook.com/settings)
2. Navigate to **System Users** > create one if needed
3. Generate a token with `ads_read` permission
4. Note your Ad Account ID (just the numbers, no `act_` prefix)

### Step 5: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **Add New > Project** > Import your GitHub repo
3. Framework Preset: **Vite**
4. Add these **Environment Variables**:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJxxxx...` |
| `SHOPIFY_STORE` | `everlasting-shop` |
| `SHOPIFY_ACCESS_TOKEN` | `shpat_xxxxx` |
| `META_ACCESS_TOKEN` | `EAAxxxxx` |
| `META_AD_ACCOUNT_ID` | `123456789` |

5. Click **Deploy**

### Step 6: Custom Domain (Optional)

In Vercel project settings > Domains, add something like `profit.everlasting.shop`

## Usage

1. Go to **Products** tab > Add your products with COGS
2. For "Shopify Product Title", use the EXACT product title from Shopify (this is how orders get matched)
3. Go to **Dashboard** > Select date range > Click **Fetch Data**
4. See real-time profit per product

## Architecture

```
Frontend (React + Vite)
    |
    |--- /api/shopify/orders  --> Shopify Admin API
    |--- /api/meta/spend      --> Meta Marketing API
    |--- Supabase             --> Products + Settings storage
    |
    Profit Engine (mirrors your spreadsheet formulas)
```

## Local Development

```bash
npm install
cp .env.example .env.local   # fill in your values
npm run dev
```

For API routes locally, you need `vercel dev` instead of `npm run dev`.
