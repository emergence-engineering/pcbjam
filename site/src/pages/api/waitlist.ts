import type { APIRoute } from 'astro';
import { Resend } from 'resend';
// Typed server secrets (schema in astro.config.mjs). Optional, so RESEND_API_KEY
// and RESEND_SEGMENT_ID are `string | undefined`; WAITLIST_FROM_EMAIL has a
// schema default so it's always a `string`. The Vercel adapter reads these from
// process.env at runtime — never inlined.
import { RESEND_API_KEY, RESEND_SEGMENT_ID, WAITLIST_FROM_EMAIL } from 'astro:env/server';

// Opt this single route into on-demand (serverless) rendering. The rest of the
// site stays static; Vercel emits exactly one function for /api/waitlist.
export const prerender = false;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

  const resend = new Resend(RESEND_API_KEY);

  try {
    // Add to the segment (the modern name for an "audience"). The SDK returns
    // { data, error } and does NOT throw on API errors. A duplicate contact has
    // no stable error code (it surfaces as a validation_error), so we treat the
    // contact step as best-effort: log any error but never fail the request on
    // it — the user-facing promise is the confirmation email below.
    if (RESEND_SEGMENT_ID) {
      const { error: contactError } = await resend.contacts.create({
        email,
        unsubscribed: false,
        segments: [{ id: RESEND_SEGMENT_ID }],
      });
      if (contactError) {
        console.error('[waitlist] contacts.create failed (non-fatal)', contactError);
      }
    }

    const { error: sendError } = await resend.emails.send({
      from: WAITLIST_FROM_EMAIL,
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

    // The confirmation send IS the user-facing promise — fail loudly if Resend
    // rejected it (bad key, unverified domain, invalid from-address, …).
    if (sendError) {
      console.error('[waitlist] emails.send failed', sendError);
      return wantsJson ? json(502, { ok: false, error: 'send_failed' }) : redirect('error');
    }

    return wantsJson ? json(200, { ok: true }) : redirect('ok');
  } catch (err) {
    // Defensive: unexpected throw (network error, bad construction).
    console.error('[waitlist] unexpected error', err);
    return wantsJson ? json(502, { ok: false, error: 'send_failed' }) : redirect('error');
  }
};

// A bare GET (e.g. someone visiting the URL) shouldn't 500.
export const GET: APIRoute = () => json(405, { ok: false, error: 'method_not_allowed' });
