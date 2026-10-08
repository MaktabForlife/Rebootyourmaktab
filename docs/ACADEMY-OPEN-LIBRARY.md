# Academy Open Library

8 October 2026 · V105.4.2.13 feature branch

Open Library is a separate public catalogue at `/academy/open-library/`. It does not require an Academy account and does not read or expose the personal For you / Explore catalogue. The Academy welcome page links to it separately from My Library.

The first selected item is **Essential Duas for Muslims (Grades 1–7)**, credited to Ta’limi Board KZN. Its source-aware ID is `EXTERNAL:TALIMI_BOARD_KZN:ESSENTIAL_DUAS_GR_1_7`. The PDF remains at the [publisher's URL](https://talimiboardkzn.org/wp-content/uploads/2018/10/essential_duas_for_muslims_gr_1-7.pdf). The book is shown once despite being listed under seven grades on the [publisher's Books page](https://talimiboardkzn.org/?page_id=37).

The public page opens the PDF in Reboot's PDF.js viewer. The existing Pages `/pdf-file` route streams this exact URL as a same-origin response, forwards PDF byte ranges, and returns `Cache-Control: no-store`. The original PDF link is also available as a fallback. There is no stored Academy PDF copy. The source may change, remove, or rate-limit the file; Academy cannot revoke direct public access.

The public [Ummabbablibrary Archive.org list](https://archive.org/details/@hbn_naidu/lists/1/ummabbablibrary) is now a second curated source. The Pages `/academy/open-library/catalogue` endpoint reads the list's public membership API, then checks each item's public metadata for a PDF that is not marked private or restricted. Newly added list items appear without editing the Academy site after the five-minute catalogue cache expires. Removed items disappear. Items without such a PDF are omitted.

**Ihya Ulum ad-Din** is one catalogue item with a selector for volumes 1–4. The initial list includes volumes 1, 2, and an item labelled 4. The latter scan's title page says **Vol. III**. The grouped item uses the verified [Volume III](https://archive.org/details/IhyaUlumAlDinVol3) and [Volume IV](https://archive.org/details/GAZALIIhyaUlumAlDin4) scans instead. These two Archive items can be outside the list while at least one recognised Ihya item remains in it. Removing every Ihya item from the list removes the grouped item and its PDF proxy access. A scan that becomes restricted or loses its public PDF is omitted from the selector.

Archive PDFs also open in Reboot's PDF.js viewer. On every `/pdf-file` request, the Pages function verifies that the exact PDF belongs to a listed item or one of the two explicitly selected Ihya replacement items, and matches its public metadata. It streams the file from Archive.org, follows only HTTPS redirects within `archive.org`, forwards byte ranges, and never stores a PDF copy. The Archive.org item remains the source of the content and metadata. The public catalogue does not inherit Academy's Assigned, Subscription, or Staff only protections.

If Archive.org's list or metadata service is unavailable, the Academy page keeps the Essential Duas entry and displays an Archive.org loading error. Other external websites still require an individual source review and explicit proxy allowlist entry.

The local implementation and proxy unit tests are complete. The Archive.org list API and PDF streaming cannot be verified end to end until a Development deployment; desktop and iPhone reading checks remain then. Pushing this feature branch does not deploy the Pages site or Worker.
