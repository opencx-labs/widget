import { getSpreadsheet, SPREADSHEET_ACCEPT } from '../attachment-kind';

describe('getSpreadsheet', () => {
  describe('by MIME type', () => {
    it('classifies text/csv as csv', () => {
      expect(getSpreadsheet({ type: 'text/csv', name: 'export' })?.kind).toBe(
        'csv',
      );
    });

    it('classifies application/csv as csv', () => {
      expect(
        getSpreadsheet({ type: 'application/csv', name: 'export' })?.kind,
      ).toBe('csv');
    });

    it('classifies application/vnd.ms-excel as excel', () => {
      expect(
        getSpreadsheet({ type: 'application/vnd.ms-excel', name: 'book' })
          ?.kind,
      ).toBe('excel');
    });

    it('classifies the xlsx OpenXML type as excel', () => {
      expect(
        getSpreadsheet({
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          name: 'book',
        })?.kind,
      ).toBe('excel');
    });

    it('ignores MIME parameters and casing', () => {
      expect(
        getSpreadsheet({ type: 'TEXT/CSV; charset=utf-8', name: 'x' })?.kind,
      ).toBe('csv');
    });
  });

  describe('by file extension (extension wins over MIME)', () => {
    it('classifies a .csv name as csv even when type is octet-stream', () => {
      expect(
        getSpreadsheet({
          type: 'application/octet-stream',
          name: 'report.csv',
        })?.kind,
      ).toBe('csv');
    });

    it('classifies a .xls name as excel', () => {
      expect(getSpreadsheet({ type: '', name: 'legacy.xls' })?.kind).toBe(
        'excel',
      );
    });

    it('classifies a .xlsx name as excel', () => {
      expect(getSpreadsheet({ type: '', name: 'modern.xlsx' })?.kind).toBe(
        'excel',
      );
    });

    it('disambiguates a .csv reported with the .xls MIME type as csv', () => {
      // Browsers sometimes report a .csv as application/vnd.ms-excel — the
      // extension must take precedence so the label reads "CSV", not "Excel".
      expect(
        getSpreadsheet({
          type: 'application/vnd.ms-excel',
          name: 'data.csv',
        })?.kind,
      ).toBe('csv');
    });

    it('is case-insensitive on the extension', () => {
      expect(getSpreadsheet({ type: '', name: 'REPORT.CSV' })?.kind).toBe(
        'csv',
      );
      expect(getSpreadsheet({ type: '', name: 'Book.XLSX' })?.kind).toBe(
        'excel',
      );
    });
  });

  describe('descriptor exposes a human label', () => {
    it('labels csv as CSV', () => {
      expect(getSpreadsheet({ type: 'text/csv', name: 'x.csv' })?.label).toBe(
        'CSV',
      );
    });

    it('labels excel as Excel', () => {
      expect(getSpreadsheet({ type: '', name: 'x.xlsx' })?.label).toBe('Excel');
    });
  });

  describe('non-spreadsheets return null', () => {
    it('returns null for images', () => {
      expect(
        getSpreadsheet({ type: 'image/png', name: 'photo.png' }),
      ).toBeNull();
    });

    it('returns null for PDFs', () => {
      expect(
        getSpreadsheet({ type: 'application/pdf', name: 'doc.pdf' }),
      ).toBeNull();
    });

    it('returns null for plain text', () => {
      expect(
        getSpreadsheet({ type: 'text/plain', name: 'notes.txt' }),
      ).toBeNull();
    });

    it('returns null for an unknown type with no extension', () => {
      expect(
        getSpreadsheet({ type: 'application/octet-stream', name: 'blob' }),
      ).toBeNull();
    });

    it('returns null for empty type and empty name', () => {
      expect(getSpreadsheet({ type: '', name: '' })).toBeNull();
    });
  });
});

describe('SPREADSHEET_ACCEPT (react-dropzone accept map)', () => {
  it('maps every spreadsheet MIME type to dotted extensions', () => {
    expect(SPREADSHEET_ACCEPT).toEqual({
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls', '.xlsx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        '.xls',
        '.xlsx',
      ],
    });
  });

  it('uses dotted extensions as react-dropzone requires', () => {
    for (const exts of Object.values(SPREADSHEET_ACCEPT)) {
      for (const ext of exts) expect(ext.startsWith('.')).toBe(true);
    }
  });
});
