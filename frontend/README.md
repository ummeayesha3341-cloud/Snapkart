# SnapKart — Scan. Shop. Done.
Mobile-first self-checkout frontend (React + Vite). Talks only to the SnapKart HTTP API.

## Setup
    npm install
    cp .env.example .env     # set VITE_API_BASE_URL (default http://localhost:3000)
    npm run dev              # http://localhost:5173
    npm run build            # production build

## Test camera scanning on a phone

Phone browsers require HTTPS for camera access. For a temporary local test, set `VITE_API_BASE_URL=/api` in `.env.local`, start Vite, then create a tunnel and open its HTTPS URL on the phone. The preferred Docker Desktop command is `docker run --rm cloudflare/cloudflared:latest tunnel --url http://host.docker.internal:5173`; alternatively run `npx --yes localtunnel --port 5173`. Vite proxies `/api` to the local backend. Keep the backend, Vite, and tunnel running; stop the tunnel after testing. A tunnel makes the development site reachable from the internet, so use test accounts and do not enter sensitive data.

## Structure
`src/services/api.js` API client (base URL, auth header, timeout, error mapping, 401) · `src/context/AppContext.jsx` auth + cart state · `src/components/ui.jsx` shared components · `src/screens/` screens · `src/utils/format.js` currency/date helpers · `src/theme/theme.css` design tokens.

## Notes
- **Scanner:** `Scan.jsx` uses `@zxing/browser` (`BrowserMultiFormatReader`) to decode supported 1D and 2D barcode text from the camera. Images stay in the browser; only decoded text is sent to the API. Manual code entry is always available. Camera access requires HTTPS or localhost.
- **Auth:** JWT stored in `localStorage` (`sk_token`), sent as `Authorization: Bearer`. A 401 clears it and returns the user to sign-in.
- **Cart:** backend is the source of truth; add returns the cart, other changes re-fetch `GET /cart`. Items are addressed by their cart-item `id` in `PATCH/DELETE /cart/items/:id`.
- **Checkout:** `POST /checkout` with an `Idempotency-Key` kept in sessionStorage; reused on retry/pending, cleared on a definitive result.
- **If endpoints change:** edit `src/services/api.js` (paths, error mapping); response shapes are read in `AppContext.jsx`, `Checkout.jsx`, `Bills.jsx`.
