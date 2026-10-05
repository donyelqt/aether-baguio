# data/

Two directories with opposite policies. Conflating them is how large binaries
end up in git history, which cannot be cleanly removed afterwards.

## `raw/` — source downloads. **Gitignored.**

Everything downloaded from a third party: Baguio Open Data, Geoportal
Philippines, OSM extracts. Checksummed on arrival.

Not committed, for three reasons:

- **Licence.** Geo terms are an open legal gate (PRD Q1). Committing the data
  would distribute it before the terms are cleared. Legal review is a gate, not
  a fix — and if terms turn out to be share-alike or restrict public release,
  the fallback is synthetic/approximate geometry for the public build with real
  data held privately (PRD R7). The simulation does not depend on survey
  accuracy.
- **Size.** Extracts are large and change without review value.
- **Provenance.** The *derived* artifact is what the app consumes; shipping the
  input as well means two things that can disagree.

Record the URL and a checksum per download so a build is reproducible without
the bytes being present.

## `world/` — derived build artifacts. **Committed.**

Versioned, diffable, cacheable, and small (PRD §6: 50–150 road segments,
10–20 landmarks). `MANIFEST.json` records the version, generator, seed, feature
counts, and source checksums, so FR-1.4's "versioned, reproducible build
artifact" has something concrete to point at.

Empty until the world build runs. A committed artifact with `"features": []` is
honest; a hand-edited geometry file that pretends to be generated is not.

## Not here

`runs/` holds replay recordings and metrics. It is gitignored because it is
regenerable from the event log (see `.gitignore`).