export type CsvRow = (string | number | null | undefined)[];

const escapeCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

export const buildCsvContent = (headers: string[], rows: CsvRow[]): string => {
  const headerRow = headers.map(escapeCell).join(',');
  const body = rows.map((row) => row.map(escapeCell).join(',')).join('\n');
  return [headerRow, body].filter(Boolean).join('\n');
};

export const triggerCsvDownload = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToCsv = (filename: string, headers: string[], rows: CsvRow[]) => {
  const content = buildCsvContent(headers, rows);
  triggerCsvDownload(filename, content);
};

