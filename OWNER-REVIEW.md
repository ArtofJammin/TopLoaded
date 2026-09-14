# Top Loaded — owner review

September 14, 2026 · [Open the updated site](https://artofjammin.github.io/TopLoaded/)

## Changes ready to review

- **Home:** Buy Desk and the duplicate stock section removed. Collection trade-in sits above the expanded Play Nights area, followed by Find Your Universe. Each scheduled game has a countdown. The moving card wall stays.
- **Card discovery:** random cards come from complete set catalogs, not just shop stock. Available cards receive an in-stock badge.
- **Latest Home/Shop refinements:** removed “03 /” from Make Room for What's Next. Removed Condition, Price Categories (including min/max), and Rarity filters. Search, game/set/type, wishlist, stock toggle and price sorting remain. Retired URL filters are discarded without losing search or a quick-view link; product condition, rarity and prices remain visible.
- **Reviews:** genuine five-star TCGplayer highlights refresh every morning. Two five-star Google excerpts verified on the supplied business listing are included with author/source links and a verification date. They are explicitly saved highlights, not a live Google feed; the automatic Google provider still needs activation.
- **Live:** updated to “Live Stream” and the requested card-show-style description. The claims board, Square catalog search, private payment links and signed-payment confirmation are built and tested. Payment-linked Square inventory is supported; production operation still needs the sales connection/acceptance steps.
- **Card Show:** October 3, 2026 remains confirmed with the countdown at the top. The unified interactive map retains the 49 ballroom positions and adds the three room outlines, Convention Entrance, three ballroom doors, walking routes, and Top Loaded’s four wall tables plus L-shaped trade table. These five shop tables do not count as five vendor assignments. Pre-function run count is still awaiting confirmation.
- **Rip a Pack:** clearly a free digital simulator. No real pack, purchase, prize or ownership of the displayed cards.
- **We Buy Collections:** recommends an in-store visit and keeps the estimator removed. **Get a Quote** is a visible, human-reviewed collection intake form with a prominent link and direct route `#/buylist?quote=1`. It accepts contact details and up to five validated HTTPS photo links. Without the API it prepares an explicitly unsent email draft; customers attach photos and send in their email app. With the API it submits to the staff inbox. No website file upload, remote image preview, or browser storage of inquiry details. The Home FAQ now points to this form; final offers remain subject to an in-store review.
- **Flat-plan presentation:** one zoomable/selectable map now contains the venue outline and table layer. The standalone entrance diagram, hotel-information panel and hotel flyer links have been removed from the page and publication package. Source reference files remain in the repository for internal traceability.

- **Cart separation:** TCGplayer items are an external shopping list with listing links and their own estimate. Confirmed stream claims appear under Stream purchases, with individual, host-issued private checkout links. Server state is rechecked before payment; paid/cancelled claims cannot start a new checkout, and paying a claim does not clear the TCGplayer list. This flow is built and tested but still requires the production API/Square connection below. Each claim has a separate checkout; shipping is not combined across claims.

## TCGplayer checkout decision

Keep the independent site and existing Top Loaded seller/listing links. Do not migrate checkout to a Pro website or enable a fee-bearing integration without approval. A corrected public Mass Entry URL prefills card text, but the tested page still describes marketplace-wide selection and exposes no Top Loaded-only restriction. The supplied `seller=` parameter is not verified as a seller lock. No bulk cart transfer was shipped, and no items were added to a TCGplayer cart during verification. The existing seller storefront is supported; seller-locked mass import needs confirmation from TCGplayer.

## Needed before operational sign-off

1. **Assign October vendors and confirm the event-specific table arrangement.** Date: **Saturday, October 3, 2026**. Pricing: **$30 per table** ($60 for two, $90 for three). The Marketfloor arrangement has 49 table positions, not 49 advertised openings; vendor assignments and bookings are not inferred from its old event. Grid positions were adapted from the existing Marketfloor table geometry onto a half-foot planning grid. Confirm actual table sizes, usable room capacity and the final plan with the Hilton.
2. **Connect the production backend.** Public customer/staff authentication is not live until the Worker is deployed. Email-code account creation/sign-in and private ledger linking are built and tested; **Google OAuth is not required**. Hosting/storage plus a verified sender (`RESEND_API_KEY`, `EMAIL_FROM`) are needed. Existing credit records can be found by phone/email at the counter, but online phone sign-in requires a separate SMS verification service and is not implemented. Shared claims, inbox delivery and Admin dispatch also need their service credentials. See `API-CONNECT.md`; never put credentials in source or chat.
3. **Confirm the live platform and schedule; activate the sales connection when ready.** See `SALES-CONNECTION.md`. A linked, paid claim reduces Square catalog stock through Square; automatic TCGplayer removal still requires its authorized connector. The ordinary shop cart is not yet an exact-SKU Square integration.
4. **Automatic Google reviews:** supply the shop's Place ID and configure the provider connection and policy links. Five-star-only filtering is enforced. The public-page automated fetch returned a JavaScript-only page, so it is not advertised as a working scraper. Verified Google excerpts are hidden after 30 days without renewal; TCGplayer highlights are already automatic.

The integrated layout uses all three show rooms. The original 49 table footprints were translated into the larger map without changing their relative positions, names or vendor assignments. Outer-room proportions and placement are schematic, not a survey. The three ballroom doors and Convention Entrance are part of this same map, not a separate graphic.

**Pending:** confirm the number of pre-function two-table runs and end tables before finalizing those placements. Admin’s **Add outer run (2 + end)** adds three selectable/editable tables at a time. Both the browser and API refuse tables in the marked entrance routes or outside room outlines. Top Loaded’s five business-center tables are already in the map and are not bookable vendor openings.

The floor editor is an organizer's planning tool, not a venue-approved safety plan. Confirm exits, aisles, table sizes and clearance requirements with the Hilton before publishing assignments.

PWA/app-install prompts remain deferred until after the sale.
