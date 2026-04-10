# Source Rating Database Setup

Applies to baseline `0.1.0-beta.3`.

TAW's `/rate-source <index|url>` command reads a local SQLite database derived
from the SourceInfo project. The default path is:

```text
~/.config/taw/sources.db
```

The path can be overridden with `sourceRatings.dbPath` in
`~/.config/taw/config.json`.

## SourceInfo Build Flow

The SourceInfo repo has been cloned locally to:

```text
~/Projects/sourceinfo-repo
```

Its build/import scripts now resolve paths from their own repo root, so the repo
does not need to live at a fixed absolute path.

Rebuild the database from SourceInfo JSON data with:

```bash
cd ~/Projects/sourceinfo-repo
python3 scripts/build_database.py
python3 scripts/import_additional_sources.py
python3 scripts/import_chatgpt_recommendations.py
```

Verify a lookup:

```bash
python3 scripts/query_sources.py lookup reuters.com
```

Then refresh TAW's default copy:

```bash
mkdir -p ~/.config/taw
cp ~/Projects/sourceinfo-repo/data/sources.db ~/.config/taw/sources.db
```

The rebuilt database used for `0.1.0-beta.3` contains 222 sources.

## TAW Lookup Behavior

TAW normalizes URLs to a root domain before querying the database, so URLs such
as `https://edition.cnn.com/world/story` resolve against `cnn.com`.

The current implementation returns:

- source name
- NewsGuard-style quality score when present
- political lean label when present
- source type
- criteria metadata when present

If the domain is not present in the database, `/rate-source` prints an explicit
"source not found" message.

## Runtime Caveat

The current TypeScript lookup layer uses Node's experimental `node:sqlite`
module. It was verified locally on Node 22. A fallback SQLite dependency or a
stricter engine requirement should be considered before a wider release.
