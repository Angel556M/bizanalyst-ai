# BizAnalyst AI — Launch Guide

## Step 1: Set Up Stripe (Collect Payments)

### Create Your Stripe Account
1. Go to **stripe.com** → Sign up (free)
2. Complete identity verification (takes ~24 hours)
3. Go to **Dashboard → API Keys** — copy your **Publishable Key** (`pk_live_...`)

### Create Your Products & Prices
In **Stripe Dashboard → Products → Add Product**:

**Product 1: BizAnalyst Pro**
- Monthly price: $29/mo (recurring)
- Annual price: $276/year ($23/mo) (recurring)
- Copy both **Price IDs** (`price_...`)

**Product 2: BizAnalyst Business**
- Monthly price: $79/mo (recurring)
- Annual price: $756/year ($63/mo) (recurring)
- Copy both **Price IDs** (`price_...`)

### Update Your App
Open `bizanalyst-ai.jsx` and replace the placeholder values in `STRIPE_CONFIG`:

```javascript
const STRIPE_CONFIG = {
  publishableKey: "pk_live_YOUR_REAL_KEY",
  prices: {
    pro_monthly: "price_XXXXX",      // Your Pro monthly price ID
    pro_annual: "price_XXXXX",       // Your Pro annual price ID
    business_monthly: "price_XXXXX", // Your Business monthly price ID
    business_annual: "price_XXXXX",  // Your Business annual price ID
  },
  successUrl: "https://yourdomain.com?checkout=success",
  cancelUrl: "https://yourdomain.com?checkout=cancel",
};
```

### Add Backend for Checkout Sessions
You need a small API endpoint to create Stripe Checkout Sessions. Here's a minimal Node.js/Express example:

```javascript
// api/create-checkout.js (Vercel serverless function)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  const { priceId, customerEmail } = req.body;
  
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: process.env.DOMAIN + '?checkout=success',
    cancel_url: process.env.DOMAIN + '?checkout=cancel',
    customer_email: customerEmail,
    allow_promotion_codes: true,
  });
  
  res.json({ url: session.url });
};
```

Then in your app, replace the simulated checkout with:
```javascript
const res = await fetch('/api/create-checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ priceId, customerEmail: user.email }),
});
const { url } = await res.json();
window.location.href = url; // Redirects to Stripe
```

---

## Step 2: Deploy to Vercel (Go Live)

### Prerequisites
- GitHub account (github.com — free)
- Vercel account (vercel.com — free)
- Node.js installed (nodejs.org)

### Set Up the Project

```bash
# 1. Create a new React project
npx create-react-app bizanalyst-ai
cd bizanalyst-ai

# 2. Install dependencies
npm install papaparse recharts

# 3. Replace src/App.js with the contents of bizanalyst-ai.jsx
#    Change the first line from:
#      import { useState, useRef, useEffect } from "react";
#    And make sure the default export is used as your App component

# 4. Push to GitHub
git init
git add .
git commit -m "BizAnalyst AI v1"
git remote add origin https://github.com/YOUR_USERNAME/bizanalyst-ai.git
git push -u origin main
```

### Deploy on Vercel

1. Go to **vercel.com** → Sign in with GitHub
2. Click **"Add New Project"**
3. Import your `bizanalyst-ai` repo
4. Vercel auto-detects React — click **Deploy**
5. In ~60 seconds, you'll get a live URL: `bizanalyst-ai.vercel.app`

### Add Your Custom Domain (Optional)
1. Buy a domain (namecheap.com or Google Domains — ~$12/year)
   - Suggestions: `bizanalyst.ai`, `bizanalystai.com`, `getbizanalyst.com`
2. In Vercel → Project Settings → Domains → Add your domain
3. Update your domain's DNS to point to Vercel (they give you the exact settings)

### Set Environment Variables
In Vercel → Project Settings → Environment Variables, add:
```
STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY
DOMAIN=https://yourdomain.com
```

---

## Step 3: Add Real Authentication

The current auth is client-side (demo mode). For production, pick one:

### Option A: Clerk (Easiest — 5 min setup)
1. Go to **clerk.com** → Create account (free for 10K users)
2. `npm install @clerk/clerk-react`
3. Wrap your app in `<ClerkProvider>`, use their `<SignIn>` and `<UserButton>` components
4. They handle everything: Google OAuth, email/password, sessions, user management

### Option B: Supabase Auth (Free + Database)
1. Go to **supabase.com** → Create project (free tier)
2. `npm install @supabase/supabase-js`
3. Use their auth methods: `supabase.auth.signUp()`, `supabase.auth.signInWithPassword()`
4. Bonus: You also get a free database for storing user analyses

### Option C: Firebase Auth
1. Go to **firebase.google.com** → Create project
2. `npm install firebase`
3. Enable Email/Password and Google sign-in in Firebase Console

**Recommendation:** Start with **Clerk** — it's the fastest to set up and has the best UI out of the box. Move to Supabase later if you need a database.

---

## Step 4: Add a Database (Store User Data)

To save user analyses, plans, and usage, you need a database:

### Supabase (Recommended — free tier)
Create these tables:
- **users**: id, email, name, plan, stripe_customer_id, created_at
- **analyses**: id, user_id, file_name, stats_json, created_at

### Stripe Webhooks
Set up a webhook endpoint to automatically update user plans when:
- Payment succeeds → upgrade user
- Subscription cancelled → downgrade to free
- Payment failed → notify user

---

## Launch Checklist

- [ ] Stripe account verified
- [ ] Products & prices created in Stripe
- [ ] Price IDs added to app config
- [ ] Checkout API endpoint working
- [ ] Auth provider set up (Clerk/Supabase)
- [ ] App deployed on Vercel
- [ ] Custom domain connected
- [ ] Environment variables set
- [ ] Test the full flow: signup → upload → analyze → upgrade → pay
- [ ] Create a landing page or Product Hunt listing
- [ ] Post on Reddit, Indie Hackers, Twitter

---

## Cost Breakdown

| Service | Cost |
|---------|------|
| Vercel hosting | Free (hobby tier) |
| Stripe | 2.9% + $0.30 per transaction |
| Clerk auth | Free up to 10K users |
| Claude API (AI analysis) | ~$0.02-0.05 per analysis |
| Domain name | ~$12/year |
| **Total to launch** | **~$12** |

---

## Revenue Projections

| Users | Plan | Monthly Revenue |
|-------|------|----------------|
| 50 | Pro ($29) | $1,450 |
| 100 | Pro ($29) | $2,900 |
| 200 | Mix | $5,800+ |
| 500 | Mix | $14,500+ |

Your main costs scale with usage: ~$0.03 per AI analysis = $15/mo at 500 analyses. Margins are 95%+.
