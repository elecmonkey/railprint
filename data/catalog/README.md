# Line catalog

Two files describe every railway section the map draws, divided the way the author divides the network:

- `lines.json`: one record per line: name, endpoints, category, and its correspondence with OSM. Hand-maintained, except the `osm` block, which `pnpm match confirm` writes.
- `paths.json`: the exact confirmed track path of each line, written by `pnpm match confirm`, one line of text per catalog line.

A third, `stations.json`, holds the station names the author has approved, see [Station names](#station-names).

Run `pnpm run catalog check` after editing.

## A line

```jsonc
{
  "id": "西延高铁/延安-西安东", // stable key, see below
  "name": "西延高铁", // display name
  "from": "延安", // endpoint, see notation
  "to": "西安东",
  "category": "emu", // emu | conventional | link
  "osm": {
    // correspondence with OSM, written on confirmation
    "from": "node/7765120777", // the OSM object the line starts at
    "to": "node/14007558344",
    "relations": [{ "id": 19529971, "name": "包西高速线" }], // relations the path follows
    "fixedRelations": true, // optional: the author chose `relations`; routing keeps them
    "confirmed": "2026-11-23",
  },
  "notes": ["…"], // optional: remarks and open questions
}
```

### Category

| Value          | Drawn                | Routed                     |
| -------------- | -------------------- | -------------------------- |
| `emu`          | red: lines with 动车 | prefers high-speed track   |
| `conventional` | black: 普速 lines    | prefers conventional track |
| `link`         | grey: 联络线         | either                     |

### Endpoint notation

| Written  | Meaning                                             |
| -------- | --------------------------------------------------- |
| `西安东` | station                                             |
| `<耿镇>` | junction (线路所), shown as `<耿镇>` on the map too |

### OSM endpoints

`osm.from` / `osm.to` are `node/<id>` or `way/<id>`: normally the station or junction found by name. Where OSM has no named object (for example the point where a link line meets a main line), it is a bare track node, chosen by hand; a note on the line says why.

### IDs

`id` is `<name>/<from>-<to>` with the endpoints as written (`蔡歌联络线/<K141>-歌乐山`), and validation enforces it: when a line's name or endpoints change, its id changes too, and the line's entry in `paths.json` is renamed with it.

## Station names

A station whose local name is not written in Simplified Chinese is listed in `stations.json` by its OSM object, with its local name and the Simplified Chinese name the author approves:

```jsonc
{
  "version": 1,
  "stations": {
    "node/7919700008": {
      "name": "香港西九龍",
      "zh": "香港西九龙",
      "lang": "zh-HK",
    },
  },
}
```

- `name` replaces the station's OSM name; `zh` is shown under it in a smaller size.
- `lang` picks the font for `name`: `zh-HK` is drawn in Noto Sans HK.
- A line ending at a listed station writes the endpoint by its local name, so the name is in its id too (`广深港高铁/广州南-香港西九龍`).
- Run `pnpm release` afterwards; it lists the characters of each language's names for its font.

## Correcting a line

1. Edit `name`, `from`, `to` or `category`. To re-route, remove the `osm` block (or keep only `from`/`to` to pin endpoints) and the line's entry in `paths.json`.
   To force a route along particular OSM lines (a branch through a station rather than the main line), set `osm.relations` to them and `osm.fixedRelations: true`.
2. `pnpm match <id>` and read `data/cache/matching/report.md`.
3. `pnpm match confirm <id>`, then `pnpm release`.

## Rules checked by `pnpm run catalog check`

- ids are unique and match the name and endpoints; no two lines repeat the same name and endpoints
- endpoints parse in the notation above, and differ from each other
- `category` is one of the three values; no unknown fields
- `osm` references are `node/<id>` or `way/<id>`; a confirmed line has both endpoints
- `stations.json` entries have a local name, a different Chinese name and a known `lang`; lines ending at them use the local name

## History

The initial 195 lines were imported on 2026-11-23 from the author's hand-drawn draft; names that differ only in 高速线 / 高铁 / 客专 / 城际 suffixes for the same section were merged into one line under a single name. On 2026-11-24 the draft's grouping (province, inter-province class) was replaced by `category`, and the OSM correspondence moved into this directory.
