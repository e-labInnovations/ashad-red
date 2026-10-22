// Slows down password guessing on the editor login (POST <httpAdminRoot>/auth/token).
//
// - Every failed login waits LOGIN_FAIL_DELAY ms before the reply.
// - An IP with LOGIN_MAX_FAILS failures in LOGIN_LOCK_MINUTES is blocked for LOGIN_LOCK_MINUTES.
// - If all IPs together fail LOGIN_MAX_TOTAL_FAILS times in that window, every login is
//   blocked until it passes. This stops guessing spread over many IPs, at the cost of
//   locking you out of the editor for a while during an attack. Flows keep running.
//
// Disable: LOGIN_GUARD=false

const crypto = require('crypto')

const num = (name, def) => parseFloat(process.env[name]) || def
const MAX_FAILS = num('LOGIN_MAX_FAILS', 5)
const MAX_TOTAL_FAILS = num('LOGIN_MAX_TOTAL_FAILS', 50)
const LOCK_MS = num('LOGIN_LOCK_MINUTES', 15) * 60 * 1000
const FAIL_DELAY_MS = num('LOGIN_FAIL_DELAY', 1000)

const fails = new Map() // ip -> timestamps of recent failures
let allFails = []        // timestamps of recent failures from any IP

const recent = (times, now) => times.filter(t => now - t < LOCK_MS)

// Render and most hosts put the real client address first in X-Forwarded-For
const clientIp = req => {
  const fwd = req.headers['x-forwarded-for']
  return ((fwd ? fwd.split(',')[0] : req.socket.remoteAddress) || '').trim()
}

const retryAfter = (times, now) => Math.ceil((times[0] + LOCK_MS - now) / 1000)

const middleware = (req, res, next) => {
  if (req.method !== 'POST' || req.path !== '/auth/token') return next()

  const now = Date.now()
  const ip = clientIp(req)
  const ipFails = recent(fails.get(ip) || [], now)
  allFails = recent(allFails, now)

  const blocked = ipFails.length >= MAX_FAILS ? ipFails
    : allFails.length >= MAX_TOTAL_FAILS ? allFails : null
  if (blocked) {
    res.set('Retry-After', String(retryAfter(blocked, now)))
    return res.status(429).json({ error: 'too_many_attempts', message: 'Too many failed logins. Try again later.' })
  }

  // Look at the reply: a 4xx means the username or password was wrong.
  // Hook res.end, since the OAuth token handler writes its reply with it directly.
  const end = res.end
  res.end = function (...args) {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      ipFails.push(now)
      fails.set(ip, ipFails)
      allFails.push(now)
      if (ipFails.length === MAX_FAILS) console.warn('Login guard: blocking ' + ip + ' after ' + MAX_FAILS + ' failed logins')
      if (allFails.length === MAX_TOTAL_FAILS) console.warn('Login guard: blocking all logins after ' + MAX_TOTAL_FAILS + ' failed logins')
      setTimeout(() => end.apply(res, args), FAIL_DELAY_MS)
      return res
    }
    if (res.statusCode < 300) fails.delete(ip)
    return end.apply(res, args)
  }

  // Drop IPs whose failures have all expired, so the map doesn't grow forever
  if (fails.size > 1000) {
    for (const [k, v] of fails) if (!recent(v, now).length) fails.delete(k)
  }
  next()
}

// Compares two strings in constant time, so response timing doesn't leak the password
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

module.exports = {
  middleware: process.env.LOGIN_GUARD === 'false' ? null : middleware,
  safeEqual
}
