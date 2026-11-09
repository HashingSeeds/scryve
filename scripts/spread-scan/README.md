# Spread scan spike

Can one photo of a spread-out deck add every card at once? These scripts read photos with Vision on a Mac and score the names against the real list. Results and photos are in the PR that added this folder.

```bash
cd scripts/spread-scan
swiftc -O read-spread.swift -o read-spread
./read-spread 90 2 a-rows.heic b-messy.heic ... > reads.json   # turn step in degrees, tile grid
curl -s https://api.scryfall.com/catalog/card-names > names.json
pnpm tsx eval.ts names.json reads.json
```

Each photo's file name starts with `a`, `b`, or `c`, the deck section in `truth.json` it shows. `90 2` (four quarter turns, 2x2 overlapping tiles) scored best.
