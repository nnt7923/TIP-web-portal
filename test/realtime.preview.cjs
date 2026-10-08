// Explicit isolated fixture files only. Never uses production accounts or the app .env.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('../../TIP-web-portal_FE/node_modules/@playwright/test');
const dotenv = require('dotenv');
const access = dotenv.parse(fs.readFileSync('.env.preview-tools.local'));
const fixtures = JSON.parse(fs.readFileSync('.env.preview-fixtures.local'));
const backend = 'https://tip-web-portal-api-realtime.vercel.app';
const frontend = 'https://tip-web-portal-fe-realtime.vercel.app';
let browser;
const delay = ms => new Promise(r => setTimeout(r, ms));
async function run() {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 950 } });
  for (const [base, token] of [[backend, access.BE_BYPASS], [frontend, access.FE_BYPASS]]) {
    const response = await context.request.get(base + (base === backend ? '/health' : '/login'), {
      headers: { 'x-vercel-protection-bypass': token, 'x-vercel-set-bypass-cookie': 'samesitenone' },
    });
    assert.equal(response.status(), 200, 'Protected preview accessible to test context');
  }
  async function api(path, body, token, method = 'POST') {
    const response = await context.request.fetch(backend + path, {
      method, headers: { 'x-vercel-protection-bypass': access.BE_BYPASS, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { data: body } : {}), timeout: 15000,
    });
    assert.ok(response.ok(), `Fixture API ${path}: ${response.status()}`);
    return response.json();
  }
  const person = await api('/auth/login', { username: fixtures.person.username, password: fixtures.password });
  const admin = await api('/auth/login', { username: fixtures.admin.username, password: fixtures.password });
  await api('/notifications/read-all', undefined, admin.accessToken, 'PATCH');
  const mine = await api('/student-enrollments/me', undefined, person.accessToken, 'GET');
  const pending = (Array.isArray(mine) ? mine : mine.data ?? []).filter(row => row.status === 'PENDING');
  for (const row of pending) await api(`/student-enrollments/${row.id}/cancel`, undefined, person.accessToken, 'PATCH');
  const page = await context.newPage();
  // Disconnected fallback is 30 seconds; allow its REST round trip as well.
  page.setDefaultTimeout(45000);
  const errors = [], frames = [], sockets = [], lifecycle = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', ws => {
    sockets.push(ws);
    lifecycle.push({ event: 'open', at: Date.now() });
    ws.on('close', () => lifecycle.push({ event: 'close', at: Date.now() }));
    ws.on('framereceived', event => {
      try { frames.push(JSON.parse(String(event.payload))); } catch {}
    });
  });
  await page.goto(frontend + '/login?next=%2Faccount%2Fnotifications');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(fixtures.admin.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(fixtures.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/account/notifications');
  await page.getByRole('button', { name: 'Thông báo, 0 chưa đọc', exact: true }).waitFor();
  for (let i = 0; i < 100 && !frames.some(f => f.type === 'notifications.ready'); i++) await delay(100);
  assert.ok(frames.some(f => f.type === 'notifications.ready'), 'Actual Vercel WebSocket authenticated');
  console.log('Preview browser logged in and WebSocket authenticated.');
  // Let ready-triggered reconciliation finish before measuring a new event.
  await delay(5000);
  const latencies = [], recoveries = [];
  for (let i = 1; latencies.length < 20 && i <= 30; i++) {
    const before = frames.length;
    const lifecycleBefore = lifecycle.length;
    const wasClosed = sockets.at(-1).isClosed();
    const startedAt = Date.now();
    const enrollment = await api('/student-enrollments', {
      universityId: fixtures.universityId, majorId: fixtures.majorId,
      studentCode: `RT${Date.now()}`, className: 'Realtime fixture', semester: 1,
    }, person.accessToken);
    await page.getByRole('button', { name: `Thông báo, ${i} chưa đọc`, exact: true }).waitFor();
    const visibleAt = Date.now();
    for (let j = 0; j < 100 && !frames.slice(before).some(f => f.type === 'notifications.changed' && f.reason === 'created'); j++) await delay(100);
    const frame = frames.slice(before).find(f => f.type === 'notifications.changed' && f.reason === 'created');
    if (frame) {
      latencies.push(visibleAt - Date.parse(frame.emittedAt));
      console.log(`Preview event ${i}: ${latencies.at(-1)}ms from post-commit publication to visible badge`);
    } else {
      assert.ok(wasClosed || lifecycle.slice(lifecycleBefore).some(event => event.event === 'close'), 'Healthy connection must deliver a WebSocket signal');
      recoveries.push({ event: i, requestToVisibleMs: visibleAt - startedAt });
      console.log(`Preview event ${i}: reconciled after Function connection closed (${visibleAt - startedAt}ms including business request)`);
    }
    await api(`/student-enrollments/${enrollment.id}/review`, { decision: 'REJECTED', reason: 'Automated isolated fixture' }, admin.accessToken, 'PATCH');
  }
  assert.equal(latencies.length, 20, 'Collect 20 healthy connection samples');
  if (process.env.VERIFY_FUNCTION_LIFETIME === 'true') {
    const oldSocket = sockets.at(-1), deadline = Date.now() + 360000;
    let announcedAt = 0;
    while (!oldSocket.isClosed() && Date.now() < deadline) {
      if (Date.now() - announcedAt > 30000) { console.log('Waiting for actual Vercel Function lifetime closure...'); announcedAt = Date.now(); }
      await delay(1000);
    }
    assert.ok(oldSocket.isClosed(), 'Function eventually closes its WebSocket');
    for (let j = 0; j < 450 && (sockets.at(-1) === oldSocket || sockets.at(-1).isClosed()); j++) await delay(100);
    await delay(5000); // Ticket authentication and ready reconciliation.
    const before = frames.length;
    const enrollment = await api('/student-enrollments', {
      universityId: fixtures.universityId, majorId: fixtures.majorId,
      studentCode: `RT${Date.now()}`, className: 'Lifetime fixture', semester: 1,
    }, person.accessToken);
    await page.getByRole('button', { name: `Thông báo, ${latencies.length + recoveries.length + 1} chưa đọc`, exact: true }).waitFor();
    assert.ok(frames.slice(before).some(f => f.type === 'notifications.changed'), 'New socket delivers after actual Function timeout');
    await api(`/student-enrollments/${enrollment.id}/review`, { decision: 'REJECTED', reason: 'Automated isolated fixture' }, admin.accessToken, 'PATCH');
    console.log('Actual Vercel Function timeout, reconnect and subsequent event delivery passed.');
  }
  assert.deepEqual(errors, []);
  const cookies = await context.cookies(frontend);
  for (const name of ['tip_access_token', 'tip_refresh_token']) {
    const cookie = cookies.find(c => c.name === name); assert.ok(cookie?.httpOnly && cookie?.secure);
  }
  await page.screenshot({ path: 'tmp/realtime-preview-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tmp/realtime-preview-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.getByRole('button', { name: 'Đọc tất cả', exact: true }).click();
  await page.getByRole('button', { name: 'Thông báo, 0 chưa đọc', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.waitForURL('**/login');
  const sorted = [...latencies].sort((a, b) => a - b);
  const result = { samples: latencies.length, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1), connections: sockets.length, reconnects: Math.max(0, sockets.length - 1), latencies, recoveries, lifecycle };
  fs.writeFileSync('tmp/realtime-preview-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  assert.ok(result.p95Ms <= 2000, 'Healthy post-commit-to-UI p95 must be <= 2 seconds');
}
fs.mkdirSync('tmp', { recursive: true });
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => browser?.close());
