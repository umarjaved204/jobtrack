# JobTrack redesign: design reference (Nov 2026)

Mockups from the design canvas, one file per screen. They are a VISUAL REFERENCE,
not code to copy: each file is an HTML mockup in a design-tool format (custom tags
like <x-dc>, <sc-for>, <dc-import> and a small script that supplies demo data).
Read them for exact colours, type sizes, spacing, borders and layout.

| File | Screen |
|---|---|
| Masthead.dc.html | Shared header: date line, wordmark, tagline, double rule, nav, Add application, ⌘K search |
| Main.dc.html | Dashboard |
| Board.dc.html | Applications: Kanban board (drag state, drop slot, Move to… menu, offer stamp) |
| Table.dc.html | Applications: table view with filters and pagination |
| Detail.dc.html | Application detail |
| Form.dc.html | Add / edit application side panel |
| Calendar.dc.html | Calendar (month grid + selected day) |
| Resumes.dc.html | Resume versions |
| Match.dc.html | Match input, result and history |
| Settings.dc.html | Settings |
| Landing.dc.html | Landing page with sign-in |
| Palette.dc.html | ⌘K command palette |
| Mobile.dc.html | Board on a 390px phone (column snap) |

Palette used (light theme): paper #F3EDE2, panel #FBF8F2 / #F8F4EC, ink #16130F,
secondary text #4A433A, muted #6B6256, rule #D6CCBB, input border #CFC4B2,
vermilion #E4412B (fills), vermilion text/button #B8321F / #C2361F, cobalt focus #2B4BDB.
Status (text on tint): wishlist #5C5348/#E6DED0, applied #2440C0/#DCE2F7,
screening #0E6468/#D3E8E6, interview #7A4F00/#F1E2C2, offer #2E6B2F/#DCEBD5,
rejected #9E2A1A/#F2D9D2, withdrawn #55514B/#E2DED8.
Fonts: Fraunces (display), Instrument Sans (body), JetBrains Mono (figures/dates).

All companies, people and numbers are demo data. Do not use these images or files
as README screenshots of the real app.
