#!/usr/bin/env python3
"""
Corleone Forged - Brother ADS-3100 Scanner Watcher Script
=========================================================

This script watches a folder where your Brother scanner saves files.
When a new PDF is scanned, it automatically:
1. Extracts the order number using OCR (looks for 5-digit numbers)
2. Uploads the scan to your app
3. Links it to the correct order

REQUIREMENTS:
  pip install watchdog pytesseract pdf2image pillow requests

SYSTEM REQUIREMENTS:
  - Tesseract OCR must be installed on your system
    Windows: https://github.com/UB-Mannheim/tesseract/wiki
    Install to default path or update TESSERACT_PATH below
  
  - Poppler (for PDF to image conversion)
    Windows: Download from https://github.com/oschwartz10612/poppler-windows/releases
    Extract and add bin folder to your PATH

USAGE:
  python scanner_watcher.py

Configure the settings below before running.
"""

import os
import sys
import re
import time
import logging
from pathlib import Path
from datetime import datetime
import requests
import shutil

# ============================================================================
# CONFIGURATION - EDIT THESE SETTINGS
# ============================================================================

# Your app's API URL (the same URL you use to access the web app)
API_URL = "https://whsmonitor.preview.emergentagent.com/api"

# Scanner API key (must match the SCANNER_API_KEY in your backend .env)
# Default is 'corleone-scanner-2025' - change this for security!
SCANNER_API_KEY = "corleone-scanner-2025"

# Folder where Brother scanner saves files
# Example: "C:\\Users\\YourName\\Documents\\ScannerOutput"
# Or a network share: "\\\\SERVER\\ScannerShare"
WATCH_FOLDER = r"C:\ScannerOutput"

# Where to move files after successful upload
PROCESSED_FOLDER = r"C:\ScannerOutput\Processed"

# Where to move files that couldn't be processed
FAILED_FOLDER = r"C:\ScannerOutput\Failed"

# Tesseract OCR path (Windows default installation)
TESSERACT_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# Poppler path (for PDF to image conversion) - REQUIRED for PDFs
# Download from: https://github.com/oschwartz10612/poppler-windows/releases
POPPLER_PATH = r"C:\Program Files\poppler\Library\bin"

# Log file location
LOG_FILE = r"C:\ScannerOutput\scanner_watcher.log"

# ============================================================================
# END CONFIGURATION
# ============================================================================

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE) if LOG_FILE else logging.NullHandler(),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def setup_tesseract():
    """Configure Tesseract OCR path"""
    if os.path.exists(TESSERACT_PATH):
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
        logger.info(f"Tesseract configured: {TESSERACT_PATH}")
    else:
        logger.warning(f"Tesseract not found at {TESSERACT_PATH}")
        logger.warning("OCR may not work. Install Tesseract or update TESSERACT_PATH")


def extract_order_number_from_pdf(pdf_path):
    """
    Extract order number from a PDF using OCR.
    Looks for 5-digit numbers that could be order numbers.
    
    Returns: str or None
    """
    try:
        from pdf2image import convert_from_path
        import pytesseract
        from PIL import Image
        
        logger.info(f"Processing PDF: {pdf_path}")
        
        # Convert first page of PDF to image
        # Using poppler_path for Windows
        poppler_path = POPPLER_PATH if os.path.exists(POPPLER_PATH) else None
        
        images = convert_from_path(
            pdf_path, 
            first_page=1, 
            last_page=1,
            poppler_path=poppler_path
        )
        
        if not images:
            logger.error("Could not convert PDF to image")
            return None
        
        # OCR the first page
        text = pytesseract.image_to_string(images[0])
        logger.debug(f"OCR extracted text: {text[:500]}...")
        
        # Look for order number patterns
        # Pattern 1: "S.O No." or "Sales Order" followed by number
        patterns = [
            r'S\.?O\.?\s*(?:No\.?)?\s*[:.]?\s*(\d{4,6})',  # S.O No. 12345 or S.O 12345
            r'Sales\s*Order\s*[:.]?\s*(\d{4,6})',  # Sales Order 12345
            r'Order\s*#?\s*[:.]?\s*(\d{4,6})',  # Order # 12345 or Order: 12345
            r'(?:^|\s)(\d{5})(?:\s|$)',  # Standalone 5-digit number
            r'#(\d{4,6})',  # #12345
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                # Return the first match
                order_num = matches[0]
                logger.info(f"Found order number: {order_num}")
                return order_num
        
        logger.warning("No order number found in PDF")
        return None
        
    except Exception as e:
        logger.error(f"Error extracting order number: {e}")
        return None


def extract_order_number_from_image(image_path):
    """
    Extract order number from an image (JPG, PNG, TIFF) using OCR.
    """
    try:
        import pytesseract
        from PIL import Image
        
        logger.info(f"Processing image: {image_path}")
        
        # Open and OCR the image
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image)
        logger.debug(f"OCR extracted text: {text[:500]}...")
        
        # Look for order number patterns (same as PDF)
        patterns = [
            r'S\.?O\.?\s*(?:No\.?)?\s*[:.]?\s*(\d{4,6})',
            r'Sales\s*Order\s*[:.]?\s*(\d{4,6})',
            r'Order\s*#?\s*[:.]?\s*(\d{4,6})',
            r'(?:^|\s)(\d{5})(?:\s|$)',
            r'#(\d{4,6})',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                order_num = matches[0]
                logger.info(f"Found order number: {order_num}")
                return order_num
        
        logger.warning("No order number found in image")
        return None
        
    except Exception as e:
        logger.error(f"Error extracting order number from image: {e}")
        return None


def verify_order_exists(order_number):
    """
    Check if an order exists in the system before uploading.
    Returns order info if found, None otherwise.
    """
    try:
        url = f"{API_URL}/scanner/find-order/{order_number}"
        response = requests.get(url, params={"api_key": SCANNER_API_KEY}, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"Found order: {data['order_number']} - {data['customer_name']}")
            return data
        elif response.status_code == 404:
            logger.warning(f"Order {order_number} not found in system")
            return None
        else:
            logger.error(f"API error: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        logger.error(f"Error verifying order: {e}")
        return None


def upload_scan(file_path, order_number):
    """
    Upload a scanned document to the app and link it to an order.
    Returns True on success, False on failure.
    """
    try:
        url = f"{API_URL}/scanner/upload"
        
        # Determine content type
        ext = Path(file_path).suffix.lower()
        content_types = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.tiff': 'image/tiff',
            '.tif': 'image/tiff',
            '.gif': 'image/gif',
        }
        content_type = content_types.get(ext, 'application/pdf')
        
        # Prepare the upload
        with open(file_path, 'rb') as f:
            files = {
                'file': (Path(file_path).name, f, content_type)
            }
            data = {
                'order_number': order_number,
                'api_key': SCANNER_API_KEY
            }
            
            logger.info(f"Uploading {file_path} for order {order_number}...")
            response = requests.post(url, files=files, data=data, timeout=60)
        
        if response.status_code == 200:
            result = response.json()
            logger.info(f"✓ Upload successful! Linked to order {result['order_number']} ({result['customer_name']})")
            return True
        else:
            logger.error(f"Upload failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Error uploading scan: {e}")
        return False


def move_file(file_path, destination_folder):
    """Move a file to a destination folder"""
    try:
        dest_path = Path(destination_folder)
        dest_path.mkdir(parents=True, exist_ok=True)
        
        # Add timestamp to filename to avoid conflicts
        original_name = Path(file_path).name
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        new_name = f"{timestamp}_{original_name}"
        
        shutil.move(file_path, dest_path / new_name)
        logger.info(f"Moved file to: {dest_path / new_name}")
        
    except Exception as e:
        logger.error(f"Error moving file: {e}")


def process_new_file(file_path):
    """
    Process a new scanned file:
    1. Extract order number via OCR
    2. Verify order exists
    3. Upload and link to order
    4. Move to processed/failed folder
    """
    logger.info(f"\n{'='*60}")
    logger.info(f"New file detected: {file_path}")
    logger.info(f"{'='*60}")
    
    # Wait a moment to ensure file is fully written
    time.sleep(2)
    
    # Check if file exists and is accessible
    if not os.path.exists(file_path):
        logger.warning(f"File no longer exists: {file_path}")
        return
    
    # Determine file type and extract order number
    ext = Path(file_path).suffix.lower()
    
    if ext == '.pdf':
        order_number = extract_order_number_from_pdf(file_path)
    elif ext in ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.gif']:
        order_number = extract_order_number_from_image(file_path)
    else:
        logger.warning(f"Unsupported file type: {ext}")
        move_file(file_path, FAILED_FOLDER)
        return
    
    if not order_number:
        logger.error("Could not extract order number from scan")
        logger.info("Moving to failed folder for manual processing")
        move_file(file_path, FAILED_FOLDER)
        return
    
    # Verify order exists in system
    order_info = verify_order_exists(order_number)
    if not order_info:
        logger.error(f"Order {order_number} not found - check if number is correct")
        move_file(file_path, FAILED_FOLDER)
        return
    
    # Upload the scan
    success = upload_scan(file_path, order_number)
    
    if success:
        logger.info(f"✓ Successfully processed scan for order {order_number}")
        move_file(file_path, PROCESSED_FOLDER)
    else:
        logger.error(f"✗ Failed to upload scan for order {order_number}")
        move_file(file_path, FAILED_FOLDER)


def test_connection():
    """Test connection to the API"""
    try:
        url = f"{API_URL}/scanner/health"
        response = requests.get(url, params={"api_key": SCANNER_API_KEY}, timeout=10)
        
        if response.status_code == 200:
            logger.info("✓ Successfully connected to Corleone Forged API")
            return True
        else:
            logger.error(f"✗ Connection test failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"✗ Could not connect to API: {e}")
        return False


def main():
    """Main function - starts the folder watcher"""
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
    except ImportError:
        logger.error("watchdog library not installed. Run: pip install watchdog")
        sys.exit(1)
    
    # Setup Tesseract
    setup_tesseract()
    
    # Create folders if they don't exist
    for folder in [WATCH_FOLDER, PROCESSED_FOLDER, FAILED_FOLDER]:
        Path(folder).mkdir(parents=True, exist_ok=True)
    
    # Test API connection
    logger.info("Testing API connection...")
    if not test_connection():
        logger.error("Cannot connect to API. Please check your settings.")
        sys.exit(1)
    
    # Define the event handler
    class ScannerHandler(FileSystemEventHandler):
        def on_created(self, event):
            if event.is_directory:
                return
            
            # Only process supported file types
            ext = Path(event.src_path).suffix.lower()
            if ext in ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif']:
                # Use a small delay to ensure file is fully written
                time.sleep(1)
                process_new_file(event.src_path)
    
    # Start watching
    event_handler = ScannerHandler()
    observer = Observer()
    observer.schedule(event_handler, WATCH_FOLDER, recursive=False)
    observer.start()
    
    logger.info(f"\n{'='*60}")
    logger.info("Corleone Forged Scanner Watcher - RUNNING")
    logger.info(f"{'='*60}")
    logger.info(f"Watching folder: {WATCH_FOLDER}")
    logger.info(f"Processed files go to: {PROCESSED_FOLDER}")
    logger.info(f"Failed files go to: {FAILED_FOLDER}")
    logger.info(f"{'='*60}")
    logger.info("Waiting for new scans... (Press Ctrl+C to stop)")
    logger.info("")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        logger.info("\nScanner watcher stopped.")
    
    observer.join()


if __name__ == "__main__":
    main()
