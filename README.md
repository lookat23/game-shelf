# Game Shelf

`game-shelf` is a browser game collection. It currently includes `四子棋 / Drop Four` and `坦克大战 / Tank Battle`.

## Games

- `四子棋 / Drop Four`: choose a column, drop a piece to the lowest open slot, and connect four horizontally, vertically, or diagonally.
- `坦克大战 / Tank Battle`: defend the base through 10 Canvas levels with random maps, brick cover, mobile controls, and sound effects.

Routes:

- `/games/drop-four`
- `/games/tank-battle`

## Audio Credits

Tank Battle uses sounds from [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds), released under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). A local license note is stored at `public/games/tank-battle/audio/LICENSE-KENNEY.txt`.

Included sound mapping:

- `shoot.ogg`: `Audio/pluck_001.ogg`
- `hit.ogg`: `Audio/click_003.ogg`
- `break.ogg`: `Audio/drop_004.ogg`
- `explode.ogg`: `Audio/glitch_002.ogg`
- `level-clear.ogg`: `Audio/confirmation_003.ogg`
- `fail.ogg`: `Audio/error_004.ogg`

## Commands

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Run the production build:

```sh
npm run build
```

Run rule tests:

```sh
npm test
```

Run browser E2E tests:

```sh
npm run test:e2e
```

If Playwright browsers are not installed yet, run:

```sh
npx playwright install chromium
```
