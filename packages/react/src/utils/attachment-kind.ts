export type SpreadsheetKind = 'csv' | 'excel';

export type Spreadsheet = {
  kind: SpreadsheetKind;
  label: string;
  mimes: string[];
  extensions: string[];
};

// Browsers report spreadsheets inconsistently (a .csv can arrive as
// application/vnd.ms-excel or application/octet-stream), so match on file
// extension before MIME.
const SPREADSHEETS: Spreadsheet[] = [
  {
    kind: 'csv',
    label: 'CSV',
    mimes: ['text/csv', 'application/csv'],
    extensions: ['csv'],
  },
  {
    kind: 'excel',
    label: 'Excel',
    mimes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    extensions: ['xls', 'xlsx'],
  },
];

// react-dropzone accept map (MIME → dotted extensions), derived so the
// accepted types stay defined in one place.
export const SPREADSHEET_ACCEPT: Record<string, string[]> = Object.fromEntries(
  SPREADSHEETS.flatMap((sheet) =>
    sheet.mimes.map((mime) => [mime, sheet.extensions.map((ext) => `.${ext}`)]),
  ),
);

export function getSpreadsheet({
  type,
  name,
}: {
  type: string;
  name: string;
}): Spreadsheet | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const mime = type.toLowerCase().split(';')[0]?.trim() ?? '';
  // Extension wins over MIME, so check every extension before any MIME.
  return (
    SPREADSHEETS.find((sheet) => ext && sheet.extensions.includes(ext)) ??
    SPREADSHEETS.find((sheet) => mime && sheet.mimes.includes(mime)) ??
    null
  );
}
