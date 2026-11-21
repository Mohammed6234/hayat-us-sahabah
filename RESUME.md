# Status

All 4,375 narrations are tagged. Text the first extraction had swallowed (mid-page
footnotes, glued words, misread reference numbers) is restored; 35 endings the scan
itself lost are listed in `review/unreadable-endings.md`.

## Rebuild order
```
npm run fetch                      # archive.org text -> data/raw/
node pipeline/segment.mjs          # -> data/build/book.json
node pipeline/repair-endings.mjs   # completes cut-off endings from the source
node pipeline/rekey.mjs            # maps current ids to the ids each tagging run used
                                   # (data/build/book-v1.json, book-v2.json are kept for this)
node pipeline/apply-vocab.mjs      # tags: full/out (run 1), out2, out3 + vocab, merges, fixes
npm run build                      # site/data -> dist/
```
Tag new or changed narrations with the `narration-tagger` agent (`.claude/agents/`,
Read/Write/Bash only) and `pipeline/prompts/tag.md`; put the output in a new
`data/full/outN/` folder and add it to `apply-vocab.mjs`.

Vocabulary: `data/vocab/people.json`, `themes.json`, `merge.json` (spellings and `_ids`
duplicates), `ignore.json`, `person-fixes.json` (per-narration corrections, e.g. the four
Ibraheems). Review lists for a scholar: `review/`.
