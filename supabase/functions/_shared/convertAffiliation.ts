export function encodeAffiliation(affiliation: number): number {
  const grade = Math.floor(affiliation / 1000); // 1桁
  const classNum = Math.floor((affiliation % 1000) / 100); // 1桁
  const number = affiliation % 100; // 2桁

  // バリデーション（必要に応じて）
  if (grade < 0 || grade > 3) {
    throw new Error('grade out of range');
  }
  if (classNum < 0 || classNum > 7) {
    throw new Error('class out of range');
  }
  if (number < 0 || number > 63) {
    throw new Error('number out of range');
  }

  // ビット詰め
  return (grade << 9) | (classNum << 6) | number;
}

export function decodeAffiliation(bits: number): number {
  const grade = (bits >> 9) & 0b11; // 上2bit
  const classNum = (bits >> 6) & 0b111; // 次3bit
  const number = bits & 0b111111; // 下6bit

  return grade * 1000 + classNum * 100 + number;
}
