# What's It Worth?

Two tools in one page:

1. **Quick estimate**: type an artist name and get a rough, streaming-only ballpark from Spotify monthly listeners.
2. **Real valuation**: enter catalog income by year and source (publishing, masters, or both) and get normalized NPS/NLS, a multiple-based range with the adjustments shown, and a 10-year DCF.

## Files

- `public/index.html`: the page
- `public/valuation.js`: all the valuation math (quick estimate, multiples, DCF)
- `api/artist.js`: server-side Spotify search and monthly-listener lookup

## Keys (Vercel environment variables)

No keys live in the code. Add these in Vercel → Project → Settings → Environment Variables, for Production and Preview:

| Name | Where to get it |
|---|---|
| `SPOTIFY_CLIENT_ID` | developer.spotify.com → your app → Settings |
| `SPOTIFY_CLIENT_SECRET` | same page (rotate it: the old one was public) |
| `RAPIDAPI_KEY` | rapidapi.com → Apps → your app → Authorization (rotate it too) |

Redeploy after adding them. If the listener service fails, the page shows the reason and lets the user type monthly listeners in by hand. The real valuation never needs any keys.
