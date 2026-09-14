# Top Loaded — owner review

September 13, 2026 · [Open the updated site](https://artofjammin.github.io/TopLoaded/)

## Changes ready to review

- **Home:** Buy Desk and the duplicate stock section removed. Collection trade-in sits above the expanded Play Nights area, followed by Find Your Universe. Each scheduled game has a countdown. The moving card wall stays.
- **Card discovery:** random cards come from complete set catalogs, not just shop stock. Available cards receive an in-stock badge.
- **Reviews:** genuine five-star TCGplayer highlights refresh every morning. Two five-star Google excerpts verified on the supplied business listing are included with author/source links and a verification date. They are explicitly saved highlights, not a live Google feed; the automatic Google provider still needs activation.
- **Live:** updated to “Live Stream” and the requested card-show-style description. The claims board, Square catalog search, private payment links and signed-payment confirmation are built and tested. Payment-linked Square inventory is supported; production operation still needs the sales connection/acceptance steps.
- **Card Show:** October 3, 2026 is confirmed; countdown is at the top. The actual Marketfloor 49-table arrangement is adapted into the interactive guide, with October vendor assignments pending (no old event bookings copied). The hotel reference is collapsed. Search, booth details, zoom, category colors, and assignment-based TCG/Sports percentages are supported. Admin can position, resize, rotate, assign and download the layout.
- **Rip a Pack:** clearly a free digital simulator. No real pack, purchase, prize or ownership of the displayed cards.
- **We Buy Collections:** recommends an in-store visit and keeps the estimator removed. An optional buyout inquiry accepts contact details and up to five validated HTTPS photo links. Without the API it prepares an email draft; customers attach photos and send in their email app. With the API it submits to the staff inbox. No website file upload, remote image preview, or browser storage of inquiry details.

## Needed before operational sign-off

1. **Assign October vendors and confirm the event-specific table arrangement.** Date: **Saturday, October 3, 2026**. Pricing: **$30 per table** ($60 for two, $90 for three). The Marketfloor arrangement has 49 table positions, not 49 advertised openings; vendor assignments and bookings are not inferred from its old event. Grid positions were adapted from the existing Marketfloor table geometry onto a half-foot planning grid. Confirm actual table sizes, usable room capacity and the final plan with the Hilton.
2. **Connect the production backend.** Public customer/staff authentication is not live until the Worker is deployed. Email-code account creation/sign-in and private ledger linking are built and tested; **Google OAuth is not required**. Hosting/storage plus a verified sender (`RESEND_API_KEY`, `EMAIL_FROM`) are needed. Existing credit records can be found by phone/email at the counter, but online phone sign-in requires a separate SMS verification service and is not implemented. Shared claims, inbox delivery and Admin dispatch also need their service credentials. See `API-CONNECT.md`; never put credentials in source or chat.
3. **Confirm the live platform and schedule; activate the sales connection when ready.** See `SALES-CONNECTION.md`. A linked, paid claim reduces Square catalog stock through Square; automatic TCGplayer removal still requires its authorized connector. The ordinary shop cart is not yet an exact-SKU Square integration.
4. **Automatic Google reviews:** supply the shop's Place ID and configure the provider connection and policy links. Five-star-only filtering is enforced. The public-page automated fetch returned a JavaScript-only page, so it is not advertised as a working scraper. Verified Google excerpts are hidden after 30 days without renewal; TCGplayer highlights are already automatic.

The floor editor is an organizer's planning tool, not a venue-approved safety plan. Confirm exits, aisles, table sizes and clearance requirements with the Hilton before publishing assignments.

PWA/app-install prompts remain deferred until after the sale.
