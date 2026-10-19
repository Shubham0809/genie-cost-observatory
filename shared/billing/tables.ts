export type SortDirection = 'asc' | 'desc';

export interface PageResult<T> {
  rows: T[];
  page: number;
  pageCount: number;
  total: number;
}

function sortableString(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function compareValues(left: unknown, right: unknown): number {
  const leftNumber = typeof left === 'number' ? left : Number(left);
  const rightNumber = typeof right === 'number' ? right : Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return sortableString(left).localeCompare(sortableString(right), undefined, { sensitivity: 'base' });
}

export function sortRows<T>(rows: T[], key: keyof T, direction: SortDirection): T[] {
  const copy = [...rows];
  copy.sort((left, right) => {
    const result = compareValues(left[key], right[key]);
    return direction === 'asc' ? result : -result;
  });
  return copy;
}

export function paginateRows<T>(rows: T[], page: number, pageSize: number): PageResult<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
  const start = currentPage * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page: currentPage,
    pageCount,
    total,
  };
}

export function searchRows<T>(rows: T[], term: string, fields: Array<keyof T>): T[] {
  const needle = term.trim().toLowerCase();
  if (!needle) {
    return rows;
  }
  return rows.filter((row) =>
    fields.some((field) =>
      String(row[field] ?? '')
        .toLowerCase()
        .includes(needle)
    )
  );
}
