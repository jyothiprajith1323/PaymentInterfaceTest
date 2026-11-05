# ⚡ CraftLanee Pay · Production Payment Suite v2.5

> **A modular, plug-and-play production UPI payment platform and observation gateway branded completely as CraftLanee Pay. Features an All-in-One Bento-Grid Control Dashboard, Plug-and-Play Module Manager, Live Checkout Customizer Studio with real-time interactive preview, and a universal drop-in SDK.**

---

## 🚀 Key Highlights & Architecture

- **Single Command Launch**: The entire gateway, verification engines, checkout portal, SSE telemetry, background statement scrapers, and unified control dashboard run from a single command:
  ```bash
  npm start
  ```
  *(Listening on port **7000**)*
- **Persistent SQLite with WAL Mode**: Embedded zero-dependency database (`craftlanee_pay.db`) using native Node.js `node:sqlite` (`DatabaseSync`) configured with:
  ```sql
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  ```
- **Plug-and-Play Feature Toggle Hub**: Enable or disable any payment or verification engine with a single click. When toggled ON, step-by-step setup checklists and credential forms expand; when toggled OFF, options are immediately hidden from customer checkouts and background pollers stop without server restart.
- **Checkout Studio Customizer**: Interactive live preview card beside theme controls with 1-click presets (`Obsidian Dark`, `Nothing Matrix`, `Clean Light`, `Emerald Fintech`), custom color pickers, border-radius sliders, and component toggles saved directly in SQLite (`ui_customization`).
- **Universal Drop-In SDK**: Zero-dependency client SDK served at `/craftlanee-pay.js` and `/youpi.js` featuring pure JavaScript embedded SVG QR code generation, 1-tap mobile UPI intents, and anti-replay UTR verification.

---

## 🗄️ Database Tables (`craftlanee_pay.db`)

1. **`merchants_config`**: Active Merchant Name, multi-VPA pool (`vpa_list`), API keys (`cl_pub_live_...`, `cl_sec_live_...`), `webhook_secret`, `webhook_url`, and edge-case rules.
2. **`orders`**: `order_id`, `amount_requested`, `amount_locked` (for unique paise matching), `vpa_assigned`, `status` (`QUEUED`, `ACTIVE`, `PROCESSING`, `UTR_SUBMITTED`, `SUCCESS`, `SUSPICIOUS`, `EXPIRED`), `utr`, `verification_method`, `customer_json`, `created_at`, and `settled_at`.
3. **`utr_ledger`**: Every bank/SMS/app/manual `utr` (strict `UNIQUE` constraint preventing replay/double-spend attacks), `amount`, `raw_source`, `matched_order_id`, and `received_at`.
4. **`feature_modules`**: Plug-and-Play modules state (`module_id`, `name`, `enabled`, `config_json`, `updated_at`).
5. **`bank_ledger`**: Corporate bank statement transactions (`utr`, `amount`, `payer_vpa`, `raw_description`, `synced_at`, `matched_order_id`).
6. **`ui_customization`**: Checkout Studio branding and visual theme configuration (`primary_color`, `bg_color`, `border_radius`, `show_qr`, `show_intent_buttons`, `show_timer`, etc.).
7. **`observer_devices`**: Paired Android phones, device secrets, last heartbeat timestamp, battery/network status, and ADB loopback status.
8. **`webhook_logs`**: Outgoing webhook attempts, HTTP status codes, HMAC-SHA256 signatures (`X-CraftLanee-Signature`), and retry counts.

---

## 🔌 The 5 Plug-and-Play Modules

### 1. UPI Intent Deep-Linking & Return Callback Engine (`upi_intent`)
- Renders 1-tap mobile payment buttons (`GPay`, `PhonePe`, `Paytm`, `BHIM`, `CRED`) using app schemes (`tez://upi/pay`, `phonepe://pay`, `paytmmp://pay`, `upi://pay`).
- Callback handler at `/api/v1/intent/callback` captures return status and UTRs, automatically verifying against bank statement ledgers before instant settlement.

### 2. Headless Bank Statement Scraper / API Poller (`bank_scraper`)
- Eliminates phone SMS dependency by pulling bank credits directly via REST banking APIs, statement endpoints, or automated headless scrapers into the SQLite `bank_ledger`.
- Supports background polling (every 10s) and instant manual trigger `/api/v1/ledger/sync`.

### 3. Customer 12-Digit UTR Lookup ("I Have Paid") (`manual_utr`)
- Upgrades `/api/v1/verify/manual` with strict 12-digit numeric validation and anti-replay detection.
- Instantly cross-checks against the live bank statement ledger with configurable fallback (Instant Optimistic Settlement vs. Zero-Trust Smart Polling Hold).

### 4. Android Push / SMS Observer & ADB Tunnel (`android_observer`)
- Listens for bank push notifications and SMS via paired Android device over LAN, public URL, or USB/Wi-Fi ADB reverse tunnel:
  ```bash
  adb reverse tcp:7000 tcp:7000
  ```
- Extracts credited amounts and UTRs via multi-bank regex patterns.

### 5. Developer Sandbox Simulator (`sandbox_simulator`)
- Instant 1-click simulated credit settlement for dev, staging, and automated CI test runs without moving real money (`/api/v1/sandbox/simulate`).

---

## 🎨 Live Checkout Studio (`/dashboard`)

Access the unified dashboard at **`http://localhost:7000/dashboard`**.

Customize every aspect of your checkout modal with live side-by-side interactive preview:
- **Brand Identity**: Display Title, Subtitle, Merchant Logo URL, Security/Trust Badge.
- **Theme Presets**: `Obsidian Dark`, `Nothing Matrix`, `Clean Light`, `Emerald Fintech`.
- **Styling**: Primary Accent Picker, Background Color Picker, Border Radius slider, Font Style.
- **Toggles**: Toggle visibility of QR Code, Mobile Intent Buttons, Countdown Timer, and Order Reference Badge.

---

## 💻 Universal SDK Integration

### Drop-in HTML / Vanilla JS
```html
<!-- 1. Include CraftLanee Pay SDK -->
<script src="http://localhost:7000/craftlanee-pay.js"></script>

<!-- 2. Declarative Pay Button -->
<button data-craftlanee-pay data-amount="499.00" data-name="Pro Subscription">
  Pay ₹499 with UPI
</button>

<!-- 3. Programmatic Trigger -->
<script>
  CraftLaneePay.pay({
    amount: 499.00,
    name: 'Pro Subscription',
    handler: function(response) {
      console.log('Payment Successful! UTR:', response.utr);
    }
  });
</script>
```

### React / Next.js
```jsx
import { useEffect } from 'react';

export default function CheckoutButton({ amount = 499.00 }) {
  useEffect(() => {
    const s = document.createElement('script');
    s.src = 'http://localhost:7000/craftlanee-pay.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  const handlePay = () => {
    window.CraftLaneePay.pay({
      amount,
      name: 'Order #1042',
      handler: (response) => {
        alert('Payment settled! UTR: ' + response.utr);
      }
    });
  };

  return <button onClick={handlePay}>Pay ₹{amount} with UPI</button>;
}
```

### Webhook Verification (Node.js)
```javascript
import crypto from 'node:crypto';

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-craftlanee-signature'];
  const hmac = crypto.createHmac('sha256', process.env.CRAFTLANEE_WEBHOOK_SECRET);
  hmac.update(req.body);
  const expected = 'sha256=' + hmac.digest('hex');

  if (signature !== expected) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body.toString());
  console.log('Verified Payment Success:', event.order_id, event.utr);
  res.status(200).send('OK');
});
```

---

## 📜 Directory Structure

```
├── .env
├── .env.example
├── README.md
├── index.js
├── craftlanee_pay.db
├── package.json
├── package-lock.json
└── public/
    ├── dashboard.html
    └── youpi.js
```
