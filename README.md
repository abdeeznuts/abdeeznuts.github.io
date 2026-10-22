# Uniworld

The Uniworld travel app: Umrah journeys, stays, flights and holidays, with live cheapest flight and hotel prices and booking requests handled by real Uniworld advisors.

- **Live app:** https://abdeeznuts.github.io/
- **Team inbox:** https://abdeeznuts.github.io/#staff
- **Hosting:** GitHub Pages. The files in this repo are the whole front end, with no build step.
- **Live listings:** the Stays page searches every hotel on Google Hotels (photos, ratings, prices from booking sites, filters, paging) and the Flights page lists every Google Flights option. Each fresh search uses one SerpApi search; results are cached for 6 hours.
- **Backend:** Supabase project `imytqgeldrfmxsxszrqs` ("uniworld").
  - Edge Function `uniworld-api`: booking requests, the team inbox, wish list and saved itineraries. Customers get a private device ID, so nobody has to sign in.
  - Edge Function `uniworld-live-rates`: live data from Google Flights and Google Hotels through SerpApi (`deal`/`search` for the home cards, `hotels` for hotel search, `hotel` for one hotel's details, `flights` for flight lists), cached and capped by `UNIWORLD_SERPAPI_MONTHLY_CAP` (default 240).

## How booking works

1. A customer taps **Request** or **Book with Uniworld** and adds a name, a phone or WhatsApp number, an optional email and notes. Nothing is charged in the app.
2. The request is saved in Supabase (table `uniworld_records`, kind `request`) with a reference like `UW-7K3Q9P`.
3. The team opens the **team inbox** (`#staff`), calls or WhatsApps the customer, and sets the status (Request sent, Advisor on it, Confirmed, Cancelled) plus a message the customer sees in **My trips**.

## Settings (Supabase, Edge Functions, Secrets)

| Secret | What it does |
| --- | --- |
| `SERPAPI_KEY` | Live flight and hotel prices (required for prices). |
| `UNIWORLD_STAFF_KEY` | Password for the team inbox (required for the inbox, 8+ characters). |
| `RESEND_API_KEY` | Optional. Sends an email for every new request. |
| `UNIWORLD_NOTIFY_EMAIL` | Optional. Where alert emails go (default contact@uniworldinc.com). |

To show WhatsApp buttons, put the agency's WhatsApp number in `CONTACT.whatsapp` in `requests.js` (international format, digits only, for example `923001234567`).

## Updating the app

Edit the files and push to `main`. GitHub Pages republishes in about a minute.
When you change any file, bump `VERSION` in `sw.js` so installed phones pick up the new version.
