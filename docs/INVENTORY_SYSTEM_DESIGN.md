# Manufacturing Inventory & WIP Tracking System
## Database Schema & Implementation Design

---

## 1. Database Schema (MongoDB Collections)

### 1.1 `inventory_items` - Master Item Catalog
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "sku": "SCR-SS-M6-25",           // Unique SKU code
  "name": "Stainless Steel Screw M6x25",
  "description": "M6 x 25mm stainless steel screw for rim assembly",
  "category": "component",          // "component" | "consumable" | "finished_good"
  "unit_of_measure": "each",        // "each" | "lbs" | "kg" | "ft" | "meters"
  "track_individually": false,      // true for high-value items (steering wheel cores)
  "barcode_type": "sku",            // "sku" (batch) | "individual"
  "default_location": "assembly",   // Default department
  "cost_per_unit": 0.15,            // Average cost
  "total_cost_value": 150.00,       // Running total cost
  "total_quantity": 1000,           // Running total quantity
  "reorder_point": 500,             // Minimum stock alert threshold
  "reorder_quantity": 2000,         // Suggested reorder amount
  "supplier": "FastenerCo",
  "supplier_sku": "SSCRM6-25",
  "is_active": true,
  "created_at": ISODate,
  "updated_at": ISODate
}
```

### 1.2 `inventory_locations` - Departments/Locations
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "code": "assembly",               // Unique code
  "name": "Assembly Department",
  "description": "Final wheel assembly area",
  "location_type": "production",    // "production" | "storage" | "shipping" | "receiving"
  "is_active": true,
  "created_at": ISODate
}
```

### 1.3 `inventory_stock` - Current Stock Levels Per Location
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "item_id": "uuid",                // Reference to inventory_items
  "location_id": "uuid",            // Reference to inventory_locations
  "quantity": 500,
  "reserved_quantity": 50,          // Reserved for pick lists
  "available_quantity": 450,        // quantity - reserved
  "last_count_date": ISODate,       // Last physical count
  "last_count_quantity": 500,
  "updated_at": ISODate
}
```

### 1.4 `inventory_serial_items` - Individual Tracked Items
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "item_id": "uuid",                // Reference to inventory_items
  "serial_number": "SWC-2024-00001",
  "barcode": "SWC202400001",        // Scannable barcode
  "location_id": "uuid",
  "status": "in_stock",             // "in_stock" | "reserved" | "in_use" | "shipped" | "scrapped"
  "order_id": null,                 // Linked order when reserved/used
  "cost": 250.00,                   // Actual cost of this unit
  "received_date": ISODate,
  "notes": "",
  "created_at": ISODate,
  "updated_at": ISODate
}
```

### 1.5 `inventory_transactions` - All Movement History
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "transaction_type": "pick",       // "receive" | "pick" | "transfer" | "adjust" | "return" | "scrap"
  "item_id": "uuid",
  "serial_id": null,                // For individually tracked items
  "from_location_id": "uuid",       // Null for receives
  "to_location_id": "uuid",         // Null for picks/scraps
  "quantity": 40,
  "unit_cost": 0.15,
  "total_cost": 6.00,
  "order_id": "uuid",               // Linked order (for picks)
  "pick_list_id": "uuid",           // Linked pick list
  "reference_number": "PO-2024-001",// PO number, adjustment reason, etc.
  "notes": "Picked for order 8769",
  "performed_by": "uuid",           // User who performed action
  "performed_by_name": "John Doe",
  "created_at": ISODate
}
```

### 1.6 `bill_of_materials` - Product Recipes
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "name": "Standard 22\" Rim Assembly",
  "product_type": "rim",            // Links to order product_type
  "model_code": "RIM-22-STD",       // Optional model variant
  "rim_size": "22",                 // Optional - for size-specific BOMs
  "description": "Standard 22 inch rim with chrome lip",
  "is_default": true,               // Default BOM for this product type
  "is_active": true,
  "created_at": ISODate,
  "updated_at": ISODate
}
```

### 1.7 `bom_components` - Components in Each BOM
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "bom_id": "uuid",                 // Reference to bill_of_materials
  "item_id": "uuid",                // Reference to inventory_items
  "quantity": 40,                   // Quantity needed
  "unit_of_measure": "each",
  "is_optional": false,
  "notes": "Use stainless for coastal orders",
  "created_at": ISODate
}
```

### 1.8 `pick_lists` - Pick and Verify Lists
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "pick_list_number": "PL-2024-00001",
  "order_id": "uuid",               // Linked order
  "order_number": "8769",
  "bom_id": "uuid",                 // BOM used to generate
  "status": "pending",              // "pending" | "in_progress" | "completed" | "cancelled"
  "assigned_to": "uuid",            // Assigned staff member
  "assigned_to_name": "John Doe",
  "created_by": "uuid",
  "created_by_name": "Manager",
  "started_at": null,
  "completed_at": null,
  "notes": "",
  "created_at": ISODate,
  "updated_at": ISODate
}
```

### 1.9 `pick_list_items` - Items to Pick
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "pick_list_id": "uuid",
  "item_id": "uuid",
  "item_sku": "SCR-SS-M6-25",
  "item_name": "Stainless Steel Screw M6x25",
  "location_id": "uuid",
  "location_name": "Assembly",
  "quantity_required": 40,
  "quantity_picked": 0,
  "quantity_short": 0,              // If not enough in stock
  "serial_id": null,                // For individual items
  "serial_number": null,
  "status": "pending",              // "pending" | "picked" | "short" | "skipped"
  "picked_by": null,
  "picked_at": null,
  "scanned_barcode": null,          // Actual barcode scanned
  "notes": ""
}
```

### 1.10 `stock_alerts` - Minimum Stock Notifications
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "item_id": "uuid",
  "item_sku": "PWD-BLK-001",
  "item_name": "Black Powder Coat",
  "alert_type": "low_stock",        // "low_stock" | "out_of_stock" | "overstock"
  "threshold": 5,
  "current_quantity": 3.5,
  "unit_of_measure": "lbs",
  "is_acknowledged": false,
  "acknowledged_by": null,
  "acknowledged_at": null,
  "created_at": ISODate
}
```

### 1.11 `api_keys` - External Integration Keys
```javascript
{
  "_id": ObjectId,
  "id": "uuid",
  "name": "QuickBooks Integration",
  "key_hash": "hashed_api_key",     // Hashed for security
  "key_prefix": "cf_live_abc",      // First 12 chars for identification
  "permissions": ["inventory:read", "inventory:write", "reports:read"],
  "is_active": true,
  "last_used_at": null,
  "created_by": "uuid",
  "created_at": ISODate,
  "expires_at": null                // Optional expiration
}
```

---

## 2. Department Locations (Pre-populated)

| Code | Name | Type |
|------|------|------|
| `receiving` | Receiving | receiving |
| `powder_coat` | Powder Coat | production |
| `polish` | Polish | production |
| `finishing` | Finishing | production |
| `assembly` | Assembly | production |
| `steering_wheels` | Steering Wheels | production |
| `wheel_caps` | Wheel Caps | production |
| `shipping` | Shipping | shipping |
| `storage` | General Storage | storage |

---

## 3. REST API Endpoints

### Items & Catalog
- `GET /api/inventory/items` - List all items (with filters)
- `POST /api/inventory/items` - Create item
- `GET /api/inventory/items/{id}` - Get item details
- `PUT /api/inventory/items/{id}` - Update item
- `DELETE /api/inventory/items/{id}` - Deactivate item

### Stock Levels
- `GET /api/inventory/stock` - Current stock by location
- `GET /api/inventory/stock/item/{item_id}` - Stock for specific item
- `GET /api/inventory/stock/location/{location_id}` - Stock at location

### Transactions
- `POST /api/inventory/receive` - Receive inventory
- `POST /api/inventory/transfer` - Transfer between locations
- `POST /api/inventory/adjust` - Manual adjustment (Manager only)
- `POST /api/inventory/pick` - Pick/scan out for order
- `GET /api/inventory/transactions` - Transaction history

### Bill of Materials
- `GET /api/inventory/bom` - List all BOMs
- `POST /api/inventory/bom` - Create BOM
- `PUT /api/inventory/bom/{id}` - Update BOM
- `GET /api/inventory/bom/{id}/components` - Get BOM components

### Pick Lists
- `POST /api/inventory/pick-list/generate` - Generate from order + BOM
- `GET /api/inventory/pick-list/{id}` - Get pick list details
- `PUT /api/inventory/pick-list/{id}/scan` - Scan item (pick)
- `PUT /api/inventory/pick-list/{id}/complete` - Complete pick list

### Reports & Export
- `GET /api/inventory/reports/stock-levels` - Current stock report
- `GET /api/inventory/reports/valuation` - Inventory valuation (avg cost)
- `GET /api/inventory/reports/movements` - Movement report
- `GET /api/inventory/reports/export/csv` - Export to CSV

### API Keys (Manager only)
- `GET /api/inventory/api-keys` - List API keys
- `POST /api/inventory/api-keys` - Generate new key
- `DELETE /api/inventory/api-keys/{id}` - Revoke key

### Alerts
- `GET /api/inventory/alerts` - Get active alerts
- `PUT /api/inventory/alerts/{id}/acknowledge` - Acknowledge alert

### CSV Import
- `POST /api/inventory/import/items` - Import items from CSV
- `POST /api/inventory/import/stock` - Import initial stock from CSV

---

## 4. Scan In/Scan Out Workflow

### Mobile Scanning Interface
1. Staff opens "Inventory Scanner" on mobile browser
2. Camera activates for barcode scanning
3. Scans item barcode:
   - **SKU Barcode**: Shows item, asks for quantity
   - **Individual Barcode**: Shows specific unit details
4. Select action: Receive | Transfer | Pick for Order
5. Confirm and submit

### Pick and Verify Workflow
1. Manager creates Pick List from Order
2. System generates list based on BOM
3. Staff assigned to Pick List
4. Staff scans each item:
   - System validates barcode matches expected item
   - Quantity entered/confirmed
   - Stock deducted only after successful scan
5. Short items flagged for manager review
6. Pick List completed when all items scanned

---

## 5. Average Cost Calculation

When receiving inventory:
```
New Average Cost = (Existing Total Value + New Purchase Value) / (Existing Qty + New Qty)

Example:
- Current: 100 screws @ $0.10 avg = $10.00 total
- Receiving: 200 screws @ $0.12 = $24.00
- New Average: ($10.00 + $24.00) / (100 + 200) = $0.1133
```

---

## 6. Barcode Format Suggestions

### SKU Barcodes (Batch Items)
- Format: `SKU-{CATEGORY}-{ID}`
- Example: `SKU-SCR-001` for screws
- Can print labels with SKU + description

### Individual Barcodes (High-Value)
- Format: `{TYPE}{YEAR}{SEQUENCE}`
- Example: `SWC202400001` for Steering Wheel Core #1 of 2024

---

## 7. Implementation Phases

### Phase 1: Core Database & API
- [ ] Create all MongoDB collections with indexes
- [ ] Implement item CRUD endpoints
- [ ] Implement location management
- [ ] Implement stock level tracking

### Phase 2: Transactions & Movements
- [ ] Receive inventory endpoint
- [ ] Transfer between locations
- [ ] Manual adjustments (with audit trail)
- [ ] Transaction history

### Phase 3: BOM & Pick Lists
- [ ] BOM creation and management
- [ ] Pick list generation from orders
- [ ] Pick/scan verification endpoint
- [ ] Order integration

### Phase 4: Mobile Scanner UI
- [ ] Camera barcode scanning (quagga2 or html5-qrcode)
- [ ] Mobile-optimized pick list interface
- [ ] Quantity input and confirmation

### Phase 5: Reports & Integration
- [ ] Stock level reports
- [ ] Valuation reports (average cost)
- [ ] CSV export functionality
- [ ] API key management for QuickBooks
- [ ] Stock alerts system

### Phase 6: CSV Import
- [ ] Item import from CSV
- [ ] Initial stock import
- [ ] Validation and error handling
