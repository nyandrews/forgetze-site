// Private numbers for forgetze.com/dashboard.html. The page sends the password,
// this checks it and asks PostHog for the counts, so the PostHog key never
// reaches the browser. Needs two Vercel settings (Environment Variables):
//   DASHBOARD_PASSWORD    the password Mark types on the page
//   POSTHOG_PERSONAL_KEY  a PostHog personal API key with "Query: Read" only
// Until both are there, the page says "Not set up yet".
const crypto = require('crypto');

const PROJECT = 694584;
const QUERY_URL = `https://us.posthog.com/api/projects/${PROJECT}/query/`;
const TZ = 'America/New_York';
// The app's own counts. The test copy of the app (Dev Forgetze) is left out.
const APP = "ifNull(properties.$app_namespace, '') NOT LIKE '%.dev%'";
const OPEN = `event = 'Application Opened' AND ${APP}`;
const SITE = "event = '$pageview' AND properties.$host LIKE '%forgetze.com'";
const days = (n) => `timestamp > now() - INTERVAL ${n} DAY`;

const QUERIES = {
  headline: `SELECT
      uniqIf(distinct_id, ${OPEN} AND ${days(7)}),
      uniqIf(distinct_id, ${OPEN} AND ${days(30)}),
      countIf(${OPEN} AND ${days(7)}),
      countIf(${SITE} AND ${days(7)}),
      countIf(event = 'purchase_completed' AND ${APP})
    FROM events WHERE ${days(30)}`,
  newThisWeek: `SELECT count() FROM (SELECT distinct_id, min(timestamp) AS first FROM events WHERE ${OPEN} GROUP BY distinct_id) WHERE first > now() - INTERVAL 7 DAY`,
  dailyUsers: `SELECT toDate(toTimeZone(timestamp, '${TZ}')) AS day, uniq(distinct_id) FROM events WHERE ${OPEN} AND ${days(30)} GROUP BY day ORDER BY day`,
  hours: `SELECT toHour(toTimeZone(timestamp, '${TZ}')) AS h, count() FROM events WHERE ${OPEN} AND ${days(30)} GROUP BY h ORDER BY h`,
  weekdays: `SELECT toDayOfWeek(toTimeZone(timestamp, '${TZ}')) AS d, count() FROM events WHERE ${OPEN} AND ${days(30)} GROUP BY d ORDER BY d`,
  features: `SELECT event, uniq(distinct_id) AS people FROM events WHERE event IN ('contact_added', 'contacts_imported', 'search_used', 'paywall_viewed', 'purchase_completed') AND ${APP} AND ${days(30)} GROUP BY event ORDER BY people DESC`,
  versions: `SELECT properties.$app_version AS v, uniq(distinct_id) AS people FROM events WHERE ${OPEN} AND ${days(30)} GROUP BY v ORDER BY v DESC LIMIT 6`,
  comingBack: `WITH firsts AS (
      SELECT distinct_id, toStartOfWeek(min(timestamp)) AS cohort FROM events WHERE ${OPEN} GROUP BY distinct_id
    ), weeks AS (
      SELECT DISTINCT distinct_id, toStartOfWeek(timestamp) AS wk FROM events WHERE ${OPEN}
    )
    SELECT f.cohort, dateDiff('week', f.cohort, w.wk) AS n, uniq(f.distinct_id)
    FROM firsts AS f JOIN weeks AS w ON f.distinct_id = w.distinct_id
    WHERE f.cohort > now() - INTERVAL 8 WEEK
    GROUP BY f.cohort, n ORDER BY f.cohort, n`,
  siteDaily: `SELECT toDate(toTimeZone(timestamp, '${TZ}')) AS day, count() FROM events WHERE ${SITE} AND ${days(30)} GROUP BY day ORDER BY day`,
  pages: `SELECT properties.$pathname AS p, count() AS visits FROM events WHERE ${SITE} AND ${days(30)} GROUP BY p ORDER BY visits DESC LIMIT 8`,
  referrers: `SELECT properties.$referring_domain AS r, count() AS visits FROM events WHERE ${SITE} AND ${days(30)} GROUP BY r ORDER BY visits DESC LIMIT 8`,
};

function samePassword(given, expected) {
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

async function runQuery(key, sql) {
  const r = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql } }),
  });
  if (!r.ok) throw new Error(`PostHog answered ${r.status}`);
  return (await r.json()).results;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  const { DASHBOARD_PASSWORD, POSTHOG_PERSONAL_KEY } = process.env;
  const ready = Boolean(DASHBOARD_PASSWORD && POSTHOG_PERSONAL_KEY);
  // The page asks this first, so it can say "Not set up yet" before anyone types a password.
  if (req.method === 'GET') return res.status(200).json({ ready });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!ready) {
    return res.status(503).json({ notSetUp: true, error: 'Not set up yet. The password or PostHog key is missing in Vercel.' });
  }
  const given = (req.body && req.body.password) || '';
  if (!samePassword(given, DASHBOARD_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 800)); // slows down guessing
    return res.status(401).json({ error: 'That password is not right.' });
  }
  try {
    const names = Object.keys(QUERIES);
    const results = await Promise.all(names.map((n) => runQuery(POSTHOG_PERSONAL_KEY, QUERIES[n])));
    const data = Object.fromEntries(names.map((n, i) => [n, results[i]]));
    return res.status(200).json({ updated: new Date().toISOString(), data });
  } catch (e) {
    return res.status(502).json({ error: `Could not reach PostHog. ${e.message}` });
  }
};

module.exports.QUERIES = QUERIES;
