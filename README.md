# Uniworld

The Uniworld travel app: Umrah packages, stays, flights and holidays, with live cheapest flight and hotel prices.

- **Live app:** https://abdeeznuts.github.io/
- **Hosting:** GitHub Pages. The files in this repo are the whole front end, with no build step.
- **Trips, bookings and saved stays:** Supabase Edge Function `uniworld-api` (project `imytqgeldrfmxsxszrqs`). Each phone or browser gets a private device ID, so nobody has to sign in.
- **Live prices:** Supabase Edge Function `uniworld-live-rates` (Google Flights and Google Hotels through SerpApi, cached to stay inside the free plan).

## Updating the app

Edit the files and push to `main`. GitHub Pages republishes in about a minute.
When you change any file, bump `VERSION` in `sw.js` so installed phones pick up the new version.
