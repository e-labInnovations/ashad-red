/**
 * Keep a Render free-tier Node-RED service awake.
 *
 * Render puts free web services to sleep after 15 minutes without traffic.
 * This Google Apps Script requests the app every 10 minutes so it stays up.
 *
 * Setup:
 *   1. Go to https://script.google.com and create a new project.
 *   2. Paste this file in, replacing the default code.
 *   3. Open Project Settings (gear icon) > Script properties > Add script property:
 *        Property: APP_URL
 *        Value:    https://your-app.onrender.com/
 *   4. Back in the editor, select "setupTrigger" in the function dropdown and click Run.
 *      Approve the permission prompt the first time.
 *
 * Check Executions in the left sidebar to see each ping.
 * To change the URL later, edit the APP_URL script property; no code change needed.
 */

function getAppUrl() {
  const url = PropertiesService.getScriptProperties().getProperty('APP_URL');
  if (!url) {
    throw new Error('Script property APP_URL is not set. Add it in Project Settings > Script properties.');
  }
  return url.trim();
}

function keepAlive() {
  const url = getAppUrl();
  try {
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true
    });
    const code = res.getResponseCode();
    if (code >= 400) {
      console.warn('Ping ' + url + ' returned HTTP ' + code);
    } else {
      console.log('Ping ' + url + ' OK (HTTP ' + code + ')');
    }
  } catch (err) {
    // Network error or timeout, e.g. while the service is waking up
    console.error('Ping ' + url + ' failed: ' + err.message);
  }
}

// Creates the 10-minute trigger. Safe to run again: replaces any existing one.
function setupTrigger() {
  getAppUrl(); // fail early if APP_URL is missing
  removeTrigger();
  ScriptApp.newTrigger('keepAlive').timeBased().everyMinutes(10).create();
  keepAlive();
}

// Stops the pings.
function removeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'keepAlive'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}
