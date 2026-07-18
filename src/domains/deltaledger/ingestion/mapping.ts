import { RawTable } from "@/core/ingestion/types";
import { ColumnMapping } from "@/core/schema/mappingTypes";
import { buildColumnMappings } from "@/core/schema/headerDetection";
import { BOM_TARGET_SCHEMA, PO_TARGET_SCHEMA, SUPPLIER_TARGET_SCHEMA } from "../schema";

export function buildBomColumnMappings(table: RawTable): ColumnMapping[] {
  return buildColumnMappings(table, BOM_TARGET_SCHEMA);
}

export function buildPoColumnMappings(table: RawTable): ColumnMapping[] {
  return buildColumnMappings(table, PO_TARGET_SCHEMA);
}

export function buildSupplierColumnMappings(table: RawTable): ColumnMapping[] {
  return buildColumnMappings(table, SUPPLIER_TARGET_SCHEMA);
}
