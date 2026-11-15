// Kiln Yard, the one map, as data: a 48 x 38 grid of 2 m cells and the named places the bots
// and the HUD use. Raiders start south and attack; Wardens start north between the two sites.
//   #  building wall        .  open yard          ,  roofed tunnel floor
//   a  A site floor         b  B site floor       c  low crate (jump on it)
//   C  shipping container   h  concrete barrier
export const CELL = 2;
export const ROOF_HEIGHT = 3.4;

export const GRID = [
  '################################################',
  '#################..............#################',
  '##bbbbbbbbbbbbb.................#aaaaaaaaaaaaa##',
  '##bcCbbbbb#bbbb....cc.......c...#aaaaaaaaaccaa##',
  '##bbbbbbbb#bbbb.................aaaaaaaaaaaCaa##',
  '##bbbbCCbbbbbbb##..............#aaaaaaaaaaaaaa##',
  '##bbbcCCcbbbbbb##..............#aaaaaCCaaaaaaa##',
  '##bbbbbbbbbbbbb######......#####aaaacCCcaaaaaa##',
  '##bbbbbbbbbbbbb######......#####aaaaaaaaaaaaaa##',
  '##bbbbbbbbbhhbb######...Cc.#####aaaaaaaaaaaaaa##',
  '##ccbbbbbbbbbbb######......#####ahhaaaaaaaaaca##',
  '##bbbbbbbbbbbbb######...........aaaaaaaaaaaaca##',
  '##bbbbbbbbbbbbb######...........aaaaaaaahhaaaa##',
  '##,,,,,,#############.....c.....aaaaaaaaaaaaaa##',
  '##,,,,,,#############......############.......##',
  '##,,,,,,#############......############.......##',
  '##,,,,,,,,,,,,,,,,,,,......############.......##',
  '##,,,,,,,,,,C,,,,,,,,......############.....cC##',
  '##,,,,,,,,,,,,,,,,,,,......############.......##',
  '##,,,,,,###############..##############.......##',
  '##,,#,,,#############......############.......##',
  '##,,,,,,#############......############.......##',
  '##,,,,,,#############......##############...####',
  '##,,,,,,#############......############.......##',
  '##,,,c,,#############c.....############.......##',
  '##,,,,,,#############......############.......##',
  '##,,,,,,#############......############.......##',
  '##,,,,,,#############......############.......##',
  '##,,,,,,#############......############.c.....##',
  '##,,,,,,,,,,,,,######......############.......##',
  '##,,,,,,,,,,,,,..................######.......##',
  '#######,,,,,,,,...............................##',
  '#######,,,,,,,,.............cc................##',
  '#######,,,,,,,,...cC..........................##',
  '###############.........................########',
  '###############.........................########',
  '###############..................###############',
  '################################################',
];

// Solid top of each blocking tile; walls get their height per building in world.js.
export const TILE_TOP = { c: 1.0, C: 2.4, h: 1.0 };

export const TEAMS = ['Raiders', 'Wardens'];
export const RAIDERS = 0;
export const WARDENS = 1;

export const SPAWNS = [
  [[21, 34], [23, 34], [25, 34], [27, 34], [22, 35], [24, 35], [26, 35], [28, 35], [20, 33], [29, 34]],
  [[21, 2], [23, 2], [25, 2], [27, 2], [22, 4], [24, 4], [26, 4], [28, 5], [20, 5], [24, 1]],
];

// Each site: where a planter heads, where Wardens hold it (cell, then the cell they watch) and
// where Raiders sit after the plant.
export const SITES = [
  {
    name: 'A',
    tile: 'a',
    plant: [38, 9],
    holds: [[[35, 4], [32, 12]], [[40, 9], [42, 14]], [[44, 6], [40, 13]], [[43, 16], [42, 30]]],
    post: [[33, 5], [44, 12], [36, 12]],
  },
  {
    name: 'B',
    tile: 'b',
    plant: [7, 8],
    holds: [[[5, 4], [4, 13]], [[9, 7], [5, 13]], [[12, 11], [5, 13]], [[23, 8], [24, 20]]],
    post: [[3, 8], [12, 4], [9, 11]],
  },
];

// Raider approaches. `smoke` is the step at which a Raider holding a smoke throws it, and where.
export const ROUTES = [
  { site: 0, name: 'Long', path: [[42, 32], [42, 25], [42, 19], [41, 13], [38, 9]], smoke: [2, [41, 10]] },
  { site: 0, name: 'Catwalk', path: [[24, 30], [24, 21], [24, 15], [28, 12], [34, 11]], smoke: [2, [33, 8]] },
  { site: 1, name: 'Tunnels', path: [[12, 31], [4, 28], [4, 18], [4, 14], [7, 8]], smoke: [2, [5, 10]] },
  { site: 1, name: 'Connector', path: [[24, 30], [24, 21], [17, 17], [6, 17], [4, 14], [8, 8]], smoke: [3, [5, 10]] },
];

// Callouts for the HUD's location readout; the first rectangle that holds a cell names it.
export const CALLOUTS = [
  ['Warden Spawn', 17, 1, 30, 6],
  ['A Site', 32, 2, 45, 13],
  ['B Site', 2, 2, 16, 12],
  ['Catwalk', 27, 11, 31, 13],
  ['Mid Doors', 21, 18, 26, 20],
  ['Mid', 21, 7, 26, 29],
  ['Long A', 39, 14, 45, 33],
  ['Connector', 8, 16, 20, 18],
  ['B Tunnels', 2, 13, 14, 33],
  ['Raider Spawn', 15, 30, 40, 36],
];
