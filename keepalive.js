// Keeps a free-tier host (e.g. Render) awake by requesting the app's own public URL.
// The request goes out through the host's proxy, so it counts as inbound traffic.
//
// URL:      KEEP_ALIVE_URL, else RENDER_EXTERNAL_URL (set automatically by Render)
// Interval: KEEP_ALIVE_INTERVAL in minutes (default 10; Render sleeps after 15)
// Disable:  KEEP_ALIVE=false

const start = () => {
  const url = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL
  if (!url || process.env.KEEP_ALIVE === 'false') return null

  const minutes = parseFloat(process.env.KEEP_ALIVE_INTERVAL) || 10
  let failing = false

  const ping = async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      if (failing) console.log('Keep-alive ping OK again')
      failing = false
    } catch (err) {
      // Log only on the first failure in a row to avoid flooding the logs
      if (!failing) console.error('Keep-alive ping to ' + url + ' failed: ' + err.message)
      failing = true
    }
  }

  console.log('Keep-alive: pinging ' + url + ' every ' + minutes + ' min')
  const timer = setInterval(ping, minutes * 60 * 1000)
  timer.unref()
  return timer
}

exports.start = start
