# Brother ADS-3100 Scanner Integration - Setup Guide

## Overview

This guide shows you how to set up **zero-click scanning** with your Brother ADS-3100 scanner. Once configured:

1. You scan a document on the Brother scanner
2. The Python script detects the new file
3. OCR extracts the order number (5-digit number like "12345")
4. The scan is automatically uploaded and linked to the order in your app

**Cost: $0** - Uses all free, open-source tools.

---

## Step 1: Configure Brother ADS-3100 to Scan to Network Folder

### Create a Shared Folder on Your Windows PC

1. Create a folder: `C:\ScannerOutput`
2. Right-click the folder → Properties → Sharing tab
3. Click "Share..." and add your network users
4. Note the network path (e.g., `\\YOUR-PC-NAME\ScannerOutput`)

### Configure the Scanner

1. Open your Brother scanner's web interface (type the scanner's IP address in a browser)
2. Go to **Scan to FTP/Network** or **Scan to Folder**
3. Set the destination to your shared folder:
   - **Host**: Your PC's IP address or hostname
   - **Path**: `ScannerOutput` (or the share name)
   - **Username/Password**: Your Windows login credentials
4. Set file format to **PDF** (recommended) or JPEG
5. Save the profile

**Alternative: USB Direct**
If your scanner is connected via USB directly to the PC running the script:
1. Use Brother's ControlCenter software
2. Set "Scan to File" destination to `C:\ScannerOutput`

---

## Step 2: Install Required Software on Windows PC

### 2.1 Install Python (if not already installed)

1. Download Python 3.10+ from https://www.python.org/downloads/
2. Run installer - **CHECK "Add Python to PATH"**
3. Verify: Open Command Prompt, type `python --version`

### 2.2 Install Tesseract OCR

1. Download from: https://github.com/UB-Mannheim/tesseract/wiki
2. Run the installer
3. Install to default path: `C:\Program Files\Tesseract-OCR`
4. Verify: Open Command Prompt, type `tesseract --version`

### 2.3 Install Poppler (for PDF processing)

1. Download from: https://github.com/oschwartz10612/poppler-windows/releases
2. Extract to `C:\Program Files\poppler`
3. Add `C:\Program Files\poppler\Library\bin` to your System PATH:
   - Search "Environment Variables" in Windows
   - Edit "Path" variable
   - Add `C:\Program Files\poppler\Library\bin`
4. Restart Command Prompt
5. Verify: Type `pdftoppm -v`

### 2.4 Install Python Libraries

Open Command Prompt and run:

```batch
pip install watchdog pytesseract pdf2image pillow requests
```

---

## Step 3: Download and Configure the Watcher Script

### 3.1 Download the Script

Save the `scanner_watcher.py` file to a folder on your PC, for example:
`C:\ScannerWatcher\scanner_watcher.py`

### 3.2 Edit Configuration

Open `scanner_watcher.py` in Notepad or any text editor and update these settings:

```python
# Your app's API URL
API_URL = "https://whsmonitor.preview.emergentagent.com/api"

# Scanner API key (keep this secret!)
SCANNER_API_KEY = "corleone-scanner-2025"

# Folder where Brother scanner saves files
WATCH_FOLDER = r"C:\ScannerOutput"

# Where to move files after successful upload
PROCESSED_FOLDER = r"C:\ScannerOutput\Processed"

# Where to move files that couldn't be processed
FAILED_FOLDER = r"C:\ScannerOutput\Failed"

# Tesseract OCR path
TESSERACT_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# Poppler path (for PDF to image conversion)
POPPLER_PATH = r"C:\Program Files\poppler\Library\bin"
```

---

## Step 4: Test the Script

### 4.1 Manual Test

1. Open Command Prompt
2. Navigate to script folder: `cd C:\ScannerWatcher`
3. Run: `python scanner_watcher.py`
4. You should see:
   ```
   ✓ Successfully connected to Corleone Forged API
   Corleone Forged Scanner Watcher - RUNNING
   Watching folder: C:\ScannerOutput
   Waiting for new scans...
   ```

### 4.2 Test with a Real Scan

1. Scan a document that has an order number on it (e.g., "S.O No. 12345")
2. Watch the Command Prompt - you should see:
   ```
   New file detected: C:\ScannerOutput\scan001.pdf
   Found order number: 12345
   Found order: 12345 - John Smith
   Uploading scan...
   ✓ Upload successful! Linked to order 12345 (John Smith)
   ```
3. Check your app - the attachment should appear on the order!

---

## Step 5: Run Automatically on Windows Startup

### Option A: Task Scheduler (Recommended)

1. Press Win+R, type `taskschd.msc`, press Enter
2. Click "Create Basic Task..."
3. Name: "Corleone Scanner Watcher"
4. Trigger: "When the computer starts"
5. Action: "Start a program"
6. Program: `python`
7. Arguments: `C:\ScannerWatcher\scanner_watcher.py`
8. Start in: `C:\ScannerWatcher`
9. Finish and check "Open properties..."
10. In properties, check "Run whether user is logged on or not"

### Option B: Startup Folder

1. Press Win+R, type `shell:startup`, press Enter
2. Create a shortcut to `scanner_watcher.py` in this folder
3. Right-click shortcut → Properties → Shortcut tab
4. Change "Start in" to `C:\ScannerWatcher`

---

## Troubleshooting

### "Order not found"

- Make sure the order exists in your app before scanning
- Check that the order number on the document matches exactly
- The script looks for 5-digit numbers like "12345"

### "Could not extract order number"

- Make sure the document has a clear order number visible
- The number should be in format like "S.O No. 12345" or "#12345"
- Try scanning at higher resolution (300 DPI recommended)

### "Connection failed"

- Check your internet connection
- Verify the API_URL is correct
- Make sure the API key matches your server configuration

### OCR not working

- Verify Tesseract is installed: `tesseract --version`
- Check the TESSERACT_PATH in the script
- For PDFs, verify Poppler is installed: `pdftoppm -v`

### Files not being detected

- Make sure you're scanning to the correct folder
- Check the script is running (look for the console window)
- Verify the folder path in WATCH_FOLDER setting

---

## Security Notes

1. **Change the API key** in both the script AND your server's backend `.env` file:
   ```
   SCANNER_API_KEY=your-secure-random-key-here
   ```

2. The scanner watcher only needs read access to the watch folder

3. Keep the API key secret - don't share it

---

## Order Number Formats Supported

The OCR looks for these patterns:

- `S.O No. 12345`
- `S.O. 12345`
- `Sales Order 12345`
- `Order #12345`
- `Order: 12345`
- `#12345`
- Any standalone 5-digit number

---

## Support

If you have issues:
1. Check the log file at `C:\ScannerOutput\scanner_watcher.log`
2. Run the script manually to see error messages
3. Test API connection: Open browser to `https://your-app-url/api/scanner/health?api_key=your-key`
