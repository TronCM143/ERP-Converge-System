# TODO - Fix BOM generation failure (varchar(20) truncation)

## Step 1
Update backend entity max lengths that are defined as `[MaxLength(20)]` for BOM generation (BOMNumber, Source, Unit).

## Step 2
Create an EF Core migration to alter affected PostgreSQL columns to larger sizes.

## Step 3
Apply migration (update DB schema).

## Step 4 (optional)
Improve frontend error handling to show backend message instead of generic `Failed to generate BOM.`

## Step 5
Test: trigger BOM generation from the Purchase Requests page and confirm the error is gone.

