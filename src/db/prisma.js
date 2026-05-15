/**
 * Prisma client singleton with Neon cold-start retry.
 *
 * Neon free tier pauses compute after inactivity. The first query after a
 * pause fails with P1001 while Neon wakes up (~3-5 seconds).
 *
 * We wrap the PrismaClient in a Proxy so every model method automatically
 * retries on connection errors — no changes needed in any route file.
 */
const { PrismaClient } = require('@prisma/client');

const RETRIES  = 3;
const DELAY_MS = 2500;

function isConnectionError(err) {
  return (
    err?.code === 'P1001' ||
    err?.message?.includes("Can't reach database") ||
    err?.message?.includes('connect_timeout') ||
    err?.message?.includes('Connection refused') ||
    err?.message?.includes('ECONNREFUSED') ||
    err?.message?.includes('ETIMEDOUT')
  );
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Wrap a single async function with retry logic. */
function withRetry(fn, label) {
  return async function (...args) {
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        return await fn.apply(this, args);
      } catch (err) {
        if (isConnectionError(err) && attempt < RETRIES) {
          console.warn(
            `[DB] ${label} — connection error (attempt ${attempt}/${RETRIES}). ` +
            `Neon may be waking up. Retrying in ${DELAY_MS}ms…`
          );
          await sleep(DELAY_MS);
          continue;
        }
        throw err;
      }
    }
  };
}

/**
 * Wrap a PrismaClient so every model delegate method retries on connection
 * errors. Works with Prisma 6 CommonJS without using $extends.
 */
function makeRetryClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  return new Proxy(client, {
    get(target, prop) {
      const value = target[prop];

      // Pass through non-model properties ($connect, $disconnect, $transaction, etc.)
      if (typeof value !== 'object' || value === null || prop.startsWith('$') || prop === 'then') {
        return typeof value === 'function' ? value.bind(target) : value;
      }

      // Wrap model delegates (user, project, update, etc.)
      return new Proxy(value, {
        get(modelTarget, method) {
          const fn = modelTarget[method];
          if (typeof fn !== 'function') return fn;
          return withRetry(fn.bind(modelTarget), `${String(prop)}.${String(method)}`);
        },
      });
    },
  });
}

const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? makeRetryClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

module.exports = prisma;
