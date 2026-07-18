import { TargetSchema } from "@/core/schema/mappingTypes";

export const BOM_TARGET_SCHEMA: TargetSchema = {
  fields: [
    {
      key: "part_number",
      label: "Part number",
      aliases: ["part number", "part #", "part no", "pn", "item number"],
      required: true,
    },
    {
      key: "description",
      label: "Description",
      aliases: ["description", "part description", "desc"],
    },
    {
      key: "quantity_per",
      label: "Quantity per",
      aliases: ["quantity per", "qty", "qty per", "quantity"],
      required: true,
    },
  ],
};

export const PO_TARGET_SCHEMA: TargetSchema = {
  fields: [
    {
      key: "po_number",
      label: "PO number",
      aliases: ["po number", "po #", "purchase order number", "po no"],
      required: true,
    },
    {
      key: "supplier_name",
      label: "Supplier",
      aliases: ["supplier", "supplier name", "vendor", "vendor name"],
      required: true,
    },
    {
      key: "part_number",
      label: "Part number",
      aliases: ["part number", "part #", "pn", "item number"],
      required: true,
    },
    {
      key: "quantity_open",
      label: "Quantity open",
      aliases: ["quantity open", "qty open", "open qty", "qty"],
      required: true,
    },
    {
      key: "unit_price",
      label: "Unit price",
      aliases: ["unit price", "price", "unit cost"],
      required: true,
    },
    {
      key: "transaction_currency",
      label: "Currency",
      aliases: ["currency", "curr", "ccy"],
      required: true,
    },
    {
      key: "promised_receipt_date",
      label: "Promised receipt date",
      aliases: ["promised receipt date", "receipt date", "promise date", "eta"],
    },
  ],
};

export const SUPPLIER_TARGET_SCHEMA: TargetSchema = {
  fields: [
    {
      key: "supplier_name",
      label: "Supplier name",
      aliases: ["supplier", "supplier name", "vendor", "vendor name"],
      required: true,
    },
    {
      key: "erp_supplier_id",
      label: "ERP supplier ID",
      aliases: ["erp supplier id", "vendor id", "supplier id"],
    },
    {
      key: "ncnr",
      label: "NCNR",
      aliases: ["ncnr", "non-cancellable"],
    },
    {
      key: "standard_lead_time_days",
      label: "Standard lead time (days)",
      aliases: ["lead time", "lead time days", "standard lead time"],
    },
    {
      key: "cancellation_window_days",
      label: "Cancellation window (days)",
      aliases: ["cancellation window", "cancellation window days"],
    },
    {
      key: "terms_source",
      label: "Terms source",
      aliases: ["terms source", "source"],
    },
  ],
};
