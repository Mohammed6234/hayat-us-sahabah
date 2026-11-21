# Pass 1 — open extraction

You are tagging narrations from *Hayat us Sahabah* (*The Lives of the Sahabah*) by
Maulana Muhammad Yusuf Kandhlawi, English translation. Each narration is one
report about the Prophet ﷺ and/or his Companions (Sahabah). Your output feeds a
reader where people can filter narrations by **person** and by **theme**.

There is **no fixed vocabulary yet**. Describe what is in the text in plain,
consistent words; a later pass merges synonyms. Accuracy matters more than
coverage: this is religious material, and a wrong attribution is worse than a
missing tag.

## Input

Each item has `id`, `chapter`, `heading` (the author's own section title, which
tells you why he placed the narration here) and `text`. The text is cleaned OCR:
`ﷺ` marks the Prophet, `(RA)` marks a Companion. Occasional OCR debris remains
(e.g. a stray word where an honorific was) — ignore it.

## Output

Return a JSON array, one object per narration, in input order:

```json
{
  "id": "n00012",
  "summary": "One plain sentence: who did/said what, and why it matters here.",
  "people": [
    { "name": "Ali bin Abi Taalib", "as_written": "Hadhrat Ali (RA)", "role": "subject", "sahabi": "yes" }
  ],
  "prophet": "subject",
  "themes": ["dawah", "conveying islam before battle", "battle of khaybar"],
  "events": ["Battle of Khaybar"],
  "places": ["Khaybar"],
  "boundary": "ok",
  "notes": ""
}
```

### `people`
Every named human being in the narration **except the Prophet ﷺ** (he goes in `prophet`).
- `name`: the fullest form the text supports, in the book's transliteration
  ("Abdullaah bin Abbaas", "Abu Bakr", "Aa'isha"). Do not add names the text
  does not give. Drop titles ("Hadhrat", "(RA)", "Ameerul Mu'mineen").
- `as_written`: the first form it appears in.
- `role` — pick one:
  - `narrator`: only relays the report ("X narrates that…") and does not act in it.
  - `subject`: the narration is about them — they act, speak or are the point of it.
    A narrator who tells their own story is `subject`.
  - `mentioned`: appears but is not the point.
- `sahabi`: `yes` (a Companion), `no` (e.g. Abu Jahal, Abu Taalib, later
  scholars like Haythami, Tabraani, Ibn Is'haaq), or `unsure`.
  Scholars who only appear in the reference line are not people of the
  narration — leave them out entirely.
- Unnamed people ("a man", "a Bedouin") are not listed.

### `prophet`
`subject`, `mentioned` or `absent`.

### `themes`
3–6 short lowercase phrases for what the narration is *about* — the lessons and
topics a reader would search for (e.g. `patience`, `generosity`, `marriage`,
`fear of allaah`, `dawah to family`, `hardship in the path of allaah`).
- Prefer general, reusable topics over one-off descriptions.
- The section `heading` is a strong hint of the author's intent; include its
  theme, but add others the text clearly supports.
- Use the book's own Islamic terms where it does (`dawah`, `jihaad`, `salaah`,
  `zakaah`, `hijrah`, `imaan`), lowercase, as spelled in the text.
- Do not tag a theme the text does not support.

### `events` / `places`
Named historical events (battles, treaties, the Hijrah…) and named places, as
written. Empty arrays if none.

### `boundary`
The text was split automatically. `ok` if it reads as one complete narration;
`starts-mid` if it begins mid-story; `ends-mid` if it is cut off; `merged` if it
clearly contains two or more separate reports that should be split; `not-narration`
if it is editorial text, not a report. Explain anything but `ok` in `notes`.
