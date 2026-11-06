export const PIECES = ['I','O','T','S','Z','J','L'] as const;
export type Piece = typeof PIECES[number];
export type Cell = readonly [number, number];
const spawn: Record<Piece, string[]> = {
  I: ['0000','1111','0000','0000'], O: ['0110','0110','0000','0000'],
  T: ['010','111','000'], S: ['011','110','000'], Z: ['110','011','000'], J: ['100','111','000'], L: ['001','111','000'],
};
export const SHAPES = Object.fromEntries(PIECES.map(p => {
  let matrix = spawn[p].map(row => [...row].map(Number));
  const rotations: Cell[][] = [];
  for (let r = 0; r < 4; r++) {
    rotations.push(matrix.flatMap((row,y) => row.flatMap((v,x) => v ? [[x,y] as Cell] : [])));
    if (p !== 'O') matrix = matrix[0].map((_,x) => matrix.map(row => row[x]).reverse());
  }
  return [p, rotations];
})) as Record<Piece, Cell[][]>;
// Standard SRS offsets. Source coordinate system is +y up; convert at the boundary.
const normal: Record<string, Cell[]> = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]], '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]], '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const iKicks: Record<string, Cell[]> = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]], '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]], '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]], '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};
export function kicks(piece: Piece, from: number, to: number): Cell[] {
  if (piece === 'O') return [[0,0]];
  return (piece === 'I' ? iKicks : normal)[`${from}>${to}`].map(([x,y]) => [x,-y]);
}
export function random(seed: number): [number, number] {
  let n = seed >>> 0 || 0x6d2b79f5;
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  return [n >>> 0, (n >>> 0) / 4294967296];
}
export function bag(seed: number): { seed: number; pieces: Piece[] } {
  const pieces: Piece[] = [...PIECES];
  for (let i = 6; i > 0; i--) {
    let r: number; [seed,r] = random(seed); const j = Math.floor(r * (i+1));
    [pieces[i],pieces[j]] = [pieces[j],pieces[i]];
  }
  return { seed, pieces };
}
