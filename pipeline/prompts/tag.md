# Tagging — full run

You are tagging narrations from *Hayat us Sahabah* (*The Lives of the Sahabah*) by
Maulana Muhammad Yusuf Kandhlawi, English translation, for a reader where people
filter narrations by **person** and by **theme**. Accuracy matters more than
coverage: this is religious material, and a wrong attribution is worse than a
missing tag.

You are given the **approved vocabulary** (`vocab-brief.md`). Use its ids wherever
they fit. Only when nothing fits, propose a new entry — a later review merges
proposals, so propose plainly and consistently.

## Input
Each item has `id`, `chapter`, `heading` (the author's section title — a strong
hint of why the narration is here) and `text` (cleaned OCR: `ﷺ` marks the Prophet,
`(RA)` a Companion; ignore stray OCR debris).

## Output
A JSON array, one object per narration, in input order:

```json
{
  "id": "n00012",
  "summary": "One plain sentence: who did or said what.",
  "people": [
    { "id": "ali", "role": "subject" },
    { "id": null, "name": "Khaalid bin Waleed", "role": "mentioned", "sahabi": "yes" }
  ],
  "prophet": "subject",
  "themes": ["dawah", "dawah-before-battle"],
  "new_themes": [],
  "boundary": "ok",
  "notes": ""
}
```

### people
Every named person in the narration except the Prophet ﷺ (he goes in `prophet`).
- If the person is in the approved list, give only `id` and `role`. Check carefully:
  several people share names (Mu'aawiya bin Haydah ≠ Mu'aawiya bin Abi Sufyaan;
  Abdullaah bin Umar ≠ Abdullaah bin Amr). "Umar" alone in these texts is Umar bin
  Khattaab, "Ali" is Ali bin Abi Taalib, "Abu Bakr" is Abu Bakr Siddeeq.
- If not in the list, set `"id": null` and give `name` (fullest form the text
  supports, book's spelling, no titles like "Hadhrat"), `role`, and `sahabi`
  (`yes` / `no` / `unsure`).
- `role`: `subject` (acts, speaks or is the point of the narration — includes a
  narrator telling their own story), `narrator` (only relays it), `mentioned`.
- Leave out: unnamed people, scholars who only appear in the reference line,
  lineage ancestors in a genealogy.

### prophet
`subject`, `mentioned` or `absent`.

### themes / new_themes
2–5 approved theme ids for what the narration is *about* — what a reader would
search for. If an important topic has no approved id, add a short lowercase phrase
to `new_themes` (e.g. `"patience in illness"`, `"marriage"`). Prefer general,
reusable topics. Never tag what the text does not support.

### boundary
`ok`; `starts-mid` (begins mid-story); `ends-mid` (cut off); `merged` (contains two
or more separate reports); `not-narration` (editorial text, a glossary, an index).
Explain anything but `ok` in `notes`.
