-- Adds a genuine, reusable read-only capability to engineering changes -- not a demo-specific
-- column. Any EC can be locked (an archived/finalized record, a scenario shared for audit,
-- etc.); the Nova Robotics demonstration scenario is simply the first row that sets it.
-- Enforced at the Server Action layer (src/domains/deltaledger/readOnly.ts), never only in the
-- UI. Defaults to false so every existing and newly-created engineering change is unaffected.
ALTER TABLE "engineering_changes" ADD COLUMN "is_read_only" boolean DEFAULT false NOT NULL;
