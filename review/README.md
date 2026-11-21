# Review for a scholar

Done since the first review list: bare names default to the main Companion (Hasan → Hasan bin Ali RA; Urwa → Urwa bin Zubayr; Zaid → Zaid bin Haaritha; and the others chosen by the owner), the four different Ibraheems are separated, spelling duplicates are merged, nothing is hidden from the Companion list, and the text the extractor had swallowed (≈64,000 words) is restored. `unreadable-endings.md` lists the 35 endings the scan itself lost.

Everything on the site was tagged by AI and has not been checked. These lists are
where checking matters most, highest-impact first.

1. `people-to-check.csv` — people marked `unsure`, ambiguous bare names ("Urwa",
   "Hasan", "Mu'aawiya"), and people with a note (e.g. text gives "(RA)" but the person
   is usually counted a Taabi'ee). Sorted by how many narrations they appear in.
   Ambiguous names are hidden from the site's Companion menu until resolved.
2. `companions-added-automatically.csv` — people the tagging added as Companions
   (`sahabi: yes`) on the strength of the text. Check status and spot duplicates
   spelled differently (e.g. "Sawaad / Sawaadah bin Amr").
3. `narration-boundaries.csv` — narrations the tagger thought were split wrongly.
   `merged` is mostly the author attaching variant reports ("Another narration
   states…") to the main one, which is the book's own arrangement; `ends-mid` /
   `starts-mid` are more likely real splitting errors.

Known source issues the taggers flagged (check against the printed book):
n02133 (speaker named Juwayriyyah in a story about Faatima's proposal),
n02140 (heading says Abdullaah bin Amr, narrator is Rabee'ah),
n02145 / n02148 (Aa'isha's dowry 480 vs 500), n03362 (Ja'far bin Muhammad "from his
grandfather" Ali), n03655 (heading Ibn Mas'ood, text addresses Abu Qataadah),
n00549 ("demise of Hadhrat Bilaal" probably means the Prophet ﷺ).

How to fix: edit `data/vocab/people.json` (status, notes), `data/vocab/merge.json`
(duplicates: `"_ids": {"wrong-id": "right-id"}`), then
`node pipeline/apply-vocab.mjs && npm run build`.
