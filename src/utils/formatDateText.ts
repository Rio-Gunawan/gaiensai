export const formatDateText = (date: string[]) => {
  if (date.length === 0) {
    return '';
  }

  const toParts = (dateText: string) => {
    const [year, month, day] = dateText
      .split('-')
      .map((value) => Number(value));
    return { year, month, day };
  };

  const first = toParts(date[0]);
  const last = toParts(date[date.length - 1]);

  if (first.year === last.year && first.month === last.month) {
    return `${first.year}/${first.month}/${first.day}~${last.day}`;
  }

  return `${first.year}/${first.month}/${first.day}~${last.year}/${last.month}/${last.day}`;
};
