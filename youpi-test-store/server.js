/**
 * YouPI-PG Dual-Mode Test Storefront Server
 * Port: 4000
 *
 * Supports:
 *   - Real UPI VPA configuration (updates SQLite database and Admin API)
 *   - Programmatic & Declarative YouPI payments with custom INR amounts
 *   - MODE A: Automated simulated observer bank credit
 *   - MODE B: Real live UPI payment with manual UTR submission & observer pairing
 *   - HMAC-SHA256 verified webhook receiver & telemetry inspector
 *   - Background Android observer heartbeat provider
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const http    = require('http');
const fs      = require('fs');
const { DatabaseSync } = require('node:sqlite');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Paths & Secrets ───────────────────────────────────────────────────────────
const YOUPI_DIR      = path.resolve(__dirname, '../youpi-pg');
const DB_PATH        = path.join(YOUPI_DIR, 'data/youpi_pg.sqlite');
const SECRETS_DIR    = path.join(YOUPI_DIR, 'data/.secrets');
const API_URL        = process.env.YOUPI_API_URL || 'http://localhost:6100';
const DEFAULT_MID    = '00000000-0000-0000-0000-000000000001';
const ENROLL_SECRET  = 'android_pairing_enrollment_secret_key_32_chars';

// In-memory state
const verifiedWebhooks = [];
let activeSessionCache = null;
let cachedAdminToken   = null;
let androidDriverInstance = null;

// Helper: read secret files
function readSecret(name, fallback = '') {
  try {
    return fs.readFileSync(path.join(SECRETS_DIR, name), 'utf8').trim();
  } catch {
    return fallback;
  }
}

function getAdminToken() {
  if (cachedAdminToken) return cachedAdminToken;
  cachedAdminToken = readSecret('admin_api_token');
  return cachedAdminToken;
}

function getWebhookSecret() {
  return readSecret('coin_store_webhook_secret');
}

// Helper: connect to SQLite DB
function getDb() {
  return new DatabaseSync(DB_PATH);
}

// Helper: HTTP request
function httpRequest(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
      if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
    }
    const req = http.request({
      hostname: parsed.hostname,
      port:     parsed.port,
      path:     parsed.pathname + parsed.search,
      method,
      headers:  reqHeaders
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Static Assets ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── 1. Webhook Endpoint (express.raw MUST be before express.json) ──────────────
app.post(
  '/api/youpi-webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const rawBody   = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const rawSig    = (req.headers['x-gateway-signature'] || '').trim();
    // Normalize signature (remove sha256= prefix if present)
    const sigHeader = rawSig.startsWith('sha256=') ? rawSig.slice(7) : rawSig;
    const secret    = getWebhookSecret();

    let verified = false;
    if (secret && sigHeader) {
      try {
        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        const expectedBuf  = Buffer.from(expected, 'utf8');
        const presentedBuf = Buffer.from(sigHeader, 'utf8');
        if (
          expectedBuf.length === presentedBuf.length &&
          crypto.timingSafeEqual(expectedBuf, presentedBuf)
        ) {
          verified = true;
        } else {
          console.warn(`[webhook] Signature mismatch: expected=${expected.slice(0, 12)}... presented=${sigHeader.slice(0, 12)}...`);
        }
      } catch (err) {
        console.error('[webhook] HMAC verification error:', err.message);
      }
    } else if (!secret) {
      console.warn('[webhook] No secret found, accepting in dev mode.');
      verified = true;
    }

    if (!verified) {
      console.warn('[webhook] ❌ Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    let payload;
    try { payload = JSON.parse(rawBody.toString()); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }

    const recorded = {
      event: payload.event,
      paymentId: payload.paymentId,
      orderId: payload.orderId,
      status: payload.status,
      utr: payload.utr || payload.bankReferenceNumber || null,
      amount: payload.amount || null,
      signature: sigHeader,
      verified: true,
      timestamp: new Date().toISOString()
    };

    verifiedWebhooks.unshift(recorded);
    if (verifiedWebhooks.length > 50) verifiedWebhooks.pop();

    console.log(`[webhook] ✅ VERIFIED: event=${recorded.event} orderId=${recorded.orderId} utr=${recorded.utr} status=${recorded.status}`);
    res.status(200).json({ received: true, event: payload.event });
  }
);

// ── JSON Body Parser for all REST APIs ────────────────────────────────────────
app.use(express.json());

// ── 2. VPA Configuration API ──────────────────────────────────────────────────
// GET /api/vpa — read active VPA & merchant details
app.get('/api/vpa', (req, res) => {
  try {
    const db = getDb();
    const activeAccount = db.prepare(`
      SELECT id, upi_id, payee_name, is_active, is_slot_busy, updated_at 
      FROM payment_receiving_accounts 
      WHERE is_active = 1 
      LIMIT 1
    `).get();

    const merchant = db.prepare(`
      SELECT id, business_name, contact_email, contact_phone 
      FROM merchants 
      WHERE id = ?
    `).get(DEFAULT_MID);

    res.json({
      success: true,
      upiId: activeAccount?.upi_id || 'merchant@upi',
      payeeName: activeAccount?.payee_name || merchant?.business_name || 'YOUPI Demo Store',
      merchantId: DEFAULT_MID,
      isSlotBusy: Boolean(activeAccount?.is_slot_busy),
      updatedAt: activeAccount?.updated_at || null
    });
  } catch (err) {
    console.error('[get-vpa] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vpa — update receiving UPI VPA & Merchant Name
app.post('/api/vpa', (req, res) => {
  const { upiId, payeeName } = req.body;
  if (!upiId || typeof upiId !== 'string') {
    return res.status(400).json({ error: 'Valid upiId is required (e.g. yourname@okaxis)' });
  }

  const cleanUpi = upiId.trim();
  const cleanName = (payeeName || 'Store Merchant').trim();

  // Basic UPI VPA format check: name@handle
  if (!/^[\w.\-_]{2,64}@[\w.\-_]{2,32}$/.test(cleanUpi)) {
    return res.status(400).json({
      error: 'Invalid UPI VPA format. Must be like username@bank or mobile@upi (e.g. 9876543210@paytm, name@okaxis)'
    });
  }

  try {
    const db = getDb();
    const now = new Date().toISOString();

    // 1. Update active receiving account
    const existing = db.prepare('SELECT id FROM payment_receiving_accounts WHERE is_active = 1 LIMIT 1').get();
    if (existing) {
      db.prepare(`
        UPDATE payment_receiving_accounts 
        SET upi_id = ?, payee_name = ?, updated_at = ?
        WHERE id = ?
      `).run(cleanUpi, cleanName, now, existing.id);
    } else {
      const newId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO payment_receiving_accounts 
        (id, merchant_id, upi_id, payee_name, is_merchant_enabled, is_active, is_slot_busy, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, 1, 0, ?, ?)
      `).run(newId, DEFAULT_MID, cleanUpi, cleanName, now, now);
    }

    // 2. Also sync merchant business_name
    db.prepare(`
      UPDATE merchants 
      SET business_name = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanName, now, DEFAULT_MID);

    console.log(`[vpa-updated] ✅ Active UPI ID is now: ${cleanUpi} (Payee: ${cleanName})`);

    res.json({
      success: true,
      upiId: cleanUpi,
      payeeName: cleanName,
      message: `Receiving UPI VPA updated to ${cleanUpi}. Checkout QR codes will now route payments directly to this account.`
    });
  } catch (err) {
    console.error('[update-vpa] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 3. Create Payment Session API ─────────────────────────────────────────────
// POST /api/create-payment
app.post('/api/create-payment', async (req, res) => {
  const { amount, orderId, customer, currency = 'INR', method = 'UPI' } = req.body;

  if (!amount || !orderId) {
    return res.status(400).json({ error: 'amount and orderId are required' });
  }

  const adminToken = getAdminToken();
  const headers = {
    'x-merchant-id':   DEFAULT_MID,
    'idempotency-key': orderId,
    'Authorization':   `Bearer ${adminToken}`
  };

  try {
    const result = await httpRequest(
      `${API_URL}/api/v1/payments`,
      'POST',
      headers,
      {
        orderId,
        amount:      Number(amount).toFixed(2),
        currency,
        method,
        autoActivate: true, // immediately makes session ACTIVE with timer & slot
        description: `Test Order ${orderId}`,
        customer:    customer || undefined,
        returnUrl:   `http://localhost:${PORT}/payment-result`,
        webhookUrl:  `http://localhost:${PORT}/api/youpi-webhook`,
        metadata:    { source: 'youpi-test-store', ts: Date.now() }
      }
    );

    if (result.status >= 200 && result.status < 300) {
      console.log(`[create-payment] ✅ Created session: ${result.body.paymentId} for ₹${amount} (order: ${orderId})`);
      activeSessionCache = {
        paymentId:   result.body.paymentId,
        orderId:     result.body.orderId,
        amount:      Number(amount).toFixed(2),
        checkoutUrl: result.body.checkoutUrl,
        createdAt:   Date.now()
      };
      return res.json({
        paymentId:   result.body.paymentId,
        checkoutUrl: result.body.checkoutUrl,
        orderId:     result.body.orderId,
        amount:      Number(amount).toFixed(2)
      });
    } else {
      console.error('[create-payment] ❌ Gateway returned:', result.status, result.body);
      return res.status(result.status).json({ error: result.body?.error || 'Gateway error', detail: result.body });
    }
  } catch (err) {
    console.error('[create-payment] ❌ Network error:', err.message);
    return res.status(503).json({ error: 'Could not connect to YouPI-PG API: ' + err.message });
  }
});

// ── 4. Helper: Dispatch Signed Android Observer Event ─────────────────────────
async function dispatchObserverEvent({ amount, utr, senderVpa, notificationText }) {
  const driverModule = await import(path.join(YOUPI_DIR, 'apps/android-observer-app/driver.js'));
  const driver = new driverModule.AndroidObserverDriver({ apiBaseUrl: API_URL });

  // 1. Pair simulated device
  await driver.pair(ENROLL_SECRET);

  // 2. Submit signed observation
  const obsResult = await driver.submitObservation({
    amount: Number(amount).toFixed(2),
    utr,
    senderVpa: senderVpa || 'customer@okaxis',
    notificationText: notificationText || `Payment of Rs ${Number(amount).toFixed(2)} received from ${senderVpa || 'customer@okaxis'} on PhonePe. UTR: ${utr}`
  });

  return obsResult;
}

// ── 5. MODE A: Simulated Payment Credit API ───────────────────────────────────
// POST /api/simulate-payment
app.post('/api/simulate-payment', async (req, res) => {
  const { paymentId, orderId, amount, utr } = req.body;
  const targetPaymentId = paymentId || activeSessionCache?.paymentId;
  const targetAmount    = amount    || activeSessionCache?.amount || '10.00';
  const targetOrderId   = orderId   || activeSessionCache?.orderId || `ORD-${Date.now()}`;

  // Generate 12-digit numeric UTR if none provided
  const generatedUtr = utr || String(Math.floor(100000000000 + Math.random() * 900000000000));

  console.log(`[simulate-payment] ▶ Triggering simulation for ${targetPaymentId || targetOrderId} (₹${targetAmount}, UTR: ${generatedUtr})`);

  try {
    // 1. Submit signed event via Android Observer Driver
    const observerResult = await dispatchObserverEvent({
      amount: targetAmount,
      utr: generatedUtr,
      senderVpa: 'simulated.bank@okaxis',
      notificationText: `Payment of Rs ${targetAmount} received from simulated.bank@okaxis on PhonePe. UTR: ${generatedUtr}`
    });

    console.log(`[simulate-payment] Observer ingest result HTTP ${observerResult.status}:`, observerResult.body?.pipeline?.status || observerResult.body);

    // 2. Also invoke /api/v1/checkout/:id/simulate-observation as direct observer fallback
    if (targetPaymentId) {
      const adminToken = getAdminToken();
      httpRequest(
        `${API_URL}/api/v1/checkout/${targetPaymentId}/simulate-observation`,
        'POST',
        { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        {
          source: 'SMS',
          sender: 'VK-HDFCBK',
          message: `Your a/c no. XX1234 is credited with Rs ${targetAmount} on ${new Date().toLocaleDateString('en-GB')} by UPI/${generatedUtr}/Simulated.`
        }
      ).catch(() => {});
    }

    res.json({
      success: true,
      utr: generatedUtr,
      amount: targetAmount,
      orderId: targetOrderId,
      paymentId: targetPaymentId,
      message: `Simulated bank credit of ₹${targetAmount} with UTR ${generatedUtr} successfully dispatched!`,
      observerResult: observerResult.body
    });
  } catch (err) {
    console.error('[simulate-payment] ❌ Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 6. MODE B: Real UPI Manual UTR Submission API ────────────────────────────
// POST /api/submit-real-utr
app.post('/api/submit-real-utr', async (req, res) => {
  const { paymentId, orderId, amount, utr } = req.body;
  const targetPaymentId = paymentId || activeSessionCache?.paymentId;
  const targetAmount    = amount    || activeSessionCache?.amount;
  const targetUtr       = (utr || '').trim();

  if (!targetUtr || !/^\d{12}$/.test(targetUtr)) {
    return res.status(400).json({
      error: 'Please enter a valid 12-digit numeric UPI Transaction Reference (UTR / RRN) from your payment app receipt.'
    });
  }

  console.log(`[real-utr] ▶ Processing Real UTR: ${targetUtr} for session: ${targetPaymentId} (₹${targetAmount})`);

  try {
    // 1. Dispatch signed observation to Attribution Pipeline
    const observerResult = await dispatchObserverEvent({
      amount: targetAmount || '1.00',
      utr: targetUtr,
      senderVpa: 'payer@bank',
      notificationText: `Payment of Rs ${targetAmount || '1.00'} received via UPI. UTR: ${targetUtr}`
    });

    // 2. Also register manual claim on checkout portal if session is known
    let manualUtrResult = null;
    if (targetPaymentId) {
      manualUtrResult = await httpRequest(
        `${API_URL}/api/v1/checkout/${targetPaymentId}/manual-utr`,
        'POST',
        { 'Content-Type': 'application/json' },
        { utr: targetUtr }
      ).catch(e => ({ status: 500, error: e.message }));
    }

    console.log(`[real-utr] ✅ Real UTR ${targetUtr} submitted successfully.`);

    res.json({
      success: true,
      utr: targetUtr,
      paymentId: targetPaymentId,
      message: `UTR ${targetUtr} submitted to verification pipeline! The gateway is matching it against your receiving account.`,
      observerResult: observerResult.body,
      manualUtrResult: manualUtrResult?.body
    });
  } catch (err) {
    console.error('[real-utr] ❌ Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 7. Telemetry & Webhook Query APIs ─────────────────────────────────────────
app.get('/api/webhooks', (req, res) => {
  res.json({ webhooks: verifiedWebhooks });
});

app.get('/api/active-session', (req, res) => {
  res.json({ activeSession: activeSessionCache });
});

app.get('/api/status', (req, res) => {
  res.json({
    store: 'youpi-test-store',
    port: PORT,
    hasAdmin: Boolean(getAdminToken()),
    hasWebhookSecret: Boolean(getWebhookSecret()),
    activeSession: activeSessionCache
  });
});

app.get('/payment-result', (req, res) => {
  const { status, paymentId, orderId } = req.query;
  res.send(`
<!DOCTYPE html><html><head><title>Payment Result</title>
<style>body{font-family:sans-serif;max-width:560px;margin:60px auto;text-align:center;background:#09090b;color:#f4f4f5}</style></head>
<body>
  <h1>${status === 'success' ? '✅ Payment Succeeded!' : '⏱ Payment: ' + (status || 'Processed')}</h1>
  <p><strong>Payment ID:</strong> ${paymentId || '-'}</p>
  <p><strong>Order ID:</strong> ${orderId || '-'}</p>
  <a href="/" style="color:#3b82f6">← Back to Storefront</a>
</body></html>`);
});

// ── 8. Background Android Observer Heartbeat Provider ────────────────────────
// Keeps gateway's smsHealthy status always true so UPI payments are permanently operational
async function maintainObserverHeartbeat() {
  try {
    const driverModule = await import(path.join(YOUPI_DIR, 'apps/android-observer-app/driver.js'));
    androidDriverInstance = new driverModule.AndroidObserverDriver({
      apiBaseUrl: API_URL,
      deviceName: 'Storefront Virtual Observer'
    });
    await androidDriverInstance.pair(ENROLL_SECRET);
    await androidDriverInstance.sendHeartbeat();
    androidDriverInstance.startHeartbeat(45000);
    console.log('[observer-heartbeat] ✅ Virtual Android Observer paired & heartbeat loop started.');
  } catch (err) {
    console.warn('[observer-heartbeat] Could not initialize virtual observer yet:', err.message);
  }
}

// Helper: sync merchant webhook URL in database
function syncMerchantWebhookUrl() {
  try {
    const db = getDb();
    const targetUrl = `http://localhost:${PORT}/api/youpi-webhook`;
    db.prepare('UPDATE merchants SET webhook_url = ? WHERE id = ?').run(targetUrl, DEFAULT_MID);
    console.log(`[db-sync] Merchant webhook URL set to: ${targetUrl}`);
  } catch (err) {
    console.warn('[db-sync] Could not sync merchant webhook URL:', err.message);
  }
}

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  syncMerchantWebhookUrl();
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║     YouPI-PG Dual-Mode Test Storefront Online                ║
╠══════════════════════════════════════════════════════════════╣
║  🛒 Storefront URL:    http://localhost:${PORT}                  ║
║  🔌 Payment API:       ${API_URL.padEnd(38)}║
║  💳 Checkout Portal:   http://localhost:7000                  ║
║  🛡  Merchant Admin:    http://localhost:6001                  ║
╠══════════════════════════════════════════════════════════════╣
║  Admin Token:          ${Boolean(getAdminToken()) ? 'AVAILABLE ✅' : 'MISSING ❌'}                            ║
║  Webhook Secret:       ${Boolean(getWebhookSecret()) ? 'CONFIGURED ✅' : 'NOT FOUND ⚠️'}                           ║
╚══════════════════════════════════════════════════════════════╝
  `);
  setTimeout(maintainObserverHeartbeat, 2000);
});
