import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Download, Upload, AlertTriangle, CheckCircle2, Database } from "lucide-react";

export default function DataMigrationPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [skipExisting, setSkipExisting] = useState(true);
  const [importResult, setImportResult] = useState(null);

  const isAdmin = user?.role === "admin";

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-red-500 font-oswald uppercase tracking-widest">Admin Access Required</div>
      </div>
    );
  }

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await axios.get(`${API}/admin/export-all-data`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `corleone-forged-backup-${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Data exported successfully! Check your downloads.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setImportFile(file);
    setImportResult(null);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        setImportPreview({
          orders: data.orders?.length || 0,
          users: data.users?.length || 0,
          employee_codes: data.employee_codes?.length || 0,
          exported_at: data.export_info?.exported_at,
          exported_by: data.export_info?.exported_by
        });
      } catch (err) {
        toast.error("Invalid JSON file");
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error("Please select a file first");
      return;
    }
    
    setImporting(true);
    setImportResult(null);
    
    try {
      const fileContent = await importFile.text();
      const data = JSON.parse(fileContent);
      
      const importPayload = {
        orders: data.orders || [],
        users: data.users || [],
        employee_codes: data.employee_codes || [],
        skip_existing: skipExisting
      };
      
      const response = await axios.post(`${API}/admin/import-all-data`, importPayload);
      
      setImportResult(response.data.results);
      toast.success("Import completed!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-oswald text-2xl uppercase tracking-widest text-white">
                  Data Migration
                </h1>
                <p className="font-mono text-[10px] text-zinc-500">
                  Export & Import Orders Between Deployments
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Export Section */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="font-oswald uppercase tracking-wider text-lg text-green-500 flex items-center gap-2">
                <Download className="w-5 h-5" />
                Export Data
              </CardTitle>
              <CardDescription className="font-mono text-xs text-zinc-500">
                Download all orders, users, and employee codes as a JSON file
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded p-4">
                <h4 className="font-mono text-xs text-green-400 uppercase mb-2">What gets exported:</h4>
                <ul className="font-mono text-xs text-zinc-400 space-y-1">
                  <li>• All orders (including completed)</li>
                  <li>• All user accounts</li>
                  <li>• All employee codes</li>
                  <li>• Order notes & attachments info</li>
                </ul>
              </div>
              
              <Button
                onClick={handleExport}
                disabled={exporting}
                className="w-full bg-green-600 hover:bg-green-500 text-white font-oswald uppercase tracking-wider"
              >
                {exporting ? (
                  <>Exporting...</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" /> Download Backup</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Import Section */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="font-oswald uppercase tracking-wider text-lg text-blue-500 flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Import Data
              </CardTitle>
              <CardDescription className="font-mono text-xs text-zinc-500">
                Upload a previously exported JSON backup file
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase text-zinc-500">Select Backup File</Label>
                <Input
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="bg-zinc-950 border-zinc-700 font-mono"
                />
              </div>
              
              {importPreview && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded p-4">
                  <h4 className="font-mono text-xs text-blue-400 uppercase mb-2">File Preview:</h4>
                  <ul className="font-mono text-xs text-zinc-400 space-y-1">
                    <li>• Orders: <span className="text-white font-bold">{importPreview.orders}</span></li>
                    <li>• Users: <span className="text-white font-bold">{importPreview.users}</span></li>
                    <li>• Employee Codes: <span className="text-white font-bold">{importPreview.employee_codes}</span></li>
                    {importPreview.exported_at && (
                      <li>• Exported: <span className="text-zinc-300">{new Date(importPreview.exported_at).toLocaleString()}</span></li>
                    )}
                  </ul>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <Checkbox
                  id="skip-existing"
                  checked={skipExisting}
                  onCheckedChange={setSkipExisting}
                  className="border-zinc-600"
                />
                <Label htmlFor="skip-existing" className="font-mono text-xs text-zinc-400">
                  Skip existing records (don't overwrite)
                </Label>
              </div>
              
              <Button
                onClick={handleImport}
                disabled={importing || !importFile}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-oswald uppercase tracking-wider"
              >
                {importing ? (
                  <>Importing...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" /> Import Data</>
                )}
              </Button>
              
              {importResult && (
                <div className="bg-zinc-800/50 border border-zinc-700 rounded p-4 mt-4">
                  <h4 className="font-mono text-xs text-white uppercase mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Import Results
                  </h4>
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Orders Imported:</span>
                      <span className="text-green-400">{importResult.orders.imported}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Orders Skipped:</span>
                      <span className="text-yellow-400">{importResult.orders.skipped}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Users Imported:</span>
                      <span className="text-green-400">{importResult.users.imported}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Users Skipped:</span>
                      <span className="text-yellow-400">{importResult.users.skipped}</span>
                    </div>
                    {importResult.orders.errors.length > 0 && (
                      <div className="mt-2 text-red-400">
                        Errors: {importResult.orders.errors.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card className="bg-zinc-900/50 border-zinc-800 mt-6">
          <CardHeader>
            <CardTitle className="font-oswald uppercase tracking-wider text-lg text-amber-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Migration Instructions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-sm text-zinc-400 space-y-4">
              <div>
                <h4 className="text-white uppercase text-xs mb-2">Step 1: Export from OLD deployment</h4>
                <p className="text-xs">Go to your current deployment (with 93 orders), navigate to this page, and click "Download Backup"</p>
              </div>
              <div>
                <h4 className="text-white uppercase text-xs mb-2">Step 2: Deploy NEW version</h4>
                <p className="text-xs">Deploy the new code with all the features</p>
              </div>
              <div>
                <h4 className="text-white uppercase text-xs mb-2">Step 3: Import to NEW deployment</h4>
                <p className="text-xs">On the new deployment, come to this page, upload the backup file, and click "Import Data"</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 mt-4">
                <p className="text-amber-400 text-xs">
                  <strong>Note:</strong> Attachment files (images, PDFs) are stored separately and may need to be re-uploaded after migration.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
