// Sends the website's contact form to hello@forgetze.com through the
// Purelymail mailbox. Needs one Vercel setting (Environment Variables):
//   CONTACT_SMTP_PASSWORD  the password of the markandrews@forgetze.com mailbox
// Optional: CONTACT_SMTP_USER (defaults to markandrews@forgetze.com).
const nodemailer = require('nodemailer');

const TO = 'hello@forgetze.com';
const KINDS = { suggestion: 'Suggestion', question: 'Question', problem: 'Problem' };

const clean = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);

// Spam limits. A person takes longer than a few seconds to fill in the form, and sends a
// handful of messages at most. The counts live in this function's memory, so they reset when
// Vercel starts a fresh copy. That is enough to stop a bot sending hundreds in a row.
const MIN_FILL_MS = 3000;
const LIMIT = 3;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_LINKS = 3;
const recent = new Map();

function tooMany(ip, now) {
  const times = (recent.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) {
    recent.set(ip, times);
    return true;
  }
  times.push(now);
  recent.set(ip, times);
  if (recent.size > 1000) recent.delete(recent.keys().next().value);
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};

  // Hidden field that people never see. Bots fill it in, so pretend it worked.
  if (clean(body.website, 100)) return res.status(200).json({ ok: true });

  // Sent faster than a person could type it, so treat it like the hidden field.
  const elapsed = Number(body.elapsed);
  if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) return res.status(200).json({ ok: true });

  const name = clean(body.name, 100);
  const email = clean(body.email, 200);
  const kind = KINDS[clean(body.kind, 20)] || 'Message';
  const message = clean(body.message, 5000);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address so we can reply.' });
  }
  if (message.length < 5) {
    return res.status(400).json({ error: 'Please write a message.' });
  }
  if ((message.match(/https?:\/\/|www\./gi) || []).length > MAX_LINKS) {
    return res.status(400).json({ error: 'Please include no more than three links.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip, Date.now())) {
    return res.status(429).json({ error: 'You have sent a few messages already. Please try again in a few minutes, or email hello@forgetze.com.' });
  }

  const pass = process.env.CONTACT_SMTP_PASSWORD;
  if (!pass) return res.status(500).json({ error: 'Sending is not set up yet.' });
  const user = process.env.CONTACT_SMTP_USER || 'markandrews@forgetze.com';

  try {
    const transport = nodemailer.createTransport({
      host: 'smtp.purelymail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
    });
    await transport.sendMail({
      from: `"Forgetze website" <${user}>`,
      to: TO,
      replyTo: name ? `"${name.replace(/["\n]/g, '')}" <${email}>` : email,
      subject: `[Website] ${kind}${name ? ' from ' + name.replace(/\n/g, ' ') : ''}`,
      text: `${kind} from the forgetze.com contact form\n\nName: ${name || '(not given)'}\nEmail: ${email}\n\n${message}\n`,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact form send failed', err && err.message);
    return res.status(502).json({ error: 'The message could not be sent. Please email hello@forgetze.com instead.' });
  }
};

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
