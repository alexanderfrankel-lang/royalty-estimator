export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  const { artistId } = req.query;
  if (!artistId) return res.status(400).json({ error: 'Missing artistId' });
  try {
    const response = await fetch(`https://spotify-artist-monthly-listeners.p.rapidapi.com/artists/spotify_artist_monthly_listeners?spotify_artist_id=${artistId}`, {
      headers: {
        'x-rapidapi-key': 'a31b9055a3msh4dc9420da8258dap10e641jsnafea3d75c593',
        'x-rapidapi-host': 'spotify-artist-monthly-listeners.p.rapidapi.com',
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
