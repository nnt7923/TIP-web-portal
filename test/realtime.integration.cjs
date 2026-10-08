// Never reads the application's .env or runs against a production database.
require('dotenv').config({ path: '.env.realtime-test.local', override: true, quiet: true });
require('reflect-metadata');
const assert = require('node:assert/strict');
require('@nestjs/common').Logger.overrideLogger(['error', 'warn']);
const { randomUUID, createHash } = require('node:crypto');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { JwtService } = require('@nestjs/jwt');
const { createBackendApp } = require('../dist/bootstrap');
const { PrismaService } = require('../dist/database/prisma.service');
const { RedisService } = require('../dist/redis/redis.service');
const { NotificationsService } = require('../dist/modules/notifications/notifications.service');
const { NotificationDeliveryService } = require('../dist/modules/notifications/notification-delivery.service');
const { NotificationTicketService } = require('../dist/modules/notifications/notification-ticket.service');
const { NotificationsGateway } = require('../dist/modules/notifications/notifications.gateway');
const { AuthService } = require('../dist/modules/auth/auth.service');
assert.equal(new URL(process.env.DATABASE_URL).hostname, 'ep-frosty-hill-b5o5lzl1.c-7.us-east-2.aws.neon.tech');
assert.equal(process.env.REDIS_KEY_PREFIX, 'realtime-test-20261007:');
process.env.NOTIFICATIONS_ALLOWED_ORIGINS = 'http://localhost:3001';
const origin = process.env.NOTIFICATIONS_ALLOWED_ORIGINS;
const delay = ms => new Promise(r => setTimeout(r, ms));
const marker = `realtime-${randomUUID()}`;
let appA, appB, prisma, redis, baseA, baseB;
const accounts = [], sessions = [], sockets = [];
let checks = 0;
const check = (a, b) => { assert.deepEqual(a, b); checks++; };
async function until(fn, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await fn()) return; await delay(30); }
  throw Error('Condition timed out');
}
async function identity(suffix, ttl = 3600) {
  const row = await prisma.account.create({ data: { username: marker + suffix, email: marker + suffix + '@example.invalid', fullName: 'Realtime test', passwordHash: 'unused', emailVerifiedAt: new Date() } });
  accounts.push(row.id);
  const sid = randomUUID(), jti = randomUUID(); sessions.push(sid);
  await redis.hset(`auth:session:${sid}`, 'accountId', row.id, 'refreshJti', randomUUID());
  await redis.expire(`auth:session:${sid}`, 3600);
  const token = await new JwtService().signAsync({ sub: row.id, sid, jti, tokenType: 'access' }, { secret: process.env.JWT_SECRET, expiresIn: ttl });
  return { ...row, token, sid };
}
async function api(base, user, path, method = 'GET') {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${user.token}` }, signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}
async function ticket(user) {
  const response = await api(baseA, user, '/notifications/socket-ticket', 'POST');
  check(response.status, 200); return response.body.ticket;
}
async function socket(ticketValue, base = baseB, allowedOrigin = origin) {
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/notifications/ws', { origin: allowedOrigin });
  const messages = []; ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
  ws.on('error', () => {}); sockets.push(ws);
  await once(ws, 'open');
  if (ticketValue) ws.send(JSON.stringify({ type: 'authenticate', ticket: ticketValue }));
  return { ws, messages };
}
async function main() {
  appA = await createBackendApp(); appB = await createBackendApp();
  await appA.listen(0, '127.0.0.1'); await appB.listen(0, '127.0.0.1');
  baseA = await appA.getUrl(); baseB = await appB.getUrl();
  prisma = appA.get(PrismaService); redis = appA.get(RedisService).connection;
  await until(() => appB.get(NotificationsGateway).healthy);
  const actor = await identity('-actor'), alice = await identity('-alice'), bob = await identity('-bob');
  const service = appA.get(NotificationsService);
  const event = (eventId = randomUUID()) => ({ eventId, actorId: actor.id, type: 'TEST', title: 'Notification test', body: 'Fixture', entityType: 'AccountProfile', entityId: alice.id, recipients: [{ id: alice.id }, { id: alice.id }, { id: actor.id }] });
  const aliceTicket = await ticket(alice);
  const stored = await redis.get(`${appA.get(NotificationDeliveryService).prefix}:ticket:${createHash('sha256').update(aliceTicket).digest('hex')}`);
  check(JSON.parse(stored).sub, alice.id);
  const a = await socket(aliceTicket), b = await socket(await ticket(bob));
  await until(() => a.messages.length && b.messages.length);
  check(a.messages[0], { type: 'notifications.ready' });
  check(await redis.get(`${appA.get(NotificationDeliveryService).prefix}:ticket:${createHash('sha256').update(aliceTicket).digest('hex')}`), null);
  const replay = await socket(aliceTicket); check((await once(replay.ws, 'close'))[0], 4401);
  const forged = await socket('x'.repeat(43)); check((await once(forged.ws, 'close'))[0], 4401);
  const expiredTicket = await ticket(bob);
  const expiredKey = `${appA.get(NotificationDeliveryService).prefix}:ticket:${createHash('sha256').update(expiredTicket).digest('hex')}`;
  assert.ok(await redis.ttl(expiredKey) <= 60); checks++;
  await redis.pexpire(expiredKey, 1); await delay(10);
  const expiredSocket = await socket(expiredTicket); check((await once(expiredSocket.ws, 'close'))[0], 4401);
  await assert.rejects(socket(await ticket(alice), baseB, 'https://attacker.invalid')); checks++;
  const noAuth = await socket(); check((await once(noAuth.ws, 'close'))[0], 4401);

  const stable = event();
  await service.transaction(async tx => {
    await service.emit(tx, stable);
    await delay(100); check(a.messages.length, 1);
  });
  await until(() => a.messages.length === 2);
  check(a.messages[1].type, 'notifications.changed');
  check(a.messages[1].reason, 'created');
  check(Object.keys(a.messages[1]).sort(), ['emittedAt', 'eventId', 'reason', 'type']);
  check(b.messages.length, 1);
  await service.transaction(tx => service.emit(tx, stable));
  await delay(150); check(a.messages.length, 2);
  const failed = event();
  await assert.rejects(service.transaction(async tx => { await service.emit(tx, failed); throw Error('rollback'); }));
  check(await prisma.notification.count({ where: { eventId: failed.eventId } }), 0);
  await delay(150); check(a.messages.length, 2);
  const concurrent = event();
  await Promise.all([service.transaction(tx => service.emit(tx, concurrent)), service.transaction(tx => service.emit(tx, concurrent))]);
  await until(() => a.messages.length === 3);
  check(await prisma.notification.count({ where: { eventId: concurrent.eventId } }), 1);
  const first = await prisma.notification.findFirst({ where: { eventId: stable.eventId } });
  check((await api(baseA, bob, `/notifications/${first.id}/read`, 'PATCH')).status, 404);
  check((await api(baseA, alice, `/notifications/${first.id}/read`, 'PATCH')).status, 200);
  await until(() => a.messages.length === 4); check(a.messages[3].reason, 'read');
  await api(baseA, alice, `/notifications/${first.id}/read`, 'PATCH');
  await delay(150); check(a.messages.length, 4);
  await api(baseA, alice, '/notifications/read-all', 'PATCH');
  await until(() => a.messages.length === 5); check(a.messages[4].reason, 'read-all');

  // A crash after commit but before publish must leave REST reconciliation intact.
  await prisma.$transaction(tx => service.emit(tx, event()));
  check((await api(baseA, alice, '/notifications/unread-count')).body.count, 1);
  const delivery = appA.get(NotificationDeliveryService);
  const publish = redis.publish.bind(redis);
  redis.publish = async () => { throw Error('simulated Redis outage'); };
  await service.transaction(tx => service.emit(tx, event()));
  redis.publish = publish;
  check((await api(baseA, alice, '/notifications/unread-count')).body.count, 2);
  const revokedClose = once(a.ws, 'close');
  await redis.del(`auth:session:${alice.sid}`);
  await delivery.publish([alice.id], 'created');
  check((await revokedClose)[0], 4401);
  check((await api(baseA, alice, '/notifications/socket-ticket', 'POST')).status, 401);

  const onceTicket = await ticket(bob);
  const outcomes = await Promise.allSettled([appA.get(NotificationTicketService).consume(onceTicket), appB.get(NotificationTicketService).consume(onceTicket)]);
  check(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  const rateKey = randomUUID();
  await appA.get(NotificationTicketService).rateLimit('ticket', rateKey, 1);
  await assert.rejects(appA.get(NotificationTicketService).rateLimit('ticket', rateKey, 1), e => e.getStatus() === 429); checks++;
  const expires = await identity('-expires', 10), short = await socket(await ticket(expires));
  await until(() => short.messages.length); check((await once(short.ws, 'close'))[0], 4401);
  const oversized = await socket();
  oversized.ws.send('x'.repeat(2000)); check((await once(oversized.ws, 'close'))[0], 1009);
  const blocked = await identity('-blocked'), blockedSocket = await socket(await ticket(blocked));
  await until(() => blockedSocket.messages.length);
  await prisma.account.update({ where: { id: blocked.id }, data: { status: 'INACTIVE' } });
  const blockedClose = once(blockedSocket.ws, 'close');
  await delivery.publish([blocked.id], 'created');
  check((await blockedClose)[0], 4401);
  const logoutUser = await identity('-logout-all');
  await redis.sadd(`auth:user-sessions:${logoutUser.id}`, logoutUser.sid);
  await appA.get(AuthService).logoutAll(logoutUser.id);
  check(await redis.exists(`auth:session:${logoutUser.sid}`), 0);
  check(await redis.exists(`auth:user-sessions:${logoutUser.id}`), 0);
  const unavailable = once(b.ws, 'close');
  appB.get(NotificationsGateway).subscriber.disconnect();
  check((await unavailable)[0], 1013);
  console.log(`Realtime integration: ${checks} checks passed (two instances, real Postgres/Redis, authentication, isolation, commit/rollback, deduplication, reconnect prerequisites).`);
}
const deadline = setTimeout(() => { console.error('Test deadline exceeded', checks); process.exit(1); }, 120000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const ws of sockets) ws.terminate();
  if (prisma && accounts.length) {
    await prisma.notification.deleteMany({ where: { recipientAccountId: { in: accounts } } });
    await prisma.account.deleteMany({ where: { id: { in: accounts } } });
  }
  if (redis) for (const sid of sessions) await redis.del(`auth:session:${sid}`);
  await appA?.close(); await appB?.close(); clearTimeout(deadline);
});
