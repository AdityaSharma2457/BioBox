# Bio Box

Bio Box is a creator portfolio MVP: creators choose a template, font, and colors, add images, social links, products, and other links, then share one public page at a custom slug. Portfolio pages are rendered by the React app from data stored in SQLite; no per-creator HTML deployments are created.

## Run locally

1. Install Node.js 20 or newer.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and set `JWT_SECRET` to a random secret of at least 32 characters.
4. Start the API and frontend together with `npm run dev`.
5. Open `http://localhost:5173`.

The API listens on port 4000, and Vite proxies `/api` requests to it. SQLite creates `data/gather.sqlite3` on first run. Uploaded JPEG, PNG, and WebP files (up to 5 MB) are stored as SQLite BLOBs.

## MVP behavior

- Creators sign up with email, password, and an Instagram profile URL. The URL is used to infer the username. A creator can provide a profile-photo URL or upload a photo in the editor; uploaded images can be captioned or used for QR codes.
- Portfolio owners can choose a sans, serif, rounded, or monospaced font and add optional Instagram, YouTube, X, Facebook, Snapchat, and business-email links.
- A separate product shelf supports up to 20 merch/product links in a horizontal carousel. Product name, image, and price sync is best-effort on Amazon, Flipkart, Myntra, Meesho, Zara, AJIO, Snapdeal, Nykaa, and Shopify-hosted stores, with a manual refresh button and editable photo/price fallbacks. Personal stores that do not expose product metadata can still be added manually. This is a creator-triggered metadata snapshot, not an automatic price tracker; each store controls whether its public metadata can be read.
- Instagram does not provide a dependable supported profile-photo lookup from a pasted URL alone. This MVP does not scrape Instagram; profile photos must be provided manually. Automatic Instagram profile refresh requires an authorized Instagram API integration.
- Spotify, YouTube, and SoundCloud links are checked against their respective oEmbed endpoints when added. If a preview is unavailable, the creator can still add a title, description, and cover image. The raw URL is not shown as the card label.
- Plans are a 7-day free pass, ₹750 for 30 days, and ₹3,000 for 365 days. Paid-plan activation is mocked; no payment is collected.
- `FREE1MONTH` and `FREE1YEAR` activate the matching monthly or yearly duration. Coupon validation and plan activation happen on the server.
- Public portfolios end with a Bio Box attribution button so visitors can start their own page.
- Public portfolios are available only while their plan is active.

## Commands

- `npm run dev` — run the API and Vite development server.
- `npm run build` — type-check and build the frontend and API.
- `npm test` — run API workflow tests.
- `npm run lint` — run Oxlint.

For production, build the React app and deploy it alongside the API with a persistent SQLite data volume. Set `NODE_ENV=production`, `CLIENT_ORIGIN`, and a strong `JWT_SECRET`. This MVP does not include a production payment provider or an Instagram OAuth integration.
