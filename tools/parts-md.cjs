// Writes reference/parts.md from the part library in src/lego.js, so the list never drifts.
//   node tools/parts-md.cjs
const fs = require('fs');
const path = require('path');
global.window = global;
require(path.resolve(__dirname, '../src/lego.js'));
const LEGO = window.LEGO;
const P = LEGO.PLATE;

const kind = (d) => {
  if (d.kind === 'cyl') return 'круглая';
  if (d.profile.length === 4) return d.studs.length ? 'коробка' : 'плитка';
  if (d.id === '3044c') return 'конек';
  return d.profile.length > 6 ? 'изогнутый скос' : 'скос';
};
const studs = (d) => {
  const up = d.studs.filter((s) => !s[3]).length;
  const side = d.studs.length - up;
  return up + (side ? ` + ${side} сбоку` : '');
};

const rows = LEGO.ORDER.map((id) => {
  const d = LEGO.LIB[id];
  return `| ${id} | ${d.ru} | ${d.w} × ${d.d} | ${Math.round(d.h / P)} | ${kind(d)} | ${studs(d)} |`;
});
const colors = Object.values(LEGO.COLORS).map((c) => `| \`${c.key}\` | ${c.name} | ${c.ru} | ${c.hex} |`);

const md = `# Детали и цвета lego.js

Файл собирается командой \`node tools/parts-md.cjs\` из библиотеки в \`src/lego.js\`.
Номера деталей такие же, как в каталоге BrickLink.

## Детали

Ширина идет по x, глубина по y, до поворота. Высота считается в пластинах, кирпич равен трем пластинам.

| Номер | Деталь | Ширина × глубина | Высота | Форма | Шипы |
|---|---|---|---|---|---|
${rows.join('\n')}

Особенности отдельных деталей
- 3040, 3039 скосы низкой стороной к -y, шипы в заднем ряду.
- 11477, 15068 изогнутые скосы спадают к -y, шипов нет.
- 3044c двойной скос, треугольник виден с торцов. Поверните на \`rot: 1\`, и треугольник смотрит вперед (так сделаны кошачьи уши).
- 87087 кирпич с шипом на передней грани (-y), центр шипа на 0.7 от низа кирпича.
- 3700, 3701 отверстия техника на длинных гранях, на той же высоте 0.7.
- 4032, 3941 с отверстием под ось между шипами.

## Цвета

Проверяйте по каталогу, что деталь выпускается в нужном цвете, см. modeling.md.

| Ключ | BrickLink | По-русски | Цвет на экране |
|---|---|---|---|
${colors.join('\n')}
`;
fs.writeFileSync(path.resolve(__dirname, '../reference/parts.md'), md);
console.log('reference/parts.md', LEGO.ORDER.length, 'parts');
