// Talks to the Google bridge (Apps Script web app running as you).
export async function bridge(action, payload = {}) {
  const url = process.env.BRIDGE_URL, secret = process.env.BRIDGE_SECRET;
  if (!url || !secret) throw new Error('Google isn\'t connected yet. Add BRIDGE_URL and BRIDGE_SECRET in Vercel, then redeploy.');
  let res, text;
  try {
    res = await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, action, ...payload }),
      redirect: 'follow',
      cache: 'no-store'
    });
    text = await res.text();
  } catch (e) {
    throw new Error('Couldn\'t reach the Google bridge. Check BRIDGE_URL in Vercel.');
  }
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error('The Google bridge didn\'t answer correctly. Check that it\'s deployed as a web app with "Who has access" set to Anyone, and that BRIDGE_URL ends in /exec.');
  }
  if (json.error) throw new Error(json.error);
  return json;
}
