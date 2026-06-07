import type { APIRoute } from 'astro';
import { Resend } from 'resend';

// Opt this single route into on-demand (serverless) rendering. The rest of the
// site stays static; Vercel emits exactly one function for /api/waitlist.
export const prerender = false;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Runtime secrets (Vercel injects at runtime). Never prefix with PUBLIC_.
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? import.meta.env.RESEND_API_KEY;
const RESEND_AUDIENCE_ID =
  process.env.RESEND_AUDIENCE_ID ?? import.meta.env.RESEND_AUDIENCE_ID;
const FROM_EMAIL =
  process.env.WAITLIST_FROM_EMAIL ??
  import.meta.env.WAITLIST_FROM_EMAIL ??
  'PCBJam <waitlist@pcbjam.com>';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function redirect(status: 'ok' | 'error') {
  // No-JS native submit: bounce back to the page with a status flag.
  return new Response(null, {
    status: 303,
    headers: { Location: `/?waitlist=${status}#waitlist` },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const ct = request.headers.get('content-type') ?? '';
  const wantsJson = ct.includes('application/json');

  let data: Record<string, unknown> = {};
  try {
    data = wantsJson
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return wantsJson ? json(400, { ok: false, error: 'bad_request' }) : redirect('error');
  }

  const email = String(data.email ?? '').trim().toLowerCase();
  const honeypot = String(data.company_url ?? ''); // hidden field — must stay empty
  const source = String(data.source ?? 'unknown');

  // Bot caught by honeypot: silently "succeed" so we don't tip them off.
  if (honeypot) return wantsJson ? json(200, { ok: true }) : redirect('ok');

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return wantsJson ? json(400, { ok: false, error: 'invalid_email' }) : redirect('error');
  }

  // No key configured (e.g. local dev without secrets): accept + log, don't 500.
  if (!RESEND_API_KEY) {
    console.warn(`[waitlist] RESEND_API_KEY not set — skipping send. email=${email} source=${source}`);
    return wantsJson ? json(200, { ok: true }) : redirect('ok');
  }

  try {
    const resend = new Resend(RESEND_API_KEY);

    if (RESEND_AUDIENCE_ID) {
      await resend.contacts.create({
        email,
        unsubscribed: false,
        audienceId: RESEND_AUDIENCE_ID,
      });
    }

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "You're on the PCBJam waitlist",
      text: [
        "You're on the list. 🎉",
        '',
        "We'll keep you posted with product updates, and send your early-access invite",
        'as seats open in waves. No spam — unsubscribe anytime.',
        '',
        '— The PCBJam team, built by Emergence Engineering',
      ].join('\n'),
    });

    return wantsJson ? json(200, { ok: true }) : redirect('ok');
  } catch (err) {
    console.error('[waitlist] send failed', err);
    return wantsJson ? json(500, { ok: false, error: 'send_failed' }) : redirect('error');
  }
};

// A bare GET (e.g. someone visiting the URL) shouldn't 500.
export const GET: APIRoute = () => json(405, { ok: false, error: 'method_not_allowed' });
