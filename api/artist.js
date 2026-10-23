// GET /api/artist?q=Drake
// Looks up the artist on Spotify and their monthly listeners on RapidAPI.
// Keys live in Vercel environment variables, never in the code:
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET (required)
//   RAPIDAPI_KEY (optional: auto-fills monthly listeners)

let cachedToken = null;
let tokenExpires = 0;

async function spotifyToken() {
  if (cachedToken && Date.now() < tokenExpires) return cachedToken;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Spotify keys are not set in Vercel');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Spotify sign-in failed — check the Spotify keys');
  cachedToken = data.access_token;
  tokenExpires = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function monthlyListeners(artistId) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return { listeners: null, warning: null }; // optional: without it, listeners are typed in by hand
  const host = 'spotify-artist-monthly-listeners.p.rapidapi.com';
  const res = await fetch(
    `https://${host}/artists/spotify_artist_monthly_listeners?spotify_artist_id=${encodeURIComponent(artistId)}`,
    { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host } }
  );
  let data = {};
  try { data = await res.json(); } catch (_) {}
  const n = Number(data.monthly_listeners ?? data.monthlyListeners ?? data.data?.monthly_listeners);
  if (res.ok && n > 0) return { listeners: n };
  const why = data.message || data.error || `listener service returned ${res.status}`;
  return { listeners: null, warning: why };
}

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Type an artist name' });
  try {
    const token = await spotifyToken();
    const s = await fetch(
      'https://api.spotify.com/v1/search?type=artist&limit=1&q=' + encodeURIComponent(q),
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const sd = await s.json();
    const a = sd.artists?.items?.[0];
    if (!a) return res.status(404).json({ error: 'Artist not found. Try a different spelling.' });
    const { listeners, warning } = await monthlyListeners(a.id);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      id: a.id,
      name: a.name,
      image: a.images?.[0]?.url || null,
      genres: (a.genres || []).slice(0, 2),
      monthlyListeners: listeners,
      warning: warning || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
