# Inventory Management Routes
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query, BackgroundTasks, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional, Callable
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import uuid
import hashlib
import secrets
import csv
import io
import base64
import os

from backend.models.inventory import (
    # Enums
    ItemCategory, UnitOfMeasure, BarcodeType, LocationType,
    TransactionType, SerialItemStatus, PickListStatus, PickItemStatus, AlertType,
    # Items
    InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse,
    # Locations
    LocationCreate, LocationResponse,
    # Stock
    StockLevelResponse,
    # Transactions
    ReceiveInventoryRequest, TransferInventoryRequest, AdjustInventoryRequest,
    PickInventoryRequest, TransactionResponse,
    # BOM
    BOMCreate, BOMUpdate, BOMComponentCreate, BOMResponse, BOMComponentResponse,
    # Pick Lists
    GeneratePickListRequest, PickListResponse, PickListItemResponse, UpdatePickListItemRequest,
    # Serial Items
    SerialItemCreate, SerialItemResponse,
    # Alerts
    AlertResponse,
    # API Keys
    APIKeyCreate, APIKeyResponse, APIKeyCreateResponse,
    # Reports
    StockReportItem, ValuationReportResponse,
    # Import
    CSVImportResult,
    # P&L
    ProfitLossItem, ProfitLossReport,
    # Attachments
    AttachmentCreate, AttachmentResponse
)

router = APIRouter(prefix="/inventory", tags=["inventory"])

# These will be injected from server.py
db = None
_get_current_user_func = None
_require_admin_func = None
logger = None
security = HTTPBearer()

def init_inventory_routes(database, current_user_dep, admin_dep, log):
    """Initialize the inventory routes with database and dependencies"""
    global db, _get_current_user_func, _require_admin_func, logger
    db = database
    _get_current_user_func = current_user_dep
    _require_admin_func = admin_dep
    logger = log

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Wrapper to call the injected get_current_user function"""
    return await _get_current_user_func(credentials)

async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Wrapper to call the injected require_admin function"""
    return await _require_admin_func(credentials)

# ============ HELPER FUNCTIONS ============

async def get_item_by_id(item_id: str):
    """Get inventory item by ID"""
    item = await db.inventory_items.find_one({"id": item_id, "is_active": True})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

async def get_location_by_id(location_id: str):
    """Get location by ID"""
    location = await db.inventory_locations.find_one({"id": location_id, "is_active": True})
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return location

async def get_or_create_stock(item_id: str, location_id: str):
    """Get or create stock record for item at location"""
    stock = await db.inventory_stock.find_one({"item_id": item_id, "location_id": location_id})
    if not stock:
        stock = {
            "id": str(uuid.uuid4()),
            "item_id": item_id,
            "location_id": location_id,
            "quantity": 0,
            "reserved_quantity": 0,
            "available_quantity": 0,
            "last_count_date": None,
            "last_count_quantity": None,
            "updated_at": datetime.now(timezone.utc)
        }
        await db.inventory_stock.insert_one(stock)
    return stock

async def update_item_totals(item_id: str):
    """Recalculate item total quantity and value from all stock locations"""
    pipeline = [
        {"$match": {"item_id": item_id}},
        {"$group": {
            "_id": "$item_id",
            "total_quantity": {"$sum": "$quantity"}
        }}
    ]
    result = await db.inventory_stock.aggregate(pipeline).to_list(1)
    total_qty = result[0]["total_quantity"] if result else 0
    
    item = await db.inventory_items.find_one({"id": item_id})
    if item:
        total_value = total_qty * item.get("cost_per_unit", 0)
        await db.inventory_items.update_one(
            {"id": item_id},
            {"$set": {
                "total_quantity": total_qty,
                "total_cost_value": total_value,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        # Check for low stock alert
        await check_stock_alerts(item_id)

async def check_stock_alerts(item_id: str):
    """Check if item needs a stock alert"""
    item = await db.inventory_items.find_one({"id": item_id})
    if not item or not item.get("reorder_point"):
        return
    
    total_qty = item.get("total_quantity", 0)
    reorder_point = item.get("reorder_point", 0)
    
    # Check for existing unacknowledged alert
    existing_alert = await db.stock_alerts.find_one({
        "item_id": item_id,
        "is_acknowledged": False
    })
    
    if total_qty <= 0 and not existing_alert:
        # Out of stock alert
        await db.stock_alerts.insert_one({
            "id": str(uuid.uuid4()),
            "item_id": item_id,
            "item_sku": item.get("sku"),
            "item_name": item.get("name"),
            "alert_type": "out_of_stock",
            "threshold": reorder_point,
            "current_quantity": total_qty,
            "unit_of_measure": item.get("unit_of_measure"),
            "is_acknowledged": False,
            "acknowledged_by": None,
            "acknowledged_at": None,
            "created_at": datetime.now(timezone.utc)
        })
    elif total_qty <= reorder_point and total_qty > 0 and not existing_alert:
        # Low stock alert
        await db.stock_alerts.insert_one({
            "id": str(uuid.uuid4()),
            "item_id": item_id,
            "item_sku": item.get("sku"),
            "item_name": item.get("name"),
            "alert_type": "low_stock",
            "threshold": reorder_point,
            "current_quantity": total_qty,
            "unit_of_measure": item.get("unit_of_measure"),
            "is_acknowledged": False,
            "acknowledged_by": None,
            "acknowledged_at": None,
            "created_at": datetime.now(timezone.utc)
        })
    elif total_qty > reorder_point and existing_alert:
        # Stock replenished - remove alert
        await db.stock_alerts.delete_one({"id": existing_alert["id"]})

async def record_transaction(
    transaction_type: str,
    item_id: str,
    quantity: float,
    unit_cost: float,
    user_id: str,
    user_name: str,
    from_location_id: Optional[str] = None,
    to_location_id: Optional[str] = None,
    serial_id: Optional[str] = None,
    order_id: Optional[str] = None,
    pick_list_id: Optional[str] = None,
    reference_number: Optional[str] = None,
    notes: Optional[str] = None
):
    """Record an inventory transaction"""
    item = await db.inventory_items.find_one({"id": item_id})
    serial = None
    if serial_id:
        serial = await db.inventory_serial_items.find_one({"id": serial_id})
    
    from_loc = None
    to_loc = None
    if from_location_id:
        from_loc = await db.inventory_locations.find_one({"id": from_location_id})
    if to_location_id:
        to_loc = await db.inventory_locations.find_one({"id": to_location_id})
    
    order = None
    if order_id:
        order = await db.orders.find_one({"id": order_id})
    
    transaction = {
        "id": str(uuid.uuid4()),
        "transaction_type": transaction_type,
        "item_id": item_id,
        "item_sku": item.get("sku") if item else None,
        "item_name": item.get("name") if item else None,
        "serial_id": serial_id,
        "serial_number": serial.get("serial_number") if serial else None,
        "from_location_id": from_location_id,
        "from_location_name": from_loc.get("name") if from_loc else None,
        "to_location_id": to_location_id,
        "to_location_name": to_loc.get("name") if to_loc else None,
        "quantity": quantity,
        "unit_cost": unit_cost,
        "total_cost": quantity * unit_cost,
        "order_id": order_id,
        "order_number": order.get("order_number") if order else None,
        "pick_list_id": pick_list_id,
        "reference_number": reference_number,
        "notes": notes,
        "performed_by": user_id,
        "performed_by_name": user_name,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.inventory_transactions.insert_one(transaction)
    return transaction

# ============ INVENTORY ITEMS ============

@router.get("/items", response_model=List[InventoryItemResponse])
async def list_items(
    category: Optional[str] = None,
    search: Optional[str] = None,
    is_active: bool = True,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """List all inventory items with optional filters"""
    query = {"is_active": is_active}
    
    if category:
        query["category"] = category
    
    if search:
        query["$or"] = [
            {"sku": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    items = await db.inventory_items.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    return items

@router.post("/items", response_model=InventoryItemResponse)
async def create_item(
    item: InventoryItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new inventory item"""
    # Check for duplicate SKU
    existing = await db.inventory_items.find_one({"sku": item.sku})
    if existing:
        raise HTTPException(status_code=400, detail="SKU already exists")
    
    now = datetime.now(timezone.utc)
    new_item = {
        "id": str(uuid.uuid4()),
        **item.model_dump(),
        "total_cost_value": 0,
        "total_quantity": 0,
        "attachments": [],
        "is_active": True,
        "created_at": now,
        "updated_at": now
    }
    
    await db.inventory_items.insert_one(new_item)
    
    # Remove MongoDB _id before returning
    new_item.pop("_id", None)
    return new_item

@router.get("/items/{item_id}", response_model=InventoryItemResponse)
async def get_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific inventory item"""
    item = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@router.put("/items/{item_id}", response_model=InventoryItemResponse)
async def update_item(
    item_id: str,
    updates: InventoryItemUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an inventory item"""
    item = await db.inventory_items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.inventory_items.update_one({"id": item_id}, {"$set": update_data})
    
    updated = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    return updated

@router.delete("/items/{item_id}")
async def deactivate_item(
    item_id: str,
    current_user: dict = Depends(require_admin)
):
    """Deactivate an inventory item (soft delete)"""
    result = await db.inventory_items.update_one(
        {"id": item_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deactivated"}

# ============ LOCATIONS ============

@router.get("/locations", response_model=List[LocationResponse])
async def list_locations(
    current_user: dict = Depends(get_current_user)
):
    """List all inventory locations"""
    locations = await db.inventory_locations.find({"is_active": True}, {"_id": 0}).to_list(100)
    return locations

@router.post("/locations", response_model=LocationResponse)
async def create_location(
    location: LocationCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new location (Admin only)"""
    existing = await db.inventory_locations.find_one({"code": location.code})
    if existing:
        raise HTTPException(status_code=400, detail="Location code already exists")
    
    new_location = {
        "id": str(uuid.uuid4()),
        **location.model_dump(),
        "is_active": True,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.inventory_locations.insert_one(new_location)
    new_location.pop("_id", None)
    return new_location

# ============ STOCK LEVELS ============

@router.get("/stock", response_model=List[StockLevelResponse])
async def get_stock_levels(
    location_id: Optional[str] = None,
    item_id: Optional[str] = None,
    below_reorder: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get current stock levels"""
    query = {}
    if location_id:
        query["location_id"] = location_id
    if item_id:
        query["item_id"] = item_id
    
    stocks = await db.inventory_stock.find(query, {"_id": 0}).to_list(1000)
    
    # Enrich with item and location data
    result = []
    for stock in stocks:
        item = await db.inventory_items.find_one({"id": stock["item_id"]})
        location = await db.inventory_locations.find_one({"id": stock["location_id"]})
        
        if not item or not location:
            continue
        
        if below_reorder and item.get("reorder_point"):
            if stock["quantity"] > item["reorder_point"]:
                continue
        
        result.append({
            **stock,
            "item_sku": item.get("sku"),
            "item_name": item.get("name"),
            "location_code": location.get("code"),
            "location_name": location.get("name"),
            "unit_of_measure": item.get("unit_of_measure")
        })
    
    return result

# ============ TRANSACTIONS ============

@router.post("/receive")
async def receive_inventory(
    request: ReceiveInventoryRequest,
    current_user: dict = Depends(get_current_user)
):
    """Receive inventory into a location"""
    item = await get_item_by_id(request.item_id)
    location = await get_location_by_id(request.location_id)
    
    # Calculate new average cost
    old_qty = item.get("total_quantity", 0)
    old_value = item.get("total_cost_value", 0)
    new_value = request.quantity * request.unit_cost
    new_total_qty = old_qty + request.quantity
    new_avg_cost = (old_value + new_value) / new_total_qty if new_total_qty > 0 else request.unit_cost
    
    # Update item average cost
    await db.inventory_items.update_one(
        {"id": request.item_id},
        {"$set": {"cost_per_unit": new_avg_cost, "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Update stock at location
    stock = await get_or_create_stock(request.item_id, request.location_id)
    new_quantity = stock["quantity"] + request.quantity
    await db.inventory_stock.update_one(
        {"id": stock["id"]},
        {"$set": {
            "quantity": new_quantity,
            "available_quantity": new_quantity - stock.get("reserved_quantity", 0),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Create serial items if tracking individually
    if item.get("track_individually") and request.serial_numbers:
        for sn in request.serial_numbers:
            serial_item = {
                "id": str(uuid.uuid4()),
                "item_id": request.item_id,
                "serial_number": sn,
                "barcode": sn.replace("-", "").replace(" ", ""),
                "location_id": request.location_id,
                "status": "in_stock",
                "order_id": None,
                "cost": request.unit_cost,
                "received_date": datetime.now(timezone.utc),
                "notes": request.notes,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            await db.inventory_serial_items.insert_one(serial_item)
    
    # Update item totals
    await update_item_totals(request.item_id)
    
    # Record transaction
    transaction = await record_transaction(
        transaction_type="receive",
        item_id=request.item_id,
        quantity=request.quantity,
        unit_cost=request.unit_cost,
        user_id=current_user["id"],
        user_name=current_user.get("name", current_user.get("email")),
        to_location_id=request.location_id,
        reference_number=request.reference_number,
        notes=request.notes
    )
    
    return {
        "message": "Inventory received successfully",
        "transaction_id": transaction["id"],
        "new_quantity": new_quantity,
        "new_avg_cost": new_avg_cost
    }

@router.post("/transfer")
async def transfer_inventory(
    request: TransferInventoryRequest,
    current_user: dict = Depends(get_current_user)
):
    """Transfer inventory between locations"""
    item = await get_item_by_id(request.item_id)
    from_location = await get_location_by_id(request.from_location_id)
    to_location = await get_location_by_id(request.to_location_id)
    
    # Check source stock
    from_stock = await get_or_create_stock(request.item_id, request.from_location_id)
    if from_stock["available_quantity"] < request.quantity:
        raise HTTPException(
            status_code=400, 
            detail=f"Insufficient stock. Available: {from_stock['available_quantity']}"
        )
    
    # Update source stock
    new_from_qty = from_stock["quantity"] - request.quantity
    await db.inventory_stock.update_one(
        {"id": from_stock["id"]},
        {"$set": {
            "quantity": new_from_qty,
            "available_quantity": new_from_qty - from_stock.get("reserved_quantity", 0),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Update destination stock
    to_stock = await get_or_create_stock(request.item_id, request.to_location_id)
    new_to_qty = to_stock["quantity"] + request.quantity
    await db.inventory_stock.update_one(
        {"id": to_stock["id"]},
        {"$set": {
            "quantity": new_to_qty,
            "available_quantity": new_to_qty - to_stock.get("reserved_quantity", 0),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Update serial items if applicable
    if request.serial_ids:
        for serial_id in request.serial_ids:
            await db.inventory_serial_items.update_one(
                {"id": serial_id},
                {"$set": {
                    "location_id": request.to_location_id,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
    
    # Record transaction
    transaction = await record_transaction(
        transaction_type="transfer",
        item_id=request.item_id,
        quantity=request.quantity,
        unit_cost=item.get("cost_per_unit", 0),
        user_id=current_user["id"],
        user_name=current_user.get("name", current_user.get("email")),
        from_location_id=request.from_location_id,
        to_location_id=request.to_location_id,
        notes=request.notes
    )
    
    return {
        "message": "Transfer completed successfully",
        "transaction_id": transaction["id"],
        "from_location": from_location.get("name"),
        "to_location": to_location.get("name"),
        "quantity": request.quantity
    }

@router.post("/adjust")
async def adjust_inventory(
    request: AdjustInventoryRequest,
    current_user: dict = Depends(require_admin)
):
    """Manual inventory adjustment (Manager only)"""
    item = await get_item_by_id(request.item_id)
    location = await get_location_by_id(request.location_id)
    
    stock = await get_or_create_stock(request.item_id, request.location_id)
    old_quantity = stock["quantity"]
    adjustment = request.new_quantity - old_quantity
    
    # Update stock
    await db.inventory_stock.update_one(
        {"id": stock["id"]},
        {"$set": {
            "quantity": request.new_quantity,
            "available_quantity": request.new_quantity - stock.get("reserved_quantity", 0),
            "last_count_date": datetime.now(timezone.utc),
            "last_count_quantity": request.new_quantity,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Update item totals
    await update_item_totals(request.item_id)
    
    # Record transaction
    transaction = await record_transaction(
        transaction_type="adjust",
        item_id=request.item_id,
        quantity=adjustment,
        unit_cost=item.get("cost_per_unit", 0),
        user_id=current_user["id"],
        user_name=current_user.get("name", current_user.get("email")),
        from_location_id=request.location_id if adjustment < 0 else None,
        to_location_id=request.location_id if adjustment > 0 else None,
        reference_number=request.reason,
        notes=request.notes
    )
    
    return {
        "message": "Adjustment recorded successfully",
        "transaction_id": transaction["id"],
        "old_quantity": old_quantity,
        "new_quantity": request.new_quantity,
        "adjustment": adjustment
    }

@router.get("/transactions", response_model=List[TransactionResponse])
async def list_transactions(
    item_id: Optional[str] = None,
    location_id: Optional[str] = None,
    transaction_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get transaction history"""
    query = {}
    
    if item_id:
        query["item_id"] = item_id
    if location_id:
        query["$or"] = [
            {"from_location_id": location_id},
            {"to_location_id": location_id}
        ]
    if transaction_type:
        query["transaction_type"] = transaction_type
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = end_date
        else:
            query["created_at"] = {"$lte": end_date}
    
    transactions = await db.inventory_transactions.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return transactions

# ============ BILL OF MATERIALS ============

@router.get("/bom", response_model=List[BOMResponse])
async def list_boms(
    product_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all Bills of Materials"""
    query = {"is_active": True}
    if product_type:
        query["product_type"] = product_type
    
    boms = await db.bill_of_materials.find(query, {"_id": 0}).to_list(100)
    
    # Get components for each BOM
    result = []
    for bom in boms:
        components = await db.bom_components.find({"bom_id": bom["id"]}, {"_id": 0}).to_list(100)
        
        # Enrich components with item data
        enriched_components = []
        for comp in components:
            item = await db.inventory_items.find_one({"id": comp["item_id"]})
            if item:
                enriched_components.append({
                    **comp,
                    "item_sku": item.get("sku"),
                    "item_name": item.get("name")
                })
        
        result.append({**bom, "components": enriched_components})
    
    return result

@router.post("/bom", response_model=BOMResponse)
async def create_bom(
    bom: BOMCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new Bill of Materials (Admin only)"""
    now = datetime.now(timezone.utc)
    
    # If this is default, unset other defaults for same product type
    if bom.is_default:
        await db.bill_of_materials.update_many(
            {"product_type": bom.product_type, "is_default": True},
            {"$set": {"is_default": False}}
        )
    
    bom_id = str(uuid.uuid4())
    new_bom = {
        "id": bom_id,
        "name": bom.name,
        "product_type": bom.product_type,
        "model_code": bom.model_code,
        "rim_size": bom.rim_size,
        "description": bom.description,
        "is_default": bom.is_default,
        "is_active": True,
        "created_at": now,
        "updated_at": now
    }
    
    await db.bill_of_materials.insert_one(new_bom)
    
    # Create components
    enriched_components = []
    for comp in bom.components:
        item = await get_item_by_id(comp.item_id)
        
        component = {
            "id": str(uuid.uuid4()),
            "bom_id": bom_id,
            "item_id": comp.item_id,
            "quantity": comp.quantity,
            "unit_of_measure": comp.unit_of_measure or item.get("unit_of_measure"),
            "is_optional": comp.is_optional,
            "notes": comp.notes,
            "created_at": now
        }
        await db.bom_components.insert_one(component)
        
        enriched_components.append({
            **component,
            "item_sku": item.get("sku"),
            "item_name": item.get("name")
        })
    
    new_bom.pop("_id", None)
    return {**new_bom, "components": enriched_components}

@router.put("/bom/{bom_id}", response_model=BOMResponse)
async def update_bom(
    bom_id: str,
    updates: BOMUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update a Bill of Materials (Admin only)"""
    bom = await db.bill_of_materials.find_one({"id": bom_id})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    # If setting as default, unset other defaults
    if update_data.get("is_default"):
        await db.bill_of_materials.update_many(
            {"product_type": bom.get("product_type"), "is_default": True, "id": {"$ne": bom_id}},
            {"$set": {"is_default": False}}
        )
    
    await db.bill_of_materials.update_one({"id": bom_id}, {"$set": update_data})
    
    # Get updated BOM with components
    updated = await db.bill_of_materials.find_one({"id": bom_id}, {"_id": 0})
    components = await db.bom_components.find({"bom_id": bom_id}, {"_id": 0}).to_list(100)
    
    enriched_components = []
    for comp in components:
        item = await db.inventory_items.find_one({"id": comp["item_id"]})
        if item:
            enriched_components.append({
                **comp,
                "item_sku": item.get("sku"),
                "item_name": item.get("name")
            })
    
    return {**updated, "components": enriched_components}

@router.post("/bom/{bom_id}/components", response_model=BOMComponentResponse)
async def add_bom_component(
    bom_id: str,
    component: BOMComponentCreate,
    current_user: dict = Depends(require_admin)
):
    """Add a component to a BOM (Admin only)"""
    bom = await db.bill_of_materials.find_one({"id": bom_id})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    item = await get_item_by_id(component.item_id)
    
    new_component = {
        "id": str(uuid.uuid4()),
        "bom_id": bom_id,
        "item_id": component.item_id,
        "quantity": component.quantity,
        "unit_of_measure": component.unit_of_measure or item.get("unit_of_measure"),
        "is_optional": component.is_optional,
        "notes": component.notes,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.bom_components.insert_one(new_component)
    new_component.pop("_id", None)
    
    return {
        **new_component,
        "item_sku": item.get("sku"),
        "item_name": item.get("name")
    }

@router.delete("/bom/{bom_id}/components/{component_id}")
async def remove_bom_component(
    bom_id: str,
    component_id: str,
    current_user: dict = Depends(require_admin)
):
    """Remove a component from a BOM (Admin only)"""
    result = await db.bom_components.delete_one({"id": component_id, "bom_id": bom_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Component not found")
    return {"message": "Component removed"}

# ============ PICK LISTS ============

@router.post("/pick-list/generate", response_model=PickListResponse)
async def generate_pick_list(
    request: GeneratePickListRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate a pick list for an order based on BOM"""
    # Get order
    order = await db.orders.find_one({"id": request.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get BOM (specific or default for product type)
    bom = None
    if request.bom_id:
        bom = await db.bill_of_materials.find_one({"id": request.bom_id, "is_active": True})
    else:
        # Find default BOM for this product type
        query = {"product_type": order.get("product_type"), "is_active": True, "is_default": True}
        # Also try to match rim size if applicable
        if order.get("rim_size"):
            bom = await db.bill_of_materials.find_one({**query, "rim_size": order.get("rim_size")})
        if not bom:
            bom = await db.bill_of_materials.find_one(query)
    
    if not bom:
        raise HTTPException(
            status_code=404, 
            detail=f"No BOM found for product type: {order.get('product_type')}"
        )
    
    # Get BOM components
    components = await db.bom_components.find({"bom_id": bom["id"]}).to_list(100)
    
    if not components:
        raise HTTPException(status_code=400, detail="BOM has no components")
    
    now = datetime.now(timezone.utc)
    
    # Generate pick list number
    count = await db.pick_lists.count_documents({})
    pick_list_number = f"PL-{datetime.now().year}-{str(count + 1).zfill(5)}"
    
    # Get assigned user info
    assigned_user = None
    if request.assigned_to:
        assigned_user = await db.users.find_one({"id": request.assigned_to})
    
    pick_list_id = str(uuid.uuid4())
    pick_list = {
        "id": pick_list_id,
        "pick_list_number": pick_list_number,
        "order_id": request.order_id,
        "order_number": order.get("order_number"),
        "bom_id": bom["id"],
        "bom_name": bom.get("name"),
        "status": "pending",
        "assigned_to": request.assigned_to,
        "assigned_to_name": assigned_user.get("name") if assigned_user else None,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", current_user.get("email")),
        "started_at": None,
        "completed_at": None,
        "notes": request.notes,
        "created_at": now,
        "updated_at": now
    }
    
    await db.pick_lists.insert_one(pick_list)
    
    # Create pick list items
    order_quantity = order.get("quantity", 1)
    pick_items = []
    
    for comp in components:
        item = await db.inventory_items.find_one({"id": comp["item_id"]})
        if not item:
            continue
        
        # Get stock location (prefer default location)
        default_location = item.get("default_location")
        location = None
        stock = None
        
        if default_location:
            location = await db.inventory_locations.find_one({"code": default_location})
            if location:
                stock = await db.inventory_stock.find_one({
                    "item_id": comp["item_id"],
                    "location_id": location["id"]
                })
        
        # If no stock at default, find any location with stock
        if not stock or stock.get("available_quantity", 0) <= 0:
            stocks = await db.inventory_stock.find({
                "item_id": comp["item_id"],
                "available_quantity": {"$gt": 0}
            }).to_list(10)
            if stocks:
                stock = stocks[0]
                location = await db.inventory_locations.find_one({"id": stock["location_id"]})
        
        quantity_required = comp["quantity"] * order_quantity
        
        pick_item = {
            "id": str(uuid.uuid4()),
            "pick_list_id": pick_list_id,
            "item_id": comp["item_id"],
            "item_sku": item.get("sku"),
            "item_name": item.get("name"),
            "location_id": location["id"] if location else None,
            "location_name": location.get("name") if location else "Not Found",
            "quantity_required": quantity_required,
            "quantity_picked": 0,
            "quantity_short": 0,
            "serial_id": None,
            "serial_number": None,
            "status": "pending",
            "picked_by": None,
            "picked_by_name": None,
            "picked_at": None,
            "scanned_barcode": None,
            "notes": comp.get("notes")
        }
        
        await db.pick_list_items.insert_one(pick_item)
        pick_item.pop("_id", None)
        pick_items.append(pick_item)
        
        # Reserve stock
        if stock:
            await db.inventory_stock.update_one(
                {"id": stock["id"]},
                {"$inc": {
                    "reserved_quantity": quantity_required,
                    "available_quantity": -quantity_required
                }}
            )
    
    pick_list.pop("_id", None)
    return {**pick_list, "items": pick_items}

@router.get("/pick-list/{pick_list_id}", response_model=PickListResponse)
async def get_pick_list(
    pick_list_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a pick list with all items"""
    pick_list = await db.pick_lists.find_one({"id": pick_list_id}, {"_id": 0})
    if not pick_list:
        raise HTTPException(status_code=404, detail="Pick list not found")
    
    items = await db.pick_list_items.find({"pick_list_id": pick_list_id}, {"_id": 0}).to_list(100)
    
    return {**pick_list, "items": items}

@router.get("/pick-lists")
async def list_pick_lists(
    status: Optional[str] = None,
    order_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """List pick lists with filters"""
    query = {}
    if status:
        query["status"] = status
    if order_id:
        query["order_id"] = order_id
    if assigned_to:
        query["assigned_to"] = assigned_to
    
    pick_lists = await db.pick_lists.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Get items count for each
    result = []
    for pl in pick_lists:
        items = await db.pick_list_items.find({"pick_list_id": pl["id"]}).to_list(100)
        total_items = len(items)
        picked_items = len([i for i in items if i.get("status") == "picked"])
        result.append({
            **pl,
            "total_items": total_items,
            "picked_items": picked_items
        })
    
    return result

@router.put("/pick-list/{pick_list_id}/item/{item_id}/scan")
async def scan_pick_item(
    pick_list_id: str,
    item_id: str,
    request: UpdatePickListItemRequest,
    current_user: dict = Depends(get_current_user)
):
    """Scan/pick an item from the pick list"""
    pick_list = await db.pick_lists.find_one({"id": pick_list_id})
    if not pick_list:
        raise HTTPException(status_code=404, detail="Pick list not found")
    
    pick_item = await db.pick_list_items.find_one({"id": item_id, "pick_list_id": pick_list_id})
    if not pick_item:
        raise HTTPException(status_code=404, detail="Pick list item not found")
    
    # Update pick list status if first scan
    if pick_list.get("status") == "pending":
        await db.pick_lists.update_one(
            {"id": pick_list_id},
            {"$set": {"status": "in_progress", "started_at": datetime.now(timezone.utc)}}
        )
    
    now = datetime.now(timezone.utc)
    quantity_short = max(0, pick_item["quantity_required"] - request.quantity_picked)
    status = "picked" if request.quantity_picked >= pick_item["quantity_required"] else "short"
    
    # Update pick item
    await db.pick_list_items.update_one(
        {"id": item_id},
        {"$set": {
            "quantity_picked": request.quantity_picked,
            "quantity_short": quantity_short,
            "status": status,
            "picked_by": current_user["id"],
            "picked_by_name": current_user.get("name", current_user.get("email")),
            "picked_at": now,
            "scanned_barcode": request.scanned_barcode,
            "serial_id": request.serial_id,
            "notes": request.notes
        }}
    )
    
    # Deduct from stock
    item = await db.inventory_items.find_one({"id": pick_item["item_id"]})
    stock = await db.inventory_stock.find_one({
        "item_id": pick_item["item_id"],
        "location_id": pick_item["location_id"]
    })
    
    if stock:
        # Reduce quantity and reserved
        await db.inventory_stock.update_one(
            {"id": stock["id"]},
            {"$inc": {
                "quantity": -request.quantity_picked,
                "reserved_quantity": -pick_item["quantity_required"]
            }}
        )
        
        # Recalculate available
        updated_stock = await db.inventory_stock.find_one({"id": stock["id"]})
        await db.inventory_stock.update_one(
            {"id": stock["id"]},
            {"$set": {
                "available_quantity": updated_stock["quantity"] - updated_stock.get("reserved_quantity", 0),
                "updated_at": now
            }}
        )
    
    # Update item totals
    await update_item_totals(pick_item["item_id"])
    
    # Record transaction
    await record_transaction(
        transaction_type="pick",
        item_id=pick_item["item_id"],
        quantity=request.quantity_picked,
        unit_cost=item.get("cost_per_unit", 0) if item else 0,
        user_id=current_user["id"],
        user_name=current_user.get("name", current_user.get("email")),
        from_location_id=pick_item["location_id"],
        order_id=pick_list.get("order_id"),
        pick_list_id=pick_list_id,
        notes=f"Picked for {pick_list.get('order_number')}"
    )
    
    return {
        "message": "Item scanned successfully",
        "status": status,
        "quantity_picked": request.quantity_picked,
        "quantity_short": quantity_short
    }

@router.put("/pick-list/{pick_list_id}/complete")
async def complete_pick_list(
    pick_list_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a pick list as completed"""
    pick_list = await db.pick_lists.find_one({"id": pick_list_id})
    if not pick_list:
        raise HTTPException(status_code=404, detail="Pick list not found")
    
    # Check all items are picked
    items = await db.pick_list_items.find({"pick_list_id": pick_list_id}).to_list(100)
    pending_items = [i for i in items if i.get("status") == "pending"]
    
    if pending_items:
        raise HTTPException(
            status_code=400, 
            detail=f"{len(pending_items)} items still pending"
        )
    
    await db.pick_lists.update_one(
        {"id": pick_list_id},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Pick list completed"}

# ============ ALERTS ============

@router.get("/alerts", response_model=List[AlertResponse])
async def get_alerts(
    acknowledged: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get stock alerts"""
    query = {}
    if acknowledged is not None:
        query["is_acknowledged"] = acknowledged
    
    alerts = await db.stock_alerts.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return alerts

@router.put("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Acknowledge a stock alert"""
    result = await db.stock_alerts.update_one(
        {"id": alert_id},
        {"$set": {
            "is_acknowledged": True,
            "acknowledged_by": current_user["id"],
            "acknowledged_by_name": current_user.get("name", current_user.get("email")),
            "acknowledged_at": datetime.now(timezone.utc)
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    return {"message": "Alert acknowledged"}

# ============ API KEYS ============

@router.get("/api-keys", response_model=List[APIKeyResponse])
async def list_api_keys(
    current_user: dict = Depends(require_admin)
):
    """List all API keys (Admin only)"""
    keys = await db.api_keys.find({}, {"_id": 0, "key_hash": 0}).to_list(100)
    return keys

@router.post("/api-keys", response_model=APIKeyCreateResponse)
async def create_api_key(
    request: APIKeyCreate,
    current_user: dict = Depends(require_admin)
):
    """Generate a new API key (Admin only)"""
    # Generate secure random key
    raw_key = f"cf_live_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:15]
    
    now = datetime.now(timezone.utc)
    expires_at = None
    if request.expires_in_days:
        expires_at = now + timedelta(days=request.expires_in_days)
    
    api_key = {
        "id": str(uuid.uuid4()),
        "name": request.name,
        "key_hash": key_hash,
        "key_prefix": key_prefix,
        "permissions": request.permissions,
        "is_active": True,
        "last_used_at": None,
        "created_by": current_user["id"],
        "created_at": now,
        "expires_at": expires_at
    }
    
    await db.api_keys.insert_one(api_key)
    api_key.pop("_id", None)
    api_key.pop("key_hash", None)
    
    return {**api_key, "api_key": raw_key}

@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    current_user: dict = Depends(require_admin)
):
    """Revoke an API key (Admin only)"""
    result = await db.api_keys.update_one(
        {"id": key_id},
        {"$set": {"is_active": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"message": "API key revoked"}

# ============ REPORTS ============

@router.get("/reports/stock-levels")
async def stock_levels_report(
    location_id: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Generate stock levels report"""
    item_query = {"is_active": True}
    if category:
        item_query["category"] = category
    
    items = await db.inventory_items.find(item_query, {"_id": 0}).to_list(1000)
    
    report_items = []
    for item in items:
        stock_query = {"item_id": item["id"]}
        if location_id:
            stock_query["location_id"] = location_id
        
        stocks = await db.inventory_stock.find(stock_query).to_list(100)
        
        locations = []
        total_qty = 0
        for stock in stocks:
            location = await db.inventory_locations.find_one({"id": stock["location_id"]})
            if location:
                locations.append({
                    "location_name": location.get("name"),
                    "quantity": stock.get("quantity", 0),
                    "reserved": stock.get("reserved_quantity", 0),
                    "available": stock.get("available_quantity", 0)
                })
                total_qty += stock.get("quantity", 0)
        
        total_value = total_qty * item.get("cost_per_unit", 0)
        is_below_reorder = item.get("reorder_point") and total_qty <= item.get("reorder_point")
        
        report_items.append({
            "item_id": item["id"],
            "sku": item.get("sku"),
            "name": item.get("name"),
            "category": item.get("category"),
            "unit_of_measure": item.get("unit_of_measure"),
            "total_quantity": total_qty,
            "total_value": total_value,
            "avg_cost": item.get("cost_per_unit", 0),
            "reorder_point": item.get("reorder_point"),
            "is_below_reorder": is_below_reorder,
            "locations": locations
        })
    
    return {
        "report_date": datetime.now(timezone.utc),
        "total_items": len(report_items),
        "items": report_items
    }

@router.get("/reports/valuation")
async def valuation_report(
    current_user: dict = Depends(get_current_user)
):
    """Generate inventory valuation report (Average Cost)"""
    items = await db.inventory_items.find({"is_active": True}, {"_id": 0}).to_list(1000)
    
    total_value = 0
    total_quantity = 0
    by_category = {}
    by_location = {}
    report_items = []
    
    for item in items:
        item_total_qty = item.get("total_quantity", 0)
        item_total_value = item_total_qty * item.get("cost_per_unit", 0)
        
        total_quantity += item_total_qty
        total_value += item_total_value
        
        # By category
        cat = item.get("category", "unknown")
        if cat not in by_category:
            by_category[cat] = {"quantity": 0, "value": 0}
        by_category[cat]["quantity"] += item_total_qty
        by_category[cat]["value"] += item_total_value
        
        # Get stock by location
        stocks = await db.inventory_stock.find({"item_id": item["id"]}).to_list(100)
        locations = []
        for stock in stocks:
            location = await db.inventory_locations.find_one({"id": stock["location_id"]})
            if location:
                loc_name = location.get("name")
                locations.append({
                    "location_name": loc_name,
                    "quantity": stock.get("quantity", 0)
                })
                
                # By location totals
                if loc_name not in by_location:
                    by_location[loc_name] = {"quantity": 0, "value": 0}
                by_location[loc_name]["quantity"] += stock.get("quantity", 0)
                by_location[loc_name]["value"] += stock.get("quantity", 0) * item.get("cost_per_unit", 0)
        
        report_items.append({
            "item_id": item["id"],
            "sku": item.get("sku"),
            "name": item.get("name"),
            "category": cat,
            "unit_of_measure": item.get("unit_of_measure"),
            "total_quantity": item_total_qty,
            "total_value": item_total_value,
            "avg_cost": item.get("cost_per_unit", 0),
            "reorder_point": item.get("reorder_point"),
            "is_below_reorder": item.get("reorder_point") and item_total_qty <= item.get("reorder_point"),
            "locations": locations
        })
    
    return {
        "report_date": datetime.now(timezone.utc),
        "total_items": len(report_items),
        "total_quantity": total_quantity,
        "total_value": total_value,
        "by_category": by_category,
        "by_location": by_location,
        "items": report_items
    }

@router.get("/reports/export/csv")
async def export_csv(
    report_type: str = Query(..., enum=["stock", "valuation", "transactions"]),
    current_user: dict = Depends(get_current_user)
):
    """Export report as CSV"""
    from fastapi.responses import StreamingResponse
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    if report_type == "stock":
        # Stock levels CSV
        writer.writerow(["SKU", "Name", "Category", "Unit", "Total Qty", "Avg Cost", "Total Value", "Reorder Point", "Below Reorder"])
        
        items = await db.inventory_items.find({"is_active": True}).to_list(1000)
        for item in items:
            total_value = item.get("total_quantity", 0) * item.get("cost_per_unit", 0)
            is_below = "Yes" if item.get("reorder_point") and item.get("total_quantity", 0) <= item.get("reorder_point") else "No"
            writer.writerow([
                item.get("sku"),
                item.get("name"),
                item.get("category"),
                item.get("unit_of_measure"),
                item.get("total_quantity", 0),
                item.get("cost_per_unit", 0),
                total_value,
                item.get("reorder_point", ""),
                is_below
            ])
    
    elif report_type == "valuation":
        # Valuation CSV
        writer.writerow(["SKU", "Name", "Category", "Unit", "Quantity", "Avg Cost", "Total Value"])
        
        items = await db.inventory_items.find({"is_active": True}).to_list(1000)
        for item in items:
            total_value = item.get("total_quantity", 0) * item.get("cost_per_unit", 0)
            writer.writerow([
                item.get("sku"),
                item.get("name"),
                item.get("category"),
                item.get("unit_of_measure"),
                item.get("total_quantity", 0),
                item.get("cost_per_unit", 0),
                total_value
            ])
    
    elif report_type == "transactions":
        # Transactions CSV
        writer.writerow(["Date", "Type", "SKU", "Item", "From Location", "To Location", "Quantity", "Unit Cost", "Total Cost", "Order #", "Reference", "Performed By"])
        
        transactions = await db.inventory_transactions.find().sort("created_at", -1).to_list(10000)
        for tx in transactions:
            writer.writerow([
                tx.get("created_at").isoformat() if tx.get("created_at") else "",
                tx.get("transaction_type"),
                tx.get("item_sku"),
                tx.get("item_name"),
                tx.get("from_location_name", ""),
                tx.get("to_location_name", ""),
                tx.get("quantity"),
                tx.get("unit_cost"),
                tx.get("total_cost"),
                tx.get("order_number", ""),
                tx.get("reference_number", ""),
                tx.get("performed_by_name")
            ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=inventory_{report_type}_{datetime.now().strftime('%Y%m%d')}.csv"
        }
    )

# ============ CSV IMPORT ============

@router.post("/import/items", response_model=CSVImportResult)
async def import_items_csv(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin)
):
    """Import inventory items from CSV (Admin only)"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    success_count = 0
    error_count = 0
    errors = []
    created_ids = []
    
    now = datetime.now(timezone.utc)
    
    for row_num, row in enumerate(reader, start=2):  # Start at 2 (1 is header)
        try:
            # Validate required fields
            if not row.get('sku') or not row.get('name'):
                errors.append({"row": row_num, "error": "SKU and Name are required"})
                error_count += 1
                continue
            
            # Check for duplicate SKU
            existing = await db.inventory_items.find_one({"sku": row['sku']})
            if existing:
                errors.append({"row": row_num, "field": "sku", "error": f"SKU {row['sku']} already exists"})
                error_count += 1
                continue
            
            item_id = str(uuid.uuid4())
            new_item = {
                "id": item_id,
                "sku": row['sku'].strip(),
                "name": row['name'].strip(),
                "description": row.get('description', '').strip() or None,
                "category": row.get('category', 'component').strip() or 'component',
                "unit_of_measure": row.get('unit_of_measure', 'each').strip() or 'each',
                "track_individually": row.get('track_individually', '').lower() == 'true',
                "barcode_type": row.get('barcode_type', 'sku').strip() or 'sku',
                "default_location": row.get('default_location', '').strip() or None,
                "cost_per_unit": float(row.get('cost_per_unit', 0) or 0),
                "total_cost_value": 0,
                "total_quantity": 0,
                "reorder_point": float(row.get('reorder_point')) if row.get('reorder_point') else None,
                "reorder_quantity": float(row.get('reorder_quantity')) if row.get('reorder_quantity') else None,
                "supplier": row.get('supplier', '').strip() or None,
                "supplier_sku": row.get('supplier_sku', '').strip() or None,
                "is_active": True,
                "created_at": now,
                "updated_at": now
            }
            
            await db.inventory_items.insert_one(new_item)
            created_ids.append(item_id)
            success_count += 1
            
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})
            error_count += 1
    
    return {
        "success_count": success_count,
        "error_count": error_count,
        "errors": errors,
        "created_ids": created_ids
    }

@router.post("/import/stock", response_model=CSVImportResult)
async def import_stock_csv(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin)
):
    """Import initial stock levels from CSV (Admin only)"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    success_count = 0
    error_count = 0
    errors = []
    created_ids = []
    
    now = datetime.now(timezone.utc)
    
    for row_num, row in enumerate(reader, start=2):
        try:
            sku = row.get('sku', '').strip()
            location_code = row.get('location_code', '').strip()
            quantity = float(row.get('quantity', 0) or 0)
            
            if not sku or not location_code:
                errors.append({"row": row_num, "error": "SKU and Location Code are required"})
                error_count += 1
                continue
            
            # Find item and location
            item = await db.inventory_items.find_one({"sku": sku})
            if not item:
                errors.append({"row": row_num, "error": f"Item SKU {sku} not found"})
                error_count += 1
                continue
            
            location = await db.inventory_locations.find_one({"code": location_code})
            if not location:
                errors.append({"row": row_num, "error": f"Location {location_code} not found"})
                error_count += 1
                continue
            
            # Create or update stock
            stock = await db.inventory_stock.find_one({
                "item_id": item["id"],
                "location_id": location["id"]
            })
            
            if stock:
                await db.inventory_stock.update_one(
                    {"id": stock["id"]},
                    {"$set": {
                        "quantity": quantity,
                        "available_quantity": quantity,
                        "reserved_quantity": 0,
                        "last_count_date": now,
                        "last_count_quantity": quantity,
                        "updated_at": now
                    }}
                )
            else:
                stock_id = str(uuid.uuid4())
                await db.inventory_stock.insert_one({
                    "id": stock_id,
                    "item_id": item["id"],
                    "location_id": location["id"],
                    "quantity": quantity,
                    "reserved_quantity": 0,
                    "available_quantity": quantity,
                    "last_count_date": now,
                    "last_count_quantity": quantity,
                    "updated_at": now
                })
                created_ids.append(stock_id)
            
            # Update item totals
            await update_item_totals(item["id"])
            
            # Record transaction
            await record_transaction(
                transaction_type="adjust",
                item_id=item["id"],
                quantity=quantity,
                unit_cost=item.get("cost_per_unit", 0),
                user_id=current_user["id"],
                user_name=current_user.get("name", current_user.get("email")),
                to_location_id=location["id"],
                reference_number="Initial Stock Import",
                notes=f"CSV import row {row_num}"
            )
            
            success_count += 1
            
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})
            error_count += 1
    
    return {
        "success_count": success_count,
        "error_count": error_count,
        "errors": errors,
        "created_ids": created_ids
    }

# ============ BARCODE LOOKUP ============

@router.get("/barcode/{barcode}")
async def lookup_barcode(
    barcode: str,
    current_user: dict = Depends(get_current_user)
):
    """Lookup item by barcode (for mobile scanning)"""
    # First check serial items (individual barcodes)
    serial = await db.inventory_serial_items.find_one({"barcode": barcode}, {"_id": 0})
    if serial:
        item = await db.inventory_items.find_one({"id": serial["item_id"]}, {"_id": 0})
        location = await db.inventory_locations.find_one({"id": serial["location_id"]}, {"_id": 0})
        return {
            "type": "serial",
            "serial_item": {
                **serial,
                "item_sku": item.get("sku") if item else None,
                "item_name": item.get("name") if item else None,
                "location_name": location.get("name") if location else None
            },
            "item": item
        }
    
    # Check SKU barcode
    item = await db.inventory_items.find_one({"sku": barcode}, {"_id": 0})
    if item:
        # Get stock levels
        stocks = await db.inventory_stock.find({"item_id": item["id"]}).to_list(100)
        locations = []
        for stock in stocks:
            location = await db.inventory_locations.find_one({"id": stock["location_id"]})
            if location:
                locations.append({
                    "location_id": location["id"],
                    "location_name": location.get("name"),
                    "quantity": stock.get("quantity", 0),
                    "available": stock.get("available_quantity", 0)
                })
        
        return {
            "type": "sku",
            "item": item,
            "stock_by_location": locations
        }
    
    raise HTTPException(status_code=404, detail="Barcode not found")

# ============ SEED DEFAULT LOCATIONS ============

@router.post("/seed-locations")
async def seed_default_locations(
    current_user: dict = Depends(require_admin)
):
    """Seed default department locations (Admin only, run once)"""
    default_locations = [
        {"code": "receiving", "name": "Receiving", "location_type": "receiving"},
        {"code": "powder_coat", "name": "Powder Coat", "location_type": "production"},
        {"code": "polish", "name": "Polish", "location_type": "production"},
        {"code": "finishing", "name": "Finishing", "location_type": "production"},
        {"code": "assembly", "name": "Assembly", "location_type": "production"},
        {"code": "steering_wheels", "name": "Steering Wheels", "location_type": "production"},
        {"code": "wheel_caps", "name": "Wheel Caps", "location_type": "production"},
        {"code": "shipping", "name": "Shipping", "location_type": "shipping"},
        {"code": "storage", "name": "General Storage", "location_type": "storage"},
    ]
    
    created = 0
    for loc in default_locations:
        existing = await db.inventory_locations.find_one({"code": loc["code"]})
        if not existing:
            await db.inventory_locations.insert_one({
                "id": str(uuid.uuid4()),
                **loc,
                "description": f"{loc['name']} Department",
                "is_active": True,
                "created_at": datetime.now(timezone.utc)
            })
            created += 1
    
    return {"message": f"Created {created} locations", "total": len(default_locations)}



# ============ PROFIT & LOSS REPORT ============

@router.get("/reports/profit-loss")
async def profit_loss_report(
    period: str = Query("month", enum=["day", "week", "month", "custom"]),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    location_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Generate Profit & Loss report based on inventory usage"""
    now = datetime.now(timezone.utc)
    
    # Calculate date range
    if period == "day":
        period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        period_end = now
    elif period == "week":
        period_start = now - timedelta(days=now.weekday())
        period_start = period_start.replace(hour=0, minute=0, second=0, microsecond=0)
        period_end = now
    elif period == "month":
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = now
    elif period == "custom" and start_date and end_date:
        period_start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        period_end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    else:
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = now
    
    # Query transactions (picks, transfers out = usage)
    query = {
        "transaction_type": {"$in": ["pick", "transfer", "adjust"]},
        "created_at": {"$gte": period_start, "$lte": period_end}
    }
    
    if location_id:
        query["from_location_id"] = location_id
    
    transactions = await db.inventory_transactions.find(query).to_list(10000)
    
    # Aggregate by item
    item_usage = {}
    for tx in transactions:
        item_id = tx.get("item_id")
        if not item_id:
            continue
        
        # Only count outgoing (picks and transfers OUT)
        if tx["transaction_type"] == "pick" or (tx["transaction_type"] == "transfer" and tx.get("from_location_id")):
            qty = abs(tx.get("quantity", 0))
            if tx["transaction_type"] == "adjust" and tx.get("quantity", 0) > 0:
                continue  # Skip positive adjustments (they're additions, not usage)
            
            if item_id not in item_usage:
                item_usage[item_id] = {"quantity": 0, "cost": 0}
            item_usage[item_id]["quantity"] += qty
            item_usage[item_id]["cost"] += qty * tx.get("unit_cost", 0)
    
    # Build report items
    report_items = []
    total_cost = 0
    total_revenue = 0
    by_category = {}
    by_location = {}
    
    for item_id, usage in item_usage.items():
        item = await db.inventory_items.find_one({"id": item_id})
        if not item:
            continue
        
        qty = usage["quantity"]
        cost = usage["cost"]
        sell_price = item.get("sell_price", 0)
        revenue = qty * sell_price
        profit = revenue - cost
        margin = (profit / revenue * 100) if revenue > 0 else 0
        
        report_items.append({
            "item_id": item_id,
            "sku": item.get("sku"),
            "name": item.get("name"),
            "category": item.get("category"),
            "quantity_used": qty,
            "unit_of_measure": item.get("unit_of_measure"),
            "cost_per_unit": item.get("cost_per_unit", 0),
            "sell_price": sell_price,
            "total_cost": cost,
            "total_revenue": revenue,
            "profit": profit,
            "margin_percent": round(margin, 2)
        })
        
        total_cost += cost
        total_revenue += revenue
        
        # By category
        cat = item.get("category", "unknown")
        if cat not in by_category:
            by_category[cat] = {"cost": 0, "revenue": 0, "profit": 0}
        by_category[cat]["cost"] += cost
        by_category[cat]["revenue"] += revenue
        by_category[cat]["profit"] += profit
        
        # By location (default location)
        loc = item.get("default_location", "unknown")
        if loc not in by_location:
            by_location[loc] = {"cost": 0, "revenue": 0, "profit": 0}
        by_location[loc]["cost"] += cost
        by_location[loc]["revenue"] += revenue
        by_location[loc]["profit"] += profit
    
    total_profit = total_revenue - total_cost
    overall_margin = (total_profit / total_revenue * 100) if total_revenue > 0 else 0
    
    return {
        "report_date": now.isoformat(),
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "period_type": period,
        "total_items_used": len(report_items),
        "total_cost": round(total_cost, 2),
        "total_revenue": round(total_revenue, 2),
        "total_profit": round(total_profit, 2),
        "overall_margin": round(overall_margin, 2),
        "by_category": by_category,
        "by_location": by_location,
        "items": sorted(report_items, key=lambda x: x["profit"], reverse=True)
    }

@router.get("/reports/profit-loss/export/csv")
async def export_profit_loss_csv(
    period: str = Query("month", enum=["day", "week", "month", "custom"]),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export Profit & Loss report as CSV"""
    from fastapi.responses import StreamingResponse
    
    # Get the report data
    report = await profit_loss_report(period, start_date, end_date, None, current_user)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header info
    writer.writerow(["Profit & Loss Report"])
    writer.writerow([f"Period: {report['period_start'][:10]} to {report['period_end'][:10]}"])
    writer.writerow([])
    writer.writerow(["Summary"])
    writer.writerow(["Total Cost", f"${report['total_cost']:.2f}"])
    writer.writerow(["Total Revenue", f"${report['total_revenue']:.2f}"])
    writer.writerow(["Total Profit", f"${report['total_profit']:.2f}"])
    writer.writerow(["Overall Margin", f"{report['overall_margin']:.2f}%"])
    writer.writerow([])
    
    # Detail rows
    writer.writerow(["SKU", "Name", "Category", "Qty Used", "Unit", "Cost/Unit", "Sell Price", "Total Cost", "Total Revenue", "Profit", "Margin %"])
    
    for item in report['items']:
        writer.writerow([
            item['sku'],
            item['name'],
            item['category'],
            item['quantity_used'],
            item['unit_of_measure'],
            f"${item['cost_per_unit']:.2f}",
            f"${item['sell_price']:.2f}",
            f"${item['total_cost']:.2f}",
            f"${item['total_revenue']:.2f}",
            f"${item['profit']:.2f}",
            f"{item['margin_percent']:.2f}%"
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=profit_loss_{report['period_start'][:10]}_{report['period_end'][:10]}.csv"
        }
    )

# ============ ATTACHMENTS ============

@router.post("/items/{item_id}/attachments")
async def upload_item_attachment(
    item_id: str,
    file: UploadFile = File(...),
    notes: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Upload an attachment to an inventory item"""
    item = await db.inventory_items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    # Determine file type
    filename = file.filename or "unknown"
    ext = filename.split('.')[-1].lower() if '.' in filename else 'unknown'
    file_type = "pdf" if ext == "pdf" else "image" if ext in ["jpg", "jpeg", "png", "gif", "webp"] else "other"
    
    # Store as base64 in database (for simplicity - production would use S3/cloud storage)
    file_b64 = base64.b64encode(content).decode('utf-8')
    content_type = file.content_type or "application/octet-stream"
    data_url = f"data:{content_type};base64,{file_b64}"
    
    # Create thumbnail for images
    thumbnail_url = None
    if file_type == "image":
        thumbnail_url = data_url  # For simplicity, use same image
    
    attachment = {
        "id": str(uuid.uuid4()),
        "filename": filename,
        "file_type": file_type,
        "url": data_url,
        "thumbnail_url": thumbnail_url,
        "size_bytes": file_size,
        "notes": notes,
        "uploaded_by": current_user["id"],
        "uploaded_by_name": current_user.get("name", current_user.get("email")),
        "created_at": datetime.now(timezone.utc)
    }
    
    # Add to item's attachments array
    await db.inventory_items.update_one(
        {"id": item_id},
        {"$push": {"attachments": attachment}}
    )
    
    return attachment

@router.delete("/items/{item_id}/attachments/{attachment_id}")
async def delete_item_attachment(
    item_id: str,
    attachment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an attachment from an inventory item"""
    result = await db.inventory_items.update_one(
        {"id": item_id},
        {"$pull": {"attachments": {"id": attachment_id}}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return {"message": "Attachment deleted"}

@router.post("/transactions/{transaction_id}/attachments")
async def upload_transaction_attachment(
    transaction_id: str,
    file: UploadFile = File(...),
    notes: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Upload an attachment to a transaction (e.g., receipt, invoice)"""
    tx = await db.inventory_transactions.find_one({"id": transaction_id})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    content = await file.read()
    file_size = len(content)
    
    filename = file.filename or "unknown"
    ext = filename.split('.')[-1].lower() if '.' in filename else 'unknown'
    file_type = "pdf" if ext == "pdf" else "image" if ext in ["jpg", "jpeg", "png", "gif", "webp"] else "other"
    
    file_b64 = base64.b64encode(content).decode('utf-8')
    content_type = file.content_type or "application/octet-stream"
    data_url = f"data:{content_type};base64,{file_b64}"
    
    thumbnail_url = data_url if file_type == "image" else None
    
    attachment = {
        "id": str(uuid.uuid4()),
        "filename": filename,
        "file_type": file_type,
        "url": data_url,
        "thumbnail_url": thumbnail_url,
        "size_bytes": file_size,
        "notes": notes,
        "uploaded_by": current_user["id"],
        "uploaded_by_name": current_user.get("name", current_user.get("email")),
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.inventory_transactions.update_one(
        {"id": transaction_id},
        {"$push": {"attachments": attachment}}
    )
    
    return attachment

# ============ QUICKBOOKS CSV IMPORT ============

@router.post("/import/quickbooks-csv", response_model=CSVImportResult)
async def import_quickbooks_csv(
    file: UploadFile = File(...),
    default_location: Optional[str] = Form(None),
    current_user: dict = Depends(require_admin)
):
    """
    Import inventory from QuickBooks CSV export (Admin only)
    
    Expected columns (flexible mapping):
    - Item Name / Name / Product/Service
    - SKU / Item Number / Part Number
    - Description
    - Type / Category
    - Qty / Quantity / Quantity On Hand
    - Cost / Avg Cost / Purchase Cost
    - Sales Price / Sell Price / Price
    - Reorder Point
    - Vendor / Supplier
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    content = await file.read()
    decoded = content.decode('utf-8-sig')  # Handle BOM from Excel
    reader = csv.DictReader(io.StringIO(decoded))
    
    # Column mapping (try multiple possible column names)
    def get_value(row, possible_keys, default=""):
        for key in possible_keys:
            if key in row and row[key]:
                return row[key].strip()
            # Try case-insensitive
            for k in row.keys():
                if k.lower() == key.lower() and row[k]:
                    return row[k].strip()
        return default
    
    success_count = 0
    error_count = 0
    errors = []
    created_ids = []
    
    now = datetime.now(timezone.utc)
    
    for row_num, row in enumerate(reader, start=2):
        try:
            # Extract values with flexible column mapping
            name = get_value(row, ['Item Name', 'Name', 'Product/Service', 'Item', 'Product Name', 'Description'])
            sku = get_value(row, ['SKU', 'Item Number', 'Part Number', 'Product Code', 'Item #', 'Code'])
            description = get_value(row, ['Description', 'Desc', 'Notes', 'Memo'])
            category = get_value(row, ['Type', 'Category', 'Item Type', 'Product Type'], 'component')
            qty_str = get_value(row, ['Qty', 'Quantity', 'Quantity On Hand', 'QOH', 'Stock', 'On Hand'], '0')
            cost_str = get_value(row, ['Cost', 'Avg Cost', 'Purchase Cost', 'Unit Cost', 'Cost Price'], '0')
            sell_str = get_value(row, ['Sales Price', 'Sell Price', 'Price', 'Rate', 'Unit Price'], '0')
            reorder_str = get_value(row, ['Reorder Point', 'Reorder', 'Min Qty', 'Minimum'], '')
            supplier = get_value(row, ['Vendor', 'Supplier', 'Preferred Vendor', 'Supplier Name'])
            uom = get_value(row, ['Unit', 'UOM', 'Unit of Measure'], 'each')
            
            if not name:
                errors.append({"row": row_num, "error": "Name is required"})
                error_count += 1
                continue
            
            # Generate SKU if not provided
            if not sku:
                sku = name.upper().replace(' ', '-')[:20] + f"-{row_num}"
            
            # Check for duplicate SKU
            existing = await db.inventory_items.find_one({"sku": sku})
            if existing:
                errors.append({"row": row_num, "field": "sku", "error": f"SKU {sku} already exists"})
                error_count += 1
                continue
            
            # Parse numeric values
            try:
                qty = float(qty_str.replace(',', '').replace('$', '')) if qty_str else 0
            except:
                qty = 0
            
            try:
                cost = float(cost_str.replace(',', '').replace('$', '')) if cost_str else 0
            except:
                cost = 0
            
            try:
                sell = float(sell_str.replace(',', '').replace('$', '')) if sell_str else 0
            except:
                sell = 0
            
            try:
                reorder = float(reorder_str.replace(',', '').replace('$', '')) if reorder_str else None
            except:
                reorder = None
            
            # Map category
            cat_lower = category.lower()
            if 'consumable' in cat_lower or 'supply' in cat_lower or 'expense' in cat_lower:
                category = 'consumable'
            elif 'finished' in cat_lower or 'inventory' in cat_lower:
                category = 'finished_good'
            else:
                category = 'component'
            
            # Map UOM
            uom_lower = uom.lower()
            if 'lb' in uom_lower or 'pound' in uom_lower:
                uom = 'lbs'
            elif 'kg' in uom_lower or 'kilo' in uom_lower:
                uom = 'kg'
            elif 'ft' in uom_lower or 'feet' in uom_lower or 'foot' in uom_lower:
                uom = 'ft'
            elif 'gal' in uom_lower:
                uom = 'gallons'
            else:
                uom = 'each'
            
            item_id = str(uuid.uuid4())
            new_item = {
                "id": item_id,
                "sku": sku,
                "name": name,
                "description": description or None,
                "category": category,
                "unit_of_measure": uom,
                "track_individually": False,
                "barcode_type": "sku",
                "default_location": default_location,
                "cost_per_unit": cost,
                "sell_price": sell,
                "total_cost_value": qty * cost,
                "total_quantity": qty,
                "reorder_point": reorder,
                "reorder_quantity": None,
                "supplier": supplier or None,
                "supplier_sku": None,
                "attachments": [],
                "is_active": True,
                "created_at": now,
                "updated_at": now
            }
            
            await db.inventory_items.insert_one(new_item)
            created_ids.append(item_id)
            
            # If quantity > 0, create stock record
            if qty > 0 and default_location:
                location = await db.inventory_locations.find_one({"code": default_location})
                if location:
                    stock_id = str(uuid.uuid4())
                    await db.inventory_stock.insert_one({
                        "id": stock_id,
                        "item_id": item_id,
                        "location_id": location["id"],
                        "quantity": qty,
                        "reserved_quantity": 0,
                        "available_quantity": qty,
                        "last_count_date": now,
                        "last_count_quantity": qty,
                        "updated_at": now
                    })
                    
                    # Record transaction
                    await db.inventory_transactions.insert_one({
                        "id": str(uuid.uuid4()),
                        "transaction_type": "receive",
                        "item_id": item_id,
                        "item_sku": sku,
                        "item_name": name,
                        "serial_id": None,
                        "serial_number": None,
                        "from_location_id": None,
                        "from_location_name": None,
                        "to_location_id": location["id"],
                        "to_location_name": location["name"],
                        "quantity": qty,
                        "unit_cost": cost,
                        "total_cost": qty * cost,
                        "order_id": None,
                        "order_number": None,
                        "pick_list_id": None,
                        "reference_number": "QuickBooks Import",
                        "notes": f"Imported from QuickBooks CSV - Row {row_num}",
                        "performed_by": current_user["id"],
                        "performed_by_name": current_user.get("name", current_user.get("email")),
                        "attachments": [],
                        "created_at": now
                    })
            
            success_count += 1
            
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})
            error_count += 1
    
    return {
        "success_count": success_count,
        "error_count": error_count,
        "errors": errors[:50],  # Limit errors returned
        "created_ids": created_ids
    }

@router.get("/import/quickbooks-template")
async def download_quickbooks_template(
    current_user: dict = Depends(get_current_user)
):
    """Download a CSV template for QuickBooks import"""
    from fastapi.responses import StreamingResponse
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header row
    writer.writerow([
        "SKU", "Item Name", "Description", "Category", "Quantity", 
        "Cost", "Sales Price", "Reorder Point", "Vendor", "Unit"
    ])
    
    # Example rows
    writer.writerow([
        "RAW-LIPS-22", "Raw Lips 22 inch", "22 inch raw aluminum lips", "component", 
        "50", "45.00", "85.00", "10", "Lip Supplier Co", "each"
    ])
    writer.writerow([
        "PWD-BLACK", "Black Powder Coat", "Gloss black powder coat", "consumable", 
        "100", "8.50", "15.00", "5", "Powder Depot", "lbs"
    ])
    writer.writerow([
        "SCR-SS-M6", "Stainless Screw M6", "M6 stainless steel screws", "component", 
        "5000", "0.15", "0.35", "500", "FastenerCo", "each"
    ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=quickbooks_import_template.csv"
        }
    )
