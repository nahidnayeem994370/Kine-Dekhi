# Kine dekhi — secure checkout setup

This folder is for the separate Kine dekhi Supabase project only.

## 1. Run the database migration
Open the **Kine dekhi** Supabase project (project ref `jyrzdtitmdsxzxtxhecu`) → SQL Editor and run the full contents of:
`supabase/migrations/202610260001_create_order_rpc.sql`

This creates an atomic database function that recalculates prices from the database, checks active products and stock, writes the order and order items, and decrements stock in one transaction. Only `service_role` may execute it.

## 2. Deploy the Edge Function
In the Kine dekhi Supabase project, open Edge Functions and create a function named `create-order`. Paste the contents of `supabase/functions/create-order/index.ts`.

Set Edge Function secrets in Supabase:
- `SUPABASE_URL` = `https://jyrzdtitmdsxzxtxhecu.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = the project's secret/service-role key, entered only in Supabase Secrets, never in GitHub or browser code.

Deploy the function. Do not enable public read/write policies on `orders` or `order_items`.

## 3. Important current limitation
The existing static storefront has not yet been wired to submit the checkout form. Do not announce that checkout is live until the function is deployed and the frontend has been updated and tested. bKash/Nagad are recorded as pending only; this does not collect or verify payment. COD is the only payment method that can be treated as ready before a real payment gateway is integrated.
