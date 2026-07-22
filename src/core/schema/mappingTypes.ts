export interface FieldSpec {
  key: string;
  label: string;
  aliases: string[]; // lowercase alias strings used for header matching
  required?: boolean;
}

export interface TargetSchema {
  fields: FieldSpec[];
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string | "unmapped";
  confidence: number; // 0-1, mocked AI confidence score
  sampleValues: string[];
}
