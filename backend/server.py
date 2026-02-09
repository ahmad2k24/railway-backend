from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, Response, RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt

# Language detection and translation for order notes
from langdetect import detect, LangDetectException
from deep_translator import GoogleTranslator

# Import inventory routes
from routes.inventory import router as inventory_router, init_inventory_routes

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create uploads directory
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# MongoDB connection with Connection Pooling for better performance
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=10,  # Keep 10 connections warm
    minPoolSize=2,   # Always maintain at least 2 connections
    maxIdleTimeMS=30000,  # Close idle connections after 30 seconds
    connectTimeoutMS=10000,  # 10 second connection timeout
    serverSelectionTimeoutMS=10000,  # 10 second server selection timeout
    retryWrites=True,  # Automatically retry failed writes
    retryReads=True    # Automatically retry failed reads
)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'wheelstat-secret-key-2024')
JWT_ALGORITHM = "HS256"

security = HTTPBearer()

# Rate Limiting Configuration
MAX_LOGIN_ATTEMPTS = 10  # Maximum failed attempts before lockout
LOCKOUT_DURATION_MINUTES = 5  # Lockout duration in minutes

# In-memory store for tracking failed login attempts
# Format: {"identifier": {"attempts": int, "lockout_until": datetime or None}}
failed_login_attempts = {}

# ===== TRANSLATION HELPER FUNCTIONS =====
# Auto-detect language and translate notes to English for search
def detect_language(text: str) -> str:
    """Detect the language of a text. Returns ISO 639-1 code (e.g., 'en', 'es', 'ar')"""
    if not text or len(text.strip()) < 3:
        return "en"  # Default to English for very short texts
    try:
        return detect(text)
    except LangDetectException:
        return "en"  # Default to English if detection fails

def translate_to_english(text: str, source_lang: str) -> Optional[str]:
    """Translate text to English. Returns None if already English or translation fails."""
    if source_lang == "en" or not text:
        return None
    try:
        translator = GoogleTranslator(source=source_lang, target='en')
        translated = translator.translate(text)
        return translated
    except Exception as e:
        logger.warning(f"Translation failed for '{text[:50]}...': {e}")
        return None

def process_note_translation(text: str) -> dict:
    """
    Process a note for translation.
    Returns dict with: original_text, detected_language, english_translation (if applicable)
    
    IMPORTANT: This only affects display/search - original data is preserved in MongoDB.
    """
    detected_lang = detect_language(text)
    result = {
        "original_text": text,
        "detected_language": detected_lang,
        "english_translation": None,
        "is_translated": False
    }
    
    if detected_lang != "en":
        translation = translate_to_english(text, detected_lang)
        if translation and translation != text:
            result["english_translation"] = translation
            result["is_translated"] = True
    
    return result

# ===== IN-MEMORY CACHE WITH TTL =====
# Simple cache for frequently accessed data (orders, stats, users)
# This reduces database load without requiring Redis infrastructure
import time
from functools import wraps
import hashlib
import json

class InMemoryCache:
    """Thread-safe in-memory cache with TTL support"""
    def __init__(self, default_ttl: int = 300):
        self._cache = {}
        self._default_ttl = default_ttl
    
    def _is_expired(self, key: str) -> bool:
        if key not in self._cache:
            return True
        entry = self._cache[key]
        return time.time() > entry["expires_at"]
    
    def get(self, key: str):
        if self._is_expired(key):
            self._cache.pop(key, None)
            return None
        return self._cache[key]["value"]
    
    def set(self, key: str, value, ttl: int = None):
        ttl = ttl or self._default_ttl
        self._cache[key] = {
            "value": value,
            "expires_at": time.time() + ttl
        }
    
    def delete(self, key: str):
        self._cache.pop(key, None)
    
    def invalidate_pattern(self, pattern: str):
        """Delete all keys matching a pattern (e.g., 'orders:*')"""
        keys_to_delete = [k for k in self._cache.keys() if k.startswith(pattern.replace('*', ''))]
        for key in keys_to_delete:
            self._cache.pop(key, None)
    
    def clear(self):
        self._cache.clear()
    
    def get_stats(self) -> dict:
        """Return cache statistics"""
        valid = sum(1 for k in self._cache if not self._is_expired(k))
        return {
            "total_entries": len(self._cache),
            "valid_entries": valid,
            "expired_entries": len(self._cache) - valid
        }

# Global cache instance
cache = InMemoryCache(default_ttl=300)  # 5 minute default TTL

def cache_key(*args, **kwargs) -> str:
    """Generate cache key from arguments"""
    key_parts = [str(arg) for arg in args]
    key_parts.extend([f"{k}:{v}" for k, v in sorted(kwargs.items())])
    key_str = "|".join(key_parts)
    return hashlib.md5(key_str.encode()).hexdigest()

# ===== END CACHE CONFIGURATION =====

# ===== ACTIVITY LOGGING HELPER =====
async def log_activity(
    action_type: str,
    user_id: str = None,
    user_name: str = None,
    description: str = None,
    order_id: str = None,
    order_number: str = None,
    customer_name: str = None,
    product_type: str = None,
    extra_data: dict = None
):
    """Log an activity to the activity_log collection for tracking user actions."""
    activity = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action_type": action_type,
        "user_id": user_id,
        "user_name": user_name,
        "description": description,
        "order_id": order_id,
        "order_number": order_number,
        "customer_name": customer_name,
        "product_type": product_type
    }
    if extra_data:
        activity.update(extra_data)
    
    await db.activity_log.insert_one(activity)

# ===== END ACTIVITY LOGGING =====

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Root-level health check for Kubernetes (must be at /health, not /api/health)
@app.get("/health")
async def root_health_check():
    return {"status": "healthy"}

# Department flow order
DEPARTMENTS = [
    "received",
    "design", 
    "program",
    "machine_waiting",
    "machine",
    "finishing",
    "powder_coat",
    "assemble",
    "showroom",
    "shipped",
    "completed"
]

DEPARTMENT_LABELS = {
    "received": "Sales",
    "design": "Design",
    "program": "Program",
    "machine_waiting": "Machine Waiting",
    "machine": "Machine",
    "finishing": "Finishing",
    "powder_coat": "Powder Coat",
    "assemble": "Assemble",
    "showroom": "Showroom",
    "shipped": "Shipped",
    "completed": "Completed Orders"
}

# Models
class UserCreate(BaseModel):
    email: Optional[str] = None  # Email is now optional - can use username instead
    username: Optional[str] = None  # Username option for login
    password: str
    name: str
    departments: Optional[List[str]] = None  # Up to 4 departments
    department: Optional[str] = None  # Single department (backwards compatibility)
    role: str = "staff"
    admin_pin: Optional[str] = None  # Required if registering as admin
    employee_code: Optional[str] = None  # Required for staff registration
    salesperson_id: Optional[str] = None  # Link to salesperson for commission tracking

class UserLogin(BaseModel):
    email: Optional[str] = None  # Email OR username
    username: Optional[str] = None  # Username option for login
    password: str

class SetPin(BaseModel):
    pin: str  # 4-digit PIN

class UserResponse(BaseModel):
    id: str
    email: Optional[str] = None
    username: Optional[str] = None
    name: str
    department: str  # Primary department (first one)
    departments: List[str] = []  # All departments
    role: str
    salesperson_id: Optional[str] = None  # Link to salesperson for commission

class EmployeeCodeCreate(BaseModel):
    code: str

class OrderCreate(BaseModel):
    order_number: str  # Custom order number entered by user
    customer_name: str
    phone: Optional[str] = ""
    product_type: str  # steering_wheel, rim, or cap types
    wheel_specs: Optional[str] = ""  # Now optional
    notes: Optional[str] = ""
    quantity: Optional[int] = 1  # Quantity for caps
    linked_order_id: Optional[str] = None  # Links caps to a rim order
    vehicle_make: Optional[str] = ""  # Vehicle make (e.g., Ford, Chevy)
    vehicle_model: Optional[str] = ""  # Vehicle model (e.g., F-150, Silverado)
    rim_size: Optional[str] = ""  # Rim size category (20", 22", etc.)
    cut_status: Optional[str] = "waiting"  # For steering wheels & caps: waiting, cut, processing
    steering_wheel_brand: Optional[str] = ""  # Brand for steering wheels (e.g., Grant, Momo)
    order_date: Optional[str] = ""  # Custom order date (optional, uses current date if empty)
    has_tires: Optional[bool] = False  # Whether order includes tires
    has_custom_caps: Optional[bool] = False  # Whether order includes custom caps
    has_race_car_caps: Optional[bool] = False  # Whether order includes race car caps
    has_steering_wheel: Optional[bool] = False  # Whether order includes steering wheel (purple indicator)
    lalo_status: Optional[str] = "not_sent"  # Lalo queue status
    rim_size_front: Optional[str] = ""  # Front rim size (for staggered setups)
    rim_size_rear: Optional[str] = ""  # Rear rim size (for staggered setups)
    tire_size: Optional[str] = ""  # Optional tire size (e.g., 275/40R20)
    sold_by: Optional[str] = None  # Salesperson ID who sold this order
    # Manual Payment Tracking
    payment_status: Optional[str] = "unpaid"  # unpaid, deposit, paid_in_full
    payment_total: Optional[float] = 0.0  # Total order amount
    deposit_amount: Optional[float] = 0.0  # Deposit received
    balance_due: Optional[float] = 0.0  # Remaining balance
    payment_notes: Optional[str] = ""  # Payment notes (e.g., "Cash", "Zelle", "Check #123")
    # Production Priority (auto-calculated based on payment percentage)
    percentage_paid: Optional[float] = 0.0  # Deposit / Total * 100
    production_priority: Optional[str] = "waiting_deposit"  # waiting_deposit, ready_production, fully_paid

# Product types and their labels
PRODUCT_TYPES = {
    "rim": "Rim",
    "steering_wheel": "Steering Wheel",
    "standard_caps": "Standard Caps",
    "floater_caps": "Floater Caps",
    "xxl_caps": "XXL Caps",
    "dually_floating_caps": "Dually Floating Caps",
    "offroad_floating_caps": "Off-Road Floating Caps",
    "custom_caps": "Custom Caps",
    "race_car_caps": "Tall Caps"
}

CAP_TYPES = ["standard_caps", "floater_caps", "xxl_caps", "dually_floating_caps", "offroad_floating_caps", "custom_caps", "race_car_caps"]

# Rim sizes
RIM_SIZES = ["19", "20", "21", "22", "24", "26", "28", "30", "32", "34"]

# Lalo Queue statuses (for orders sent to California for gold/chrome dipping)
LALO_STATUS = {
    "not_sent": "Not Sent",
    "shipped_to_lalo": "Shipped to Lalo",
    "at_lalo": "At Lalo (Processing)",
    "returned": "Returned from Lalo",
    "waiting_shipping": "Waiting for Shipping"
}

# Cut status options
CUT_STATUS = {
    "waiting": "Waiting to Process",
    "processing": "Processing",
    "cut": "Cut Complete"
}

# Payment status options
PAYMENT_STATUS = {
    "unpaid": "Unpaid",
    "deposit": "Deposit Received",
    "paid_in_full": "Paid in Full"
}

# Production priority options (based on payment percentage)
PRODUCTION_PRIORITY = {
    "waiting_deposit": "Waiting for Deposit",  # Under 50%
    "ready_production": "Ready for Production",  # 50% or more
    "fully_paid": "Fully Paid"  # 100%
}

# Helper function to calculate production priority
def calculate_production_priority(deposit_amount: float, payment_total: float) -> dict:
    """Calculate percentage paid and production priority based on deposit/total ratio"""
    if payment_total <= 0:
        return {
            "percentage_paid": 0.0,
            "production_priority": "waiting_deposit",
            "balance_due": 0.0
        }
    
    percentage = (deposit_amount / payment_total) * 100
    balance = max(0, payment_total - deposit_amount)
    
    if percentage >= 100:
        priority = "fully_paid"
    elif percentage >= 50:
        priority = "ready_production"
    else:
        priority = "waiting_deposit"
    
    return {
        "percentage_paid": round(percentage, 2),
        "production_priority": priority,
        "balance_due": round(balance, 2)
    }

class OrderUpdate(BaseModel):
    order_number: Optional[str] = None
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    wheel_specs: Optional[str] = None
    notes: Optional[str] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    rim_size: Optional[str] = None
    rim_size_front: Optional[str] = None
    rim_size_rear: Optional[str] = None
    cut_status: Optional[str] = None
    product_type: Optional[str] = None
    quantity: Optional[int] = None
    steering_wheel_brand: Optional[str] = None
    order_date: Optional[str] = None  # Allow editing order date
    has_tires: Optional[bool] = None  # Toggle tires
    has_custom_caps: Optional[bool] = None  # Toggle custom caps
    has_race_car_caps: Optional[bool] = None  # Toggle race car caps
    has_steering_wheel: Optional[bool] = None  # Toggle steering wheel
    lalo_status: Optional[str] = None  # Lalo queue status
    tire_size: Optional[str] = None  # Optional tire size
    sold_by: Optional[str] = None  # Salesperson ID
    # Manual Payment Tracking
    payment_status: Optional[str] = None  # unpaid, deposit, paid_in_full
    payment_total: Optional[float] = None  # Total order amount
    deposit_amount: Optional[float] = None  # Deposit received
    balance_due: Optional[float] = None  # Remaining balance
    payment_notes: Optional[str] = None  # Payment notes
    # Production Priority (auto-calculated)
    percentage_paid: Optional[float] = None
    production_priority: Optional[str] = None

class DepartmentHistory(BaseModel):
    department: str
    started_at: str
    completed_at: Optional[str] = None

class OrderNote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    created_by: str
    created_by_name: str
    department: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AddNoteRequest(BaseModel):
    text: str

class OrderResponse(BaseModel):
    id: str
    order_number: str
    customer_name: str
    phone: str
    product_type: str
    wheel_specs: str
    notes: str
    order_date: str
    current_department: str
    status: str
    final_status: Optional[str] = None
    department_history: List[dict]
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachments: Optional[List[dict]] = []  # Multiple attachments
    order_notes: Optional[List[dict]] = []
    quantity: Optional[int] = 1
    linked_order_id: Optional[str] = None
    vehicle_make: Optional[str] = ""
    vehicle_model: Optional[str] = ""
    rim_size: Optional[str] = ""
    cut_status: Optional[str] = "waiting"
    steering_wheel_brand: Optional[str] = ""
    has_tires: Optional[bool] = False
    has_custom_caps: Optional[bool] = False
    has_race_car_caps: Optional[bool] = False
    has_steering_wheel: Optional[bool] = False
    lalo_status: Optional[str] = "not_sent"
    rim_size_front: Optional[str] = ""
    rim_size_rear: Optional[str] = ""
    tire_size: Optional[str] = ""  # Optional tire size
    sold_by: Optional[str] = None  # Salesperson ID for commission tracking
    # Manual Payment Tracking
    payment_status: Optional[str] = "unpaid"  # unpaid, deposit, paid_in_full
    payment_total: Optional[float] = 0.0  # Total order amount
    deposit_amount: Optional[float] = 0.0  # Deposit received
    balance_due: Optional[float] = 0.0  # Remaining balance
    payment_notes: Optional[str] = ""  # Payment notes
    # Production Priority (auto-calculated based on payment)
    percentage_paid: Optional[float] = 0.0  # Deposit / Total * 100
    production_priority: Optional[str] = "waiting_deposit"  # waiting_deposit, ready_production, fully_paid
    # RUSH order fields
    is_rush: Optional[bool] = False
    rush_reason: Optional[str] = None
    rush_set_by: Optional[str] = None
    rush_set_at: Optional[str] = None
    # Re-Do order fields (for orders that need fixing due to customer issues)
    is_redo: Optional[bool] = False
    redo_reason: Optional[str] = None
    redo_set_by: Optional[str] = None
    redo_set_at: Optional[str] = None
    # Hold queue fields
    is_on_hold: Optional[bool] = False
    # Order movement tracking
    last_moved_by: Optional[str] = None
    last_moved_by_name: Optional[str] = None
    last_moved_at: Optional[str] = None
    last_moved_from: Optional[str] = None
    last_moved_to: Optional[str] = None
    hold_reason: Optional[str] = None
    hold_date: Optional[str] = None
    # Position within department for manual ordering
    position: Optional[int] = 0
    created_at: str
    updated_at: str

# Helper functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed) -> bool:
    """Verify password against hash - handles string, bytes, and edge cases"""
    try:
        if hashed is None:
            logger.error("Password hash is None")
            return False
        
        # Handle both string and bytes for hashed password
        if isinstance(hashed, bytes):
            hashed_bytes = hashed
        elif isinstance(hashed, str):
            # Check if it's a valid bcrypt hash
            if not hashed.startswith('$2'):
                logger.error(f"Invalid bcrypt hash format")
                return False
            hashed_bytes = hashed.encode('utf-8')
        else:
            logger.error(f"Unexpected password hash type: {type(hashed)}")
            return False
        
        result = bcrypt.checkpw(password.encode('utf-8'), hashed_bytes)
        return result
    except Exception as e:
        logger.error(f"Password verification error: {str(e)}")
        return False

# Clear all rate limits on module load (helps after deployment restart)
failed_login_attempts.clear()

def create_token(user_data: dict, session_id: str = None) -> str:
    payload = {
        "id": user_data["id"],
        "email": user_data["email"],
        "department": user_data["department"],
        "role": user_data["role"],
        "session_id": session_id or str(uuid.uuid4()),  # Unique session ID for single device enforcement
        "exp": datetime.now(timezone.utc).timestamp() + 86400 * 7  # 7 days
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Single device login enforcement - check if session is still valid
    session_id = payload.get("session_id")
    if session_id and user.get("active_session_id"):
        if user.get("active_session_id") != session_id:
            raise HTTPException(status_code=401, detail="Session expired - logged in on another device")
    
    return user

async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency that requires admin role"""
    user = await get_current_user(credentials)
    if user.get("role") not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def generate_order_number():
    now = datetime.now(timezone.utc)
    return f"CF-{now.strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"

# Rate limiting helper functions
def check_rate_limit(identifier: str) -> tuple[bool, int]:
    """
    Check if an identifier (email or IP) is rate limited.
    Returns (is_locked, seconds_remaining)
    """
    if identifier not in failed_login_attempts:
        return False, 0
    
    record = failed_login_attempts[identifier]
    lockout_until = record.get("lockout_until")
    
    if lockout_until:
        now = datetime.now(timezone.utc)
        if now < lockout_until:
            remaining = int((lockout_until - now).total_seconds())
            return True, remaining
        else:
            # Lockout expired, reset
            del failed_login_attempts[identifier]
            return False, 0
    
    return False, 0

def record_failed_attempt(identifier: str) -> tuple[int, bool]:
    """
    Record a failed login attempt.
    Returns (attempts_count, is_now_locked)
    """
    now = datetime.now(timezone.utc)
    
    if identifier not in failed_login_attempts:
        failed_login_attempts[identifier] = {"attempts": 1, "lockout_until": None}
        return 1, False
    
    record = failed_login_attempts[identifier]
    record["attempts"] += 1
    
    if record["attempts"] >= MAX_LOGIN_ATTEMPTS:
        # Lock the account
        record["lockout_until"] = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        return record["attempts"], True
    
    return record["attempts"], False

def clear_failed_attempts(identifier: str):
    """Clear failed attempts on successful login."""
    if identifier in failed_login_attempts:
        del failed_login_attempts[identifier]

# Admin endpoint to clear all rate limits
@api_router.post("/admin/clear-lockouts")
async def clear_all_lockouts(user: dict = Depends(get_current_user)):
    """Admin can clear all login lockouts"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    count = len(failed_login_attempts)
    failed_login_attempts.clear()
    return {"message": f"Cleared {count} lockout(s)"}

# Admin PIN for registration (read from environment for security)
ADMIN_PIN = os.environ.get('ADMIN_PIN', '9905')

# Auth Routes
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    # Validate that either email or username is provided
    if not user_data.email and not user_data.username:
        raise HTTPException(status_code=400, detail="Either email or username is required")
    
    # Check for existing user by email or username
    if user_data.email:
        existing = await db.users.find_one({"email": user_data.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    if user_data.username:
        existing_username = await db.users.find_one({"username": user_data.username.lower()})
        if existing_username:
            raise HTTPException(status_code=400, detail="Username already taken")
    
    # Handle both departments (list) and department (single) for backwards compatibility
    departments = user_data.departments
    if not departments and user_data.department:
        departments = [user_data.department]
    
    # Validate departments (max 4)
    if not departments or len(departments) == 0:
        raise HTTPException(status_code=400, detail="At least one department is required")
    
    if len(departments) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 departments allowed")
    
    # Check if admin is in departments
    is_admin = "admin" in departments or user_data.role == "admin"
    
    # Validate each department
    for dept in departments:
        if dept not in DEPARTMENTS and dept != "admin":
            raise HTTPException(status_code=400, detail=f"Invalid department: {dept}")
    
    # Check admin PIN if registering as admin
    if is_admin:
        if not user_data.admin_pin or user_data.admin_pin != ADMIN_PIN:
            raise HTTPException(status_code=403, detail="Invalid admin PIN")
    else:
        # Staff registration requires a valid employee code
        if not user_data.employee_code:
            raise HTTPException(status_code=400, detail="Employee code is required")
        
        # Check if employee code exists and is not used
        code_doc = await db.employee_codes.find_one({
            "code": user_data.employee_code.upper(),
            "used": False
        })
        if not code_doc:
            raise HTTPException(status_code=403, detail="Invalid or already used employee code")
        
        # Mark the code as used
        await db.employee_codes.update_one(
            {"code": user_data.employee_code.upper()},
            {"$set": {
                "used": True,
                "used_by": user_data.email or user_data.username,
                "used_by_name": user_data.name,
                "used_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    # Primary department is the first one selected
    primary_department = departments[0]
    
    user = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "username": user_data.username.lower() if user_data.username else None,
        "password": hash_password(user_data.password),
        "name": user_data.name,
        "department": primary_department,  # Primary department
        "departments": departments,  # All departments (up to 4)
        "role": "admin" if is_admin else "staff",
        "salesperson_id": user_data.salesperson_id,  # Link to salesperson for commission
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user)
    return UserResponse(
        id=user["id"],
        email=user["email"],
        username=user["username"],
        name=user["name"],
        department=user["department"],
        departments=user["departments"],
        role=user["role"],
        salesperson_id=user.get("salesperson_id")
    )

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    # Allow login with either email or username
    if not credentials.email and not credentials.username:
        raise HTTPException(status_code=400, detail="Either email or username is required")
    
    identifier = (credentials.email or credentials.username).lower()  # Use email or username as identifier
    logger.info(f"Login attempt for: {identifier}")
    
    # Check if account is locked
    is_locked, seconds_remaining = check_rate_limit(identifier)
    if is_locked:
        minutes = seconds_remaining // 60
        seconds = seconds_remaining % 60
        logger.warning(f"Account locked for {identifier}")
        raise HTTPException(
            status_code=429, 
            detail=f"Too many failed attempts. Account locked for {minutes}m {seconds}s. Please try again later."
        )
    
    # Find user by email or username
    user = None
    if credentials.email:
        user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user and credentials.username:
        user = await db.users.find_one({"username": credentials.username.lower()}, {"_id": 0})
    
    if not user:
        logger.warning(f"User not found: {identifier}")
        attempts, is_now_locked = record_failed_attempt(identifier)
        remaining_attempts = MAX_LOGIN_ATTEMPTS - attempts
        if is_now_locked:
            raise HTTPException(status_code=429, detail=f"Too many failed attempts. Account locked for {LOCKOUT_DURATION_MINUTES} minutes.")
        raise HTTPException(status_code=401, detail=f"Invalid credentials. {remaining_attempts} attempt(s) remaining before lockout.")
    
    # Verify password
    password_valid = verify_password(credentials.password, user.get("password"))
    if not password_valid:
        logger.warning(f"Invalid password for: {identifier}")
        attempts, is_now_locked = record_failed_attempt(identifier)
        remaining_attempts = MAX_LOGIN_ATTEMPTS - attempts
        
        if is_now_locked:
            raise HTTPException(
                status_code=429, 
                detail=f"Too many failed attempts. Account locked for {LOCKOUT_DURATION_MINUTES} minutes."
            )
        else:
            raise HTTPException(
                status_code=401, 
                detail=f"Invalid credentials. {remaining_attempts} attempt(s) remaining before lockout."
            )
    
    # Clear failed attempts on successful login
    clear_failed_attempts(identifier)
    
    # Generate unique session ID for single device enforcement
    session_id = str(uuid.uuid4())
    
    # Store active session in database (invalidates previous sessions)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"active_session_id": session_id, "last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Log the login activity
    await log_activity(
        action_type="login",
        user_id=user["id"],
        user_name=user.get("name", user.get("email", "Unknown")),
        description=f"{user.get('name', 'User')} logged in via email/password"
    )
    
    token = create_token(user, session_id)
    return {
        "token": token,
        "user": UserResponse(
            id=user["id"],
            email=user.get("email"),
            username=user.get("username"),
            name=user["name"],
            department=user["department"],
            departments=user.get("departments", [user["department"]]),
            role=user["role"],
            salesperson_id=user.get("salesperson_id")
        )
    }

# Set or Update PIN (must be unique across all users)
@api_router.post("/auth/set-pin")
async def set_pin(pin_data: SetPin, user: dict = Depends(get_current_user)):
    if len(pin_data.pin) != 4 or not pin_data.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    
    # Check if PIN is already used by another user
    existing_user = await db.users.find_one({"login_pin": pin_data.pin, "id": {"$ne": user["id"]}})
    if existing_user:
        raise HTTPException(status_code=400, detail="This PIN is already in use. Please choose a different PIN.")
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"login_pin": pin_data.pin}}
    )
    
    return {"message": "PIN set successfully"}

# PIN-only login (no email required)
class PinLogin(BaseModel):
    pin: str

@api_router.post("/auth/pin-login")
async def pin_login(pin_data: PinLogin):
    if len(pin_data.pin) != 4 or not pin_data.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    
    identifier = f"pin:{pin_data.pin}"  # Use PIN as identifier for rate limiting
    
    # Check if this PIN is locked due to too many attempts
    is_locked, seconds_remaining = check_rate_limit(identifier)
    if is_locked:
        minutes = seconds_remaining // 60
        seconds = seconds_remaining % 60
        raise HTTPException(
            status_code=429, 
            detail=f"Too many failed attempts. Please try again in {minutes}m {seconds}s."
        )
    
    # Find user by PIN - try both string and integer comparison for robustness
    pin_str = str(pin_data.pin).strip()
    user = await db.users.find_one({"login_pin": pin_str}, {"_id": 0})
    
    # If not found as string, try as integer (in case PIN was stored as number)
    if not user:
        try:
            pin_int = int(pin_data.pin)
            user = await db.users.find_one({"login_pin": pin_int}, {"_id": 0})
        except ValueError:
            pass
    
    if not user:
        # Record failed attempt
        attempts, is_now_locked = record_failed_attempt(identifier)
        remaining_attempts = MAX_LOGIN_ATTEMPTS - attempts
        
        if is_now_locked:
            raise HTTPException(
                status_code=429, 
                detail=f"Too many failed attempts. Please try again in {LOCKOUT_DURATION_MINUTES} minutes."
            )
        else:
            raise HTTPException(
                status_code=401, 
                detail=f"Invalid PIN. {remaining_attempts} attempt(s) remaining."
            )
    
    # Clear failed attempts on successful login
    clear_failed_attempts(identifier)
    
    # Generate unique session ID for single device enforcement
    session_id = str(uuid.uuid4())
    
    # Store active session in database (invalidates previous sessions)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"active_session_id": session_id, "last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Generate JWT token with session ID
    token = create_token(user, session_id)
    
    # Update last_active
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_active": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Log the login activity
    await log_activity(
        action_type="login",
        user_id=user["id"],
        user_name=user.get("name", user.get("email", "Unknown")),
        description=f"{user.get('name', 'User')} logged in via PIN"
    )
    
    return {
        "token": token,
        "user": UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            department=user["department"],
            departments=user.get("departments", [user["department"]]),
            role=user["role"]
        )
    }

# Check if user has PIN set
@api_router.get("/auth/has-pin")
async def check_has_pin(email: str):
    user = await db.users.find_one({"email": email})
    if not user:
        return {"has_pin": False, "exists": False}
    return {"has_pin": bool(user.get("login_pin")), "exists": True}

# Admin: View current lockouts
@api_router.get("/admin/lockouts")
async def get_lockouts(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    now = datetime.now(timezone.utc)
    active_lockouts = []
    
    for identifier, record in failed_login_attempts.items():
        lockout_until = record.get("lockout_until")
        if lockout_until and lockout_until > now:
            remaining = int((lockout_until - now).total_seconds())
            active_lockouts.append({
                "identifier": identifier,
                "attempts": record["attempts"],
                "lockout_until": lockout_until.isoformat(),
                "seconds_remaining": remaining
            })
    
    return {"lockouts": active_lockouts, "total": len(active_lockouts)}

# Admin: Clear a lockout
@api_router.delete("/admin/lockouts/{identifier}")
async def clear_lockout(identifier: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # URL decode the identifier (in case of special characters)
    from urllib.parse import unquote
    identifier = unquote(identifier)
    
    if identifier in failed_login_attempts:
        del failed_login_attempts[identifier]
        return {"message": f"Lockout cleared for {identifier}"}
    
    raise HTTPException(status_code=404, detail="No lockout found for this identifier")

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    # Update last_active timestamp
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_active": datetime.now(timezone.utc).isoformat()}}
    )
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        department=user["department"],
        departments=user.get("departments", [user["department"]]),
        role=user["role"]
    )

# Admin: Delete a user
@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Prevent deleting yourself
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted successfully"}

# Admin: Get all users
@api_router.get("/admin/users")
async def get_all_users(user: dict = Depends(get_current_user)):
    # admin_restricted cannot view user list
    if user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Full admin access required")
    
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    
    # Calculate online status (active in last 5 minutes)
    now = datetime.now(timezone.utc)
    for u in users:
        last_active = u.get("last_active")
        if last_active:
            last_active_dt = datetime.fromisoformat(last_active.replace('Z', '+00:00'))
            u["is_online"] = (now - last_active_dt).total_seconds() < 300  # 5 minutes
        else:
            u["is_online"] = False
        
        # Ensure departments is always an array (fallback to primary department)
        if not u.get("departments"):
            u["departments"] = [u["department"]] if u.get("department") else []
    
    return users

# Admin: Employee Code Management
@api_router.get("/admin/employee-codes")
async def get_employee_codes(user: dict = Depends(get_current_user)):
    """Get all employee codes (full admin only - admin_restricted cannot create codes)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Full admin access required")
    
    codes = await db.employee_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return codes

@api_router.post("/admin/employee-codes")
async def create_employee_code(code_data: EmployeeCodeCreate, user: dict = Depends(get_current_user)):
    """Create a new employee code (full admin only - admin_restricted cannot create codes)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Full admin access required")
    
    code_upper = code_data.code.upper().strip()
    
    # Check if code already exists
    existing = await db.employee_codes.find_one({"code": code_upper})
    if existing:
        raise HTTPException(status_code=400, detail="Employee code already exists")
    
    new_code = {
        "id": str(uuid.uuid4()),
        "code": code_upper,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["name"],
        "used": False,
        "used_by": None,
        "used_by_name": None,
        "used_at": None
    }
    
    await db.employee_codes.insert_one(new_code)
    new_code.pop("_id", None)
    return new_code

@api_router.delete("/admin/employee-codes/{code_id}")
async def delete_employee_code(code_id: str, user: dict = Depends(get_current_user)):
    """Delete an employee code (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.employee_codes.delete_one({"id": code_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Employee code not found")
    
    return {"message": "Employee code deleted"}

# Admin: Update user departments and role
class UpdateUserRequest(BaseModel):
    departments: Optional[List[str]] = None
    role: Optional[str] = None
    name: Optional[str] = None
    salesperson_id: Optional[str] = None  # Link to salesperson for commission

@api_router.put("/admin/users/{user_id}")
async def update_user(user_id: str, data: UpdateUserRequest, user: dict = Depends(get_current_user)):
    """Update a user's departments, role, or name (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    target_user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {}
    
    # Update departments if provided
    if data.departments is not None:
        # Validate departments
        valid_depts = ["admin", "received", "design", "program", "machine_waiting", "machine", "finishing", "powder_coat", "assemble", "showroom", "shipped"]
        for dept in data.departments:
            if dept not in valid_depts:
                raise HTTPException(status_code=400, detail=f"Invalid department: {dept}")
        
        if len(data.departments) == 0:
            raise HTTPException(status_code=400, detail="At least one department is required")
        
        if len(data.departments) > 4:
            raise HTTPException(status_code=400, detail="Maximum 4 departments allowed")
        
        update_data["departments"] = data.departments
        update_data["department"] = data.departments[0]  # Primary department is the first one
    
    # Update role if provided
    if data.role is not None:
        if data.role not in ["admin", "staff", "admin_restricted"]:
            raise HTTPException(status_code=400, detail="Role must be 'admin', 'admin_restricted', or 'staff'")
        update_data["role"] = data.role
    
    # Update name if provided
    if data.name is not None:
        update_data["name"] = data.name
    
    # Update salesperson_id if provided (for commission tracking)
    if data.salesperson_id is not None:
        # Validate salesperson exists (if not empty string)
        if data.salesperson_id:
            salesperson = await db.salespeople.find_one({"id": data.salesperson_id})
            if not salesperson:
                raise HTTPException(status_code=400, detail="Salesperson not found")
        update_data["salesperson_id"] = data.salesperson_id if data.salesperson_id else None
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    # Return updated user
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "pin": 0})
    return updated_user

# Admin Password Reset Model
class AdminPasswordReset(BaseModel):
    new_password: str

@api_router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, data: AdminPasswordReset, user: dict = Depends(get_current_user)):
    """Admin can reset any user's password"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Validate password length
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    target_user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Hash the new password
    hashed_password = hash_password(data.new_password)
    
    # Update user's password
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "password": hashed_password,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log the activity
    await db.activity_log.insert_one({
        "id": str(uuid.uuid4()),
        "action": "password_reset",
        "description": f"Password reset for {target_user.get('name', 'Unknown')} by admin {user.get('name', 'Unknown')}",
        "user_id": user["id"],
        "user_name": user.get("name", "Unknown"),
        "target_user_id": user_id,
        "target_user_name": target_user.get("name", "Unknown"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Password reset successfully for {target_user.get('name', 'Unknown')}"}

# Admin set/reset PIN for any user
class AdminSetPin(BaseModel):
    pin: Optional[str] = None  # None to remove PIN

@api_router.post("/admin/users/{user_id}/set-pin")
async def admin_set_pin(user_id: str, data: AdminSetPin, user: dict = Depends(get_current_user)):
    """Admin can set or remove any user's PIN"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    target_user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # If PIN is provided, validate and set it
    if data.pin:
        if len(data.pin) != 4 or not data.pin.isdigit():
            raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
        
        # Check if PIN is already used by another user
        existing_user = await db.users.find_one({"login_pin": data.pin, "id": {"$ne": user_id}})
        if existing_user:
            raise HTTPException(status_code=400, detail="This PIN is already in use by another user")
        
        # Set the PIN
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "login_pin": data.pin,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        action_msg = f"PIN set for {target_user.get('name', 'Unknown')}"
    else:
        # Remove the PIN
        await db.users.update_one(
            {"id": user_id},
            {"$unset": {"login_pin": ""}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        action_msg = f"PIN removed for {target_user.get('name', 'Unknown')}"
    
    # Log the activity
    await db.activity_log.insert_one({
        "id": str(uuid.uuid4()),
        "action": "pin_update",
        "description": f"{action_msg} by admin {user.get('name', 'Unknown')}",
        "user_id": user["id"],
        "user_name": user.get("name", "Unknown"),
        "target_user_id": user_id,
        "target_user_name": target_user.get("name", "Unknown"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": action_msg}

# Bulk Import Model - supports full backup restore
class BulkOrderImport(BaseModel):
    order_number: str
    customer_name: str
    phone: Optional[str] = ""
    product_type: str
    wheel_specs: Optional[str] = ""
    notes: Optional[str] = ""
    vehicle_make: Optional[str] = ""
    vehicle_model: Optional[str] = ""
    rim_size: Optional[str] = ""
    rim_size_front: Optional[str] = ""
    rim_size_rear: Optional[str] = ""
    steering_wheel_brand: Optional[str] = ""
    order_date: Optional[str] = ""
    quantity: Optional[int] = 1
    current_department: Optional[str] = "received"
    cut_status: Optional[str] = "waiting"
    has_tires: Optional[str] = "false"
    has_steering_wheel: Optional[str] = "false"
    lalo_status: Optional[str] = "not_sent"

class BulkImportRequest(BaseModel):
    orders: List[BulkOrderImport]

# Bulk Edit Model
class BulkEditRequest(BaseModel):
    order_ids: List[str]
    updates: dict  # Fields to update

# Admin: Bulk Import Orders from CSV data
@api_router.post("/admin/orders/bulk-import")
async def bulk_import_orders(import_data: BulkImportRequest, user: dict = Depends(get_current_user)):
    """Bulk import orders - admin/admin_restricted. Validates no duplicate order numbers."""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not import_data.orders:
        raise HTTPException(status_code=400, detail="No orders to import")
    
    now = datetime.now(timezone.utc).isoformat()
    imported_count = 0
    skipped = []
    errors = []
    
    for idx, order_data in enumerate(import_data.orders, 1):
        try:
            # Validate product type
            if order_data.product_type not in PRODUCT_TYPES:
                errors.append(f"Row {idx}: Invalid product type '{order_data.product_type}'")
                continue
            
            # Check for duplicate order number (regardless of product type for imports)
            existing = await db.orders.find_one({"order_number": order_data.order_number})
            if existing:
                skipped.append(f"Row {idx}: Order #{order_data.order_number} already exists")
                continue
            
            # Process order date
            order_date = now
            if order_data.order_date:
                try:
                    if 'T' in order_data.order_date:
                        order_date = order_data.order_date
                    else:
                        order_date = datetime.strptime(order_data.order_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).isoformat()
                except:
                    pass  # Use current date if parsing fails
            
            # Parse boolean values from strings
            has_tires = str(order_data.has_tires).lower() in ['true', '1', 'yes']
            has_steering_wheel = str(order_data.has_steering_wheel).lower() in ['true', '1', 'yes']
            
            # Validate department if provided
            dept = order_data.current_department or "received"
            valid_depts = ["received", "cnc", "weld", "finish", "assembled", "shipped", "completed"]
            if dept not in valid_depts:
                dept = "received"
            
            order = {
                "id": str(uuid.uuid4()),
                "order_number": order_data.order_number,
                "customer_name": order_data.customer_name,
                "phone": order_data.phone or "",
                "product_type": order_data.product_type,
                "wheel_specs": order_data.wheel_specs or "",
                "notes": order_data.notes or "",
                "order_date": order_date,
                "current_department": dept,
                "status": "active",
                "final_status": None,
                "department_history": [{
                    "department": dept,
                    "started_at": now,
                    "completed_at": None
                }],
                "attachment_url": None,
                "attachment_name": None,
                "attachments": [],
                "order_notes": [],
                "quantity": order_data.quantity or 1,
                "linked_order_id": None,
                "vehicle_make": order_data.vehicle_make or "",
                "vehicle_model": order_data.vehicle_model or "",
                "rim_size": order_data.rim_size or "",
                "rim_size_front": order_data.rim_size_front or "",
                "rim_size_rear": order_data.rim_size_rear or "",
                "cut_status": order_data.cut_status or "waiting",
                "steering_wheel_brand": order_data.steering_wheel_brand or "",
                "has_tires": has_tires,
                "has_steering_wheel": has_steering_wheel,
                "lalo_status": order_data.lalo_status or "not_sent",
                "created_at": now,
                "updated_at": now
            }
            
            await db.orders.insert_one(order)
            imported_count += 1
            
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    # Invalidate stats cache if any orders were imported
    if imported_count > 0:
        cache.invalidate_pattern("stats:")
    
    return {
        "success": True,
        "imported": imported_count,
        "skipped": skipped,
        "errors": errors,
        "total_processed": len(import_data.orders)
    }

# Admin: Bulk Move Orders to Department
class BulkMoveRequest(BaseModel):
    order_ids: List[str]
    target_department: str

@api_router.put("/admin/orders/bulk-move")
async def bulk_move_orders(move_data: BulkMoveRequest, user: dict = Depends(get_current_user)):
    """Bulk move multiple orders to a department - admin/admin_restricted"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not move_data.order_ids:
        raise HTTPException(status_code=400, detail="No orders selected")
    
    if move_data.target_department not in DEPARTMENTS:
        raise HTTPException(status_code=400, detail="Invalid department")
    
    now = datetime.now(timezone.utc).isoformat()
    target_dept = move_data.target_department
    success_count = 0
    errors = []
    
    for order_id in move_data.order_ids:
        try:
            order = await db.orders.find_one({"id": order_id}, {"_id": 0})
            if not order:
                errors.append(f"Order {order_id} not found")
                continue
            
            current_dept = order["current_department"]
            
            # Skip if already in target department
            if current_dept == target_dept:
                success_count += 1
                continue
            
            # Update department history
            history = order.get("department_history", [])
            for h in history:
                if h["department"] == current_dept and h.get("completed_at") is None:
                    h["completed_at"] = now
                    break
            
            # Add new department entry
            if target_dept != "completed":
                history.append({
                    "department": target_dept,
                    "started_at": now,
                    "completed_at": None,
                    "moved_by": user.get("id"),
                    "moved_by_name": user.get("name") or user.get("username") or user.get("email", "Unknown")
                })
            
            # Track move info
            update_data = {
                "current_department": target_dept,
                "department_history": history,
                "updated_at": now,
                "lalo_status": "not_sent",
                "last_moved_by": user.get("id"),
                "last_moved_by_name": user.get("name") or user.get("username") or user.get("email", "Unknown"),
                "last_moved_at": now,
                "last_moved_from": current_dept,
                "last_moved_to": target_dept
            }
            
            if target_dept == "completed":
                update_data["status"] = "done"
            else:
                update_data["status"] = "in_process"
            
            await db.orders.update_one({"id": order_id}, {"$set": update_data})
            
            # Log the activity for real-time tracking
            await log_activity(
                action_type="move",
                user_id=user.get("id"),
                user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
                description=f"Bulk moved order #{order.get('order_number')} from {current_dept} to {target_dept}",
                order_id=order_id,
                order_number=order.get("order_number"),
                customer_name=order.get("customer_name"),
                product_type=order.get("product_type"),
                extra_data={"from_department": current_dept, "to_department": target_dept}
            )
            
            success_count += 1
        except Exception as e:
            errors.append(f"Error moving order {order_id}: {str(e)}")
    
    # Invalidate stats cache if any orders were moved
    if success_count > 0:
        cache.invalidate_pattern("stats:")
    
    return {
        "success": True,
        "moved_count": success_count,
        "errors": errors,
        "target_department": target_dept
    }

# Reorder an order within its department (move up/down)
class ReorderRequest(BaseModel):
    direction: str  # "up" or "down"

@api_router.put("/orders/{order_id}/reorder")
async def reorder_order(order_id: str, reorder_data: ReorderRequest, user: dict = Depends(get_current_user)):
    """Move an order up or down in its department queue - admin/admin_restricted"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    current_dept = order["current_department"]
    current_position = order.get("position", 0)
    direction = reorder_data.direction
    
    if direction not in ["up", "down"]:
        raise HTTPException(status_code=400, detail="Direction must be 'up' or 'down'")
    
    # Get all orders in the same department sorted by position
    dept_orders = await db.orders.find(
        {"current_department": current_dept, "status": {"$ne": "done"}},
        {"_id": 0, "id": 1, "position": 1}
    ).sort("position", 1).to_list(None)
    
    # Find current order's index in the list
    order_ids = [o["id"] for o in dept_orders]
    if order_id not in order_ids:
        return {"success": False, "message": "Order not found in department"}
    
    current_index = order_ids.index(order_id)
    
    # Calculate new index
    if direction == "up" and current_index > 0:
        swap_index = current_index - 1
    elif direction == "down" and current_index < len(order_ids) - 1:
        swap_index = current_index + 1
    else:
        return {"success": True, "message": "Order already at boundary"}
    
    # Swap positions
    swap_order_id = order_ids[swap_index]
    swap_position = dept_orders[swap_index].get("position", swap_index)
    
    # Update both orders
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"position": swap_position, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.orders.update_one(
        {"id": swap_order_id},
        {"$set": {"position": current_position, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "success": True,
        "message": f"Order moved {direction}",
        "new_position": swap_position
    }

# Admin: Bulk Edit Orders
@api_router.put("/admin/orders/bulk-edit")
async def bulk_edit_orders(edit_data: BulkEditRequest, user: dict = Depends(get_current_user)):
    """Bulk edit multiple orders - admin/admin_restricted"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not edit_data.order_ids:
        raise HTTPException(status_code=400, detail="No orders selected")
    
    if not edit_data.updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    # Allowed fields for bulk edit
    allowed_fields = {
        "order_date", "wheel_specs", "rim_size", "vehicle_make", "vehicle_model",
        "notes", "cut_status", "steering_wheel_brand", "current_department", "phone"
    }
    
    # Filter to only allowed fields
    updates = {k: v for k, v in edit_data.updates.items() if k in allowed_fields}
    
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    # Add updated timestamp
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Handle special case for order_date conversion
    if "order_date" in updates and updates["order_date"]:
        try:
            if 'T' not in updates["order_date"]:
                updates["order_date"] = datetime.strptime(updates["order_date"], "%Y-%m-%d").replace(tzinfo=timezone.utc).isoformat()
        except:
            pass
    
    # Perform bulk update
    result = await db.orders.update_many(
        {"id": {"$in": edit_data.order_ids}},
        {"$set": updates}
    )
    
    return {
        "success": True,
        "modified_count": result.modified_count,
        "fields_updated": list(updates.keys())
    }

# Bulk delete orders - admin only
class BulkDeleteRequest(BaseModel):
    order_ids: List[str]

@api_router.delete("/admin/orders/bulk-delete")
async def bulk_delete_orders(delete_data: BulkDeleteRequest, user: dict = Depends(get_current_user)):
    """Bulk delete multiple orders - admin/admin_restricted"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not delete_data.order_ids:
        raise HTTPException(status_code=400, detail="No orders selected")
    
    # Delete all selected orders
    result = await db.orders.delete_many(
        {"id": {"$in": delete_data.order_ids}}
    )
    
    # Invalidate stats cache if any orders were deleted
    if result.deleted_count > 0:
        cache.invalidate_pattern("stats:")
    
    return {
        "success": True,
        "deleted_count": result.deleted_count
    }

# Get CSV template for bulk import
@api_router.get("/admin/orders/csv-template")
async def get_csv_template(user: dict = Depends(get_current_user)):
    """Get CSV template headers for bulk import"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return {
        "headers": [
            "order_number", "customer_name", "phone", "product_type", 
            "wheel_specs", "notes", "vehicle_make", "vehicle_model", 
            "rim_size", "rim_size_front", "rim_size_rear", "steering_wheel_brand", 
            "order_date", "quantity", "current_department", "cut_status",
            "has_tires", "has_steering_wheel", "lalo_status"
        ],
        "product_types": list(PRODUCT_TYPES.keys()),
        "rim_sizes": RIM_SIZES,
        "example_row": {
            "order_number": "CF-001",
            "customer_name": "John Doe",
            "phone": "555-1234",
            "product_type": "rim",
            "wheel_specs": "22x10 -12 offset",
            "notes": "Custom finish",
            "vehicle_make": "Ford",
            "vehicle_model": "F-150",
            "rim_size": "22",
            "rim_size_front": "",
            "rim_size_rear": "",
            "steering_wheel_brand": "",
            "order_date": "2025-01-15",
            "quantity": "1",
            "current_department": "received",
            "cut_status": "waiting",
            "has_tires": "false",
            "has_steering_wheel": "false",
            "lalo_status": "not_sent"
        }
    }

# Bulk export all orders to CSV
@api_router.get("/admin/orders/bulk-export")
async def bulk_export_orders(user: dict = Depends(get_current_user)):
    """Export all orders as CSV for backup - admin/admin_restricted"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all orders
    orders = await db.orders.find({}, {"_id": 0}).to_list(10000)
    
    if not orders:
        raise HTTPException(status_code=404, detail="No orders to export")
    
    # CSV headers - includes all fields needed for re-import
    headers = [
        "order_number", "customer_name", "phone", "product_type", 
        "wheel_specs", "notes", "vehicle_make", "vehicle_model", 
        "rim_size", "rim_size_front", "rim_size_rear", "steering_wheel_brand", 
        "order_date", "quantity", "current_department", "cut_status",
        "has_tires", "has_steering_wheel", "lalo_status"
    ]
    
    # Build CSV content
    import csv
    import io
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers, extrasaction='ignore')
    writer.writeheader()
    
    for order in orders:
        row = {
            "order_number": order.get("order_number", ""),
            "customer_name": order.get("customer_name", ""),
            "phone": order.get("phone", ""),
            "product_type": order.get("product_type", ""),
            "wheel_specs": order.get("wheel_specs", ""),
            "notes": order.get("notes", ""),
            "vehicle_make": order.get("vehicle_make", ""),
            "vehicle_model": order.get("vehicle_model", ""),
            "rim_size": order.get("rim_size", ""),
            "rim_size_front": order.get("rim_size_front", ""),
            "rim_size_rear": order.get("rim_size_rear", ""),
            "steering_wheel_brand": order.get("steering_wheel_brand", ""),
            "order_date": order.get("order_date", ""),
            "quantity": order.get("quantity", 1),
            "current_department": order.get("current_department", "received"),
            "cut_status": order.get("cut_status", "waiting"),
            "has_tires": str(order.get("has_tires", False)).lower(),
            "has_steering_wheel": str(order.get("has_steering_wheel", False)).lower(),
            "lalo_status": order.get("lalo_status", "not_sent")
        }
        writer.writerow(row)
    
    csv_content = output.getvalue()
    output.close()
    
    # Return as downloadable CSV
    from fastapi.responses import Response
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=corleone-backup-{datetime.now().strftime('%Y-%m-%d')}.csv"
        }
    )

# Get user's order history (orders they created)
@api_router.get("/users/my-orders")
async def get_my_orders(user: dict = Depends(get_current_user)):
    # Find orders that this user created
    query = {"created_by_user_id": user["id"]}
    
    orders = await db.orders.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    return orders

# Get rim sizes and cut statuses
@api_router.get("/rim-sizes")
async def get_rim_sizes():
    return {"rim_sizes": RIM_SIZES, "cut_statuses": CUT_STATUS}

# Customer autocomplete - get unique customers for autofill
@api_router.get("/customers/autocomplete")
async def get_customers_autocomplete(q: str = "", user: dict = Depends(get_current_user)):
    """Get unique customers matching query for autocomplete with phone numbers"""
    if len(q) < 2:
        return {"customers": []}
    
    # Search for customers whose name starts with or contains the query (case-insensitive)
    pipeline = [
        {"$match": {"customer_name": {"$regex": q, "$options": "i"}}},
        {"$group": {
            "_id": {"name": "$customer_name", "phone": "$phone"},
            "customer_name": {"$first": "$customer_name"},
            "phone": {"$first": "$phone"},
            "order_count": {"$sum": 1},
            "last_order": {"$max": "$order_date"}
        }},
        {"$sort": {"order_count": -1, "last_order": -1}},
        {"$limit": 10},
        {"$project": {
            "_id": 0,
            "customer_name": 1,
            "phone": 1,
            "order_count": 1
        }}
    ]
    
    customers = await db.orders.aggregate(pipeline).to_list(10)
    return {"customers": customers}

# Order Routes
@api_router.post("/orders", response_model=OrderResponse)
async def create_order(order_data: OrderCreate, user: dict = Depends(get_current_user)):
    # Check permission - only admin/admin_restricted or received department can create orders
    if user["role"] not in ["admin", "admin_restricted"] and user["department"] != "received":
        raise HTTPException(status_code=403, detail="Only admin or received department can create orders")
    
    # Check for duplicate order number within the SAME product type only
    existing_order = await db.orders.find_one({
        "order_number": order_data.order_number,
        "product_type": order_data.product_type
    })
    if existing_order:
        product_label = PRODUCT_TYPES.get(order_data.product_type, order_data.product_type)
        raise HTTPException(status_code=400, detail=f"Order number '{order_data.order_number}' already exists in {product_label}")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Use custom order_date if provided (convert from YYYY-MM-DD to ISO), otherwise use current date
    if order_data.order_date:
        try:
            # If it's already ISO format, use it; if it's YYYY-MM-DD, convert it
            if 'T' in order_data.order_date:
                order_date = order_data.order_date
            else:
                # Convert YYYY-MM-DD to ISO format
                order_date = datetime.strptime(order_data.order_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).isoformat()
        except:
            order_date = now
    else:
        order_date = now
    
    order = {
        "id": str(uuid.uuid4()),
        "order_number": order_data.order_number,
        "customer_name": order_data.customer_name,
        "phone": order_data.phone or "",
        "product_type": order_data.product_type,
        "wheel_specs": order_data.wheel_specs,
        "notes": order_data.notes or "",  # Admin notes - internal reference only
        "order_date": order_date,
        "current_department": "received",
        "status": "in_process",
        "final_status": None,
        "department_history": [
            {"department": "received", "started_at": now, "completed_at": None}
        ],
        "attachment_url": None,
        "attachment_name": None,
        "attachments": [],  # Multiple attachments support
        "order_notes": [],  # Conversation notes - added via order detail modal
        "quantity": order_data.quantity or 1,
        "linked_order_id": order_data.linked_order_id,
        "vehicle_make": order_data.vehicle_make or "",
        "vehicle_model": order_data.vehicle_model or "",
        "rim_size": order_data.rim_size or "",
        "rim_size_front": order_data.rim_size_front or "",
        "rim_size_rear": order_data.rim_size_rear or "",
        "cut_status": order_data.cut_status or "waiting",
        "steering_wheel_brand": (order_data.steering_wheel_brand or "").upper(),  # Auto uppercase
        "has_tires": order_data.has_tires or False,
        "has_custom_caps": order_data.has_custom_caps or False,
        "has_race_car_caps": order_data.has_race_car_caps or False,
        "has_steering_wheel": order_data.has_steering_wheel or False,
        "lalo_status": order_data.lalo_status or "not_sent",
        "tire_size": order_data.tire_size or "",  # Optional tire size
        "sold_by": order_data.sold_by,  # Salesperson ID for commission tracking
        # Manual Payment Tracking
        "payment_status": order_data.payment_status or "unpaid",
        "payment_total": order_data.payment_total or 0.0,
        "deposit_amount": order_data.deposit_amount or 0.0,
        "balance_due": order_data.balance_due or 0.0,
        "payment_notes": order_data.payment_notes or "",
        # Production Priority (auto-calculated)
        "percentage_paid": 0.0,
        "production_priority": "waiting_deposit",
        "created_by_user_id": user["id"],  # Track who created this order
        "created_by_user_name": user.get("name", user.get("email", "Unknown")),  # Creator's name
        "created_at": now,
        "updated_at": now
    }
    
    # Auto-calculate production priority if payment info provided
    if order_data.payment_total and order_data.payment_total > 0:
        priority_calc = calculate_production_priority(
            order_data.deposit_amount or 0.0,
            order_data.payment_total
        )
        order["percentage_paid"] = priority_calc["percentage_paid"]
        order["production_priority"] = priority_calc["production_priority"]
        order["balance_due"] = priority_calc["balance_due"]
    
    await db.orders.insert_one(order)
    del order["_id"]
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    return order

@api_router.get("/orders", response_model=List[OrderResponse])
async def get_orders(
    department: Optional[str] = None,
    product_type: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {"current_department": {"$ne": "completed"}}
    
    # Staff can see orders from ALL their assigned departments, admin/admin_restricted sees all
    if user["role"] not in ["admin", "admin_restricted"]:
        user_departments = user.get("departments", [user["department"]])
        query["current_department"] = {"$in": user_departments}
    elif department and department != "all":
        query["current_department"] = department
    
    # Handle product type filter - "caps" returns all cap types
    if product_type and product_type != "all":
        if product_type == "caps":
            query["product_type"] = {"$in": CAP_TYPES}
        else:
            query["product_type"] = product_type
    
    orders = await db.orders.find(query, {"_id": 0}).sort("order_date", 1).to_list(1000)
    return orders

@api_router.get("/orders/completed", response_model=List[OrderResponse])
async def get_completed_orders(
    final_status: Optional[str] = None,
    product_type: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {"current_department": "completed"}
    
    if final_status and final_status != "all":
        query["final_status"] = final_status
    
    if product_type and product_type != "all":
        query["product_type"] = product_type
    
    orders = await db.orders.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    return orders

@api_router.get("/orders/search")
async def search_orders(
    q: str,
    user: dict = Depends(get_current_user)
):
    """Search orders by order number, customer name, phone, vehicle make/model, wheel specs.
    Also searches through order notes - both original text and English translations.
    This allows finding orders using English keywords even if notes were written in other languages.
    """
    if not q or len(q) < 1:
        return []
    
    # Search across multiple fields (case-insensitive partial match)
    # Including order_notes.text (original) and order_notes.english_translation
    query = {
        "$or": [
            {"order_number": {"$regex": q, "$options": "i"}},
            {"customer_name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"vehicle_make": {"$regex": q, "$options": "i"}},
            {"vehicle_model": {"$regex": q, "$options": "i"}},
            {"wheel_specs": {"$regex": q, "$options": "i"}},
            # Search in order notes - original text
            {"order_notes.text": {"$regex": q, "$options": "i"}},
            {"order_notes.original_text": {"$regex": q, "$options": "i"}},
            # Search in order notes - English translation (allows finding non-English notes via English keywords)
            {"order_notes.english_translation": {"$regex": q, "$options": "i"}}
        ]
    }
    
    orders = await db.orders.find(query, {"_id": 0}).sort("order_date", -1).to_list(50)
    return orders

# Get orders in Lalo Queue (sent to California)
@api_router.get("/orders/lalo-queue")
async def get_lalo_queue(user: dict = Depends(get_current_user)):
    """Get all orders that have been sent to Lalo (not_sent excluded)"""
    query = {
        "lalo_status": {"$exists": True, "$ne": "not_sent"},
        "status": {"$ne": "done"}
    }
    
    orders = await db.orders.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    return orders

# Get Lalo statuses
@api_router.get("/lalo-statuses")
async def get_lalo_statuses():
    return {"lalo_statuses": LALO_STATUS}

@api_router.post("/orders/{order_id}/notes", response_model=OrderResponse)
async def add_order_note(order_id: str, note_data: AddNoteRequest, user: dict = Depends(get_current_user)):
    """Add a note to an order - any user can add notes. Supports @mentions to notify users.
    If the note is added by an admin, all users receive a notification.
    
    Auto-detects language and stores English translation for non-English notes.
    Original text is always preserved - translation is for display/search only.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Process translation for the note
    translation_data = process_note_translation(note_data.text)
    
    new_note = {
        "id": str(uuid.uuid4()),
        "text": note_data.text,  # Always store original text
        "original_text": translation_data["original_text"],
        "detected_language": translation_data["detected_language"],
        "english_translation": translation_data["english_translation"],
        "is_translated": translation_data["is_translated"],
        "created_by": user["id"],
        "created_by_name": user["name"],
        "department": user["department"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Get existing notes or empty list
    existing_notes = order.get("order_notes", []) or []
    existing_notes.append(new_note)
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "order_notes": existing_notes,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="note",
        user_id=user["id"],
        user_name=user["name"],
        description=f"Added note to order #{order.get('order_number')}",
        order_id=order_id,
        order_number=order.get("order_number"),
        customer_name=order.get("customer_name"),
        product_type=order.get("product_type"),
        extra_data={"note_preview": note_data.text[:100], "language": translation_data["detected_language"]}
    )
    
    # If admin/admin_restricted adds a note, notify ALL users (broadcast notification)
    if user["role"] in ["admin", "admin_restricted"]:
        # Get all users except the admin who added the note
        all_users = await db.users.find(
            {"id": {"$ne": user["id"]}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(1000)
        
        for target_user in all_users:
            await create_notification(
                recipient_id=target_user["id"],
                sender_id=user["id"],
                sender_name=user["name"],
                notification_type="admin_note",
                title=f"Admin note on Order #{order['order_number']}",
                message=note_data.text[:200],  # Truncate message preview
                order_id=order_id,
                order_number=order["order_number"]
            )
    else:
        # Process @mentions and create notifications (for non-admin users)
        mentions = extract_mentions(note_data.text)
        if mentions:
            for mention in mentions:
                # Try to find user by:
                # 1. Exact username match (case-insensitive)
                # 2. Name converted to username format (lowercase, underscores)
                mentioned_user = await db.users.find_one(
                    {"$or": [
                        {"username": {"$regex": f"^{mention}$", "$options": "i"}},
                        # Match name with underscores/lowercase (e.g., @admin_user matches "Admin User")
                        {"name": {"$regex": f"^{mention.replace('_', ' ')}$", "$options": "i"}}
                    ]},
                    {"_id": 0, "id": 1, "name": 1}
                )
                if mentioned_user and mentioned_user["id"] != user["id"]:
                    # Create notification for mentioned user
                    await create_notification(
                        recipient_id=mentioned_user["id"],
                        sender_id=user["id"],
                        sender_name=user["name"],
                        notification_type="mention",
                        title=f"You were mentioned in Order #{order['order_number']}",
                        message=note_data.text[:200],  # Truncate message preview
                        order_id=order_id,
                        order_number=order["order_number"]
                    )
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

# Edit a note - users can only edit their own notes
class EditNoteRequest(BaseModel):
    text: str

@api_router.put("/orders/{order_id}/notes/{note_id}")
async def edit_order_note(order_id: str, note_id: str, note_data: EditNoteRequest, user: dict = Depends(get_current_user)):
    """Edit a note - users can only edit their own notes"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    existing_notes = order.get("order_notes", []) or []
    note_found = False
    
    for i, note in enumerate(existing_notes):
        if note.get("id") == note_id:
            # Check if user owns this note
            if note.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="You can only edit your own notes")
            
            # Update the note text and add edited timestamp
            existing_notes[i]["text"] = note_data.text
            existing_notes[i]["edited_at"] = datetime.now(timezone.utc).isoformat()
            note_found = True
            break
    
    if not note_found:
        raise HTTPException(status_code=404, detail="Note not found")
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "order_notes": existing_notes,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

# Delete a note - users can only delete their own notes
@api_router.delete("/orders/{order_id}/notes/{note_id}")
async def delete_order_note(order_id: str, note_id: str, user: dict = Depends(get_current_user)):
    """Delete a note - users can only delete their own notes"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    existing_notes = order.get("order_notes", []) or []
    note_to_delete = None
    
    for note in existing_notes:
        if note.get("id") == note_id:
            note_to_delete = note
            break
    
    if not note_to_delete:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Check if user owns this note
    if note_to_delete.get("created_by") != user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own notes")
    
    # Remove the note
    updated_notes = [n for n in existing_notes if n.get("id") != note_id]
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "order_notes": updated_notes,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Note deleted successfully"}

@api_router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@api_router.put("/orders/{order_id}", response_model=OrderResponse)
async def update_order(order_id: str, order_data: OrderUpdate, user: dict = Depends(get_current_user)):
    """Any user can edit orders - to fix input mistakes"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    update_data = {k: v for k, v in order_data.model_dump().items() if v is not None}
    
    # Auto uppercase steering wheel brand
    if "steering_wheel_brand" in update_data and update_data["steering_wheel_brand"]:
        update_data["steering_wheel_brand"] = update_data["steering_wheel_brand"].upper()
    
    # Auto-calculate production priority when payment fields change
    payment_total = update_data.get("payment_total", order.get("payment_total", 0))
    deposit_amount = update_data.get("deposit_amount", order.get("deposit_amount", 0))
    
    if payment_total is not None or deposit_amount is not None:
        priority_calc = calculate_production_priority(
            deposit_amount or 0,
            payment_total or 0
        )
        update_data["percentage_paid"] = priority_calc["percentage_paid"]
        update_data["production_priority"] = priority_calc["production_priority"]
        update_data["balance_due"] = priority_calc["balance_due"]
        
        # Auto-update payment_status based on percentage
        if priority_calc["percentage_paid"] >= 100:
            update_data["payment_status"] = "paid_in_full"
        elif priority_calc["percentage_paid"] > 0:
            update_data["payment_status"] = "deposit"
        elif payment_total and payment_total > 0:
            update_data["payment_status"] = "unpaid"
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

# Add Payment to Order
class AddPaymentRequest(BaseModel):
    amount: float  # Payment amount to add
    payment_method: Optional[str] = ""  # Cash, Zelle, Check, Credit Card, etc.
    note: Optional[str] = ""  # Optional note about this payment

class PaymentHistoryEntry(BaseModel):
    id: str
    amount: float
    payment_method: str
    note: str
    added_by: str
    added_by_name: str
    added_at: str

@api_router.post("/orders/{order_id}/add-payment")
async def add_payment_to_order(order_id: str, data: AddPaymentRequest, user: dict = Depends(get_current_user)):
    """Add a payment/deposit to an order. Automatically recalculates percentage paid and production priority."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Get current payment info
    current_deposit = order.get("deposit_amount", 0) or 0
    payment_total = order.get("payment_total", 0) or 0
    payment_history = order.get("payment_history", [])
    
    # Add new payment to total deposit
    new_deposit = current_deposit + data.amount
    
    # Create payment history entry
    payment_entry = {
        "id": str(uuid.uuid4()),
        "amount": data.amount,
        "payment_method": data.payment_method or "",
        "note": data.note or "",
        "added_by": user.get("id"),
        "added_by_name": user.get("name") or user.get("username") or user.get("email", "Unknown"),
        "added_at": now
    }
    payment_history.append(payment_entry)
    
    # Calculate new production priority
    priority_calc = calculate_production_priority(new_deposit, payment_total)
    
    # Determine payment status
    if priority_calc["percentage_paid"] >= 100:
        payment_status = "paid_in_full"
    elif new_deposit > 0:
        payment_status = "deposit"
    else:
        payment_status = "unpaid"
    
    # Build payment notes (append to existing)
    existing_notes = order.get("payment_notes", "") or ""
    new_note = f"${data.amount:.2f} {data.payment_method}"
    if data.note:
        new_note += f" - {data.note}"
    new_note += f" ({now[:10]})"
    
    if existing_notes:
        payment_notes = f"{existing_notes}; {new_note}"
    else:
        payment_notes = new_note
    
    # Update order
    update_data = {
        "deposit_amount": new_deposit,
        "balance_due": priority_calc["balance_due"],
        "percentage_paid": priority_calc["percentage_paid"],
        "production_priority": priority_calc["production_priority"],
        "payment_status": payment_status,
        "payment_notes": payment_notes,
        "payment_history": payment_history,
        "updated_at": now
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Invalidate stats cache
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return {
        "success": True,
        "message": f"Payment of ${data.amount:.2f} added successfully",
        "order": updated_order,
        "new_percentage_paid": priority_calc["percentage_paid"],
        "production_priority": priority_calc["production_priority"]
    }

# Update cut status for steering wheels and caps
class CutStatusUpdate(BaseModel):
    cut_status: str

@api_router.put("/orders/{order_id}/cut-status")
async def update_cut_status(order_id: str, data: CutStatusUpdate, user: dict = Depends(get_current_user)):
    """Update cut status for steering wheels and caps.
    When marked as CUT, order automatically moves to FINISHING department.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if data.cut_status not in CUT_STATUS:
        raise HTTPException(status_code=400, detail="Invalid cut status")
    
    old_status = order.get("cut_status", "waiting")
    now = datetime.now(timezone.utc).isoformat()
    current_dept = order.get("current_department", "received")
    
    # Build update data - add cut_at timestamp when marking as cut
    update_data = {
        "cut_status": data.cut_status,
        "updated_at": now
    }
    
    # Set cut_at timestamp when order is marked as "cut"
    if data.cut_status == "cut" and old_status != "cut":
        update_data["cut_at"] = now
        
        # AUTO-MOVE TO FINISHING: When marked as CUT, move order to finishing department
        # This ensures finishing team can see orders that need touch-up work after cutting
        if current_dept != "finishing" and current_dept not in ["powder_coat", "assemble", "showroom", "shipped", "completed"]:
            # Update department history - close current department
            history = order.get("department_history", [])
            for h in history:
                if h.get("department") == current_dept and h.get("completed_at") is None:
                    h["completed_at"] = now
                    break
            
            # Add finishing department entry
            history.append({
                "department": "finishing",
                "started_at": now,
                "completed_at": None,
                "moved_by": user.get("id"),
                "moved_by_name": user.get("name") or user.get("username") or user.get("email", "System"),
                "auto_moved": True,
                "reason": "Auto-moved on CUT status"
            })
            
            update_data["current_department"] = "finishing"
            update_data["department_history"] = history
            update_data["last_moved_by"] = user.get("id")
            update_data["last_moved_by_name"] = user.get("name") or user.get("username") or "System"
            update_data["last_moved_at"] = now
            update_data["last_moved_from"] = current_dept
            update_data["last_moved_to"] = "finishing"
    
    # Clear cut_at if changing back from cut to waiting
    elif data.cut_status != "cut" and old_status == "cut":
        update_data["cut_at"] = None
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": update_data}
    )
    
    # Build description for activity log
    description = f"Changed cut status from '{old_status}' to '{data.cut_status}'"
    if data.cut_status == "cut" and update_data.get("current_department") == "finishing":
        description += f" (auto-moved from {current_dept} to finishing)"
    
    # Log activity for cut status change
    await log_activity(
        action_type="cut_status_change",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username"),
        description=description,
        order_id=order_id,
        order_number=order.get("order_number"),
        customer_name=order.get("customer_name"),
        product_type=order.get("product_type"),
        extra_data={
            "old_cut_status": old_status,
            "new_cut_status": data.cut_status,
            "auto_moved_to_finishing": update_data.get("current_department") == "finishing" and current_dept != "finishing"
        }
    )
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

# Toggle has_tires status
@api_router.put("/orders/{order_id}/tires")
async def toggle_tires(order_id: str, user: dict = Depends(get_current_user)):
    """Toggle has_tires status for an order"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    current_status = order.get("has_tires", False)
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "has_tires": not current_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

# Toggle has_steering_wheel status
@api_router.put("/orders/{order_id}/steering-wheel")
async def toggle_steering_wheel(order_id: str, user: dict = Depends(get_current_user)):
    """Toggle has_steering_wheel status for an order"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    current_status = order.get("has_steering_wheel", False)
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "has_steering_wheel": not current_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

# Update Lalo status
class LaloStatusUpdate(BaseModel):
    lalo_status: str

@api_router.put("/orders/{order_id}/lalo-status")
async def update_lalo_status(order_id: str, data: LaloStatusUpdate, user: dict = Depends(get_current_user)):
    """Update Lalo queue status for an order. When sent to Lalo, order moves to 'shipped' department."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if data.lalo_status not in LALO_STATUS:
        raise HTTPException(status_code=400, detail="Invalid Lalo status")
    
    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "lalo_status": data.lalo_status,
        "updated_at": now
    }
    
    # When sending to Lalo (shipped_to_lalo), move order to "shipped" department
    # When order returns from Lalo, it stays in shipped until manually moved
    if data.lalo_status == "shipped_to_lalo":
        current_dept = order["current_department"]
        
        # Only move if not already shipped or completed
        if current_dept not in ["shipped", "completed"]:
            # Update department history - mark current as completed
            history = order.get("department_history", [])
            for h in history:
                if h["department"] == current_dept and h.get("completed_at") is None:
                    h["completed_at"] = now
                    break
            
            # Add shipped department entry
            history.append({"department": "shipped", "started_at": now, "completed_at": None})
            
            update_data["current_department"] = "shipped"
            update_data["department_history"] = history
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

# RUSH Order Feature - Admin Only
class RushOrderRequest(BaseModel):
    is_rush: bool
    rush_reason: Optional[str] = None

@api_router.put("/orders/{order_id}/rush")
async def toggle_rush_order(order_id: str, data: RushOrderRequest, user: dict = Depends(get_current_user)):
    """Mark/unmark an order as RUSH - Admin only"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "is_rush": data.is_rush,
        "rush_reason": data.rush_reason if data.is_rush else None,
        "rush_set_by": user.get("name", user.get("email")) if data.is_rush else None,
        "rush_set_at": now if data.is_rush else None,
        "updated_at": now
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

class MoveOrderRequest(BaseModel):
    target_department: str

@api_router.put("/orders/{order_id}/move", response_model=OrderResponse)
async def move_order_to_department(order_id: str, move_data: MoveOrderRequest, user: dict = Depends(get_current_user)):
    """Move order to a department - Admin/Admin1 can move anywhere, Staff can move to their assigned departments.
    CUT orders cannot be moved backwards (before finishing).
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    target_dept = move_data.target_department
    if target_dept not in DEPARTMENTS:
        raise HTTPException(status_code=400, detail="Invalid department")
    
    # PREVENT CUT ORDERS FROM MOVING BACKWARDS
    # CUT orders can only go forward: finishing -> powder_coat -> assemble -> showroom -> shipped -> completed
    cut_status = order.get("cut_status", "waiting")
    if cut_status == "cut":
        # Departments that CUT orders CANNOT go back to
        blocked_departments = ["received", "design", "program", "machine_waiting", "machine"]
        if target_dept in blocked_departments:
            raise HTTPException(
                status_code=400, 
                detail=f"CUT orders cannot be moved back to {target_dept}. CUT orders can only move forward from Finishing."
            )
    
    # Check permissions - admin and admin_restricted can move anywhere
    if user["role"] not in ["admin", "admin_restricted"]:
        # Staff can only move to their assigned departments
        user_departments = user.get("departments", [user["department"]])
        current_dept = order["current_department"]
        
        # Staff must have access to the order's current department OR the target department
        if current_dept not in user_departments and target_dept not in user_departments:
            raise HTTPException(status_code=403, detail="You can only move orders between your assigned departments")
        
        # Staff can only move to one of their assigned departments
        if target_dept not in user_departments:
            raise HTTPException(status_code=403, detail=f"You can only move orders to your departments: {', '.join(user_departments)}")
    
    now = datetime.now(timezone.utc).isoformat()
    current_dept = order["current_department"]
    
    # Update department history
    history = order["department_history"]
    for h in history:
        if h["department"] == current_dept and h.get("completed_at") is None:
            h["completed_at"] = now
            break
    
    # Add new department entry with user tracking
    if target_dept != "completed":
        history.append({
            "department": target_dept, 
            "started_at": now, 
            "completed_at": None,
            "moved_by": user.get("id"),
            "moved_by_name": user.get("name") or user.get("username") or user.get("email", "Unknown")
        })
    
    # Track who moved from completed
    last_move_info = {
        "last_moved_by": user.get("id"),
        "last_moved_by_name": user.get("name") or user.get("username") or user.get("email", "Unknown"),
        "last_moved_at": now,
        "last_moved_from": current_dept,
        "last_moved_to": target_dept
    }
    
    update_data = {
        "current_department": target_dept,
        "department_history": history,
        "updated_at": now,
        "lalo_status": "not_sent",  # Clear Lalo status when order is moved to any department
        **last_move_info
    }
    
    if target_dept == "completed":
        update_data["status"] = "done"
    else:
        update_data["status"] = "in_process"
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="move",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
        description=f"Moved order #{order.get('order_number')} from {current_dept} to {target_dept}",
        order_id=order_id,
        order_number=order.get("order_number"),
        customer_name=order.get("customer_name"),
        product_type=order.get("product_type"),
        extra_data={"from_department": current_dept, "to_department": target_dept}
    )
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

@api_router.put("/orders/{order_id}/advance", response_model=OrderResponse)
async def advance_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    current_dept = order["current_department"]
    
    # Staff can advance orders in any of their departments, admin/admin_restricted can advance any
    user_departments = user.get("departments", [user["department"]])
    if user["role"] not in ["admin", "admin_restricted"] and current_dept not in user_departments:
        raise HTTPException(status_code=403, detail="You can only advance orders in your departments")
    
    if current_dept == "completed":
        raise HTTPException(status_code=400, detail="Order already completed")
    
    current_index = DEPARTMENTS.index(current_dept)
    next_dept = DEPARTMENTS[current_index + 1]
    now = datetime.now(timezone.utc).isoformat()
    
    # Update department history - mark current as completed
    history = order["department_history"]
    for h in history:
        if h["department"] == current_dept and h.get("completed_at") is None:
            h["completed_at"] = now
            break
    
    # Add new department entry with user tracking (unless it's completed)
    if next_dept != "completed":
        history.append({
            "department": next_dept, 
            "started_at": now, 
            "completed_at": None,
            "moved_by": user.get("id"),
            "moved_by_name": user.get("name") or user.get("username") or user.get("email", "Unknown")
        })
    
    # Track who moved the order
    last_move_info = {
        "last_moved_by": user.get("id"),
        "last_moved_by_name": user.get("name") or user.get("username") or user.get("email", "Unknown"),
        "last_moved_at": now,
        "last_moved_from": current_dept,
        "last_moved_to": next_dept
    }
    
    update_data = {
        "current_department": next_dept,
        "department_history": history,
        "updated_at": now,
        "lalo_status": "not_sent",  # Clear Lalo status when order advances
        **last_move_info
    }
    
    # If moving to completed, mark as done
    if next_dept == "completed":
        update_data["status"] = "done"
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="move",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
        description=f"Advanced order #{order.get('order_number')} from {current_dept} to {next_dept}",
        order_id=order_id,
        order_number=order.get("order_number"),
        customer_name=order.get("customer_name"),
        product_type=order.get("product_type"),
        extra_data={"from_department": current_dept, "to_department": next_dept}
    )
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

class UpdateFinalStatus(BaseModel):
    final_status: str  # pickup or shipped

@api_router.put("/orders/{order_id}/final-status", response_model=OrderResponse)
async def update_final_status(order_id: str, status_data: UpdateFinalStatus, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order["current_department"] != "completed":
        raise HTTPException(status_code=400, detail="Order must be completed first")
    
    if status_data.final_status not in ["pickup", "shipped"]:
        raise HTTPException(status_code=400, detail="Status must be 'pickup' or 'shipped'")
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "final_status": status_data.final_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

@api_router.put("/orders/{order_id}/ship", response_model=OrderResponse)
async def ship_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order["current_department"] != "completed":
        raise HTTPException(status_code=400, detail="Order must be completed first")
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "final_status": "shipped",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Only admin can delete orders")
    
    result = await db.orders.delete_one({"id": order_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    return {"message": "Order deleted"}

# Stats endpoint
@api_router.get("/stats")
async def get_stats(user: dict = Depends(get_current_user)):
    # Check cache first (30 second TTL for stats - balance between freshness and performance)
    cache_key_str = "stats:dashboard"
    cached = cache.get(cache_key_str)
    if cached:
        return cached
    
    pipeline = [
        {"$group": {
            "_id": "$current_department",
            "count": {"$sum": 1}
        }}
    ]
    
    dept_counts = await db.orders.aggregate(pipeline).to_list(100)
    stats = {d["_id"]: d["count"] for d in dept_counts}
    
    # Product type counts (active orders only) - counts orders, not quantities
    product_pipeline = [
        {"$match": {"current_department": {"$ne": "completed"}}},
        {"$group": {
            "_id": "$product_type",
            "count": {"$sum": 1}
        }}
    ]
    
    product_counts = await db.orders.aggregate(product_pipeline).to_list(20)
    product_stats = {p["_id"]: p["count"] for p in product_counts}
    
    # Custom caps count (separate stat)
    custom_caps_count = await db.orders.count_documents({
        "product_type": "custom_caps",
        "current_department": {"$ne": "completed"}
    })
    
    # Lalo queue count
    lalo_count = await db.orders.count_documents({
        "lalo_status": {"$ne": "not_sent"},
        "status": {"$ne": "done"}
    })
    
    result = {
        "departments": stats,
        "products": product_stats,
        "total_active": sum(v for k, v in stats.items() if k != "completed"),
        "total_completed": stats.get("completed", 0),
        "custom_caps": custom_caps_count,
        "lalo_queue": lalo_count
    }
    
    # Cache for 30 seconds
    cache.set(cache_key_str, result, ttl=30)
    return result

# Machine Queue endpoint - groups orders by product type for machinist
@api_router.get("/machine-queue")
async def get_machine_queue(user: dict = Depends(get_current_user)):
    """Get orders in machine-related departments grouped by product type for the machinist"""
    # Orders waiting for machining or currently being machined
    machine_departments = ["machine_waiting", "machine"]
    
    query = {"current_department": {"$in": machine_departments}}
    orders = await db.orders.find(query, {"_id": 0}).sort("order_date", 1).to_list(1000)
    
    # Group by product type
    grouped = {}
    for order in orders:
        product_type = order.get("product_type", "unknown")
        if product_type not in grouped:
            grouped[product_type] = []
        grouped[product_type].append(order)
    
    # Calculate totals per product type
    summary = []
    for product_type, type_orders in grouped.items():
        total_quantity = sum(o.get("quantity", 1) for o in type_orders)
        summary.append({
            "product_type": product_type,
            "label": PRODUCT_TYPES.get(product_type, product_type),
            "order_count": len(type_orders),
            "total_quantity": total_quantity,
            "orders": type_orders
        })
    
    # Sort by order count descending
    summary.sort(key=lambda x: x["order_count"], reverse=True)
    
    return {
        "groups": summary,
        "total_orders": len(orders),
        "product_types": PRODUCT_TYPES
    }

@api_router.get("/product-types")
async def get_product_types():
    """Get all product types and their labels"""
    return {
        "product_types": PRODUCT_TYPES,
        "cap_types": CAP_TYPES
    }

@api_router.get("/departments")
async def get_departments():
    return {
        "departments": DEPARTMENTS[:-1],  # Exclude 'completed' as a working department
        "labels": DEPARTMENT_LABELS
    }

# File upload endpoint - supports multiple attachments
# Files are stored in MongoDB as base64 to persist across deployments
@api_router.post("/orders/{order_id}/attachment")
async def upload_attachment(
    order_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="File type not allowed. Use JPG, PNG, GIF, WEBP, or PDF")
    
    # Read file content
    content = await file.read()
    
    # Check file size (max 10MB)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")
    
    # Generate unique ID for this attachment
    attachment_id = str(uuid.uuid4())
    
    # Store file in MongoDB for persistence
    import base64
    file_data = {
        "id": attachment_id,
        "order_id": order_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "data": base64.b64encode(content).decode('utf-8'),
        "size": len(content),
        "uploaded_by": user["name"],
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    await db.attachments.insert_one(file_data)
    
    # Create attachment reference for order
    attachment_url = f"/api/attachments/{attachment_id}"
    new_attachment = {
        "id": attachment_id,
        "url": attachment_url,
        "name": file.filename,
        "content_type": file.content_type,
        "size": len(content),
        "uploaded_by": user["name"],
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Get existing attachments or create empty list
    existing_attachments = order.get("attachments", []) or []
    existing_attachments.append(new_attachment)
    
    # Update order with new attachment
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "attachments": existing_attachments,
            "attachment_url": attachment_url,  # Keep for backward compatibility
            "attachment_name": file.filename,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Attachment uploaded", "attachment_url": attachment_url, "attachment_name": file.filename, "attachment": new_attachment}

@api_router.delete("/orders/{order_id}/attachment")
async def delete_attachment(order_id: str, attachment_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Delete an attachment. If attachment_id provided, delete specific one. Otherwise delete all."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if attachment_id:
        # Delete specific attachment
        attachments = order.get("attachments", []) or []
        attachment_to_delete = None
        for att in attachments:
            if att.get("id") == attachment_id:
                attachment_to_delete = att
                break
        
        if attachment_to_delete:
            url = attachment_to_delete.get("url", "")
            
            # Check if it's a MongoDB-stored attachment or file-based
            if "/api/attachments/" in url:
                # Delete from MongoDB attachments collection
                await db.attachments.delete_one({"id": attachment_id})
            else:
                # Delete file from disk (legacy)
                file_path = UPLOADS_DIR / url.split("/")[-1]
                if file_path.exists():
                    file_path.unlink()
            
            # Remove from list
            attachments = [a for a in attachments if a.get("id") != attachment_id]
            
            # Update order
            update_data = {
                "attachments": attachments,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Update legacy fields based on remaining attachments
            if attachments:
                update_data["attachment_url"] = attachments[-1]["url"]
                update_data["attachment_name"] = attachments[-1]["name"]
            else:
                update_data["attachment_url"] = None
                update_data["attachment_name"] = None
            
            await db.orders.update_one({"id": order_id}, {"$set": update_data})
    else:
        # Delete all attachments
        attachments = order.get("attachments", []) or []
        for att in attachments:
            url = att.get("url", "")
            att_id = att.get("id")
            
            if "/api/attachments/" in url and att_id:
                # Delete from MongoDB
                await db.attachments.delete_one({"id": att_id})
            else:
                # Delete file from disk (legacy)
                file_path = UPLOADS_DIR / url.split("/")[-1]
                if file_path.exists():
                    file_path.unlink()
        
        # Also check legacy attachment
        if order.get("attachment_url"):
            file_path = UPLOADS_DIR / order["attachment_url"].split("/")[-1]
            if file_path.exists():
                file_path.unlink()
        
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {
                "attachments": [],
                "attachment_url": None,
                "attachment_name": None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return {"message": "Attachment deleted"}

# PDF Export endpoint
@api_router.get("/orders/export")
async def export_orders(
    department: Optional[str] = None,
    product_type: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {}
    
    if department and department != "all":
        query["current_department"] = department
    
    if product_type and product_type != "all":
        query["product_type"] = product_type
    
    orders = await db.orders.find(query, {"_id": 0}).sort("order_date", 1).to_list(1000)
    
    # Return data formatted for PDF generation on frontend
    return {
        "orders": orders,
        "department": department or "all",
        "product_type": product_type or "all",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_count": len(orders)
    }

# =============================================================================
# DATA EXPORT/IMPORT ENDPOINTS (For Migration Between Deployments)
# =============================================================================

# Export all data (orders and users) - Admin/Admin Restricted
@api_router.get("/admin/export-all-data")
async def export_all_data(user: dict = Depends(get_current_user)):
    """Export ALL orders and users for migration to new deployment - Admin/Admin Restricted"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all orders
    orders = await db.orders.find({}, {"_id": 0}).to_list(10000)
    
    # Get all users (excluding sensitive password hashes for security)
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    
    # Get employee codes
    employee_codes = await db.employee_codes.find({}, {"_id": 0}).to_list(1000)
    
    export_data = {
        "export_info": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_by": user["email"],
            "orders_count": len(orders),
            "users_count": len(users),
            "employee_codes_count": len(employee_codes)
        },
        "orders": orders,
        "users": users,
        "employee_codes": employee_codes
    }
    
    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": f"attachment; filename=corleone-forged-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        }
    )

# Import data model
class ImportDataRequest(BaseModel):
    orders: List[dict] = []
    users: List[dict] = []
    employee_codes: List[dict] = []
    skip_existing: bool = True  # Skip orders/users that already exist

# Import all data - Admin/Admin Restricted
@api_router.post("/admin/import-all-data")
async def import_all_data(import_data: ImportDataRequest, user: dict = Depends(get_current_user)):
    """Import orders and users from exported backup - Admin/Admin Restricted"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    results = {
        "orders": {"imported": 0, "skipped": 0, "errors": []},
        "users": {"imported": 0, "skipped": 0, "errors": []},
        "employee_codes": {"imported": 0, "skipped": 0, "errors": []}
    }
    
    # Import orders
    for order in import_data.orders:
        try:
            # Check if order already exists
            existing = await db.orders.find_one({"id": order.get("id")})
            if existing:
                if import_data.skip_existing:
                    results["orders"]["skipped"] += 1
                    continue
                else:
                    # Update existing order
                    await db.orders.replace_one({"id": order["id"]}, order)
                    results["orders"]["imported"] += 1
            else:
                await db.orders.insert_one(order)
                results["orders"]["imported"] += 1
        except Exception as e:
            results["orders"]["errors"].append(f"Order {order.get('order_number', 'unknown')}: {str(e)}")
    
    # Import users
    for user_doc in import_data.users:
        try:
            existing = await db.users.find_one({"id": user_doc.get("id")})
            if existing:
                if import_data.skip_existing:
                    results["users"]["skipped"] += 1
                    continue
                else:
                    await db.users.replace_one({"id": user_doc["id"]}, user_doc)
                    results["users"]["imported"] += 1
            else:
                await db.users.insert_one(user_doc)
                results["users"]["imported"] += 1
        except Exception as e:
            results["users"]["errors"].append(f"User {user_doc.get('email', 'unknown')}: {str(e)}")
    
    # Import employee codes
    for code in import_data.employee_codes:
        try:
            existing = await db.employee_codes.find_one({"id": code.get("id")})
            if existing:
                if import_data.skip_existing:
                    results["employee_codes"]["skipped"] += 1
                    continue
                else:
                    await db.employee_codes.replace_one({"id": code["id"]}, code)
                    results["employee_codes"]["imported"] += 1
            else:
                await db.employee_codes.insert_one(code)
                results["employee_codes"]["imported"] += 1
        except Exception as e:
            results["employee_codes"]["errors"].append(f"Code {code.get('code', 'unknown')}: {str(e)}")
    
    return {
        "success": True,
        "message": "Import completed",
        "results": results
    }

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

@api_router.get("/auth/debug-status")
async def auth_debug_status():
    """Debug endpoint to check auth system status - no auth required"""
    try:
        # Count users
        user_count = await db.users.count_documents({})
        
        # Count users with PINs
        pin_count = await db.users.count_documents({"login_pin": {"$exists": True, "$ne": None}})
        
        # Get list of users with PINs - include data type info for debugging
        users_with_pins = await db.users.find(
            {"login_pin": {"$exists": True, "$ne": None}},
            {"_id": 0, "name": 1, "login_pin": 1, "email": 1}
        ).to_list(100)
        
        # Get sample user emails (first 10)
        sample_users = await db.users.find({}, {"_id": 0, "name": 1, "email": 1, "role": 1}).to_list(10)
        
        # Check rate limiter status - show all entries for debugging
        rate_limit_details = []
        now = datetime.now(timezone.utc)
        for key, record in failed_login_attempts.items():
            lockout_until = record.get("lockout_until")
            is_locked = lockout_until and lockout_until > now
            rate_limit_details.append({
                "identifier": key,
                "attempts": record.get("attempts", 0),
                "is_locked": is_locked,
                "lockout_until": lockout_until.isoformat() if lockout_until else None
            })
        
        return {
            "status": "ok",
            "total_users": user_count,
            "users_with_pins": pin_count,
            "pin_users": [
                {
                    "name": u.get("name"), 
                    "pin": u.get("login_pin"),
                    "pin_type": type(u.get("login_pin")).__name__,
                    "email": u.get("email")
                } for u in users_with_pins
            ],
            "sample_users": sample_users,
            "locked_accounts": len([r for r in rate_limit_details if r["is_locked"]]),
            "rate_limit_entries": rate_limit_details,
            "server_time": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "traceback": traceback.format_exc()}

@api_router.get("/auth/test-pin/{pin}")
async def test_pin_lookup(pin: str):
    """Debug endpoint to test PIN lookup - shows exactly what's happening"""
    try:
        results = {
            "input_pin": pin,
            "input_type": type(pin).__name__,
            "input_length": len(pin),
            "searches": []
        }
        
        # Search 1: Exact string match
        user_str = await db.users.find_one({"login_pin": pin}, {"_id": 0, "name": 1, "login_pin": 1})
        results["searches"].append({
            "method": "string_exact",
            "query": {"login_pin": pin},
            "found": user_str is not None,
            "user": user_str
        })
        
        # Search 2: Integer match
        try:
            pin_int = int(pin)
            user_int = await db.users.find_one({"login_pin": pin_int}, {"_id": 0, "name": 1, "login_pin": 1})
            results["searches"].append({
                "method": "integer",
                "query": {"login_pin": pin_int},
                "found": user_int is not None,
                "user": user_int
            })
        except ValueError:
            results["searches"].append({"method": "integer", "error": "not a valid integer"})
        
        # Search 3: Regex match (case insensitive, whitespace tolerant)
        user_regex = await db.users.find_one(
            {"login_pin": {"$regex": f"^\\s*{pin}\\s*$"}}, 
            {"_id": 0, "name": 1, "login_pin": 1}
        )
        results["searches"].append({
            "method": "regex_whitespace",
            "found": user_regex is not None,
            "user": user_regex
        })
        
        # Get all PINs in database for comparison
        all_pins = await db.users.find(
            {"login_pin": {"$exists": True, "$ne": None}},
            {"_id": 0, "name": 1, "login_pin": 1}
        ).to_list(100)
        
        results["all_pins_in_db"] = [
            {
                "name": u.get("name"),
                "pin": u.get("login_pin"),
                "pin_type": type(u.get("login_pin")).__name__,
                "pin_repr": repr(u.get("login_pin"))
            } for u in all_pins
        ]
        
        return results
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "traceback": traceback.format_exc()}

# Custom file serving endpoint that sets proper headers for inline viewing
from fastapi.responses import FileResponse, Response
import mimetypes

@api_router.get("/uploads/{filename}")
async def serve_upload(filename: str):
    """Serve uploaded files with proper headers for Chrome compatibility"""
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Get the mime type
    mime_type, _ = mimetypes.guess_type(str(file_path))
    if mime_type is None:
        mime_type = "application/octet-stream"
    
    # Read file content
    with open(file_path, "rb") as f:
        content = f.read()
    
    # For PDFs and images, display inline with proper headers for Chrome
    headers = {
        "Content-Type": mime_type,
        "Content-Length": str(len(content)),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
    }
    
    if mime_type in ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]:
        headers["Content-Disposition"] = f"inline; filename=\"{filename}\""
    else:
        headers["Content-Disposition"] = f"attachment; filename=\"{filename}\""
    
    return Response(content=content, media_type=mime_type, headers=headers)

# Serve attachments stored in MongoDB (new system - persistent)
@api_router.get("/attachments/{attachment_id}")
async def serve_attachment_from_db(attachment_id: str):
    """Serve attachments stored in MongoDB - these persist across deployments"""
    import base64
    
    # Find attachment in database
    attachment = await db.attachments.find_one({"id": attachment_id}, {"_id": 0})
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Decode base64 content
    try:
        content = base64.b64decode(attachment["data"])
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decode attachment")
    
    mime_type = attachment.get("content_type", "application/octet-stream")
    filename = attachment.get("filename", "attachment")
    
    # Set headers for proper viewing
    headers = {
        "Content-Type": mime_type,
        "Content-Length": str(len(content)),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
    }
    
    if mime_type in ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]:
        headers["Content-Disposition"] = f"inline; filename=\"{filename}\""
    else:
        headers["Content-Disposition"] = f"attachment; filename=\"{filename}\""
    
    return Response(content=content, media_type=mime_type, headers=headers)

# Admin endpoint to clear broken attachments
@api_router.delete("/admin/orders/{order_id}/clear-attachments")
async def clear_broken_attachments(order_id: str, user: dict = Depends(get_current_user)):
    """Clear all attachment references from an order (admin/admin_restricted)"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "attachments": [],
            "attachment_url": None,
            "attachment_name": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Attachments cleared", "order_id": order_id}

# Bulk mark orders as cut - admin only
class BulkCutRequest(BaseModel):
    order_ids: List[str]
    cut_status: str = "cut"  # "cut", "waiting", "processing"

# ============ HOLD QUEUE MODELS ============
class HoldOrderRequest(BaseModel):
    order_id: str
    hold_reason: str

class RemoveFromHoldRequest(BaseModel):
    order_id: str

class CreateHoldOrderRequest(BaseModel):
    order_number: str
    customer_name: str
    phone: Optional[str] = ""
    product_type: str = "rim"
    wheel_specs: Optional[str] = ""
    notes: Optional[str] = ""
    hold_reason: str
    order_date: Optional[str] = None

# ============ STOCK INVENTORY MODELS ============
class StockSetCreate(BaseModel):
    sku: str
    name: str
    size: str
    bolt_pattern: str
    cf_caps: Optional[str] = None
    finish: Optional[str] = None
    original_order_number: Optional[str] = None
    fitment: Optional[str] = None
    cubby_number: Optional[str] = None
    notes: Optional[str] = None

class StockSetUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    size: Optional[str] = None
    bolt_pattern: Optional[str] = None
    cf_caps: Optional[str] = None
    finish: Optional[str] = None
    original_order_number: Optional[str] = None
    fitment: Optional[str] = None
    cubby_number: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # "available", "reserved", "sold"

class CreateOrderFromStockRequest(BaseModel):
    customer_name: str
    phone: str
    notes: Optional[str] = ""

@api_router.put("/admin/orders/bulk-cut")
async def bulk_mark_cut(cut_data: BulkCutRequest, user: dict = Depends(get_current_user)):
    """Bulk mark orders as cut - admin/admin_restricted"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not cut_data.order_ids:
        raise HTTPException(status_code=400, detail="No orders selected")
    
    # Get order details before update for logging
    orders_to_update = await db.orders.find(
        {"id": {"$in": cut_data.order_ids}},
        {"_id": 0, "id": 1, "order_number": 1, "customer_name": 1, "product_type": 1, "cut_status": 1}
    ).to_list(None)
    
    result = await db.orders.update_many(
        {"id": {"$in": cut_data.order_ids}},
        {"$set": {
            "cut_status": cut_data.cut_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log activity for bulk cut action
    order_numbers = [o.get("order_number", "N/A") for o in orders_to_update]
    await log_activity(
        action_type="bulk_cut_status",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username"),
        description=f"Bulk marked {result.modified_count} orders as '{cut_data.cut_status}'",
        extra_data={
            "cut_status": cut_data.cut_status,
            "order_count": result.modified_count,
            "order_ids": cut_data.order_ids,
            "order_numbers": order_numbers[:20]  # Limit to first 20 for readability
        }
    )
    
    return {
        "success": True,
        "modified_count": result.modified_count,
        "cut_status": cut_data.cut_status
    }

# ============ HOLD QUEUE ENDPOINTS ============
# Check if user has Sales or Admin access
def check_sales_or_admin(user: dict):
    """Helper to check if user is admin/admin_restricted or has sales (received) department access"""
    if user["role"] in ["admin", "admin_restricted"]:
        return True
    user_depts = user.get("departments", [user.get("department")])
    return "received" in user_depts

@api_router.get("/hold-queue")
async def get_hold_queue(user: dict = Depends(get_current_user)):
    """Get all orders in the hold queue - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    orders = await db.orders.find(
        {"on_hold": True},
        {"_id": 0}
    ).to_list(1000)
    
    # Calculate days on hold for each order
    for order in orders:
        hold_since = order.get("hold_since")
        if hold_since:
            try:
                hold_date = datetime.fromisoformat(hold_since.replace('Z', '+00:00'))
                days_on_hold = (datetime.now(timezone.utc) - hold_date).days
                order["days_on_hold"] = days_on_hold
            except:
                order["days_on_hold"] = 0
        else:
            order["days_on_hold"] = 0
    
    return orders

@api_router.post("/orders/hold")
async def create_order_on_hold(data: CreateHoldOrderRequest, user: dict = Depends(get_current_user)):
    """Create a new order directly on hold - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    # Check for duplicate order number
    existing = await db.orders.find_one({"order_number": data.order_number}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Order number already exists")
    
    now = datetime.now(timezone.utc).isoformat()
    order_date = data.order_date or now.split('T')[0]
    
    new_order = {
        "id": str(uuid.uuid4()),
        "order_number": data.order_number,
        "customer_name": data.customer_name,
        "phone": data.phone or "",
        "product_type": data.product_type,
        "wheel_specs": data.wheel_specs or "",
        "notes": data.notes or "",
        "order_date": order_date,
        "current_department": "received",  # Stays in Sales/Received but on hold
        "status": "pending",
        "final_status": None,
        "department_history": [{
            "department": "received",
            "entered_at": now,
            "entered_by": user.get("name", user.get("email")),
            "note": f"Created on hold: {data.hold_reason}"
        }],
        "attachment_url": None,
        "attachment_name": None,
        "attachments": [],
        "order_notes": [],
        "quantity": 1,
        "linked_order_id": None,
        "vehicle_make": "",
        "vehicle_model": "",
        "rim_size": "",
        "cut_status": "waiting",
        "steering_wheel_brand": "",
        "has_tires": False,
        "has_custom_caps": False,
        "has_race_car_caps": False,
        "has_steering_wheel": False,
        "lalo_status": "not_sent",
        "rim_size_front": "",
        "rim_size_rear": "",
        # Hold queue fields
        "on_hold": True,
        "is_on_hold": True,
        "hold_reason": data.hold_reason,
        "hold_since": now,
        "hold_date": now,
        "hold_added_by": user.get("name", user.get("email")),
        # RUSH fields
        "is_rush": False,
        "rush_reason": None,
        "rush_set_by": None,
        "rush_set_at": None,
        # Track who created this order
        "created_by_user_id": user["id"],
        "created_by_user_name": user.get("name", user.get("email", "Unknown")),
        "created_at": now,
        "updated_at": now
    }
    
    await db.orders.insert_one(new_order)
    
    # Invalidate stats cache when orders change
    cache.invalidate_pattern("stats:")
    
    # Remove _id from response
    new_order.pop("_id", None)
    return new_order

@api_router.post("/hold-queue/add")
async def add_to_hold_queue(data: HoldOrderRequest, user: dict = Depends(get_current_user)):
    """Add an order to the hold queue - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    order = await db.orders.find_one({"id": data.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    await db.orders.update_one(
        {"id": data.order_id},
        {"$set": {
            "on_hold": True,
            "hold_reason": data.hold_reason,
            "hold_since": datetime.now(timezone.utc).isoformat(),
            "hold_added_by": user.get("name", user.get("email")),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "message": "Order added to hold queue"}

@api_router.post("/hold-queue/remove")
async def remove_from_hold_queue(data: RemoveFromHoldRequest, user: dict = Depends(get_current_user)):
    """Remove an order from the hold queue - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    order = await db.orders.find_one({"id": data.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    await db.orders.update_one(
        {"id": data.order_id},
        {"$set": {
            "on_hold": False,
            "hold_reason": None,
            "hold_since": None,
            "hold_added_by": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "message": "Order removed from hold queue"}

@api_router.put("/hold-queue/{order_id}/reason")
async def update_hold_reason(order_id: str, data: HoldOrderRequest, user: dict = Depends(get_current_user)):
    """Update hold reason for an order - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    result = await db.orders.update_one(
        {"id": order_id, "on_hold": True},
        {"$set": {
            "hold_reason": data.hold_reason,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found or not on hold")
    
    return {"success": True, "message": "Hold reason updated"}

# ============ RUSH QUEUE ENDPOINTS ============
@api_router.get("/rush-queue")
async def get_rush_queue(user: dict = Depends(get_current_user)):
    """Get all RUSH orders - visible to all users
    RUSH orders override other queues (like Refinish, Re-Do) - they appear here even if marked for refinish/redo
    """
    # Data projection: Only fetch fields needed for the list view (reduces payload size ~60%)
    list_view_projection = {
        "_id": 0,
        "id": 1,
        "order_number": 1,
        "customer_name": 1,
        "phone": 1,
        "product_type": 1,
        "current_department": 1,
        "status": 1,
        "order_date": 1,
        "quantity": 1,
        "vehicle_make": 1,
        "vehicle_model": 1,
        "rim_size": 1,
        "is_rush": 1,
        "rush_reason": 1,
        "rush_set_at": 1,
        "is_redo": 1,
        "cut_status": 1,
        "lalo_status": 1,
        "created_at": 1
    }
    
    # Get all rush orders (is_rush = True) that are not completed
    orders = await db.orders.find(
        {"is_rush": True, "current_department": {"$ne": "completed"}},
        list_view_projection
    ).sort("order_number", 1).to_list(1000)
    
    # Batch fetch refinish status for all orders at once (single query instead of N queries)
    order_ids = [order["id"] for order in orders]
    refinish_entries = {}
    if order_ids:
        async for entry in db.refinish_queue.find(
            {"original_order_id": {"$in": order_ids}},
            {"_id": 0, "original_order_id": 1, "fix_notes": 1}
        ):
            refinish_entries[entry["original_order_id"]] = entry.get("fix_notes")
    
    # Apply refinish status to orders
    for order in orders:
        order["is_refinish"] = order["id"] in refinish_entries
        order["refinish_notes"] = refinish_entries.get(order["id"])
    
    return orders

@api_router.get("/rush-queue/stats")
async def get_rush_queue_stats(user: dict = Depends(get_current_user)):
    """Get RUSH queue statistics"""
    total = await db.orders.count_documents({"is_rush": True, "current_department": {"$ne": "completed"}})
    
    # Count by department
    pipeline = [
        {"$match": {"is_rush": True, "current_department": {"$ne": "completed"}}},
        {"$group": {"_id": "$current_department", "count": {"$sum": 1}}}
    ]
    dept_counts = await db.orders.aggregate(pipeline).to_list(100)
    by_department = {item["_id"]: item["count"] for item in dept_counts}
    
    # Count refinish overlap
    rush_ids = await db.orders.distinct("id", {"is_rush": True, "current_department": {"$ne": "completed"}})
    refinish_overlap = await db.refinish_queue.count_documents({"original_order_id": {"$in": rush_ids}})
    
    return {
        "total": total,
        "by_department": by_department,
        "refinish_overlap": refinish_overlap
    }

class RushMoveRequest(BaseModel):
    target_department: str

@api_router.put("/rush-queue/{order_id}/move-to")
async def move_rush_order_to_department(order_id: str, data: RushMoveRequest, user: dict = Depends(get_current_user)):
    """Move a RUSH order to any department (skip steps)
    This allows RUSH orders to bypass normal department flow for urgent processing.
    """
    # Validate target department
    valid_departments = ["received", "design", "program", "machine_waiting", "machine", 
                         "finishing", "powder_coat", "assemble", "showroom", "shipped", "completed"]
    if data.target_department not in valid_departments:
        raise HTTPException(status_code=400, detail=f"Invalid department: {data.target_department}")
    
    # Find the order
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Verify it's a RUSH order
    if not order.get("is_rush"):
        raise HTTPException(status_code=400, detail="Only RUSH orders can skip departments")
    
    current_dept = order.get("current_department")
    if current_dept == data.target_department:
        raise HTTPException(status_code=400, detail="Order is already in this department")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update department history - close current department
    dept_history = order.get("department_history", [])
    for entry in dept_history:
        if entry["department"] == current_dept and not entry.get("completed_at"):
            entry["completed_at"] = now
            break
    
    # Add new department entry
    dept_history.append({
        "department": data.target_department,
        "started_at": now,
        "completed_at": None
    })
    
    # Update the order
    update_data = {
        "current_department": data.target_department,
        "department_history": dept_history,
        "updated_at": now,
        "last_moved_by": user["id"],
        "last_moved_by_name": user.get("name", user.get("email")),
        "last_moved_at": now,
        "last_moved_from": current_dept,
        "last_moved_to": data.target_department
    }
    
    # If moving to completed, set final status
    if data.target_department == "completed":
        update_data["status"] = "completed"
        update_data["final_status"] = "completed"
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

# ============ RE-DO QUEUE ENDPOINTS ============
# Re-Do Queue is for orders that need to be fixed due to customer issues/complaints
# Similar to RUSH, Re-Do orders can be moved to any department

class RedoOrderRequest(BaseModel):
    is_redo: bool
    redo_reason: Optional[str] = None

@api_router.put("/orders/{order_id}/redo")
async def toggle_redo_order(order_id: str, data: RedoOrderRequest, user: dict = Depends(get_current_user)):
    """Mark/unmark an order as Re-Do - any user can mark orders as redo"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    now = datetime.now(timezone.utc).isoformat()
    update_data = {
        "is_redo": data.is_redo,
        "redo_reason": data.redo_reason if data.is_redo else None,
        "redo_set_by": user.get("name", user.get("email")) if data.is_redo else None,
        "redo_set_at": now if data.is_redo else None,
        "updated_at": now
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order

@api_router.get("/redo-queue")
async def get_redo_queue(user: dict = Depends(get_current_user)):
    """Get all Re-Do orders - visible to all users
    Re-Do orders are for fixing customer issues. RUSH orders override Re-Do in priority.
    """
    # Data projection: Only fetch fields needed for the list view (reduces payload size ~60%)
    list_view_projection = {
        "_id": 0,
        "id": 1,
        "order_number": 1,
        "customer_name": 1,
        "phone": 1,
        "product_type": 1,
        "current_department": 1,
        "status": 1,
        "order_date": 1,
        "quantity": 1,
        "vehicle_make": 1,
        "vehicle_model": 1,
        "rim_size": 1,
        "is_rush": 1,
        "is_redo": 1,
        "redo_reason": 1,
        "redo_set_at": 1,
        "cut_status": 1,
        "lalo_status": 1,
        "created_at": 1
    }
    
    # Get all redo orders (is_redo = True) that are NOT rush (rush overrides redo) and not completed
    orders = await db.orders.find(
        {"is_redo": True, "is_rush": {"$ne": True}, "current_department": {"$ne": "completed"}},
        list_view_projection
    ).sort("order_number", 1).to_list(1000)
    
    # Batch fetch refinish status for all orders at once (single query instead of N queries)
    order_ids = [order["id"] for order in orders]
    refinish_entries = {}
    if order_ids:
        async for entry in db.refinish_queue.find(
            {"original_order_id": {"$in": order_ids}},
            {"_id": 0, "original_order_id": 1, "fix_notes": 1}
        ):
            refinish_entries[entry["original_order_id"]] = entry.get("fix_notes")
    
    # Apply refinish status to orders
    for order in orders:
        order["is_refinish"] = order["id"] in refinish_entries
        order["refinish_notes"] = refinish_entries.get(order["id"])
    
    return orders

@api_router.get("/redo-queue/stats")
async def get_redo_queue_stats(user: dict = Depends(get_current_user)):
    """Get Re-Do queue statistics"""
    # Count non-rush redo orders (rush overrides redo)
    total = await db.orders.count_documents({
        "is_redo": True, 
        "is_rush": {"$ne": True}, 
        "current_department": {"$ne": "completed"}
    })
    
    # Count by department
    pipeline = [
        {"$match": {"is_redo": True, "is_rush": {"$ne": True}, "current_department": {"$ne": "completed"}}},
        {"$group": {"_id": "$current_department", "count": {"$sum": 1}}}
    ]
    dept_counts = await db.orders.aggregate(pipeline).to_list(100)
    by_department = {item["_id"]: item["count"] for item in dept_counts}
    
    # Count refinish overlap
    redo_ids = await db.orders.distinct("id", {
        "is_redo": True, 
        "is_rush": {"$ne": True}, 
        "current_department": {"$ne": "completed"}
    })
    refinish_overlap = await db.refinish_queue.count_documents({"original_order_id": {"$in": redo_ids}})
    
    return {
        "total": total,
        "by_department": by_department,
        "refinish_overlap": refinish_overlap
    }

class RedoMoveRequest(BaseModel):
    target_department: str

@api_router.put("/redo-queue/{order_id}/move-to")
async def move_redo_order_to_department(order_id: str, data: RedoMoveRequest, user: dict = Depends(get_current_user)):
    """Move a Re-Do order to any department (skip steps)
    This allows Re-Do orders to bypass normal department flow for fixing customer issues.
    """
    # Validate target department
    valid_departments = ["received", "design", "program", "machine_waiting", "machine", 
                         "finishing", "powder_coat", "assemble", "showroom", "shipped", "completed"]
    if data.target_department not in valid_departments:
        raise HTTPException(status_code=400, detail=f"Invalid department: {data.target_department}")
    
    # Find the order
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Verify it's a Re-Do order
    if not order.get("is_redo"):
        raise HTTPException(status_code=400, detail="Only Re-Do orders can use this endpoint")
    
    current_dept = order.get("current_department")
    if current_dept == data.target_department:
        raise HTTPException(status_code=400, detail="Order is already in this department")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update department history - close current department
    dept_history = order.get("department_history", [])
    for entry in dept_history:
        if entry["department"] == current_dept and not entry.get("completed_at"):
            entry["completed_at"] = now
            break
    
    # Add new department entry
    dept_history.append({
        "department": data.target_department,
        "started_at": now,
        "completed_at": None,
        "moved_by": user["id"],
        "moved_by_name": user.get("name", user.get("email"))
    })
    
    # Update the order
    update_data = {
        "current_department": data.target_department,
        "department_history": dept_history,
        "updated_at": now,
        "last_moved_by": user["id"],
        "last_moved_by_name": user.get("name", user.get("email")),
        "last_moved_at": now,
        "last_moved_from": current_dept,
        "last_moved_to": data.target_department
    }
    
    # If moving to completed, set final status and clear redo flag
    if data.target_department == "completed":
        update_data["status"] = "completed"
        update_data["final_status"] = "completed"
        update_data["is_redo"] = False  # Clear redo flag when completed
        update_data["redo_reason"] = None
        update_data["redo_set_by"] = None
        update_data["redo_set_at"] = None
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated_order
@api_router.get("/customers/search")
async def search_customers(q: str, user: dict = Depends(get_current_user)):
    """Search for unique customer names to get list of customers/dealers"""
    if not q or len(q) < 2:
        return []
    
    # Find unique customer names matching the query
    pipeline = [
        {"$match": {"customer_name": {"$regex": q, "$options": "i"}}},
        {"$group": {
            "_id": "$customer_name",
            "order_count": {"$sum": 1},
            "latest_order": {"$max": "$order_date"}
        }},
        {"$sort": {"order_count": -1}},
        {"$limit": 20}
    ]
    
    results = await db.orders.aggregate(pipeline).to_list(20)
    return [{"name": r["_id"], "order_count": r["order_count"], "latest_order": r["latest_order"]} for r in results]

@api_router.get("/customers/{customer_name}/orders")
async def get_customer_orders(customer_name: str, user: dict = Depends(get_current_user)):
    """Get all orders for a specific customer/dealer with department breakdown"""
    # URL decode the customer name
    from urllib.parse import unquote
    decoded_name = unquote(customer_name)
    
    # Find all orders for this customer (case insensitive exact match)
    # Sort by order_number ascending for consistent ordering
    orders = await db.orders.find(
        {"customer_name": {"$regex": f"^{decoded_name}$", "$options": "i"}},
        {"_id": 0}
    ).to_list(500)
    
    # Sort orders by order_number (try numeric sort, fallback to string)
    def order_sort_key(o):
        order_num = o.get("order_number", "")
        # Try to extract numeric part for sorting
        try:
            # Remove non-numeric prefixes/suffixes
            import re
            numeric_part = re.sub(r'[^0-9]', '', order_num)
            return (0, int(numeric_part) if numeric_part else 0, order_num)
        except:
            return (1, 0, order_num)  # Non-numeric orders sort after numeric
    
    orders.sort(key=order_sort_key)
    
    # Calculate days since order date for each order
    now = datetime.now(timezone.utc)
    for order in orders:
        order_date = parse_datetime(order.get("order_date"))
        if order_date:
            days_since = (now - order_date).days
            order["days_since_order"] = days_since
        else:
            order["days_since_order"] = None
    
    # Calculate department breakdown
    dept_counts = {}
    for order in orders:
        dept = order.get("current_department", "unknown")
        dept_counts[dept] = dept_counts.get(dept, 0) + 1
    
    # Calculate summary stats
    total_orders = len(orders)
    completed_orders = sum(1 for o in orders if o.get("current_department") == "completed")
    active_orders = total_orders - completed_orders
    rush_orders = sum(1 for o in orders if o.get("is_rush"))
    redo_orders = sum(1 for o in orders if o.get("is_redo"))
    
    # Product type breakdown
    product_counts = {}
    for order in orders:
        ptype = order.get("product_type", "unknown")
        product_counts[ptype] = product_counts.get(ptype, 0) + 1
    
    return {
        "customer_name": decoded_name,
        "total_orders": total_orders,
        "active_orders": active_orders,
        "completed_orders": completed_orders,
        "rush_orders": rush_orders,
        "redo_orders": redo_orders,
        "by_department": dept_counts,
        "by_product_type": product_counts,
        "orders": orders
    }

# ============ STOCK INVENTORY ENDPOINTS ============
@api_router.get("/stock-inventory")
async def get_stock_inventory(user: dict = Depends(get_current_user)):
    """Get all stock sets - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    stock_sets = await db.stock_inventory.find({}, {"_id": 0}).to_list(1000)
    return stock_sets

@api_router.post("/stock-inventory")
async def create_stock_set(data: StockSetCreate, user: dict = Depends(get_current_user)):
    """Create a new stock set - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    stock_set = {
        "id": str(uuid.uuid4()),
        "sku": data.sku,
        "name": data.name,
        "size": data.size,
        "bolt_pattern": data.bolt_pattern,
        "cf_caps": data.cf_caps or "",
        "finish": data.finish or "",
        "original_order_number": data.original_order_number or "",
        "fitment": data.fitment or "",
        "cubby_number": data.cubby_number or "",
        "notes": data.notes or "",
        "status": "available",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.get("name", user.get("email"))
    }
    
    await db.stock_inventory.insert_one(stock_set)
    stock_set.pop("_id", None)
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="stock_add",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
        description=f"Added rim stock: {data.name} (SKU: {data.sku}, Size: {data.size})",
        extra_data={
            "stock_type": "rim",
            "stock_id": stock_set["id"],
            "sku": data.sku,
            "name": data.name,
            "size": data.size
        }
    )
    
    return stock_set

@api_router.put("/stock-inventory/{stock_id}")
async def update_stock_set(stock_id: str, data: StockSetUpdate, user: dict = Depends(get_current_user)):
    """Update a stock set - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    # Get original stock for logging
    original_stock = await db.stock_inventory.find_one({"id": stock_id}, {"_id": 0})
    if not original_stock:
        raise HTTPException(status_code=404, detail="Stock set not found")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.stock_inventory.update_one(
        {"id": stock_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Stock set not found or no changes made")
    
    updated = await db.stock_inventory.find_one({"id": stock_id}, {"_id": 0})
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="stock_update",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
        description=f"Updated rim stock: {updated.get('name', 'Unknown')} (SKU: {updated.get('sku', 'N/A')})",
        extra_data={
            "stock_type": "rim",
            "stock_id": stock_id,
            "sku": updated.get("sku"),
            "name": updated.get("name"),
            "changes": list(update_data.keys())
        }
    )
    
    return updated

@api_router.delete("/stock-inventory/{stock_id}")
async def delete_stock_set(stock_id: str, user: dict = Depends(get_current_user)):
    """Delete a stock set - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    # Get stock info before deletion for logging
    stock = await db.stock_inventory.find_one({"id": stock_id}, {"_id": 0})
    if not stock:
        raise HTTPException(status_code=404, detail="Stock set not found")
    
    result = await db.stock_inventory.delete_one({"id": stock_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Stock set not found")
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="stock_delete",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
        description=f"Deleted rim stock: {stock.get('name', 'Unknown')} (SKU: {stock.get('sku', 'N/A')})",
        extra_data={
            "stock_type": "rim",
            "stock_id": stock_id,
            "sku": stock.get("sku"),
            "name": stock.get("name")
        }
    )
    
    return {"success": True, "message": "Stock set deleted"}

@api_router.post("/stock-inventory/{stock_id}/create-order")
async def create_order_from_stock(stock_id: str, data: CreateOrderFromStockRequest, user: dict = Depends(get_current_user)):
    """Create a new order from a stock set and mark it as sold - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    # Get the stock set
    stock_set = await db.stock_inventory.find_one({"id": stock_id}, {"_id": 0})
    if not stock_set:
        raise HTTPException(status_code=404, detail="Stock set not found")
    
    if stock_set.get("status") == "sold":
        raise HTTPException(status_code=400, detail="Stock set already sold")
    
    # Generate a new order number
    last_order = await db.orders.find_one(
        {"order_number": {"$regex": "^[0-9]+$"}},
        sort=[("order_number", -1)]
    )
    if last_order:
        try:
            next_num = int(last_order["order_number"]) + 1
        except:
            next_num = 9000
    else:
        next_num = 9000
    
    new_order_number = str(next_num)
    
    # Create the order
    now = datetime.now(timezone.utc).isoformat()
    new_order = {
        "id": str(uuid.uuid4()),
        "order_number": new_order_number,
        "customer_name": data.customer_name,
        "phone": data.phone,
        "product_type": "rim",
        "wheel_specs": f"{stock_set.get('name', '')} - {stock_set.get('size', '')} - {stock_set.get('bolt_pattern', '')}",
        "notes": f"From Stock: SKU {stock_set.get('sku', '')}. {data.notes or ''}".strip(),
        "order_date": now,
        "current_department": "received",
        "status": "active",
        "final_status": None,
        "department_history": [{
            "department": "received",
            "entered_at": now,
            "user": user.get("name", user.get("email"))
        }],
        "attachment_url": None,
        "attachment_name": None,
        "attachments": [],
        "order_notes": [],
        "quantity": 1,
        "linked_order_id": None,
        "vehicle_make": stock_set.get("fitment", "").split()[0] if stock_set.get("fitment") else "",
        "vehicle_model": "",
        "rim_size": stock_set.get("size", "").replace('"', ''),
        "cut_status": "waiting",
        "steering_wheel_brand": "",
        "has_tires": False,
        "has_custom_caps": bool(stock_set.get("cf_caps")),
        "has_race_car_caps": False,
        "has_steering_wheel": False,
        "lalo_status": "not_sent",
        "rim_size_front": "",
        "rim_size_rear": "",
        # Track who created this order
        "created_by_user_id": user["id"],
        "created_by_user_name": user.get("name", user.get("email", "Unknown")),
        "created_at": now,
        "updated_at": now,
        "from_stock_id": stock_id,
        "from_stock_sku": stock_set.get("sku", "")
    }
    
    await db.orders.insert_one(new_order)
    
    # Mark stock set as sold
    await db.stock_inventory.update_one(
        {"id": stock_id},
        {"$set": {
            "status": "sold",
            "sold_at": now,
            "sold_to_order_number": new_order_number,
            "sold_by": user.get("name", user.get("email")),
            "updated_at": now
        }}
    )
    
    # Clean up the response
    new_order.pop("_id", None)
    
    return {
        "success": True,
        "order": new_order,
        "message": f"Order #{new_order_number} created from stock"
    }

class MarkStockSoldRequest(BaseModel):
    sold_to_order_number: str

@api_router.put("/stock-inventory/{stock_id}/mark-sold")
async def mark_stock_rim_as_sold(stock_id: str, data: MarkStockSoldRequest, user: dict = Depends(get_current_user)):
    """Mark a stock rim as sold when order is created from new order form - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    # Get the stock set
    stock_set = await db.stock_inventory.find_one({"id": stock_id}, {"_id": 0})
    if not stock_set:
        raise HTTPException(status_code=404, detail="Stock set not found")
    
    if stock_set.get("status") == "sold":
        raise HTTPException(status_code=400, detail="Stock set already sold")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Mark stock set as sold
    await db.stock_inventory.update_one(
        {"id": stock_id},
        {"$set": {
            "status": "sold",
            "sold_at": now,
            "sold_to_order_number": data.sold_to_order_number,
            "sold_by": user.get("name", user.get("email")),
            "updated_at": now
        }}
    )
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="stock_sold",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
        description=f"Sold rim stock: {stock_set.get('name', 'Unknown')} (SKU: {stock_set.get('sku', 'N/A')}) to Order #{data.sold_to_order_number}",
        order_number=data.sold_to_order_number,
        extra_data={
            "stock_type": "rim",
            "stock_id": stock_id,
            "sku": stock_set.get("sku"),
            "name": stock_set.get("name"),
            "sold_to_order": data.sold_to_order_number
        }
    )
    
    return {"success": True, "message": f"Stock item marked as sold to order #{data.sold_to_order_number}"}

@api_router.post("/stock-inventory/bulk-import")
async def bulk_import_stock(stock_sets: List[StockSetCreate], user: dict = Depends(get_current_user)):
    """Bulk import stock sets - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    now = datetime.now(timezone.utc).isoformat()
    created_by = user.get("name", user.get("email"))
    
    documents = []
    for data in stock_sets:
        doc = {
            "id": str(uuid.uuid4()),
            "sku": data.sku,
            "name": data.name,
            "size": data.size,
            "bolt_pattern": data.bolt_pattern,
            "cf_caps": data.cf_caps or "",
            "finish": data.finish or "",
            "original_order_number": data.original_order_number or "",
            "fitment": data.fitment or "",
            "cubby_number": data.cubby_number or "",
            "notes": data.notes or "",
            "status": "available",
            "created_at": now,
            "updated_at": now,
            "created_by": created_by
        }
        documents.append(doc)
    
    if documents:
        await db.stock_inventory.insert_many(documents)
        
        # Log the activity for real-time tracking
        await log_activity(
            action_type="stock_bulk_import",
            user_id=user.get("id"),
            user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
            description=f"Bulk imported {len(documents)} rim stock items",
            extra_data={
                "stock_type": "rim",
                "imported_count": len(documents),
                "skus": [d["sku"] for d in documents[:10]]  # First 10 SKUs
            }
        )
    
    return {"success": True, "imported_count": len(documents)}


# ============ STOCK STEERING WHEELS ENDPOINTS ============
class StockSteeringWheelCreate(BaseModel):
    sku: str
    brand: str
    model: Optional[str] = ""
    finish: Optional[str] = ""
    original_order_number: Optional[str] = ""
    cubby_number: Optional[str] = ""
    notes: Optional[str] = ""

class StockSteeringWheelUpdate(BaseModel):
    sku: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    finish: Optional[str] = None
    original_order_number: Optional[str] = None
    cubby_number: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # "available", "reserved", "sold"

@api_router.get("/stock-steering-wheels")
async def get_stock_steering_wheels(user: dict = Depends(get_current_user)):
    """Get all stock steering wheels - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    wheels = await db.stock_steering_wheels.find({}, {"_id": 0}).to_list(1000)
    return wheels

@api_router.get("/stock-steering-wheels/next-sku")
async def get_next_steering_wheel_sku(user: dict = Depends(get_current_user)):
    """Generate the next available SKU for steering wheels - Format: SW-001, SW-002, etc."""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    # Find all existing SKUs that match the SW-XXX pattern
    wheels = await db.stock_steering_wheels.find({}, {"sku": 1, "_id": 0}).to_list(1000)
    
    # Extract numbers from SKUs like "SW-001", "SW-002", etc.
    max_num = 0
    import re
    for wheel in wheels:
        sku = wheel.get("sku", "")
        # Match patterns like SW-001, SW-1, TEST-SW-001, etc.
        match = re.search(r'SW-?(\d+)', sku, re.IGNORECASE)
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    
    # Generate next SKU
    next_num = max_num + 1
    next_sku = f"SW-{next_num:03d}"
    
    return {"next_sku": next_sku, "next_number": next_num}

@api_router.post("/stock-steering-wheels")
async def create_stock_steering_wheel(data: StockSteeringWheelCreate, user: dict = Depends(get_current_user)):
    """Create a new stock steering wheel - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    wheel = {
        "id": str(uuid.uuid4()),
        "sku": data.sku,
        "brand": data.brand,
        "model": data.model or "",
        "finish": data.finish or "",
        "original_order_number": data.original_order_number or "",
        "cubby_number": data.cubby_number or "",
        "notes": data.notes or "",
        "status": "available",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.get("name", user.get("email"))
    }
    
    await db.stock_steering_wheels.insert_one(wheel)
    wheel.pop("_id", None)
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="stock_add",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
        description=f"Added steering wheel stock: {data.brand} {data.model or ''} (SKU: {data.sku})".strip(),
        extra_data={
            "stock_type": "steering_wheel",
            "stock_id": wheel["id"],
            "sku": data.sku,
            "brand": data.brand,
            "model": data.model or ""
        }
    )
    
    return wheel

@api_router.put("/stock-steering-wheels/{wheel_id}")
async def update_stock_steering_wheel(wheel_id: str, data: StockSteeringWheelUpdate, user: dict = Depends(get_current_user)):
    """Update a stock steering wheel - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    # Get original wheel for logging
    original_wheel = await db.stock_steering_wheels.find_one({"id": wheel_id}, {"_id": 0})
    if not original_wheel:
        raise HTTPException(status_code=404, detail="Steering wheel not found")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.stock_steering_wheels.update_one(
        {"id": wheel_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Steering wheel not found or no changes made")
    
    updated = await db.stock_steering_wheels.find_one({"id": wheel_id}, {"_id": 0})
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="stock_update",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
        description=f"Updated steering wheel stock: {updated.get('brand', 'Unknown')} {updated.get('model', '')} (SKU: {updated.get('sku', 'N/A')})".strip(),
        extra_data={
            "stock_type": "steering_wheel",
            "stock_id": wheel_id,
            "sku": updated.get("sku"),
            "brand": updated.get("brand"),
            "model": updated.get("model"),
            "changes": list(update_data.keys())
        }
    )
    
    return updated

@api_router.delete("/stock-steering-wheels/{wheel_id}")
async def delete_stock_steering_wheel(wheel_id: str, user: dict = Depends(get_current_user)):
    """Delete a stock steering wheel - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    # Get wheel info before deletion for logging
    wheel = await db.stock_steering_wheels.find_one({"id": wheel_id}, {"_id": 0})
    if not wheel:
        raise HTTPException(status_code=404, detail="Steering wheel not found")
    
    result = await db.stock_steering_wheels.delete_one({"id": wheel_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Steering wheel not found")
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="stock_delete",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
        description=f"Deleted steering wheel stock: {wheel.get('brand', 'Unknown')} {wheel.get('model', '')} (SKU: {wheel.get('sku', 'N/A')})".strip(),
        extra_data={
            "stock_type": "steering_wheel",
            "stock_id": wheel_id,
            "sku": wheel.get("sku"),
            "brand": wheel.get("brand"),
            "model": wheel.get("model")
        }
    )
    
    return {"success": True, "message": "Steering wheel deleted"}

@api_router.post("/stock-steering-wheels/{wheel_id}/create-order")
async def create_order_from_steering_wheel(wheel_id: str, data: CreateOrderFromStockRequest, user: dict = Depends(get_current_user)):
    """Create a new order from a stock steering wheel and mark it as sold - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    # Get the steering wheel
    wheel = await db.stock_steering_wheels.find_one({"id": wheel_id}, {"_id": 0})
    if not wheel:
        raise HTTPException(status_code=404, detail="Steering wheel not found")
    
    if wheel.get("status") == "sold":
        raise HTTPException(status_code=400, detail="Steering wheel already sold")
    
    # Generate a new order number
    last_order = await db.orders.find_one(
        {"order_number": {"$regex": "^[0-9]+$"}},
        sort=[("order_number", -1)]
    )
    if last_order:
        try:
            next_num = int(last_order["order_number"]) + 1
        except Exception:
            next_num = 9000
    else:
        next_num = 9000
    
    new_order_number = str(next_num)
    
    # Create the order
    now = datetime.now(timezone.utc).isoformat()
    new_order = {
        "id": str(uuid.uuid4()),
        "order_number": new_order_number,
        "customer_name": data.customer_name,
        "phone": data.phone,
        "product_type": "steering_wheel",
        "wheel_specs": f"{wheel.get('brand', '')} {wheel.get('model', '')} - {wheel.get('finish', '')}".strip(),
        "notes": f"From Stock: SKU {wheel.get('sku', '')}. {data.notes or ''}".strip(),
        "order_date": now,
        "current_department": "received",
        "status": "active",
        "final_status": None,
        "department_history": [{
            "department": "received",
            "entered_at": now,
            "user": user.get("name", user.get("email"))
        }],
        "attachment_url": None,
        "attachment_name": None,
        "attachments": [],
        "order_notes": [],
        "quantity": 1,
        "linked_order_id": None,
        "vehicle_make": "",
        "vehicle_model": "",
        "rim_size": "",
        "cut_status": "waiting",
        "steering_wheel_brand": wheel.get("brand", ""),
        "has_tires": False,
        "has_custom_caps": False,
        "has_race_car_caps": False,
        "has_steering_wheel": False,
        "lalo_status": "not_sent",
        "rim_size_front": "",
        "rim_size_rear": "",
        # Track who created this order
        "created_by_user_id": user["id"],
        "created_by_user_name": user.get("name", user.get("email", "Unknown")),
        "created_at": now,
        "updated_at": now,
        "from_stock_wheel_id": wheel_id,
        "from_stock_wheel_sku": wheel.get("sku", "")
    }
    
    await db.orders.insert_one(new_order)
    
    # Mark steering wheel as sold
    await db.stock_steering_wheels.update_one(
        {"id": wheel_id},
        {"$set": {
            "status": "sold",
            "sold_at": now,
            "sold_to_order_number": new_order_number,
            "sold_by": user.get("name", user.get("email")),
            "updated_at": now
        }}
    )
    
    # Clean up the response
    new_order.pop("_id", None)
    
    return {
        "success": True,
        "order": new_order,
        "message": f"Order #{new_order_number} created from stock steering wheel"
    }

@api_router.put("/stock-steering-wheels/{wheel_id}/mark-sold")
async def mark_stock_wheel_as_sold(wheel_id: str, data: MarkStockSoldRequest, user: dict = Depends(get_current_user)):
    """Mark a stock steering wheel as sold when order is created from new order form - Sales/Admin only"""
    if not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Sales or Admin access required")
    
    # Get the steering wheel
    wheel = await db.stock_steering_wheels.find_one({"id": wheel_id}, {"_id": 0})
    if not wheel:
        raise HTTPException(status_code=404, detail="Steering wheel not found")
    
    if wheel.get("status") == "sold":
        raise HTTPException(status_code=400, detail="Steering wheel already sold")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Mark steering wheel as sold
    await db.stock_steering_wheels.update_one(
        {"id": wheel_id},
        {"$set": {
            "status": "sold",
            "sold_at": now,
            "sold_to_order_number": data.sold_to_order_number,
            "sold_by": user.get("name", user.get("email")),
            "updated_at": now
        }}
    )
    
    # Log the activity for real-time tracking
    await log_activity(
        action_type="stock_sold",
        user_id=user.get("id"),
        user_name=user.get("name") or user.get("username") or user.get("email", "Unknown"),
        description=f"Sold steering wheel stock: {wheel.get('brand', 'Unknown')} {wheel.get('model', '')} (SKU: {wheel.get('sku', 'N/A')}) to Order #{data.sold_to_order_number}".strip(),
        order_number=data.sold_to_order_number,
        extra_data={
            "stock_type": "steering_wheel",
            "stock_id": wheel_id,
            "sku": wheel.get("sku"),
            "brand": wheel.get("brand"),
            "model": wheel.get("model"),
            "sold_to_order": data.sold_to_order_number
        }
    )
    
    return {"success": True, "message": f"Steering wheel marked as sold to order #{data.sold_to_order_number}"}


# ==================== PERFORMANCE TRACKING ====================

def calculate_grade(score: float) -> str:
    """Calculate letter grade based on performance score (0-100)"""
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    else:
        return "F"

def parse_datetime(dt_str):
    """Parse datetime string to datetime object"""
    if not dt_str:
        return None
    try:
        if isinstance(dt_str, datetime):
            return dt_str
        return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
    except:
        return None

@api_router.get("/performance/daily")
async def get_daily_performance(
    date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get daily performance report for all departments and users"""
    if user.get("role") != "admin" and not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Admin or Sales access required")
    
    # Parse date or use today
    if date:
        try:
            target_date = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
        except:
            target_date = datetime.now(timezone.utc)
    else:
        target_date = datetime.now(timezone.utc)
    
    # Start and end of the target day
    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    # Get all orders
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(10000)
    
    # Track department stats
    dept_stats = {}
    for dept in DEPARTMENTS:
        dept_stats[dept] = {
            "department": dept,
            "label": DEPARTMENT_LABELS.get(dept, dept),
            "orders_completed": 0,
            "orders_received": 0,
            "total_processing_time_minutes": 0,
            "rush_orders_completed": 0,
            "rush_orders_total": 0,
            "users": {}
        }
    
    # Track user stats
    user_stats = {}
    
    for order in all_orders:
        history = order.get("department_history", [])
        is_rush = order.get("is_rush", False)
        
        for entry in history:
            dept = entry.get("department")
            if dept not in dept_stats:
                continue
            
            started_at = parse_datetime(entry.get("started_at"))
            completed_at = parse_datetime(entry.get("completed_at"))
            
            # Check if started on target date
            if started_at and start_of_day <= started_at < end_of_day:
                dept_stats[dept]["orders_received"] += 1
            
            # Check if completed on target date
            if completed_at and start_of_day <= completed_at < end_of_day:
                dept_stats[dept]["orders_completed"] += 1
                
                if is_rush:
                    dept_stats[dept]["rush_orders_completed"] += 1
                
                # Calculate processing time
                if started_at:
                    processing_time = (completed_at - started_at).total_seconds() / 60
                    dept_stats[dept]["total_processing_time_minutes"] += processing_time
                
                # Track by user who moved it (from notes or department history)
                # We'll attribute to the department for now
                
            # Track rush orders in department
            if started_at and is_rush:
                if start_of_day <= started_at < end_of_day:
                    dept_stats[dept]["rush_orders_total"] += 1
    
    # Get user activity from order notes and department changes
    for order in all_orders:
        notes = order.get("order_notes", [])
        for note in notes:
            created_at = parse_datetime(note.get("created_at"))
            if created_at and start_of_day <= created_at < end_of_day:
                user_id = note.get("created_by")
                user_name = note.get("created_by_name", "Unknown")
                if user_id:
                    if user_id not in user_stats:
                        user_stats[user_id] = {
                            "user_id": user_id,
                            "name": user_name,
                            "orders_touched": set(),
                            "notes_added": 0,
                            "orders_advanced": 0
                        }
                    user_stats[user_id]["notes_added"] += 1
                    user_stats[user_id]["orders_touched"].add(order.get("id"))
    
    # Calculate department grades and averages
    dept_results = []
    for dept, stats in dept_stats.items():
        completed = stats["orders_completed"]
        received = stats["orders_received"]
        
        # Calculate average processing time
        avg_time = 0
        if completed > 0:
            avg_time = stats["total_processing_time_minutes"] / completed
        
        # Calculate score (composite of completion rate and volume)
        # Score = (orders_completed * 5) + (completion_rate * 50) - (avg_time_penalty)
        completion_rate = (completed / received * 100) if received > 0 else 100
        volume_score = min(completed * 5, 50)  # Max 50 points for volume
        rate_score = completion_rate * 0.4  # Max 40 points for completion rate
        time_penalty = min(avg_time / 60, 10)  # Penalty for long processing (max 10 points)
        
        score = volume_score + rate_score - time_penalty
        score = max(0, min(100, score))  # Clamp to 0-100
        
        grade = calculate_grade(score)
        
        dept_results.append({
            "department": dept,
            "label": DEPARTMENT_LABELS.get(dept, dept),
            "orders_completed": completed,
            "orders_received": received,
            "completion_rate": round(completion_rate, 1),
            "avg_processing_time_minutes": round(avg_time, 1),
            "avg_processing_time_hours": round(avg_time / 60, 2),
            "rush_orders_completed": stats["rush_orders_completed"],
            "rush_orders_total": stats["rush_orders_total"],
            "score": round(score, 1),
            "grade": grade
        })
    
    # Convert user stats
    user_results = []
    for user_id, stats in user_stats.items():
        user_results.append({
            "user_id": stats["user_id"],
            "name": stats["name"],
            "orders_touched": len(stats["orders_touched"]),
            "notes_added": stats["notes_added"],
            "orders_advanced": stats["orders_advanced"]
        })
    
    # Sort by orders touched
    user_results.sort(key=lambda x: x["orders_touched"], reverse=True)
    
    # Calculate totals
    total_completed = sum(d["orders_completed"] for d in dept_results)
    total_received = sum(d["orders_received"] for d in dept_results)
    
    return {
        "date": target_date.date().isoformat(),
        "summary": {
            "total_orders_completed": total_completed,
            "total_orders_received": total_received,
            "overall_completion_rate": round((total_completed / total_received * 100) if total_received > 0 else 100, 1)
        },
        "departments": dept_results,
        "users": user_results,
        "grade_scale": {
            "A": "90-100 (Excellent)",
            "B": "80-89 (Good)",
            "C": "70-79 (Average)",
            "D": "60-69 (Below Average)",
            "F": "0-59 (Needs Improvement)"
        }
    }

@api_router.get("/performance/range")
async def get_performance_range(
    start_date: str,
    end_date: str,
    user: dict = Depends(get_current_user)
):
    """Get performance report for a date range"""
    if user.get("role") != "admin" and not check_sales_or_admin(user):
        raise HTTPException(status_code=403, detail="Admin or Sales access required")
    
    try:
        start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
        end = datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc) + timedelta(days=1)
    except:
        raise HTTPException(status_code=400, detail="Invalid date format")
    
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(10000)
    
    # Track daily stats
    daily_stats = {}
    current = start
    while current < end:
        daily_stats[current.date().isoformat()] = {
            "date": current.date().isoformat(),
            "orders_completed": 0,
            "orders_received": 0
        }
        current += timedelta(days=1)
    
    # Track department totals
    dept_totals = {}
    for dept in DEPARTMENTS:
        dept_totals[dept] = {
            "department": dept,
            "label": DEPARTMENT_LABELS.get(dept, dept),
            "orders_completed": 0,
            "orders_received": 0,
            "total_processing_time": 0
        }
    
    # Track user totals
    user_totals = {}
    
    for order in all_orders:
        history = order.get("department_history", [])
        
        for entry in history:
            dept = entry.get("department")
            if dept not in dept_totals:
                continue
            
            started_at = parse_datetime(entry.get("started_at"))
            completed_at = parse_datetime(entry.get("completed_at"))
            
            if started_at and start <= started_at < end:
                dept_totals[dept]["orders_received"] += 1
                date_key = started_at.date().isoformat()
                if date_key in daily_stats:
                    daily_stats[date_key]["orders_received"] += 1
            
            if completed_at and start <= completed_at < end:
                dept_totals[dept]["orders_completed"] += 1
                date_key = completed_at.date().isoformat()
                if date_key in daily_stats:
                    daily_stats[date_key]["orders_completed"] += 1
                
                if started_at:
                    processing_time = (completed_at - started_at).total_seconds() / 60
                    dept_totals[dept]["total_processing_time"] += processing_time
        
        # Track user activity
        notes = order.get("order_notes", [])
        for note in notes:
            created_at = parse_datetime(note.get("created_at"))
            if created_at and start <= created_at < end:
                user_id = note.get("created_by")
                user_name = note.get("created_by_name", "Unknown")
                if user_id:
                    if user_id not in user_totals:
                        user_totals[user_id] = {
                            "user_id": user_id,
                            "name": user_name,
                            "orders_touched": set(),
                            "notes_added": 0
                        }
                    user_totals[user_id]["notes_added"] += 1
                    user_totals[user_id]["orders_touched"].add(order.get("id"))
    
    # Calculate department results with grades
    dept_results = []
    for dept, stats in dept_totals.items():
        completed = stats["orders_completed"]
        received = stats["orders_received"]
        
        avg_time = 0
        if completed > 0:
            avg_time = stats["total_processing_time"] / completed
        
        completion_rate = (completed / received * 100) if received > 0 else 100
        volume_score = min(completed * 2, 50)
        rate_score = completion_rate * 0.4
        time_penalty = min(avg_time / 60, 10)
        
        score = volume_score + rate_score - time_penalty
        score = max(0, min(100, score))
        
        dept_results.append({
            "department": dept,
            "label": DEPARTMENT_LABELS.get(dept, dept),
            "orders_completed": completed,
            "orders_received": received,
            "completion_rate": round(completion_rate, 1),
            "avg_processing_time_hours": round(avg_time / 60, 2),
            "score": round(score, 1),
            "grade": calculate_grade(score)
        })
    
    # Convert user stats
    user_results = []
    for user_id, stats in user_totals.items():
        user_results.append({
            "user_id": stats["user_id"],
            "name": stats["name"],
            "orders_touched": len(stats["orders_touched"]),
            "notes_added": stats["notes_added"]
        })
    user_results.sort(key=lambda x: x["orders_touched"], reverse=True)
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "daily_stats": list(daily_stats.values()),
        "departments": dept_results,
        "users": user_results
    }

# ==========================================
# REFINISH QUEUE - Orders returned for fixes
# ==========================================

REFINISH_STATUSES = {
    "received": "Received",
    "in_progress": "In Progress", 
    "completed": "Completed",
    "shipped_back": "Shipped Back"
}

class RefinishOrderCreate(BaseModel):
    order_id: str  # Original order ID
    fix_notes: str  # What needs to be fixed
    
class RefinishOrderUpdate(BaseModel):
    status: Optional[str] = None
    fix_notes: Optional[str] = None
    department: Optional[str] = None

# Model for creating NEW order directly in refinish queue
class RefinishNewOrderCreate(BaseModel):
    order_number: str
    customer_name: str
    phone: Optional[str] = ""
    product_type: str
    wheel_specs: Optional[str] = ""
    fix_notes: str  # What needs to be fixed
    quantity: Optional[int] = 1
    rim_size: Optional[str] = ""

@api_router.post("/refinish-queue/add")
async def add_to_refinish_queue(data: RefinishOrderCreate, user: dict = Depends(get_current_user)):
    """Mark an existing order for refinish/return"""
    # Find the original order
    order = await db.orders.find_one({"id": data.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check if already in refinish queue
    existing = await db.refinish_queue.find_one({"original_order_id": data.order_id, "status": {"$ne": "shipped_back"}})
    if existing:
        raise HTTPException(status_code=400, detail="Order is already in the refinish queue")
    
    now = datetime.now(timezone.utc).isoformat()
    
    refinish_entry = {
        "id": str(uuid.uuid4()),
        "original_order_id": order["id"],
        "order_number": order["order_number"],
        "customer_name": order["customer_name"],
        "phone": order.get("phone", ""),
        "product_type": order["product_type"],
        "fix_notes": data.fix_notes,
        "status": "received",
        "current_department": "received",
        "date_received": now,
        "added_by": user.get("name", user.get("email")),
        "added_by_id": user["id"],
        "status_history": [{
            "status": "received",
            "timestamp": now,
            "by": user.get("name", user.get("email"))
        }],
        "created_at": now,
        "updated_at": now
    }
    
    await db.refinish_queue.insert_one(refinish_entry)
    refinish_entry.pop("_id", None)
    
    # Add a note to the original order
    note = {
        "id": str(uuid.uuid4()),
        "text": f"📦 REFINISH: Order returned for fixes - {data.fix_notes}",
        "created_by": user["id"],
        "created_by_name": user.get("name", user.get("email")),
        "department": user.get("department", "admin"),
        "created_at": now
    }
    await db.orders.update_one(
        {"id": data.order_id},
        {"$push": {"order_notes": note}, "$set": {"updated_at": now}}
    )
    
    return refinish_entry

@api_router.post("/refinish-queue/create-new")
async def create_new_refinish_order(data: RefinishNewOrderCreate, user: dict = Depends(get_current_user)):
    """Create a brand new order directly in the refinish queue (for customer returns without existing order)"""
    # Validate product type
    if data.product_type not in PRODUCT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid product type")
    
    # Check for duplicate order number in refinish queue
    existing_refinish = await db.refinish_queue.find_one({
        "order_number": data.order_number,
        "status": {"$nin": ["shipped_back", "completed"]}  # Active refinish entries only
    })
    if existing_refinish:
        raise HTTPException(status_code=400, detail=f"Order number '{data.order_number}' already exists in the Refinish Queue")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # First create a new order in the orders collection
    order_id = str(uuid.uuid4())
    order = {
        "id": order_id,
        "order_number": data.order_number,
        "customer_name": data.customer_name,
        "phone": data.phone or "",
        "product_type": data.product_type,
        "wheel_specs": data.wheel_specs or "",
        "notes": f"REFINISH ORDER: {data.fix_notes}",
        "order_date": now,
        "current_department": "received",
        "status": "in_process",
        "final_status": None,
        "department_history": [
            {"department": "received", "started_at": now, "completed_at": None}
        ],
        "attachment_url": None,
        "attachment_name": None,
        "attachments": [],
        "order_notes": [{
            "id": str(uuid.uuid4()),
            "text": f"📦 REFINISH ORDER CREATED: {data.fix_notes}",
            "created_by": user["id"],
            "created_by_name": user.get("name", user.get("email")),
            "department": user.get("department", "admin"),
            "created_at": now
        }],
        "quantity": data.quantity or 1,
        "linked_order_id": None,
        "vehicle_make": "",
        "vehicle_model": "",
        "rim_size": data.rim_size or "",
        "rim_size_front": "",
        "rim_size_rear": "",
        "cut_status": "waiting",
        "steering_wheel_brand": "",
        "has_tires": False,
        "has_custom_caps": False,
        "has_race_car_caps": False,
        "has_steering_wheel": False,
        "lalo_status": "not_sent",
        "is_refinish": True,  # Flag to indicate this is a refinish order
        "created_at": now,
        "updated_at": now
    }
    
    await db.orders.insert_one(order)
    
    # Now create the refinish queue entry
    refinish_entry = {
        "id": str(uuid.uuid4()),
        "original_order_id": order_id,
        "order_number": data.order_number,
        "customer_name": data.customer_name,
        "phone": data.phone or "",
        "product_type": data.product_type,
        "fix_notes": data.fix_notes,
        "status": "received",
        "current_department": "received",
        "date_received": now,
        "added_by": user.get("name", user.get("email")),
        "added_by_id": user["id"],
        "status_history": [{
            "status": "received",
            "timestamp": now,
            "by": user.get("name", user.get("email"))
        }],
        "created_at": now,
        "updated_at": now
    }
    
    await db.refinish_queue.insert_one(refinish_entry)
    refinish_entry.pop("_id", None)
    
    return {
        "order": {k: v for k, v in order.items() if k != "_id"},
        "refinish_entry": refinish_entry
    }

@api_router.get("/refinish-queue")
async def get_refinish_queue(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get all orders in refinish queue"""
    query = {}
    if status and status != "all":
        query["status"] = status
    
    entries = await db.refinish_queue.find(query, {"_id": 0}).sort("date_received", -1).to_list(1000)
    return entries

@api_router.put("/refinish-queue/{refinish_id}")
async def update_refinish_entry(refinish_id: str, data: RefinishOrderUpdate, user: dict = Depends(get_current_user)):
    """Update a refinish queue entry (status, notes, department)"""
    entry = await db.refinish_queue.find_one({"id": refinish_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Refinish entry not found")
    
    now = datetime.now(timezone.utc).isoformat()
    updates = {"updated_at": now}
    
    if data.status and data.status in REFINISH_STATUSES:
        updates["status"] = data.status
        # Add to status history
        history_entry = {
            "status": data.status,
            "timestamp": now,
            "by": user.get("name", user.get("email"))
        }
        await db.refinish_queue.update_one(
            {"id": refinish_id},
            {"$push": {"status_history": history_entry}}
        )
    
    if data.fix_notes is not None:
        updates["fix_notes"] = data.fix_notes
    
    if data.department:
        updates["current_department"] = data.department
    
    await db.refinish_queue.update_one({"id": refinish_id}, {"$set": updates})
    
    updated = await db.refinish_queue.find_one({"id": refinish_id}, {"_id": 0})
    return updated

@api_router.delete("/refinish-queue/{refinish_id}")
async def delete_refinish_entry(refinish_id: str, user: dict = Depends(get_current_user)):
    """Remove an entry from refinish queue (admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.refinish_queue.delete_one({"id": refinish_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Refinish entry not found")
    
    return {"message": "Refinish entry removed"}

@api_router.get("/refinish-queue/stats")
async def get_refinish_stats(user: dict = Depends(get_current_user)):
    """Get statistics for refinish queue"""
    all_entries = await db.refinish_queue.find({}, {"_id": 0}).to_list(1000)
    
    stats = {
        "total": len(all_entries),
        "by_status": {status: 0 for status in REFINISH_STATUSES.keys()},
        "by_product_type": {}
    }
    
    for entry in all_entries:
        status = entry.get("status", "received")
        if status in stats["by_status"]:
            stats["by_status"][status] += 1
        
        product_type = entry.get("product_type", "unknown")
        if product_type not in stats["by_product_type"]:
            stats["by_product_type"][product_type] = 0
        stats["by_product_type"][product_type] += 1
    
    return stats

@api_router.get("/performance/detailed")
async def get_detailed_performance(
    date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get detailed performance report showing exactly what each user did on a specific day.
    Shows: orders moved/advanced, orders touched, notes added, product types, departments.
    """
    if user.get("role") not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Parse date or use today
    if date:
        try:
            target_date = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
        except:
            target_date = datetime.now(timezone.utc)
    else:
        target_date = datetime.now(timezone.utc)
    
    # Start and end of the target day
    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    # Get all orders
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(10000)
    
    # Get all users for name lookup
    all_users = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(1000)
    user_map = {u["id"]: u for u in all_users}
    
    # Track detailed user activity
    user_activity = {}
    
    def get_or_create_user_activity(uid, uname=None):
        if uid not in user_activity:
            user_info = user_map.get(uid, {})
            user_activity[uid] = {
                "user_id": uid,
                "name": uname or user_info.get("name", "Unknown"),
                "departments": user_info.get("departments", []),
                "orders_moved": [],  # Orders they advanced/moved
                "orders_touched": [],  # Orders they added notes to
                "total_orders_moved": 0,
                "total_notes_added": 0,
                "by_product_type": {"rim": 0, "steering_wheel": 0, "caps": 0, "other": 0},
                "by_department": {}
            }
        return user_activity[uid]
    
    # Process each order
    for order in all_orders:
        order_id = order.get("id")
        order_number = order.get("order_number")
        product_type = order.get("product_type", "other")
        customer_name = order.get("customer_name", "Unknown")
        
        # Categorize product type
        if product_type in ["steering_wheel"]:
            product_category = "steering_wheel"
        elif "caps" in product_type:
            product_category = "caps"
        elif product_type == "rim":
            product_category = "rim"
        else:
            product_category = "other"
        
        # Track orders moved (from department_history)
        history = order.get("department_history", [])
        for entry in history:
            completed_at = parse_datetime(entry.get("completed_at"))
            moved_by = entry.get("moved_by")
            moved_by_name = entry.get("moved_by_name")
            dept = entry.get("department")
            
            if completed_at and start_of_day <= completed_at < end_of_day and moved_by:
                user_data = get_or_create_user_activity(moved_by, moved_by_name)
                user_data["orders_moved"].append({
                    "order_id": order_id,
                    "order_number": order_number,
                    "customer_name": customer_name,
                    "product_type": product_type,
                    "product_category": product_category,
                    "department": dept,
                    "action": "moved",
                    "timestamp": completed_at.isoformat()
                })
                user_data["total_orders_moved"] += 1
                user_data["by_product_type"][product_category] += 1
                if dept not in user_data["by_department"]:
                    user_data["by_department"][dept] = 0
                user_data["by_department"][dept] += 1
        
        # Also check last_moved_by for direct moves
        last_moved_at = parse_datetime(order.get("last_moved_at"))
        last_moved_by = order.get("last_moved_by")
        last_moved_by_name = order.get("last_moved_by_name")
        last_moved_from = order.get("last_moved_from")
        last_moved_to = order.get("last_moved_to")
        
        if last_moved_at and start_of_day <= last_moved_at < end_of_day and last_moved_by:
            # Check if this move was already captured in history
            already_captured = False
            user_data = get_or_create_user_activity(last_moved_by, last_moved_by_name)
            for moved_order in user_data["orders_moved"]:
                if moved_order["order_id"] == order_id and moved_order["department"] == last_moved_from:
                    already_captured = True
                    break
            
            if not already_captured:
                user_data["orders_moved"].append({
                    "order_id": order_id,
                    "order_number": order_number,
                    "customer_name": customer_name,
                    "product_type": product_type,
                    "product_category": product_category,
                    "department": last_moved_from,
                    "moved_to": last_moved_to,
                    "action": "moved",
                    "timestamp": last_moved_at.isoformat()
                })
                user_data["total_orders_moved"] += 1
                user_data["by_product_type"][product_category] += 1
                dept = last_moved_from or last_moved_to
                if dept:
                    if dept not in user_data["by_department"]:
                        user_data["by_department"][dept] = 0
                    user_data["by_department"][dept] += 1
        
        # Track notes added
        notes = order.get("order_notes", [])
        for note in notes:
            created_at = parse_datetime(note.get("created_at"))
            created_by = note.get("created_by")
            created_by_name = note.get("created_by_name")
            
            if created_at and start_of_day <= created_at < end_of_day and created_by:
                user_data = get_or_create_user_activity(created_by, created_by_name)
                user_data["orders_touched"].append({
                    "order_id": order_id,
                    "order_number": order_number,
                    "customer_name": customer_name,
                    "product_type": product_type,
                    "action": "note_added",
                    "note_preview": note.get("text", "")[:100],
                    "timestamp": created_at.isoformat()
                })
                user_data["total_notes_added"] += 1
    
    # Convert to list and sort by activity
    user_results = list(user_activity.values())
    user_results.sort(key=lambda x: x["total_orders_moved"] + x["total_notes_added"], reverse=True)
    
    # Calculate totals
    total_orders_moved = sum(u["total_orders_moved"] for u in user_results)
    total_notes_added = sum(u["total_notes_added"] for u in user_results)
    
    return {
        "date": target_date.date().isoformat(),
        "date_formatted": target_date.strftime("%A, %B %d, %Y"),
        "summary": {
            "total_users_active": len([u for u in user_results if u["total_orders_moved"] > 0 or u["total_notes_added"] > 0]),
            "total_orders_moved": total_orders_moved,
            "total_notes_added": total_notes_added
        },
        "users": user_results
    }

@api_router.get("/performance/user/{user_id}")
async def get_user_performance(
    user_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get detailed performance for a specific user"""
    if user.get("role") != "admin" and user.get("id") != user_id:
        raise HTTPException(status_code=403, detail="Can only view your own performance or admin access required")
    
    # Get target user info
    target_user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Parse dates
    if start_date:
        start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    else:
        start = datetime.now(timezone.utc) - timedelta(days=30)
    
    if end_date:
        end = datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc) + timedelta(days=1)
    else:
        end = datetime.now(timezone.utc) + timedelta(days=1)
    
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(10000)
    
    orders_touched = set()
    notes_added = 0
    daily_activity = {}
    
    for order in all_orders:
        notes = order.get("order_notes", [])
        for note in notes:
            if note.get("created_by") == user_id:
                created_at = parse_datetime(note.get("created_at"))
                if created_at and start <= created_at < end:
                    orders_touched.add(order.get("id"))
                    notes_added += 1
                    date_key = created_at.date().isoformat()
                    if date_key not in daily_activity:
                        daily_activity[date_key] = {"date": date_key, "orders": 0, "notes": 0}
                    daily_activity[date_key]["orders"] += 1
                    daily_activity[date_key]["notes"] += 1
    
    return {
        "user": {
            "id": target_user.get("id"),
            "name": target_user.get("name"),
            "departments": target_user.get("departments", [target_user.get("department")])
        },
        "period": {
            "start": start.date().isoformat(),
            "end": (end - timedelta(days=1)).date().isoformat()
        },
        "totals": {
            "orders_touched": len(orders_touched),
            "notes_added": notes_added
        },
        "daily_activity": sorted(daily_activity.values(), key=lambda x: x["date"], reverse=True)
    }

# ============= USER TARGETS & DAILY REPORTS SYSTEM =============
# Set daily targets for users and generate graded daily reports

class UserTargetCreate(BaseModel):
    user_id: str
    daily_target: int = Field(ge=1, le=100, description="Daily orders target")

class UserTargetUpdate(BaseModel):
    daily_target: int = Field(ge=1, le=100, description="Daily orders target")

class DefaultTargetUpdate(BaseModel):
    default_target: int = Field(ge=1, le=100, description="Default daily target for new users")

def calculate_user_grade(orders_completed: int, target: int) -> dict:
    """Calculate letter grade based on orders completed vs target"""
    if target <= 0:
        percentage = 100 if orders_completed > 0 else 0
    else:
        percentage = (orders_completed / target) * 100
    
    if percentage >= 100:
        grade = "A"
        description = "Exceeded target"
    elif percentage >= 80:
        grade = "B"
        description = "Met most of target"
    elif percentage >= 60:
        grade = "C"
        description = "Partial completion"
    elif percentage >= 40:
        grade = "D"
        description = "Below expectations"
    else:
        grade = "F"
        description = "Needs improvement"
    
    return {
        "grade": grade,
        "percentage": round(percentage, 1),
        "description": description
    }

@api_router.get("/user-targets")
async def get_user_targets(user: dict = Depends(get_current_user)):
    """Get all user targets (admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    targets = await db.user_targets.find({}, {"_id": 0}).to_list(1000)
    
    # Get default target
    settings = await db.settings.find_one({"key": "default_daily_target"}, {"_id": 0})
    default_target = settings.get("value", 5) if settings else 5
    
    return {
        "targets": targets,
        "default_target": default_target
    }

@api_router.post("/user-targets")
async def set_user_target(target_data: UserTargetCreate, user: dict = Depends(get_current_user)):
    """Set or update a user's daily target (admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Verify user exists
    target_user = await db.users.find_one({"id": target_data.user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Upsert the target
    await db.user_targets.update_one(
        {"user_id": target_data.user_id},
        {"$set": {
            "user_id": target_data.user_id,
            "user_name": target_user.get("name", "Unknown"),
            "daily_target": target_data.daily_target,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.get("id")
        }},
        upsert=True
    )
    
    return {"success": True, "message": f"Target set to {target_data.daily_target} orders/day"}

@api_router.put("/user-targets/{user_id}")
async def update_user_target(user_id: str, target_data: UserTargetUpdate, user: dict = Depends(get_current_user)):
    """Update a user's daily target (admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.user_targets.update_one(
        {"user_id": user_id},
        {"$set": {
            "daily_target": target_data.daily_target,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.get("id")
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Target not found for this user")
    
    return {"success": True, "message": f"Target updated to {target_data.daily_target} orders/day"}

@api_router.delete("/user-targets/{user_id}")
async def delete_user_target(user_id: str, user: dict = Depends(get_current_user)):
    """Delete a user's daily target (admin only) - they will use default"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.user_targets.delete_one({"user_id": user_id})
    return {"success": True, "message": "Target removed, user will use default"}

@api_router.put("/user-targets/default")
async def set_default_target(target_data: DefaultTargetUpdate, user: dict = Depends(get_current_user)):
    """Set the default daily target for users without individual targets (admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.settings.update_one(
        {"key": "default_daily_target"},
        {"$set": {
            "key": "default_daily_target",
            "value": target_data.default_target,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.get("id")
        }},
        upsert=True
    )
    
    return {"success": True, "message": f"Default target set to {target_data.default_target} orders/day"}

@api_router.get("/daily-reports")
async def get_daily_reports(
    date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get daily performance reports for all users with grades (admin only)
    Shows orders completed vs target and letter grade for each user.
    """
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Parse date or use today
    if date:
        try:
            target_date = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
        except:
            target_date = datetime.now(timezone.utc)
    else:
        target_date = datetime.now(timezone.utc)
    
    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    # Get default target
    settings = await db.settings.find_one({"key": "default_daily_target"}, {"_id": 0})
    default_target = settings.get("value", 5) if settings else 5
    
    # Get all user targets
    user_targets = await db.user_targets.find({}, {"_id": 0}).to_list(1000)
    target_map = {t["user_id"]: t["daily_target"] for t in user_targets}
    
    # Get all users
    all_users = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(1000)
    user_map = {u["id"]: u for u in all_users}
    
    # Get all orders to track activity
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(10000)
    
    # Track user activity
    user_activity = {}
    
    for order in all_orders:
        order_number = order.get("order_number")
        customer_name = order.get("customer_name", "Unknown")
        product_type = order.get("product_type", "other")
        
        # Track orders moved from department_history
        history = order.get("department_history", [])
        for entry in history:
            completed_at = parse_datetime(entry.get("completed_at"))
            moved_by = entry.get("moved_by")
            moved_by_name = entry.get("moved_by_name")
            from_dept = entry.get("department", "")
            to_dept = entry.get("moved_to", "")
            
            if completed_at and start_of_day <= completed_at < end_of_day and moved_by:
                if moved_by not in user_activity:
                    user_info = user_map.get(moved_by, {})
                    user_activity[moved_by] = {
                        "user_id": moved_by,
                        "name": moved_by_name or user_info.get("name", "Unknown"),
                        "orders_completed": 0,
                        "orders_list": []
                    }
                
                user_activity[moved_by]["orders_completed"] += 1
                user_activity[moved_by]["orders_list"].append({
                    "order_number": order_number,
                    "customer_name": customer_name,
                    "product_type": product_type,
                    "from_department": from_dept,
                    "to_department": to_dept,
                    "time": completed_at.strftime("%H:%M")
                })
    
    # Build reports with grades
    reports = []
    
    # Include all active users, not just those with activity
    for u in all_users:
        user_id = u["id"]
        # Skip inactive users (you could add an "active" field to filter)
        if u.get("role") == "admin":
            continue  # Don't include admins in daily reports
            
        activity = user_activity.get(user_id, {
            "user_id": user_id,
            "name": u.get("name", "Unknown"),
            "orders_completed": 0,
            "orders_list": []
        })
        
        target = target_map.get(user_id, default_target)
        grade_info = calculate_user_grade(activity["orders_completed"], target)
        
        reports.append({
            "user_id": user_id,
            "name": activity["name"],
            "departments": u.get("departments", []),
            "target": target,
            "orders_completed": activity["orders_completed"],
            "orders_list": activity.get("orders_list", []),
            "grade": grade_info["grade"],
            "percentage": grade_info["percentage"],
            "grade_description": grade_info["description"]
        })
    
    # Sort by orders completed descending
    reports.sort(key=lambda x: x["orders_completed"], reverse=True)
    
    # Calculate summary stats
    total_orders = sum(r["orders_completed"] for r in reports)
    users_with_activity = len([r for r in reports if r["orders_completed"] > 0])
    grade_distribution = {}
    for r in reports:
        grade_distribution[r["grade"]] = grade_distribution.get(r["grade"], 0) + 1
    
    return {
        "date": target_date.date().isoformat(),
        "date_formatted": target_date.strftime("%A, %B %d, %Y"),
        "default_target": default_target,
        "summary": {
            "total_users": len(reports),
            "users_with_activity": users_with_activity,
            "total_orders_completed": total_orders,
            "grade_distribution": grade_distribution
        },
        "grade_scale": {
            "A": "100%+ of target",
            "B": "80-99% of target",
            "C": "60-79% of target",
            "D": "40-59% of target",
            "F": "Below 40% of target"
        },
        "reports": reports
    }

# ============= ACTIVITY LOG SYSTEM =============
# Track and retrieve recent user activity for admin oversight

@api_router.get("/activity-log")
async def get_activity_log(
    user_id: Optional[str] = None,
    action_type: Optional[str] = None,  # move, note, login, status_change
    days: int = 7,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    """Get recent activity log showing what users have done.
    Admin and Admin Restricted - shows moves, notes, logins, status changes.
    """
    if user.get("role") not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Calculate date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)
    
    # Get all users for name lookup
    all_users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(1000)
    user_map = {u["id"]: u for u in all_users}
    
    activities = []
    
    # FIRST: Get activities from the activity_log collection (real-time logged activities)
    activity_query = {
        "timestamp": {
            "$gte": start_date.isoformat(),
            "$lte": end_date.isoformat()
        }
    }
    if user_id:
        activity_query["user_id"] = user_id
    if action_type:
        activity_query["action_type"] = action_type
    
    logged_activities = await db.activity_log.find(activity_query, {"_id": 0}).to_list(1000)
    for act in logged_activities:
        activity_entry = {
            "timestamp": act.get("timestamp"),
            "action_type": act.get("action_type"),
            "user_id": act.get("user_id"),
            "user_name": act.get("user_name") or user_map.get(act.get("user_id"), {}).get("name", "Unknown"),
            "description": act.get("description"),
            "order_id": act.get("order_id"),
            "order_number": act.get("order_number"),
            "customer_name": act.get("customer_name"),
            "product_type": act.get("product_type")
        }
        # Include extra fields for bulk cut status and cut status changes
        if act.get("action_type") in ["bulk_cut_status", "cut_status_change"]:
            activity_entry["order_numbers"] = act.get("order_numbers")
            activity_entry["order_ids"] = act.get("order_ids")
            activity_entry["order_count"] = act.get("order_count")
            activity_entry["cut_status"] = act.get("cut_status")
            activity_entry["old_cut_status"] = act.get("old_cut_status")
            activity_entry["new_cut_status"] = act.get("new_cut_status")
        activities.append(activity_entry)
    
    # Track which activities we already have from activity_log to avoid duplicates
    logged_activity_keys = set()
    for act in logged_activities:
        key = f"{act.get('action_type')}_{act.get('user_id')}_{act.get('timestamp')}_{act.get('order_id')}"
        logged_activity_keys.add(key)
    
    # ALSO: Get historical activities from order data (for backwards compatibility)
    # 1. Get order movements from department_history
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(10000)
    
    for order in all_orders:
        order_number = order.get("order_number")
        order_id = order.get("id")
        customer_name = order.get("customer_name", "Unknown")
        product_type = order.get("product_type", "unknown")
        
        # Track order moves from history
        history = order.get("department_history", [])
        for entry in history:
            completed_at = parse_datetime(entry.get("completed_at"))
            moved_by = entry.get("moved_by")
            moved_by_name = entry.get("moved_by_name")
            dept = entry.get("department")
            
            if completed_at and start_date <= completed_at <= end_date:
                if user_id and moved_by != user_id:
                    continue
                if action_type and action_type != "move":
                    continue
                    
                activities.append({
                    "timestamp": completed_at.isoformat(),
                    "action_type": "move",
                    "user_id": moved_by,
                    "user_name": moved_by_name or user_map.get(moved_by, {}).get("name", "Unknown"),
                    "description": f"Moved order #{order_number} out of {dept}",
                    "order_id": order_id,
                    "order_number": order_number,
                    "customer_name": customer_name,
                    "product_type": product_type,
                    "department": dept
                })
        
        # Track direct moves
        last_moved_at = parse_datetime(order.get("last_moved_at"))
        last_moved_by = order.get("last_moved_by")
        last_moved_by_name = order.get("last_moved_by_name")
        last_moved_from = order.get("last_moved_from")
        last_moved_to = order.get("last_moved_to")
        
        if last_moved_at and start_date <= last_moved_at <= end_date:
            if (not user_id or last_moved_by == user_id) and (not action_type or action_type == "move"):
                activities.append({
                    "timestamp": last_moved_at.isoformat(),
                    "action_type": "move",
                    "user_id": last_moved_by,
                    "user_name": last_moved_by_name or user_map.get(last_moved_by, {}).get("name", "Unknown"),
                    "description": f"Moved order #{order_number} from {last_moved_from} to {last_moved_to}",
                    "order_id": order_id,
                    "order_number": order_number,
                    "customer_name": customer_name,
                    "product_type": product_type,
                    "from_department": last_moved_from,
                    "to_department": last_moved_to
                })
        
        # Track notes added
        notes = order.get("order_notes", [])
        for note in notes:
            created_at = parse_datetime(note.get("created_at"))
            created_by = note.get("created_by")
            created_by_name = note.get("created_by_name")
            
            if created_at and start_date <= created_at <= end_date:
                if user_id and created_by != user_id:
                    continue
                if action_type and action_type != "note":
                    continue
                    
                activities.append({
                    "timestamp": created_at.isoformat(),
                    "action_type": "note",
                    "user_id": created_by,
                    "user_name": created_by_name or user_map.get(created_by, {}).get("name", "Unknown"),
                    "description": f"Added note to order #{order_number}",
                    "order_id": order_id,
                    "order_number": order_number,
                    "customer_name": customer_name,
                    "product_type": product_type,
                    "note_preview": note.get("text", "")[:100]
                })
        
        # Track status changes (rush, hold, cut)
        if order.get("rush_set_at"):
            rush_at = parse_datetime(order.get("rush_set_at"))
            if rush_at and start_date <= rush_at <= end_date:
                if (not user_id) and (not action_type or action_type == "status_change"):
                    activities.append({
                        "timestamp": rush_at.isoformat(),
                        "action_type": "status_change",
                        "user_id": None,
                        "user_name": order.get("rush_set_by", "Unknown"),
                        "description": f"Marked order #{order_number} as RUSH",
                        "order_id": order_id,
                        "order_number": order_number,
                        "customer_name": customer_name,
                        "product_type": product_type,
                        "status_type": "rush"
                    })
    
    # 2. Track logins from activity_log collection (full history)
    if not action_type or action_type == "login":
        # Build query for activity_log collection
        login_query = {
            "action_type": "login",
            "timestamp": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }
        if user_id:
            login_query["user_id"] = user_id
        
        login_activities = await db.activity_log.find(login_query, {"_id": 0}).to_list(1000)
        for login_act in login_activities:
            activities.append({
                "timestamp": login_act.get("timestamp"),
                "action_type": "login",
                "user_id": login_act.get("user_id"),
                "user_name": login_act.get("user_name") or user_map.get(login_act.get("user_id"), {}).get("name", "Unknown"),
                "description": login_act.get("description", "User logged in"),
                "order_id": None,
                "order_number": None
            })
        
        # Fallback: Also include last_login from users for backwards compatibility (users who logged in before tracking)
        for u in all_users:
            if user_id and u["id"] != user_id:
                continue
            last_login = parse_datetime(u.get("last_login"))
            if last_login and start_date <= last_login <= end_date:
                # Check if we already have this login in activity_log to avoid duplicates
                already_tracked = any(
                    act.get("user_id") == u["id"] and 
                    act.get("action_type") == "login" and 
                    act.get("timestamp") == last_login.isoformat()
                    for act in activities
                )
                if not already_tracked:
                    activities.append({
                        "timestamp": last_login.isoformat(),
                        "action_type": "login",
                        "user_id": u["id"],
                        "user_name": u.get("name", u.get("email", "Unknown")),
                        "description": f"{u.get('name', 'User')} logged in",
                        "order_id": None,
                        "order_number": None
                    })
    
    # Sort by timestamp descending (most recent first)
    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    
    # Apply limit
    activities = activities[:limit]
    
    # Group activities by user for summary
    user_summary = {}
    for act in activities:
        uid = act.get("user_id") or act.get("user_name")
        if uid not in user_summary:
            user_summary[uid] = {
                "user_id": act.get("user_id"),
                "user_name": act.get("user_name"),
                "total_actions": 0,
                "moves": 0,
                "notes": 0,
                "logins": 0,
                "status_changes": 0,
                "last_activity": act["timestamp"]
            }
        user_summary[uid]["total_actions"] += 1
        if act["action_type"] == "move":
            user_summary[uid]["moves"] += 1
        elif act["action_type"] == "note":
            user_summary[uid]["notes"] += 1
        elif act["action_type"] == "login":
            user_summary[uid]["logins"] += 1
        elif act["action_type"] == "status_change":
            user_summary[uid]["status_changes"] += 1
    
    return {
        "date_range": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "days": days
        },
        "total_activities": len(activities),
        "user_summary": sorted(user_summary.values(), key=lambda x: x["total_actions"], reverse=True),
        "activities": activities
    }

# ============= TRANSLATION SERVICE =============
# Translation models
class TranslateRequest(BaseModel):
    texts: List[str]
    target_language: str  # es, vi, ar, ku-sor, ku-kmr

class TranslateResponse(BaseModel):
    translations: List[str]
    source_language: str
    target_language: str

# In-memory cache for translations
translation_cache = {}

# ==========================================
# NOTIFICATIONS SYSTEM - User tagging & alerts
# ==========================================

import re

NOTIFICATION_TYPES = {
    "mention": "You were mentioned",
    "order_update": "Order updated",
    "system": "System notification",
    "admin_note": "Admin added a note"
}

class NotificationCreate(BaseModel):
    recipient_id: str
    type: str = "mention"
    title: str
    message: str
    order_id: Optional[str] = None
    order_number: Optional[str] = None

class NotificationResponse(BaseModel):
    id: str
    recipient_id: str
    sender_id: str
    sender_name: str
    type: str
    title: str
    message: str
    order_id: Optional[str] = None
    order_number: Optional[str] = None
    is_read: bool
    created_at: str

# Get list of users for @mention autocomplete
@api_router.get("/users/list")
async def get_users_list(user: dict = Depends(get_current_user)):
    """Get list of all users for @mention autocomplete"""
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "username": 1, "department": 1, "departments": 1, "role": 1}).to_list(500)
    return {"users": users}

# Get notifications for current user
@api_router.get("/notifications")
async def get_notifications(
    limit: int = 50,
    unread_only: bool = False,
    user: dict = Depends(get_current_user)
):
    """Get notifications for the current user. Admins can see all notifications."""
    query = {}
    
    # Admin/admin_restricted sees all, others see only their own
    if user["role"] not in ["admin", "admin_restricted"]:
        query["recipient_id"] = user["id"]
    
    if unread_only:
        query["is_read"] = False
    
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"notifications": notifications}

# Get unread notification count
@api_router.get("/notifications/unread-count")
async def get_unread_count(request: Request):
    """Get count of unread notifications - returns 0 if not authenticated"""
    try:
        # Try to get current user, but don't fail if not authenticated
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return {"count": 0}
        
        token = auth_header.split(" ")[1]
        payload = decode_token(token)
        if not payload:
            return {"count": 0}
        
        user_id = payload.get("id")
        user_role = payload.get("role")
        
        query = {"is_read": False}
        
        # Admin/admin_restricted sees all unread, others see only their own
        if user_role not in ["admin", "admin_restricted"]:
            query["recipient_id"] = user_id
        
        count = await db.notifications.count_documents(query)
        return {"count": count}
    except Exception:
        return {"count": 0}

# Mark notification as read
@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    """Mark a notification as read"""
    # Verify notification belongs to user or user is admin
    notification = await db.notifications.find_one({"id": notification_id})
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if user["role"] not in ["admin", "admin_restricted"] and notification["recipient_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Notification marked as read"}

# Mark all notifications as read
@api_router.put("/notifications/mark-all-read")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    """Mark all notifications as read for current user"""
    query = {"is_read": False}
    if user["role"] not in ["admin", "admin_restricted"]:
        query["recipient_id"] = user["id"]
    
    result = await db.notifications.update_many(
        query,
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": f"Marked {result.modified_count} notifications as read"}

# Delete a notification
@api_router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, user: dict = Depends(get_current_user)):
    """Delete a notification"""
    notification = await db.notifications.find_one({"id": notification_id})
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if user["role"] not in ["admin", "admin_restricted"] and notification["recipient_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.notifications.delete_one({"id": notification_id})
    return {"message": "Notification deleted"}

# Helper function to extract @mentions from text
def extract_mentions(text: str) -> list:
    """Extract @username mentions from text"""
    # Match @username pattern (alphanumeric and underscores)
    pattern = r'@([a-zA-Z0-9_]+)'
    matches = re.findall(pattern, text)
    return list(set(matches))  # Remove duplicates

# Helper function to create notification
async def create_notification(
    recipient_id: str,
    sender_id: str,
    sender_name: str,
    notification_type: str,
    title: str,
    message: str,
    order_id: Optional[str] = None,
    order_number: Optional[str] = None
):
    """Create a notification in the database"""
    notification = {
        "id": str(uuid.uuid4()),
        "recipient_id": recipient_id,
        "sender_id": sender_id,
        "sender_name": sender_name,
        "type": notification_type,
        "title": title,
        "message": message,
        "order_id": order_id,
        "order_number": order_number,
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification

# ==========================================
# TRANSLATION SYSTEM
# ==========================================

LANGUAGE_NAMES = {
    "en": "English",
    "es": "Spanish",
    "vi": "Vietnamese", 
    "ar": "Arabic",
    "ku-sor": "Kurdish Sorani",
    "ku-kmr": "Kurdish Kurmanji"
}

@api_router.post("/translate", response_model=TranslateResponse)
async def translate_texts(request: TranslateRequest):
    """Translate texts to target language using Gemini (disabled)"""
    raise HTTPException(
        status_code=501,
        detail="Translation temporarily disabled because emergentintegrations was removed."
    )

@api_router.get("/supported-languages")
async def get_supported_languages():
    """Get list of supported languages"""
    return [
        {"code": "en", "name": "English", "native": "English"},
        {"code": "es", "name": "Spanish", "native": "Español"},
        {"code": "vi", "name": "Vietnamese", "native": "Tiếng Việt"},
        {"code": "ar", "name": "Arabic", "native": "العربية"},
        {"code": "ku-sor", "name": "Kurdish Sorani", "native": "کوردی سۆرانی"},
        {"code": "ku-kmr", "name": "Kurdish Kurmanji", "native": "Kurdî Kurmancî"}
    ]


# ============================================================================
# SCANNER INTEGRATION ENDPOINTS
# For Brother ADS-3100 scanner with Python watcher script
# ============================================================================

class ScannerUploadRequest(BaseModel):
    """Request model for scanner upload with auto-link"""
    order_number: str  # 5-digit order number extracted via OCR
    filename: str
    content_type: str = "application/pdf"
    
class ScannerApiKeyAuth:
    """Simple API key authentication for scanner script"""
    def __init__(self):
        self.api_key = os.environ.get('SCANNER_API_KEY', 'corleone-scanner-2025')
    
    async def __call__(self, api_key: str = None):
        if not api_key:
            raise HTTPException(status_code=401, detail="API key required")
        if api_key != self.api_key:
            raise HTTPException(status_code=401, detail="Invalid API key")
        return True

scanner_auth = ScannerApiKeyAuth()

@api_router.get("/scanner/find-order/{order_number}")
async def scanner_find_order(order_number: str, api_key: str = None):
    """
    Find an order by order number (for scanner script to verify before upload).
    Used by the scanner watcher script to find the matching order before uploading.
    """
    # Validate API key
    await scanner_auth(api_key)
    
    # Clean up order number - handle various formats
    clean_number = order_number.strip()
    
    # Try exact match first
    order = await db.orders.find_one({"order_number": clean_number}, {"_id": 0, "id": 1, "order_number": 1, "customer_name": 1, "product_type": 1, "current_department": 1})
    
    if not order:
        # Try partial match (ends with the number)
        order = await db.orders.find_one(
            {"order_number": {"$regex": f"{clean_number}$", "$options": "i"}},
            {"_id": 0, "id": 1, "order_number": 1, "customer_name": 1, "product_type": 1, "current_department": 1}
        )
    
    if not order:
        # Try containing the number
        order = await db.orders.find_one(
            {"order_number": {"$regex": clean_number, "$options": "i"}},
            {"_id": 0, "id": 1, "order_number": 1, "customer_name": 1, "product_type": 1, "current_department": 1}
        )
    
    if not order:
        raise HTTPException(status_code=404, detail=f"Order not found for number: {order_number}")
    
    return {
        "found": True,
        "order_id": order["id"],
        "order_number": order["order_number"],
        "customer_name": order["customer_name"],
        "product_type": order.get("product_type", "unknown"),
        "current_department": order.get("current_department", "unknown")
    }

@api_router.post("/scanner/upload")
async def scanner_upload_attachment(
    file: UploadFile = File(...),
    order_number: str = Form(...),
    api_key: str = Form(...)
):
    """
    Upload a scanned document and auto-link it to an order by order number.
    This is the main endpoint used by the scanner watcher script.
    
    The script:
    1. Watches a folder for new scanned PDFs
    2. Uses OCR to extract the 5-digit order number
    3. Calls this endpoint to upload and auto-link
    """
    # Validate API key
    await scanner_auth(api_key)
    
    # Find the order
    clean_number = order_number.strip()
    
    # Try exact match first
    order = await db.orders.find_one({"order_number": clean_number}, {"_id": 0})
    
    if not order:
        # Try partial match (ends with the number)
        order = await db.orders.find_one(
            {"order_number": {"$regex": f"{clean_number}$", "$options": "i"}},
            {"_id": 0}
        )
    
    if not order:
        # Try containing the number
        order = await db.orders.find_one(
            {"order_number": {"$regex": clean_number, "$options": "i"}},
            {"_id": 0}
        )
    
    if not order:
        raise HTTPException(status_code=404, detail=f"Order not found for number: {order_number}")
    
    order_id = order["id"]
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "image/tiff"]
    content_type = file.content_type or "application/pdf"
    if content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"File type {content_type} not allowed")
    
    # Read file content
    content = await file.read()
    
    # Check file size (max 10MB)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")
    
    # Generate unique ID for this attachment
    import base64
    attachment_id = str(uuid.uuid4())
    
    # Store file in MongoDB for persistence
    file_data = {
        "id": attachment_id,
        "order_id": order_id,
        "filename": file.filename or f"scan_{order_number}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
        "content_type": content_type,
        "data": base64.b64encode(content).decode('utf-8'),
        "size": len(content),
        "uploaded_by": "Scanner",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "source": "scanner_auto_upload"
    }
    await db.attachments.insert_one(file_data)
    
    # Create attachment reference for order
    attachment_url = f"/api/attachments/{attachment_id}"
    new_attachment = {
        "id": attachment_id,
        "url": attachment_url,
        "name": file_data["filename"],
        "content_type": content_type,
        "size": len(content),
        "uploaded_by": "Scanner",
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Get existing attachments or create empty list
    existing_attachments = order.get("attachments", []) or []
    existing_attachments.append(new_attachment)
    
    # Update order with new attachment
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "attachments": existing_attachments,
            "attachment_url": attachment_url,
            "attachment_name": file_data["filename"],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Scanner auto-uploaded attachment for order {order['order_number']} (ID: {order_id})")
    
    return {
        "success": True,
        "message": f"Scan uploaded and linked to order {order['order_number']}",
        "order_id": order_id,
        "order_number": order["order_number"],
        "customer_name": order["customer_name"],
        "attachment_id": attachment_id,
        "attachment_url": attachment_url
    }


# ============================================================================
# SALESPEOPLE & COMMISSION MANAGEMENT
# Track sales staff and generate commission reports
# ============================================================================

class SalespersonCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    notes: Optional[str] = ""
    is_active: Optional[bool] = True

class SalespersonUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

# Commission rate: $50 per set of 4 rims
COMMISSION_RATE_PER_SET = 50.0
RIMS_PER_SET = 4

@api_router.get("/salespeople")
async def get_salespeople(
    active_only: bool = True,
    user: dict = Depends(get_current_user)
):
    """Get all salespeople"""
    query = {"is_active": True} if active_only else {}
    salespeople = await db.salespeople.find(query, {"_id": 0}).sort("name", 1).to_list(100)
    return salespeople

@api_router.post("/salespeople")
async def create_salesperson(
    data: SalespersonCreate,
    user: dict = Depends(get_current_user)
):
    """Create a new salesperson (admin/admin_restricted)"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    salesperson = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "phone": data.phone or "",
        "email": data.email or "",
        "notes": data.notes or "",
        "is_active": data.is_active if data.is_active is not None else True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.salespeople.insert_one(salesperson)
    
    # Return without _id
    if "_id" in salesperson:
        del salesperson["_id"]
    return salesperson

@api_router.put("/salespeople/{salesperson_id}")
async def update_salesperson(
    salesperson_id: str,
    data: SalespersonUpdate,
    user: dict = Depends(get_current_user)
):
    """Update a salesperson (admin/admin_restricted)"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    salesperson = await db.salespeople.find_one({"id": salesperson_id})
    if not salesperson:
        raise HTTPException(status_code=404, detail="Salesperson not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.name is not None:
        update_data["name"] = data.name
    if data.phone is not None:
        update_data["phone"] = data.phone
    if data.email is not None:
        update_data["email"] = data.email
    if data.notes is not None:
        update_data["notes"] = data.notes
    if data.is_active is not None:
        update_data["is_active"] = data.is_active
    
    await db.salespeople.update_one({"id": salesperson_id}, {"$set": update_data})
    
    updated = await db.salespeople.find_one({"id": salesperson_id}, {"_id": 0})
    return updated

@api_router.delete("/salespeople/{salesperson_id}")
async def delete_salesperson(
    salesperson_id: str,
    user: dict = Depends(get_current_user)
):
    """Delete a salesperson (admin/admin_restricted) - soft delete by deactivating"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    salesperson = await db.salespeople.find_one({"id": salesperson_id})
    if not salesperson:
        raise HTTPException(status_code=404, detail="Salesperson not found")
    
    # Soft delete - just deactivate
    await db.salespeople.update_one(
        {"id": salesperson_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True, "message": "Salesperson deactivated"}

@api_router.get("/commission/report")
async def get_commission_report(
    start_date: str,
    end_date: str,
    salesperson_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Generate commission report for a date range.
    Commission = $50 per SET of 4 rims (quantity / 4 rounded down)
    
    Only counts RIM orders (not steering wheels, caps, etc.)
    """
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Build query for rim orders in date range with a salesperson assigned
    query = {
        "product_type": "rim",
        "sold_by": {"$ne": None, "$exists": True},
        "order_date": {
            "$gte": start_date,
            "$lte": end_date + "T23:59:59"
        }
    }
    
    if salesperson_id:
        query["sold_by"] = salesperson_id
    
    # Get all matching orders
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
    # Get all salespeople for name lookup
    salespeople = await db.salespeople.find({}, {"_id": 0}).to_list(100)
    salespeople_map = {sp["id"]: sp for sp in salespeople}
    
    # Group by salesperson and calculate commission
    commission_by_person = {}
    
    for order in orders:
        sp_id = order.get("sold_by")
        if not sp_id:
            continue
        
        if sp_id not in commission_by_person:
            sp_info = salespeople_map.get(sp_id, {"name": "Unknown", "id": sp_id})
            commission_by_person[sp_id] = {
                "salesperson_id": sp_id,
                "salesperson_name": sp_info.get("name", "Unknown"),
                "total_orders": 0,
                "total_quantity": 0,
                "total_sets": 0,
                "commission": 0.0,
                "orders": []
            }
        
        qty = order.get("quantity", 1) or 1
        sets = qty // RIMS_PER_SET  # Integer division for sets of 4
        commission = sets * COMMISSION_RATE_PER_SET
        
        commission_by_person[sp_id]["total_orders"] += 1
        commission_by_person[sp_id]["total_quantity"] += qty
        commission_by_person[sp_id]["total_sets"] += sets
        commission_by_person[sp_id]["commission"] += commission
        commission_by_person[sp_id]["orders"].append({
            "order_number": order.get("order_number"),
            "customer_name": order.get("customer_name"),
            "order_date": order.get("order_date"),
            "quantity": qty,
            "sets": sets,
            "commission": commission
        })
    
    # Calculate totals
    total_orders = sum(p["total_orders"] for p in commission_by_person.values())
    total_quantity = sum(p["total_quantity"] for p in commission_by_person.values())
    total_sets = sum(p["total_sets"] for p in commission_by_person.values())
    total_commission = sum(p["commission"] for p in commission_by_person.values())
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "commission_rate": COMMISSION_RATE_PER_SET,
        "rims_per_set": RIMS_PER_SET,
        "summary": {
            "total_orders": total_orders,
            "total_quantity": total_quantity,
            "total_sets": total_sets,
            "total_commission": total_commission
        },
        "by_salesperson": list(commission_by_person.values()),
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/commission/salesperson/{salesperson_id}")
async def get_salesperson_commission(
    salesperson_id: str,
    start_date: str,
    end_date: str,
    user: dict = Depends(get_current_user)
):
    """Get detailed commission for a specific salesperson"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get salesperson info
    salesperson = await db.salespeople.find_one({"id": salesperson_id}, {"_id": 0})
    if not salesperson:
        raise HTTPException(status_code=404, detail="Salesperson not found")
    
    # Get their rim orders
    orders = await db.orders.find({
        "product_type": "rim",
        "sold_by": salesperson_id,
        "order_date": {
            "$gte": start_date,
            "$lte": end_date + "T23:59:59"
        }
    }, {"_id": 0}).sort("order_date", -1).to_list(1000)
    
    # Calculate commission for each order
    order_details = []
    total_commission = 0.0
    total_sets = 0
    
    for order in orders:
        qty = order.get("quantity", 1) or 1
        sets = qty // RIMS_PER_SET
        commission = sets * COMMISSION_RATE_PER_SET
        total_sets += sets
        total_commission += commission
        
        order_details.append({
            "order_id": order.get("id"),
            "order_number": order.get("order_number"),
            "customer_name": order.get("customer_name"),
            "order_date": order.get("order_date"),
            "quantity": qty,
            "sets": sets,
            "commission": commission,
            "status": order.get("status"),
            "current_department": order.get("current_department")
        })
    
    return {
        "salesperson": salesperson,
        "period": {"start_date": start_date, "end_date": end_date},
        "summary": {
            "total_orders": len(orders),
            "total_sets": total_sets,
            "total_commission": total_commission
        },
        "orders": order_details
    }


@api_router.get("/scanner/health")
async def scanner_health_check(api_key: str = None):
    """Health check endpoint for scanner script to verify connectivity"""
    await scanner_auth(api_key)
    return {
        "status": "healthy",
        "service": "Corleone Forged Scanner Integration",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# ============================================================================
# QUICKBOOKS ONLINE INTEGRATION
# OAuth 2.0 Authentication + Webhook Listener for Invoice Auto-Import
# ============================================================================

import base64
import hmac
import httpx
import asyncio

# QuickBooks OAuth Configuration
QBO_CLIENT_ID = os.environ.get('QBO_CLIENT_ID', '')
QBO_CLIENT_SECRET = os.environ.get('QBO_CLIENT_SECRET', '')
QBO_REDIRECT_URI = os.environ.get('QBO_REDIRECT_URI', '')
QBO_ENVIRONMENT = os.environ.get('QBO_ENVIRONMENT', 'sandbox')
QBO_WEBHOOK_VERIFIER = os.environ.get('QBO_WEBHOOK_VERIFIER_TOKEN', '')

# QuickBooks API URLs
QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
QBO_API_BASE = "https://sandbox-quickbooks.api.intuit.com" if QBO_ENVIRONMENT == "sandbox" else "https://quickbooks.api.intuit.com"


class QuickBooksOAuth:
    """QuickBooks OAuth 2.0 handler"""
    
    @staticmethod
    def get_authorization_url(state: str) -> str:
        """Generate the authorization URL for user redirect"""
        scope = "com.intuit.quickbooks.accounting"
        params = {
            "client_id": QBO_CLIENT_ID,
            "response_type": "code",
            "scope": scope,
            "redirect_uri": QBO_REDIRECT_URI,
            "state": state
        }
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{QBO_AUTH_URL}?{query_string}"
    
    @staticmethod
    async def exchange_code_for_tokens(auth_code: str) -> dict:
        """Exchange authorization code for access and refresh tokens"""
        auth_header = base64.b64encode(
            f"{QBO_CLIENT_ID}:{QBO_CLIENT_SECRET}".encode()
        ).decode()
        
        headers = {
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
        }
        
        data = {
            "grant_type": "authorization_code",
            "code": auth_code,
            "redirect_uri": QBO_REDIRECT_URI
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(QBO_TOKEN_URL, headers=headers, data=data, timeout=30)
        
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail=f"Token exchange failed: {response.text}")
        
        return response.json()
    
    @staticmethod
    async def refresh_access_token(refresh_token: str) -> dict:
        """Refresh an expired access token"""
        auth_header = base64.b64encode(
            f"{QBO_CLIENT_ID}:{QBO_CLIENT_SECRET}".encode()
        ).decode()
        
        headers = {
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
        }
        
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(QBO_TOKEN_URL, headers=headers, data=data, timeout=30)
        
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Token refresh failed")
        
        return response.json()


class QuickBooksAPI:
    """QuickBooks API client for fetching invoice data"""
    
    def __init__(self, access_token: str, realm_id: str):
        self.access_token = access_token
        self.realm_id = realm_id
        self.base_url = f"{QBO_API_BASE}/v3/company/{realm_id}"
    
    def _get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    
    async def get_invoice(self, invoice_id: str) -> dict:
        """Fetch a specific invoice by ID"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/invoice/{invoice_id}",
                headers=self._get_headers(),
                timeout=30
            )
        
        if response.status_code == 200:
            return response.json().get("Invoice", {})
        return None
    
    async def get_customer(self, customer_id: str) -> dict:
        """Fetch customer details"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/customer/{customer_id}",
                headers=self._get_headers(),
                timeout=30
            )
        
        if response.status_code == 200:
            return response.json().get("Customer", {})
        return None


def detect_product_type_from_text(text: str) -> str:
    """
    Auto-detect product type from QuickBooks line item description.
    Looks for keywords to determine if it's a rim, steering wheel, or caps.
    
    Returns: product_type string (rim, steering_wheel, standard_caps, etc.)
    """
    text_lower = text.lower()
    
    # Check for steering wheel keywords
    steering_keywords = ['steering', 'wheel steering', 'grant', 'momo', 'nardi', 'sparco']
    for keyword in steering_keywords:
        if keyword in text_lower:
            return "steering_wheel"
    
    # Check for cap keywords
    cap_keywords = ['cap', 'caps', 'floater', 'dually', 'offroad', 'xxl']
    for keyword in cap_keywords:
        if keyword in text_lower:
            if 'floater' in text_lower:
                return "floater_caps"
            elif 'dually' in text_lower:
                return "dually_floating_caps"
            elif 'offroad' in text_lower or 'off-road' in text_lower:
                return "offroad_floating_caps"
            elif 'xxl' in text_lower:
                return "xxl_caps"
            elif 'race' in text_lower:
                return "race_car_caps"
            elif 'custom' in text_lower:
                return "custom_caps"
            return "standard_caps"
    
    # Default to rim (most common product)
    return "rim"


def extract_rim_size_from_text(text: str) -> str:
    """
    Extract rim size from text (e.g., "22 inch", "24"", "20x10")
    Returns the size as a string like "22" or empty string if not found.
    """
    # Pattern for common rim size formats
    patterns = [
        r'(\d{2})\s*(?:inch|in|")',  # 22 inch, 22in, 22"
        r'(\d{2})x\d+',              # 22x10
        r'(\d{2})\s*(?:rim|wheel)',  # 22 rim, 22 wheel
        r'^(\d{2})(?:\s|$)',         # Just the number at start
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            size = match.group(1)
            if size in ["19", "20", "21", "22", "24", "26", "28", "30", "32", "34"]:
                return size
    
    return ""


async def create_order_from_invoice(invoice_data: dict, realm_id: str):
    """
    Create an order in our system from a QuickBooks invoice.
    This runs in the background after webhook is received.
    """
    try:
        invoice_number = invoice_data.get("DocNumber", "")
        customer_ref = invoice_data.get("CustomerRef", {})
        customer_name = customer_ref.get("name", "Unknown Customer")
        line_items = invoice_data.get("Line", [])
        invoice_date = invoice_data.get("TxnDate", datetime.now(timezone.utc).isoformat())
        
        # Check if order already exists with this invoice number
        existing = await db.orders.find_one({"order_number": invoice_number})
        if existing:
            logger.info(f"Order {invoice_number} already exists, skipping")
            return
        
        now = datetime.now(timezone.utc).isoformat()
        orders_created = []
        
        # Process each line item as a potential order
        for line in line_items:
            # Skip subtotal lines (they don't have SalesItemLineDetail)
            if line.get("DetailType") != "SalesItemLineDetail":
                continue
            
            detail = line.get("SalesItemLineDetail", {})
            item_ref = detail.get("ItemRef", {})
            item_name = item_ref.get("name", "")
            description = line.get("Description", item_name)
            quantity = int(detail.get("Qty", 1))
            
            # Auto-detect product type from line item
            product_type = detect_product_type_from_text(f"{item_name} {description}")
            rim_size = extract_rim_size_from_text(f"{item_name} {description}")
            
            # Create the order
            order = {
                "id": str(uuid.uuid4()),
                "order_number": invoice_number,
                "customer_name": customer_name.upper(),  # Uppercase to match existing convention
                "phone": "",
                "product_type": product_type,
                "wheel_specs": description,
                "notes": f"Auto-imported from QuickBooks Invoice #{invoice_number}",
                "order_date": invoice_date if 'T' in str(invoice_date) else f"{invoice_date}T00:00:00+00:00",
                "current_department": "received",
                "status": "in_process",
                "final_status": None,
                "department_history": [
                    {"department": "received", "started_at": now, "completed_at": None}
                ],
                "attachment_url": None,
                "attachment_name": None,
                "attachments": [],
                "order_notes": [],
                "quantity": quantity,
                "linked_order_id": None,
                "vehicle_make": "",
                "vehicle_model": "",
                "rim_size": rim_size,
                "rim_size_front": "",
                "rim_size_rear": "",
                "cut_status": "waiting",
                "steering_wheel_brand": "",
                "has_tires": False,
                "has_steering_wheel": product_type == "steering_wheel",
                "lalo_status": "not_sent",
                "tire_size": "",
                "qbo_realm_id": realm_id,
                "qbo_invoice_id": invoice_data.get("Id"),
                "source": "quickbooks_webhook",
                "created_at": now,
                "updated_at": now
            }
            
            await db.orders.insert_one(order)
            orders_created.append(order["id"])
            logger.info(f"Created order {invoice_number} ({product_type}) from QuickBooks invoice")
        
        # Log the import
        await db.qbo_import_log.insert_one({
            "id": str(uuid.uuid4()),
            "invoice_number": invoice_number,
            "invoice_id": invoice_data.get("Id"),
            "realm_id": realm_id,
            "customer_name": customer_name,
            "orders_created": orders_created,
            "line_items_count": len(line_items),
            "imported_at": now
        })
        
        return orders_created
        
    except Exception as e:
        logger.error(f"Error creating order from invoice: {e}")
        return None


# QuickBooks OAuth Routes
@api_router.get("/quickbooks/auth-url")
async def get_quickbooks_auth_url(user: dict = Depends(get_current_user)):
    """
    Get the QuickBooks authorization URL to start the OAuth flow.
    Only admins/admin_restricted can connect QuickBooks.
    """
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not QBO_CLIENT_ID:
        raise HTTPException(status_code=400, detail="QuickBooks not configured. Add QBO_CLIENT_ID to .env")
    
    # Generate state for CSRF protection
    state = str(uuid.uuid4())
    
    # Store state temporarily
    await db.qbo_oauth_states.insert_one({
        "state": state,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10)
    })
    
    auth_url = QuickBooksOAuth.get_authorization_url(state)
    
    return {
        "authorization_url": auth_url,
        "state": state
    }


@api_router.get("/quickbooks/callback")
async def quickbooks_oauth_callback(
    code: str = None,
    state: str = None,
    realmId: str = None,
    error: str = None
):
    """
    OAuth callback endpoint for QuickBooks.
    QuickBooks redirects here after user grants permission.
    """
    if error:
        # Redirect to frontend with error
        return RedirectResponse(
            url=f"/?qbo_error={error}",
            status_code=302
        )
    
    if not code or not state or not realmId:
        return RedirectResponse(
            url="/?qbo_error=missing_params",
            status_code=302
        )
    
    # Verify state
    state_record = await db.qbo_oauth_states.find_one({"state": state})
    if not state_record:
        return RedirectResponse(
            url="/?qbo_error=invalid_state",
            status_code=302
        )
    
    if datetime.now(timezone.utc) > state_record["expires_at"]:
        return RedirectResponse(
            url="/?qbo_error=state_expired",
            status_code=302
        )
    
    try:
        # Exchange code for tokens
        token_response = await QuickBooksOAuth.exchange_code_for_tokens(code)
        
        now = datetime.now(timezone.utc)
        
        # Store or update connection
        await db.qbo_connections.update_one(
            {"realm_id": realmId},
            {
                "$set": {
                    "realm_id": realmId,
                    "access_token": token_response.get("access_token"),
                    "refresh_token": token_response.get("refresh_token"),
                    "token_type": token_response.get("token_type", "Bearer"),
                    "expires_in": token_response.get("expires_in", 3600),
                    "expires_at": now + timedelta(seconds=token_response.get("expires_in", 3600)),
                    "connected_by": state_record["user_id"],
                    "connected_at": now,
                    "updated_at": now,
                    "environment": QBO_ENVIRONMENT
                }
            },
            upsert=True
        )
        
        # Clean up state
        await db.qbo_oauth_states.delete_one({"state": state})
        
        logger.info(f"QuickBooks connected successfully for realm {realmId}")
        
        # Redirect to frontend with success
        return RedirectResponse(
            url="/?qbo_success=connected",
            status_code=302
        )
        
    except Exception as e:
        logger.error(f"QuickBooks OAuth error: {e}")
        return RedirectResponse(
            url=f"/?qbo_error={str(e)}",
            status_code=302
        )


@api_router.get("/quickbooks/status")
async def get_quickbooks_status(user: dict = Depends(get_current_user)):
    """Check if QuickBooks is connected"""
    connection = await db.qbo_connections.find_one({}, {"_id": 0, "access_token": 0, "refresh_token": 0})
    
    if not connection:
        return {
            "connected": False,
            "configured": bool(QBO_CLIENT_ID)
        }
    
    # Check if token is expired
    is_expired = datetime.now(timezone.utc) > connection.get("expires_at", datetime.now(timezone.utc))
    
    return {
        "connected": True,
        "configured": bool(QBO_CLIENT_ID),
        "realm_id": connection.get("realm_id"),
        "environment": connection.get("environment", "sandbox"),
        "connected_at": connection.get("connected_at"),
        "token_expired": is_expired
    }


@api_router.post("/quickbooks/disconnect")
async def disconnect_quickbooks(user: dict = Depends(get_current_user)):
    """Disconnect QuickBooks integration"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.qbo_connections.delete_many({})
    
    return {
        "success": True,
        "message": "QuickBooks disconnected",
        "deleted": result.deleted_count
    }


@api_router.post("/quickbooks/refresh-token")
async def refresh_quickbooks_token(user: dict = Depends(get_current_user)):
    """Manually refresh QuickBooks access token"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    connection = await db.qbo_connections.find_one({})
    if not connection:
        raise HTTPException(status_code=404, detail="QuickBooks not connected")
    
    try:
        token_response = await QuickBooksOAuth.refresh_access_token(connection["refresh_token"])
        
        now = datetime.now(timezone.utc)
        
        await db.qbo_connections.update_one(
            {"realm_id": connection["realm_id"]},
            {
                "$set": {
                    "access_token": token_response.get("access_token"),
                    "refresh_token": token_response.get("refresh_token"),
                    "expires_at": now + timedelta(seconds=token_response.get("expires_in", 3600)),
                    "updated_at": now
                }
            }
        )
        
        return {"success": True, "message": "Token refreshed"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token refresh failed: {str(e)}")


# QuickBooks Webhook Endpoint
@api_router.post("/quickbooks/webhook")
async def quickbooks_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Webhook endpoint for QuickBooks Online events.
    Receives notifications when invoices are created/updated in QuickBooks.
    
    QuickBooks requires a response within 3 seconds, so we process asynchronously.
    """
    try:
        # Get raw body for signature verification
        body = await request.body()
        body_str = body.decode('utf-8')
        
        # Verify webhook signature
        signature_header = request.headers.get("intuit-signature", "")
        
        if QBO_WEBHOOK_VERIFIER and signature_header:
            # Calculate expected signature
            expected_signature = base64.b64encode(
                hmac.new(
                    QBO_WEBHOOK_VERIFIER.encode('utf-8'),
                    body_str.encode('utf-8'),
                    hashlib.sha256
                ).digest()
            ).decode()
            
            if not hmac.compare_digest(expected_signature, signature_header):
                logger.warning("QuickBooks webhook signature verification failed")
                raise HTTPException(status_code=401, detail="Invalid signature")
        
        # Parse payload
        import json
        payload = json.loads(body_str)
        
        # Log webhook receipt
        webhook_id = str(uuid.uuid4())
        await db.qbo_webhooks.insert_one({
            "id": webhook_id,
            "payload": payload,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "processed": False
        })
        
        # Process webhook events asynchronously
        background_tasks.add_task(process_quickbooks_webhook, webhook_id, payload)
        
        # Return 200 immediately (QuickBooks requires < 3 second response)
        return {"status": "received", "webhook_id": webhook_id}
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def process_quickbooks_webhook(webhook_id: str, payload: dict):
    """
    Process QuickBooks webhook events in the background.
    This function runs asynchronously after the webhook response is sent.
    """
    try:
        event_notifications = payload.get("eventNotifications", [])
        
        for notification in event_notifications:
            realm_id = notification.get("realmId")
            entities = notification.get("dataChangeEvent", {}).get("entities", [])
            
            for entity in entities:
                entity_name = entity.get("name")
                operation = entity.get("operation")
                entity_id = entity.get("id")
                
                # We only care about Invoice Create events
                if entity_name == "Invoice" and operation == "Create":
                    logger.info(f"Processing Invoice Create event: {entity_id} in realm {realm_id}")
                    
                    # Get connection for this realm
                    connection = await db.qbo_connections.find_one({"realm_id": realm_id})
                    if not connection:
                        logger.warning(f"No connection found for realm {realm_id}")
                        continue
                    
                    # Check if token needs refresh
                    if datetime.now(timezone.utc) > connection.get("expires_at", datetime.now(timezone.utc)):
                        try:
                            token_response = await QuickBooksOAuth.refresh_access_token(connection["refresh_token"])
                            connection["access_token"] = token_response.get("access_token")
                            await db.qbo_connections.update_one(
                                {"realm_id": realm_id},
                                {"$set": {
                                    "access_token": token_response.get("access_token"),
                                    "refresh_token": token_response.get("refresh_token"),
                                    "expires_at": datetime.now(timezone.utc) + timedelta(seconds=token_response.get("expires_in", 3600))
                                }}
                            )
                        except Exception as e:
                            logger.error(f"Token refresh failed: {e}")
                            continue
                    
                    # Fetch invoice details from QuickBooks
                    api_client = QuickBooksAPI(connection["access_token"], realm_id)
                    invoice_data = await api_client.get_invoice(entity_id)
                    
                    if invoice_data:
                        # Create order(s) from invoice
                        await create_order_from_invoice(invoice_data, realm_id)
        
        # Mark webhook as processed
        await db.qbo_webhooks.update_one(
            {"id": webhook_id},
            {"$set": {"processed": True, "processed_at": datetime.now(timezone.utc).isoformat()}}
        )
        
    except Exception as e:
        logger.error(f"Error processing webhook {webhook_id}: {e}")
        await db.qbo_webhooks.update_one(
            {"id": webhook_id},
            {"$set": {"processing_error": str(e), "processed_at": datetime.now(timezone.utc).isoformat()}}
        )


@api_router.get("/quickbooks/import-log")
async def get_quickbooks_import_log(
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    """Get log of orders imported from QuickBooks"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    logs = await db.qbo_import_log.find(
        {}, {"_id": 0}
    ).sort("imported_at", -1).limit(limit).to_list(limit)
    
    return {"imports": logs, "count": len(logs)}


@api_router.get("/quickbooks/webhook-log")
async def get_quickbooks_webhook_log(
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    """Get log of received webhooks (for debugging)"""
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    logs = await db.qbo_webhooks.find(
        {}, {"_id": 0}
    ).sort("received_at", -1).limit(limit).to_list(limit)
    
    return {"webhooks": logs, "count": len(logs)}


# Manual invoice import (for testing without webhooks)
class ManualInvoiceImport(BaseModel):
    invoice_number: str
    customer_name: str
    line_items: List[dict]  # [{"name": "22 inch rim", "description": "...", "quantity": 4}]


@api_router.post("/quickbooks/manual-import")
async def manual_import_invoice(
    data: ManualInvoiceImport,
    user: dict = Depends(get_current_user)
):
    """
    Manually import an invoice (for testing without full QuickBooks connection).
    Creates orders from the provided invoice data.
    """
    if user["role"] not in ["admin", "admin_restricted"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check if order already exists
    existing = await db.orders.find_one({"order_number": data.invoice_number})
    if existing:
        raise HTTPException(status_code=400, detail=f"Order {data.invoice_number} already exists")
    
    now = datetime.now(timezone.utc).isoformat()
    orders_created = []
    
    for item in data.line_items:
        item_name = item.get("name", "")
        description = item.get("description", item_name)
        quantity = int(item.get("quantity", 1))
        
        # Auto-detect product type
        product_type = detect_product_type_from_text(f"{item_name} {description}")
        rim_size = extract_rim_size_from_text(f"{item_name} {description}")
        
        order = {
            "id": str(uuid.uuid4()),
            "order_number": data.invoice_number,
            "customer_name": data.customer_name.upper(),
            "phone": "",
            "product_type": product_type,
            "wheel_specs": description,
            "notes": f"Manually imported from QuickBooks Invoice #{data.invoice_number}",
            "order_date": now,
            "current_department": "received",
            "status": "in_process",
            "final_status": None,
            "department_history": [
                {"department": "received", "started_at": now, "completed_at": None}
            ],
            "attachment_url": None,
            "attachment_name": None,
            "attachments": [],
            "order_notes": [],
            "quantity": quantity,
            "linked_order_id": None,
            "vehicle_make": "",
            "vehicle_model": "",
            "rim_size": rim_size,
            "rim_size_front": "",
            "rim_size_rear": "",
            "cut_status": "waiting",
            "steering_wheel_brand": "",
            "has_tires": False,
            "has_steering_wheel": product_type == "steering_wheel",
            "lalo_status": "not_sent",
            "tire_size": "",
            "source": "quickbooks_manual",
            "created_at": now,
            "updated_at": now
        }
        
        await db.orders.insert_one(order)
        orders_created.append({
            "id": order["id"],
            "product_type": product_type,
            "quantity": quantity,
            "rim_size": rim_size
        })
    
    return {
        "success": True,
        "invoice_number": data.invoice_number,
        "customer_name": data.customer_name,
        "orders_created": orders_created
    }


# ===== RIM OVERLAY TOOL ENDPOINTS =====
# Uses fal.ai for image processing and wheel detection
import fal_client
from PIL import Image
import io
import numpy as np

# Set FAL_KEY for fal-client
FAL_KEY = os.environ.get('FAL_KEY')
if FAL_KEY:
    os.environ["FAL_KEY"] = FAL_KEY

class RimOverlaySegmentRequest(BaseModel):
    image_base64: str  # Base64 encoded car image
    points: Optional[List[List[int]]] = None  # Click points for segmentation [[x,y], ...]
    box: Optional[List[int]] = None  # Bounding box [x1, y1, x2, y2]

class RimOverlayAnalyzeRequest(BaseModel):
    image_base64: str  # Base64 encoded car image
    wheel_region: Optional[List[int]] = None  # Optional wheel region [x, y, width, height]

class RimOverlaySaveRequest(BaseModel):
    composite_base64: str  # Base64 encoded final composite image
    order_id: Optional[str] = None  # Optional: link to order
    filename: Optional[str] = "rim_preview"

def analyze_image_lighting(image_data: bytes, region: Optional[List[int]] = None) -> dict:
    """
    Analyze image lighting in a specific region.
    Returns brightness, contrast, and shadow info for auto-matching.
    """
    try:
        img = Image.open(io.BytesIO(image_data))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Crop to region if specified
        if region and len(region) == 4:
            x, y, w, h = region
            img = img.crop((x, y, x + w, y + h))
        
        # Convert to numpy for analysis
        arr = np.array(img)
        
        # Calculate average brightness (0-255)
        brightness = float(np.mean(arr))
        
        # Calculate contrast (standard deviation)
        contrast = float(np.std(arr))
        
        # Analyze shadow direction by comparing top/bottom brightness
        h = arr.shape[0]
        top_half = np.mean(arr[:h//2])
        bottom_half = np.mean(arr[h//2:])
        shadow_direction = "top" if top_half < bottom_half else "bottom"
        shadow_intensity = abs(float(top_half - bottom_half))
        
        # Calculate suggested rim adjustments
        # Normal brightness is around 127, normal contrast around 50
        brightness_adjust = int(100 + (brightness - 127) / 2.55 * 0.3)  # Scale to 70-130%
        contrast_adjust = int(100 + (contrast - 50) / 1.0 * 0.2)  # Scale to 90-110%
        
        return {
            "brightness": brightness,
            "contrast": contrast,
            "shadow_direction": shadow_direction,
            "shadow_intensity": shadow_intensity,
            "suggested_brightness": max(50, min(150, brightness_adjust)),
            "suggested_contrast": max(80, min(120, contrast_adjust)),
            "suggested_shadow_opacity": min(50, int(shadow_intensity / 3)),
            "suggested_shadow_blur": int(shadow_intensity / 10) + 5
        }
    except Exception as e:
        logger.warning(f"Image analysis failed: {e}")
        return {
            "brightness": 127,
            "contrast": 50,
            "shadow_direction": "bottom",
            "shadow_intensity": 20,
            "suggested_brightness": 100,
            "suggested_contrast": 100,
            "suggested_shadow_opacity": 20,
            "suggested_shadow_blur": 10
        }

def estimate_perspective(image_data: bytes, wheel_points: List[List[int]] = None) -> dict:
    """
    Estimate perspective/viewing angle from wheel positions.
    Returns skew and rotation suggestions for rim placement.
    """
    try:
        img = Image.open(io.BytesIO(image_data))
        img_width, img_height = img.size
        
        # If wheel points provided, use them to estimate perspective
        if wheel_points and len(wheel_points) >= 2:
            # Calculate angle between wheels (if 2+ points)
            p1, p2 = wheel_points[0], wheel_points[1]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            
            # Horizontal distance suggests viewing angle
            # If dx is large relative to image width, it's a side view
            # If dx is small, it's more of a front/rear view
            side_view_factor = abs(dx) / img_width
            
            # Vertical difference suggests car is angled
            vertical_diff = dy / img_height
            
            # Calculate perspective suggestions
            skew_x = int(vertical_diff * 30)  # -30 to +30 degrees
            skew_y = int((0.5 - side_view_factor) * 20)  # Subtle Y skew
            
            # Scale difference between wheels suggests depth
            # (Further wheel appears smaller)
            scale_ratio = 1.0
            if len(wheel_points) >= 2:
                scale_ratio = 0.85 if dx > 0 else 1.15  # Rear wheel smaller
            
            return {
                "view_type": "side" if side_view_factor > 0.3 else "three_quarter",
                "skew_x": skew_x,
                "skew_y": skew_y,
                "rotation": int(vertical_diff * 15),  # Slight rotation
                "rear_wheel_scale": scale_ratio,
                "front_wheel_scale": 1.0 / scale_ratio if scale_ratio != 1.0 else 1.0,
                "perspective_strength": side_view_factor
            }
        
        # Default values for single wheel or no points
        return {
            "view_type": "three_quarter",
            "skew_x": 0,
            "skew_y": 5,  # Slight default skew
            "rotation": 0,
            "rear_wheel_scale": 0.9,
            "front_wheel_scale": 1.0,
            "perspective_strength": 0.5
        }
        
    except Exception as e:
        logger.warning(f"Perspective estimation failed: {e}")
        return {
            "view_type": "unknown",
            "skew_x": 0,
            "skew_y": 0,
            "rotation": 0,
            "rear_wheel_scale": 1.0,
            "front_wheel_scale": 1.0,
            "perspective_strength": 0
        }

@api_router.post("/rim-overlay/segment")
async def segment_car_wheels(request: RimOverlaySegmentRequest, user: dict = Depends(get_current_user)):
    """
    Use fal.ai BiRefNet to segment/remove background from wheel region.
    Click on the wheel to get a precise mask for that wheel.
    """
    if not FAL_KEY:
        raise HTTPException(status_code=500, detail="FAL_KEY not configured. Please add your fal.ai API key.")
    
    try:
        image_data = request.image_base64
        if not image_data.startswith('data:'):
            image_data = f"data:image/jpeg;base64,{image_data}"
        
        # Use BiRefNet for background removal/segmentation
        handler = await fal_client.submit_async(
            "fal-ai/birefnet",
            arguments={
                "image_url": image_data,
                "model": "General Use (Heavy)",  # Best quality for car images
                "output_format": "png"
            }
        )
        
        result = await handler.get()
        
        return {
            "success": True,
            "mask_url": result.get("image", {}).get("url"),
            "raw_result": result
        }
        
    except Exception as e:
        logger.error(f"SAM segmentation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(e)}")

@api_router.post("/rim-overlay/analyze")
async def analyze_car_image(request: RimOverlayAnalyzeRequest, user: dict = Depends(get_current_user)):
    """
    Analyze car image lighting and perspective for auto rim blending.
    Returns suggested brightness, contrast, shadow, and skew settings.
    """
    try:
        image_data = request.image_base64
        if image_data.startswith('data:'):
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        
        # Analyze lighting
        lighting = analyze_image_lighting(image_bytes, request.wheel_region)
        
        # Estimate perspective (would need wheel points for better accuracy)
        perspective = estimate_perspective(image_bytes)
        
        return {
            "success": True,
            "lighting": lighting,
            "perspective": perspective,
            "auto_settings": {
                "brightness": lighting["suggested_brightness"],
                "contrast": lighting["suggested_contrast"],
                "shadow_opacity": lighting["suggested_shadow_opacity"],
                "shadow_blur": lighting["suggested_shadow_blur"],
                "skew_x": perspective["skew_x"],
                "skew_y": perspective["skew_y"],
                "rotation": perspective["rotation"]
            }
        }
        
    except Exception as e:
        logger.error(f"Image analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@api_router.post("/rim-overlay/detect-wheels")
async def detect_car_wheels(request: RimOverlaySegmentRequest, user: dict = Depends(get_current_user)):
    """
    Auto-detect and remove background using BiRefNet.
    Returns a cleaned image with transparent background.
    """
    if not FAL_KEY:
        raise HTTPException(status_code=500, detail="FAL_KEY not configured.")
    
    try:
        image_data = request.image_base64
        if not image_data.startswith('data:'):
            image_data = f"data:image/jpeg;base64,{image_data}"
        
        # Use BiRefNet for background removal
        handler = await fal_client.submit_async(
            "fal-ai/birefnet",
            arguments={
                "image_url": image_data,
                "model": "General Use (Heavy)",
                "output_format": "png"
            }
        )
        
        result = await handler.get()
        
        return {
            "success": True,
            "mask_url": result.get("image", {}).get("url"),
            "raw_result": result
        }
        
    except Exception as e:
        logger.error(f"Wheel detection failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

@api_router.post("/rim-overlay/save")
async def save_rim_overlay(request: RimOverlaySaveRequest, user: dict = Depends(get_current_user)):
    """
    Save the final composited rim overlay image.
    Stores in MongoDB and returns a download URL.
    """
    try:
        # Decode base64 image
        image_data = request.composite_base64
        if image_data.startswith('data:'):
            # Remove data URL prefix
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        
        # Generate unique ID for the overlay
        overlay_id = str(uuid.uuid4())
        filename = f"{request.filename}_{overlay_id[:8]}.jpg"
        
        # Store in MongoDB (using GridFS pattern with binary storage)
        overlay_doc = {
            "id": overlay_id,
            "filename": filename,
            "image_data": image_bytes,
            "content_type": "image/jpeg",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user.get("id"),
            "created_by_name": user.get("name"),
            "order_id": request.order_id,
            "file_size": len(image_bytes)
        }
        
        await db.rim_overlays.insert_one(overlay_doc)
        
        return {
            "success": True,
            "overlay_id": overlay_id,
            "filename": filename,
            "download_url": f"/api/rim-overlay/download/{overlay_id}",
            "file_size": len(image_bytes)
        }
        
    except Exception as e:
        logger.error(f"Failed to save rim overlay: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save: {str(e)}")

@api_router.get("/rim-overlay/download/{overlay_id}")
async def download_rim_overlay(overlay_id: str):
    """
    Download a saved rim overlay image.
    """
    overlay = await db.rim_overlays.find_one({"id": overlay_id})
    
    if not overlay:
        raise HTTPException(status_code=404, detail="Overlay not found")
    
    return Response(
        content=overlay["image_data"],
        media_type=overlay.get("content_type", "image/jpeg"),
        headers={
            "Content-Disposition": f'attachment; filename="{overlay.get("filename", "rim_preview.jpg")}"'
        }
    )

@api_router.get("/rim-overlay/list")
async def list_rim_overlays(user: dict = Depends(get_current_user), limit: int = 20):
    """
    List saved rim overlays for the current user (most recent first).
    """
    cursor = db.rim_overlays.find(
        {"created_by": user.get("id")},
        {"image_data": 0}  # Exclude binary data from listing
    ).sort("created_at", -1).limit(limit)
    
    overlays = []
    async for overlay in cursor:
        overlay.pop("_id", None)
        overlays.append(overlay)
    
    return {"success": True, "overlays": overlays}

# ===== END RIM OVERLAY TOOL ENDPOINTS =====

# ===== ADMIN CONTROL CENTER ENDPOINTS =====
# This is a powerful self-editing AI engine for the admin dashboard
# Restricted to specific admin user: digitalebookdepot@gmail.com

import subprocess
import shutil

# ADMIN_CONTROL_EMAIL - The only user who can access the Admin Control Center
ADMIN_CONTROL_EMAIL = "digitalebookdepot@gmail.com"

# File paths that can be edited (restricted to /src/ folder for safety)
ALLOWED_EDIT_PATHS = [
    "/app/frontend/src/",
]

# Maximum rollback history
MAX_ROLLBACK_HISTORY = 10

# Models for Admin Control Center
class ChatAttachment(BaseModel):
    name: str
    url: str
    type: Optional[str] = None

class AdminChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None
    attachments: Optional[List[ChatAttachment]] = []

class FileReadRequest(BaseModel):
    file_path: str

class FileWriteRequest(BaseModel):
    file_path: str
    content: str
    commit_message: Optional[str] = "AI Code Edit"

class IntegrationCreate(BaseModel):
    name: str
    url: str
    api_key: str
    description: Optional[str] = ""

class IntegrationUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    api_key: Optional[str] = None
    description: Optional[str] = None

def verify_admin_control_access(user: dict) -> bool:
    """Verify user has access to Admin Control Center"""
    return user.get("email") == ADMIN_CONTROL_EMAIL

def is_path_allowed(file_path: str) -> bool:
    """Check if file path is within allowed directories"""
    # Normalize path to prevent directory traversal attacks
    normalized = os.path.normpath(file_path)
    # Remove trailing slash for comparison
    normalized = normalized.rstrip('/')
    for allowed in ALLOWED_EDIT_PATHS:
        allowed_normalized = allowed.rstrip('/')
        if normalized == allowed_normalized or normalized.startswith(allowed_normalized + '/'):
            return True
    return False

def get_file_extension(file_path: str) -> str:
    """Get file extension"""
    return os.path.splitext(file_path)[1].lower()

# Admin Control Center access verification
@api_router.get("/admin-control/verify")
async def verify_admin_control(user: dict = Depends(get_current_user)):
    """Verify if current user has access to Admin Control Center"""
    has_access = verify_admin_control_access(user)
    return {
        "has_access": has_access,
        "user_email": user.get("email"),
        "message": "Access granted" if has_access else "Access denied - restricted to admin user"
    }

# List files in a directory
@api_router.get("/admin-control/files")
async def list_files(path: str = "/app/frontend/src", user: dict = Depends(get_current_user)):
    """List files in a directory (restricted to allowed paths)"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    if not is_path_allowed(path):
        raise HTTPException(status_code=403, detail="Path not allowed for editing")
    
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Path not found")
    
    files = []
    try:
        for item in os.listdir(path):
            item_path = os.path.join(path, item)
            is_dir = os.path.isdir(item_path)
            files.append({
                "name": item,
                "path": item_path,
                "is_directory": is_dir,
                "extension": get_file_extension(item) if not is_dir else None
            })
        
        # Sort: directories first, then files alphabetically
        files.sort(key=lambda x: (not x["is_directory"], x["name"].lower()))
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    return {"path": path, "files": files}

# Read file content
@api_router.post("/admin-control/read-file")
async def read_file(request: FileReadRequest, user: dict = Depends(get_current_user)):
    """Read file content"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    if not is_path_allowed(request.file_path):
        raise HTTPException(status_code=403, detail="Path not allowed for reading")
    
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    if os.path.isdir(request.file_path):
        raise HTTPException(status_code=400, detail="Cannot read directory as file")
    
    try:
        with open(request.file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            "file_path": request.file_path,
            "content": content,
            "lines": len(content.split('\n')),
            "size": len(content)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Write file with git-based rollback
@api_router.post("/admin-control/write-file")
async def write_file(request: FileWriteRequest, user: dict = Depends(get_current_user)):
    """Write file content with git commit for rollback"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    if not is_path_allowed(request.file_path):
        raise HTTPException(status_code=403, detail="Path not allowed for writing")
    
    # Ensure directory exists
    dir_path = os.path.dirname(request.file_path)
    if not os.path.exists(dir_path):
        os.makedirs(dir_path, exist_ok=True)
    
    try:
        # Write the file
        with open(request.file_path, 'w', encoding='utf-8') as f:
            f.write(request.content)
        
        # Create git commit for rollback
        commit_message = f"[AI Edit] {request.commit_message}"
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Git add and commit
        subprocess.run(
            ["git", "add", request.file_path],
            cwd="/app",
            capture_output=True,
            text=True
        )
        
        subprocess.run(
            ["git", "commit", "-m", commit_message],
            cwd="/app",
            capture_output=True,
            text=True
        )
        
        # Get commit hash
        hash_result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd="/app",
            capture_output=True,
            text=True
        )
        commit_hash = hash_result.stdout.strip() if hash_result.returncode == 0 else None
        
        # Log the edit to database for tracking
        edit_log = {
            "id": str(uuid.uuid4()),
            "file_path": request.file_path,
            "commit_hash": commit_hash,
            "commit_message": commit_message,
            "edited_by": user.get("email"),
            "timestamp": timestamp,
            "content_preview": request.content[:500] + "..." if len(request.content) > 500 else request.content
        }
        await db.admin_control_edits.insert_one(edit_log)
        
        return {
            "success": True,
            "file_path": request.file_path,
            "commit_hash": commit_hash,
            "message": "File saved and committed successfully"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get rollback history
@api_router.get("/admin-control/rollback-history")
async def get_rollback_history(user: dict = Depends(get_current_user)):
    """Get list of recent AI edits for rollback"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    # Get recent edits from database
    cursor = db.admin_control_edits.find({}).sort("timestamp", -1).limit(MAX_ROLLBACK_HISTORY)
    
    edits = []
    async for edit in cursor:
        edit.pop("_id", None)
        edits.append(edit)
    
    return {"edits": edits, "max_history": MAX_ROLLBACK_HISTORY}

# Rollback to previous commit
@api_router.post("/admin-control/rollback/{edit_id}")
async def rollback_edit(edit_id: str, user: dict = Depends(get_current_user)):
    """Rollback to a specific edit/commit"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    # Find the edit
    edit = await db.admin_control_edits.find_one({"id": edit_id}, {"_id": 0})
    if not edit:
        raise HTTPException(status_code=404, detail="Edit not found")
    
    commit_hash = edit.get("commit_hash")
    if not commit_hash:
        raise HTTPException(status_code=400, detail="No commit hash available for this edit")
    
    try:
        # Git revert to the commit BEFORE this one
        # First, get the parent commit
        parent_result = subprocess.run(
            ["git", "rev-parse", f"{commit_hash}^"],
            cwd="/app",
            capture_output=True,
            text=True
        )
        
        if parent_result.returncode != 0:
            raise HTTPException(status_code=400, detail="Cannot find parent commit for rollback")
        
        parent_hash = parent_result.stdout.strip()
        
        # Checkout the file from parent commit
        file_path = edit.get("file_path")
        checkout_result = subprocess.run(
            ["git", "checkout", parent_hash, "--", file_path],
            cwd="/app",
            capture_output=True,
            text=True
        )
        
        if checkout_result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Rollback failed: {checkout_result.stderr}")
        
        # Commit the rollback
        rollback_message = f"[Rollback] Reverted {file_path} to before edit {edit_id[:8]}"
        subprocess.run(
            ["git", "add", file_path],
            cwd="/app",
            capture_output=True
        )
        subprocess.run(
            ["git", "commit", "-m", rollback_message],
            cwd="/app",
            capture_output=True
        )
        
        # Log the rollback
        rollback_log = {
            "id": str(uuid.uuid4()),
            "type": "rollback",
            "original_edit_id": edit_id,
            "file_path": file_path,
            "rolled_back_by": user.get("email"),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.admin_control_edits.insert_one(rollback_log)
        
        return {
            "success": True,
            "message": f"Successfully rolled back {file_path}",
            "rolled_back_edit_id": edit_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Chat with Gemini AI for code editing
@api_router.post("/admin-control/chat")
async def admin_control_chat(request: AdminChatMessage, user: dict = Depends(get_current_user)):
    """Chat with Gemini AI for code editing suggestions"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    raise HTTPException(
        status_code=501,
        detail="Admin Control AI chat is temporarily disabled because emergentintegrations was removed."
    )

# Get chat history - returns raw chat logs
@api_router.get("/admin-control/chat-history")
async def get_chat_history(session_id: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    """Get chat history for admin control"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    query = {"user_email": user.get("email")}
    if session_id:
        query["session_id"] = session_id
    
    cursor = db.admin_control_chats.find(query).sort("timestamp", -1).limit(limit)
    
    chats = []
    async for chat in cursor:
        chat.pop("_id", None)
        chats.append(chat)
    
    return {"chats": chats}

# ===== CHAT MESSAGES PERSISTENCE =====
# Store individual chat messages for the Admin AI Chat

@api_router.get("/admin-control/messages")
async def get_chat_messages(limit: int = 50, user: dict = Depends(get_current_user)):
    """Get the last N chat messages for display in Admin Control Center"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    # Query messages for this admin user, sorted by timestamp ascending (oldest first for display)
    cursor = db.admin_chat_messages.find(
        {"user_email": user.get("email")},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit)
    
    messages = []
    async for msg in cursor:
        messages.append(msg)
    
    # Reverse to get chronological order (oldest to newest)
    messages.reverse()
    
    return {"messages": messages, "count": len(messages)}

@api_router.post("/admin-control/messages")
async def save_chat_message(user: dict = Depends(get_current_user), role: str = "", content: str = "", file_edits: List[dict] = None):
    """Save a single chat message to the database"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    message = {
        "id": str(uuid.uuid4()),
        "user_email": user.get("email"),
        "role": role,
        "content": content,
        "file_edits": file_edits or [],
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    await db.admin_chat_messages.insert_one(message)
    message.pop("_id", None)
    
    return {"success": True, "message": message}

class SaveChatMessageRequest(BaseModel):
    role: str
    content: str
    file_edits: Optional[List[dict]] = None

@api_router.post("/admin-control/messages/save")
async def save_chat_message_v2(request: SaveChatMessageRequest, user: dict = Depends(get_current_user)):
    """Save a single chat message to the database (with body params)"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    message = {
        "id": str(uuid.uuid4()),
        "user_email": user.get("email"),
        "role": request.role,
        "content": request.content,
        "file_edits": request.file_edits or [],
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    await db.admin_chat_messages.insert_one(message)
    message.pop("_id", None)
    
    return {"success": True, "message": message}

@api_router.delete("/admin-control/messages")
async def clear_chat_messages(user: dict = Depends(get_current_user)):
    """Clear all chat messages for this admin user"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    result = await db.admin_chat_messages.delete_many({"user_email": user.get("email")})
    
    return {"success": True, "deleted_count": result.deleted_count}

# ===== INTEGRATIONS MANAGEMENT =====
# Store and manage external API integrations

@api_router.get("/admin-control/integrations")
async def list_integrations(user: dict = Depends(get_current_user)):
    """List all stored integrations"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    cursor = db.admin_integrations.find({}, {"_id": 0, "api_key": 0})  # Hide API keys in list
    
    integrations = []
    async for integration in cursor:
        # Mask the API key
        integration["api_key_masked"] = "••••••••" + integration.get("api_key_last4", "")
        integrations.append(integration)
    
    return {"integrations": integrations}

@api_router.post("/admin-control/integrations")
async def create_integration(integration: IntegrationCreate, user: dict = Depends(get_current_user)):
    """Create a new integration"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    # Check for duplicate name
    existing = await db.admin_integrations.find_one({"name": integration.name})
    if existing:
        raise HTTPException(status_code=400, detail="Integration with this name already exists")
    
    new_integration = {
        "id": str(uuid.uuid4()),
        "name": integration.name,
        "url": integration.url,
        "api_key": integration.api_key,
        "api_key_last4": integration.api_key[-4:] if len(integration.api_key) >= 4 else integration.api_key,
        "description": integration.description,
        "created_by": user.get("email"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.admin_integrations.insert_one(new_integration)
    
    # Return without full API key
    response = {**new_integration}
    response.pop("_id", None)
    response["api_key"] = "••••••••" + response["api_key_last4"]
    
    return {"success": True, "integration": response}

@api_router.put("/admin-control/integrations/{integration_id}")
async def update_integration(integration_id: str, update: IntegrationUpdate, user: dict = Depends(get_current_user)):
    """Update an existing integration"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    existing = await db.admin_integrations.find_one({"id": integration_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if update.name is not None:
        update_data["name"] = update.name
    if update.url is not None:
        update_data["url"] = update.url
    if update.api_key is not None:
        update_data["api_key"] = update.api_key
        update_data["api_key_last4"] = update.api_key[-4:] if len(update.api_key) >= 4 else update.api_key
    if update.description is not None:
        update_data["description"] = update.description
    
    await db.admin_integrations.update_one(
        {"id": integration_id},
        {"$set": update_data}
    )
    
    return {"success": True, "message": "Integration updated"}

@api_router.delete("/admin-control/integrations/{integration_id}")
async def delete_integration(integration_id: str, user: dict = Depends(get_current_user)):
    """Delete an integration"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    result = await db.admin_integrations.delete_one({"id": integration_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    return {"success": True, "message": "Integration deleted"}

@api_router.get("/admin-control/integrations/{integration_id}/key")
async def get_integration_key(integration_id: str, user: dict = Depends(get_current_user)):
    """Get full API key for an integration (for use in code)"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    integration = await db.admin_integrations.find_one({"id": integration_id}, {"_id": 0})
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    return {
        "id": integration["id"],
        "name": integration["name"],
        "api_key": integration["api_key"],
        "url": integration["url"]
    }

@api_router.post("/admin-control/upload-attachment")
async def upload_chat_attachment(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """Upload an attachment for the admin control chat"""
    if not verify_admin_control_access(user):
        raise HTTPException(status_code=403, detail="Admin Control Center access denied")
    
    # Check file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv", "application/json"]
    content_type = file.content_type or ""
    filename = file.filename or "unknown"
    
    is_allowed = content_type in allowed_types or filename.endswith(('.txt', '.csv', '.json'))
    if not is_allowed:
        raise HTTPException(status_code=400, detail=f"File type not allowed: {content_type}")
    
    # Check file size (10MB max)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")
    
    # Store in MongoDB as base64
    import base64
    file_id = str(uuid.uuid4())
    encoded = base64.b64encode(contents).decode('utf-8')
    
    await db.admin_chat_attachments.insert_one({
        "id": file_id,
        "filename": filename,
        "content_type": content_type,
        "data": encoded,
        "size": len(contents),
        "uploaded_by": user.get("email"),
        "uploaded_at": datetime.now(timezone.utc)
    })
    
    # Return a URL that can retrieve the file
    base_url = os.environ.get("REACT_APP_BACKEND_URL", "")
    file_url = f"{base_url}/admin-control/attachment/{file_id}"
    
    return {
        "success": True,
        "url": file_url,
        "filename": filename,
        "content_type": content_type,
        "size": len(contents)
    }

@api_router.get("/admin-control/attachment/{attachment_id}")
async def get_chat_attachment(attachment_id: str):
    """Retrieve an uploaded chat attachment"""
    import base64
    
    attachment = await db.admin_chat_attachments.find_one({"id": attachment_id}, {"_id": 0})
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Decode and return the file
    content = base64.b64decode(attachment["data"])
    content_type = attachment.get("content_type", "application/octet-stream")
    filename = attachment.get("filename", "attachment")
    
    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )

# ===== END ADMIN CONTROL CENTER ENDPOINTS =====


# Initialize and include inventory router BEFORE including api_router in app
init_inventory_routes(db, get_current_user, require_admin, logging.getLogger("inventory"))
api_router.include_router(inventory_router)

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_db_client():
    """Create database indexes on startup to enforce data integrity and optimize queries"""
    
    # Clear all rate limits on startup
    failed_login_attempts.clear()
    logger.info("Cleared all login rate limits on startup")
    
    async def drop_index_safe(collection, index_name):
        """Helper to drop index and handle errors gracefully"""
        try:
            await collection.drop_index(index_name)
            logger.info(f"Dropped old index: {index_name}")
            return True
        except Exception:
            return False
    
    async def create_index_safe(collection, keys, **kwargs):
        """Helper to create index and handle errors gracefully"""
        try:
            await collection.create_index(keys, **kwargs)
            return True
        except Exception as e:
            logger.warning(f"Index creation warning for {kwargs.get('name', 'unknown')}: {e}")
            return False
    
    # Drop old problematic indexes that might conflict
    await drop_index_safe(db.users, "email_unique_idx")
    
    indexes_created = 0
    
    # Create unique compound index on order_number + product_type to prevent duplicates
    if await create_index_safe(
        db.orders,
        [("order_number", 1), ("product_type", 1)],
        unique=True, background=True, name="order_number_product_type_unique"
    ):
        indexes_created += 1
    
    # Performance indexes for frequently searched/filtered columns
    if await create_index_safe(
        db.orders, [("customer_name", 1)],
        background=True, name="customer_name_idx"
    ):
        indexes_created += 1
    
    if await create_index_safe(
        db.orders, [("order_number", 1)],
        background=True, name="order_number_idx"
    ):
        indexes_created += 1
    
    if await create_index_safe(
        db.orders, [("product_type", 1)],
        background=True, name="product_type_idx"
    ):
        indexes_created += 1
    
    if await create_index_safe(
        db.orders, [("current_department", 1)],
        background=True, name="current_department_idx"
    ):
        indexes_created += 1
    
    if await create_index_safe(
        db.orders, [("status", 1)],
        background=True, name="status_idx"
    ):
        indexes_created += 1
    
    if await create_index_safe(
        db.orders, [("status", 1), ("product_type", 1)],
        background=True, name="status_product_type_idx"
    ):
        indexes_created += 1
    
    if await create_index_safe(
        db.orders, [("order_date", -1)],
        background=True, name="order_date_idx"
    ):
        indexes_created += 1
    
    if await create_index_safe(
        db.orders, [("created_at", -1)],
        background=True, name="created_at_idx"
    ):
        indexes_created += 1
    
    if await create_index_safe(
        db.orders, [("phone", 1)],
        background=True, name="phone_idx"
    ):
        indexes_created += 1
    
    # Compound indexes for Rush Queue optimization (is_rush + current_department + order_number)
    if await create_index_safe(
        db.orders, [("is_rush", 1), ("current_department", 1), ("order_number", 1)],
        background=True, name="idx_rush_queue"
    ):
        indexes_created += 1
    
    # Compound indexes for Redo Queue optimization (is_redo + is_rush + current_department + order_number)
    if await create_index_safe(
        db.orders, [("is_redo", 1), ("is_rush", 1), ("current_department", 1), ("order_number", 1)],
        background=True, name="idx_redo_queue"
    ):
        indexes_created += 1
    
    # Index for refinish_queue lookups by original_order_id
    if await create_index_safe(
        db.refinish_queue, [("original_order_id", 1)],
        background=True, name="idx_original_order_id"
    ):
        indexes_created += 1
    
    # User collection indexes - use sparse to allow multiple null emails
    if await create_index_safe(
        db.users, [("email", 1)],
        unique=True, background=True, sparse=True, name="email_unique_sparse_idx"
    ):
        indexes_created += 1
    
    if await create_index_safe(
        db.users, [("pin", 1)],
        background=True, sparse=True, name="pin_idx"
    ):
        indexes_created += 1
    
    # ===== INVENTORY SYSTEM INDEXES =====
    # Inventory items - unique SKU
    if await create_index_safe(
        db.inventory_items, [("sku", 1)],
        unique=True, background=True, name="inventory_sku_unique"
    ):
        indexes_created += 1
    
    # Inventory stock - compound for item+location
    if await create_index_safe(
        db.inventory_stock, [("item_id", 1), ("location_id", 1)],
        unique=True, background=True, name="inventory_stock_item_location"
    ):
        indexes_created += 1
    
    # Inventory transactions - for history queries
    if await create_index_safe(
        db.inventory_transactions, [("created_at", -1)],
        background=True, name="inventory_tx_created"
    ):
        indexes_created += 1
    
    if await create_index_safe(
        db.inventory_transactions, [("item_id", 1), ("created_at", -1)],
        background=True, name="inventory_tx_item"
    ):
        indexes_created += 1
    
    # Pick lists - for order lookup
    if await create_index_safe(
        db.pick_lists, [("order_id", 1)],
        background=True, name="pick_list_order"
    ):
        indexes_created += 1
    
    # Serial items - unique barcode
    if await create_index_safe(
        db.inventory_serial_items, [("barcode", 1)],
        unique=True, sparse=True, background=True, name="serial_barcode_unique"
    ):
        indexes_created += 1
    
    # Stock alerts - for unacknowledged alerts
    if await create_index_safe(
        db.stock_alerts, [("is_acknowledged", 1), ("created_at", -1)],
        background=True, name="stock_alerts_unack"
    ):
        indexes_created += 1
    
    # API keys - for authentication lookup
    if await create_index_safe(
        db.api_keys, [("key_hash", 1)],
        unique=True, background=True, name="api_key_hash_unique"
    ):
        indexes_created += 1
    # ===== END INVENTORY SYSTEM INDEXES =====
    
    logger.info(f"Database indexes: {indexes_created} created/verified")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
