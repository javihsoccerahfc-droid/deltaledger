// Fully generic ingestion types. Nothing in src/core may reference domain
// vocabulary (debtor, invoice, aging, concentration, etc.) — that belongs in
// src/domains/*.

export interface RawTable {
  headers: string[];
  rows: (string | number | null)[][];
}

export interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
}

export interface SourceDescriptor {
  fileName: string;
  sheetName: string;
  isUploaded: boolean; // true = a real user-provided file, false = a bundled demo case
}
