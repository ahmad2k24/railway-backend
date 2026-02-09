# Inventory System Pydantic Models
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum

# ============ ENUMS ============

class ItemCategory(str, Enum):
    COMPONENT = "component"
    CONSUMABLE = "consumable"
    FINISHED_GOOD = "finished_good"

class UnitOfMeasure(str, Enum):
    EACH = "each"
    LBS = "lbs"
    KG = "kg"
    FT = "ft"
    METERS = "meters"
    GALLONS = "gallons"
    LITERS = "liters"

class BarcodeType(str, Enum):
    SKU = "sku"
    INDIVIDUAL = "individual"

class LocationType(str, Enum):
    PRODUCTION = "production"
    STORAGE = "storage"
    SHIPPING = "shipping"
    RECEIVING = "receiving"

class TransactionType(str, Enum):
    RECEIVE = "receive"
    PICK = "pick"
    TRANSFER = "transfer"
    ADJUST = "adjust"
    RETURN = "return"
    SCRAP = "scrap"

class SerialItemStatus(str, Enum):
    IN_STOCK = "in_stock"
    RESERVED = "reserved"
    IN_USE = "in_use"
    SHIPPED = "shipped"
    SCRAPPED = "scrapped"

class PickListStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class PickItemStatus(str, Enum):
    PENDING = "pending"
    PICKED = "picked"
    SHORT = "short"
    SKIPPED = "skipped"

class AlertType(str, Enum):
    LOW_STOCK = "low_stock"
    OUT_OF_STOCK = "out_of_stock"
    OVERSTOCK = "overstock"

# ============ INVENTORY ITEMS ============

class InventoryItemCreate(BaseModel):
    sku: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    category: ItemCategory = ItemCategory.COMPONENT
    unit_of_measure: UnitOfMeasure = UnitOfMeasure.EACH
    track_individually: bool = False
    barcode_type: BarcodeType = BarcodeType.SKU
    default_location: Optional[str] = None
    cost_per_unit: float = 0.0
    sell_price: float = 0.0  # What you sell it for - profit = sell_price - cost
    reorder_point: Optional[float] = None
    reorder_quantity: Optional[float] = None
    supplier: Optional[str] = None
    supplier_sku: Optional[str] = None

class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[ItemCategory] = None
    unit_of_measure: Optional[UnitOfMeasure] = None
    track_individually: Optional[bool] = None
    barcode_type: Optional[BarcodeType] = None
    default_location: Optional[str] = None
    cost_per_unit: Optional[float] = None
    sell_price: Optional[float] = None
    reorder_point: Optional[float] = None
    reorder_quantity: Optional[float] = None
    supplier: Optional[str] = None
    supplier_sku: Optional[str] = None
    is_active: Optional[bool] = None

class InventoryItemResponse(BaseModel):
    id: str
    sku: str
    name: str
    description: Optional[str]
    category: str
    unit_of_measure: str
    track_individually: bool
    barcode_type: str
    default_location: Optional[str]
    cost_per_unit: float
    sell_price: Optional[float] = 0
    total_cost_value: float
    total_quantity: float
    reorder_point: Optional[float]
    reorder_quantity: Optional[float]
    supplier: Optional[str]
    supplier_sku: Optional[str]
    attachments: Optional[List[dict]] = []
    is_active: bool
    created_at: datetime
    updated_at: datetime

# ============ LOCATIONS ============

class LocationCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    location_type: LocationType = LocationType.PRODUCTION

class LocationResponse(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str]
    location_type: str
    is_active: bool
    created_at: datetime

# ============ STOCK ============

class StockLevelResponse(BaseModel):
    id: str
    item_id: str
    item_sku: str
    item_name: str
    location_id: str
    location_code: str
    location_name: str
    quantity: float
    reserved_quantity: float
    available_quantity: float
    unit_of_measure: str
    last_count_date: Optional[datetime]
    updated_at: datetime

# ============ TRANSACTIONS ============

class ReceiveInventoryRequest(BaseModel):
    item_id: str
    location_id: str
    quantity: float = Field(..., gt=0)
    unit_cost: float = Field(..., ge=0)
    reference_number: Optional[str] = None  # PO number
    notes: Optional[str] = None
    serial_numbers: Optional[List[str]] = None  # For individually tracked items

class TransferInventoryRequest(BaseModel):
    item_id: str
    from_location_id: str
    to_location_id: str
    quantity: float = Field(..., gt=0)
    serial_ids: Optional[List[str]] = None  # For individually tracked items
    notes: Optional[str] = None

class AdjustInventoryRequest(BaseModel):
    item_id: str
    location_id: str
    new_quantity: float = Field(..., ge=0)
    reason: str = Field(..., min_length=1)
    notes: Optional[str] = None

class PickInventoryRequest(BaseModel):
    pick_list_id: str
    pick_list_item_id: str
    quantity_picked: float = Field(..., ge=0)
    scanned_barcode: Optional[str] = None
    serial_id: Optional[str] = None
    notes: Optional[str] = None

class TransactionResponse(BaseModel):
    id: str
    transaction_type: str
    item_id: str
    item_sku: str
    item_name: str
    serial_id: Optional[str]
    serial_number: Optional[str]
    from_location_id: Optional[str]
    from_location_name: Optional[str]
    to_location_id: Optional[str]
    to_location_name: Optional[str]
    quantity: float
    unit_cost: float
    total_cost: float
    order_id: Optional[str]
    order_number: Optional[str]
    pick_list_id: Optional[str]
    reference_number: Optional[str]
    notes: Optional[str]
    performed_by: str
    performed_by_name: str
    created_at: datetime

# ============ BILL OF MATERIALS ============

class BOMComponentCreate(BaseModel):
    item_id: str
    quantity: float = Field(..., gt=0)
    unit_of_measure: Optional[UnitOfMeasure] = None
    is_optional: bool = False
    notes: Optional[str] = None

class BOMCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    product_type: str  # rim, steering_wheel, standard_caps, etc.
    model_code: Optional[str] = None
    rim_size: Optional[str] = None
    description: Optional[str] = None
    is_default: bool = False
    components: List[BOMComponentCreate] = []

class BOMUpdate(BaseModel):
    name: Optional[str] = None
    product_type: Optional[str] = None
    model_code: Optional[str] = None
    rim_size: Optional[str] = None
    description: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None

class BOMComponentResponse(BaseModel):
    id: str
    bom_id: str
    item_id: str
    item_sku: str
    item_name: str
    quantity: float
    unit_of_measure: str
    is_optional: bool
    notes: Optional[str]

class BOMResponse(BaseModel):
    id: str
    name: str
    product_type: str
    model_code: Optional[str]
    rim_size: Optional[str]
    description: Optional[str]
    is_default: bool
    is_active: bool
    components: List[BOMComponentResponse]
    created_at: datetime
    updated_at: datetime

# ============ PICK LISTS ============

class GeneratePickListRequest(BaseModel):
    order_id: str
    bom_id: Optional[str] = None  # If not provided, uses default BOM
    assigned_to: Optional[str] = None
    notes: Optional[str] = None

class PickListItemResponse(BaseModel):
    id: str
    pick_list_id: str
    item_id: str
    item_sku: str
    item_name: str
    location_id: str
    location_name: str
    quantity_required: float
    quantity_picked: float
    quantity_short: float
    serial_id: Optional[str]
    serial_number: Optional[str]
    status: str
    picked_by: Optional[str]
    picked_by_name: Optional[str]
    picked_at: Optional[datetime]
    scanned_barcode: Optional[str]
    notes: Optional[str]

class PickListResponse(BaseModel):
    id: str
    pick_list_number: str
    order_id: str
    order_number: str
    bom_id: Optional[str]
    bom_name: Optional[str]
    status: str
    assigned_to: Optional[str]
    assigned_to_name: Optional[str]
    created_by: str
    created_by_name: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    notes: Optional[str]
    items: List[PickListItemResponse]
    created_at: datetime
    updated_at: datetime

class UpdatePickListItemRequest(BaseModel):
    quantity_picked: float = Field(..., ge=0)
    scanned_barcode: Optional[str] = None
    serial_id: Optional[str] = None
    notes: Optional[str] = None

# ============ SERIAL ITEMS ============

class SerialItemCreate(BaseModel):
    item_id: str
    serial_number: str
    barcode: Optional[str] = None
    location_id: str
    cost: float = Field(..., ge=0)
    notes: Optional[str] = None

class SerialItemResponse(BaseModel):
    id: str
    item_id: str
    item_sku: str
    item_name: str
    serial_number: str
    barcode: str
    location_id: str
    location_name: str
    status: str
    order_id: Optional[str]
    order_number: Optional[str]
    cost: float
    received_date: datetime
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

# ============ ALERTS ============

class AlertResponse(BaseModel):
    id: str
    item_id: str
    item_sku: str
    item_name: str
    alert_type: str
    threshold: float
    current_quantity: float
    unit_of_measure: str
    is_acknowledged: bool
    acknowledged_by: Optional[str]
    acknowledged_by_name: Optional[str]
    acknowledged_at: Optional[datetime]
    created_at: datetime

# ============ API KEYS ============

class APIKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    permissions: List[str] = ["inventory:read"]
    expires_in_days: Optional[int] = None  # None = never expires

class APIKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    permissions: List[str]
    is_active: bool
    last_used_at: Optional[datetime]
    created_by: str
    created_at: datetime
    expires_at: Optional[datetime]

class APIKeyCreateResponse(APIKeyResponse):
    api_key: str  # Full key - only shown once on creation

# ============ REPORTS ============

class StockReportItem(BaseModel):
    item_id: str
    sku: str
    name: str
    category: str
    unit_of_measure: str
    total_quantity: float
    total_value: float
    avg_cost: float
    reorder_point: Optional[float]
    is_below_reorder: bool
    locations: List[dict]  # [{location_name, quantity}]

class ValuationReportResponse(BaseModel):
    report_date: datetime
    total_items: int
    total_quantity: float
    total_value: float
    by_category: dict  # {category: {quantity, value}}
    by_location: dict  # {location: {quantity, value}}
    items: List[StockReportItem]

# ============ CSV IMPORT ============

class CSVImportResult(BaseModel):
    success_count: int
    error_count: int
    errors: List[dict]  # [{row, field, error}]
    created_ids: List[str]

# ============ PROFIT & LOSS REPORT ============

class ProfitLossItem(BaseModel):
    item_id: str
    sku: str
    name: str
    category: str
    quantity_used: float
    unit_of_measure: str
    cost_per_unit: float
    sell_price: float
    total_cost: float
    total_revenue: float
    profit: float
    margin_percent: float

class ProfitLossReport(BaseModel):
    report_date: datetime
    period_start: datetime
    period_end: datetime
    period_type: str  # "day", "week", "month", "custom"
    total_items_used: int
    total_cost: float
    total_revenue: float
    total_profit: float
    overall_margin: float
    by_category: dict  # {category: {cost, revenue, profit}}
    by_location: dict  # {location: {cost, revenue, profit}}
    items: List[ProfitLossItem]

# ============ ATTACHMENTS ============

class AttachmentCreate(BaseModel):
    filename: str
    file_type: str  # "pdf", "image", etc.
    url: str
    thumbnail_url: Optional[str] = None
    size_bytes: Optional[int] = None
    notes: Optional[str] = None

class AttachmentResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    url: str
    thumbnail_url: Optional[str]
    size_bytes: Optional[int]
    notes: Optional[str]
    uploaded_by: str
    uploaded_by_name: str
    created_at: datetime
