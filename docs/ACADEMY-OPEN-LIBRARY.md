# Academy Open Library

6 October 2026 · local development

Open Library is a separate public catalogue at `/academy/open-library/`. It does not require an Academy account and does not read or expose the personal For you / Explore catalogue. The Academy welcome page links to it separately from My Library.

The first selected item is **Essential Duas for Muslims (Grades 1–7)**, credited to Ta’limi Board KZN. Its source-aware ID is `EXTERNAL:TALIMI_BOARD_KZN:ESSENTIAL_DUAS_GR_1_7`. The PDF remains at the [publisher's URL](https://talimiboardkzn.org/wp-content/uploads/2018/10/essential_duas_for_muslims_gr_1-7.pdf). The book is shown once despite being listed under seven grades on the [publisher's Books page](https://talimiboardkzn.org/?page_id=37).

The public page opens the PDF in Reboot's PDF.js viewer. The existing Pages `/pdf-file` route streams this exact URL as a same-origin response, forwards PDF byte ranges, and returns `Cache-Control: no-store`. The original PDF link is also available as a fallback. There is no stored Academy PDF copy. The source may change, remove, or rate-limit the file; Academy cannot revoke direct public access.

Additional Archive.org or other website resources require individual review, a stable source URL, source attribution, and an explicit proxy allowlist entry when using PDF.js. A public link does not inherit Academy's Assigned, Subscription, or Staff only protections. Do not import entire external catalogues automatically.

The local implementation and proxy unit test are complete. A live desktop and iPhone reading check remains after an authorised Development deployment.
