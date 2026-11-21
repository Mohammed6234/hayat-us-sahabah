# Hayat us Sahabah reader

A reader for *The Lives of the Sahabah* (Hayat us Sahabah) by Maulana Muhammad Yusuf
Kandhlawi, in the English translation by Mufti Afzal Hoosen Elias. Readers can go
through the book in the author's order, or filter narrations by Companion, by theme,
or by both.

> **Copyright.** The translation is in copyright (Zam Zam Publishers). Get the
> publisher's permission before this site goes public. Keep this repository private
> until then.

## How it fits together

```
archive.org OCR ──fetch──▶ data/raw/partN.txt
                 ──segment──▶ data/build/book.json      volumes › chapters › sections › narrations
                 ──pass 1 (LLM)──▶ data/pilot/extract/*.json   free-form people + themes per narration
                 ──pass 2 (vocab)──▶ data/pilot/tags.json       mapped onto data/vocab/*.json
                 ──build──▶ site/data.json ─▶ dist/              static site, no server
```

| Step | Command | Notes |
| --- | --- | --- |
| Download text | `npm run fetch` | Reads archive.org's `/stream/` pages (the `/download/` links redirect to mirror hosts). |
| Segment | `npm run segment` | 19 chapters, ~2,900 sections, 3,761 narrations, ~700k words. Writes `data/build/segment-report.json` with headings it could not place. |
| Pass 1 input | `npm run pilot:input` | First 50 narrations → `data/pilot/input.json`. |
| Pass 1 | (subagents for the pilot; Batches API for the full run) | Prompt: `pipeline/prompts/extract.md`. |
| Pass 2 | `npm run tags` | Maps names/themes to `data/vocab/`. Anything unmapped goes to `data/pilot/review-queue.json`, never guessed. |
| Site | `npm run build`, `npm run serve` | `site/` is plain HTML/CSS/JS; `dist/` deploys to any static host. |

### Segmentation (pipeline/segment.mjs)
- Running headers, page numbers and footnotes are separated per page; each footnote marker
  is resolved on the page where it is printed, so a narration carries its own references.
- Headings come from each volume's table of contents and are matched in the body near the
  page the TOC gives (fuzzy, because the OCR differs). The printed heading is preferred
  over the TOC text, which has more typos.
- A narration ends at its reference marker: every report in this book ends with one.
- The scanned honorific glyphs come out as junk (`&§`, `5g»2®e>`); `clean.mjs` replaces
  them with `ﷺ` after the Prophet's name and `(RA)` after a Companion's.

### Vocabulary (data/vocab/)
- `people.json`: canonical person, display name, aliases as they appear in the text,
  and `sahabi: yes | no | unsure`. Entries with a `note` need a scholar's check.
- `themes.json`: canonical theme, group, and the raw pass-1 phrases it absorbs.
- `overrides.json`: per-narration fixes for names that are ambiguous ("Mu'aawiya").
- `ignore.json`: names deliberately not tagged (lineage ancestors, unclear referents).

Roles: `subject` (the narration is about them), `narrator` (they report it), `mentioned`.
The site's default "About them" filter uses `subject` only.

## Pilot results (first 50 narrations)
- Pass 1 produced 109 raw names and 111 raw themes; pass 2 reduced these to 93 people
  (58 Companions, 8 unsure, 27 others) and 34 themes in 6 groups, with nothing left unmapped.
- 10 of 50 narrations were flagged by pass 1 as `merged` (7) or `ends-mid` (3). Most trace
  to TOC headings the segmenter missed, so the flag is a useful segmentation check.
- 14 people are marked `unsure` or carry a review note for a scholar to check.

## Next steps
1. Fix the segmentation issues flagged by the pilot (missed headings, ~12% of headings).
2. Review `data/vocab/` (people with notes, theme names and grouping).
3. Run pass 1 over all 3,761 narrations with the Batches API, then pass 2, then a
   constrained re-tag against the approved vocabulary with a second-opinion model.
4. Human review queue: disagreements, low confidence and a random 5–10% sample.
5. Prerender one page per narration, Companion and theme for SEO.

## Deploying (Cloudflare Pages)

The site is static: `site/` plus its generated `site/data/`. From a fresh clone, with no raw OCR needed:

```
export CLOUDFLARE_API_TOKEN=...      # token with "Cloudflare Pages: Edit"
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy                       # builds dist/ and uploads it as project "hayat-us-sahabah"
```

The first run creates the Pages project; the site appears at `https://hayat-us-sahabah.pages.dev`.
Keep the project private (Cloudflare Access) or get the publisher's permission before making it public.
