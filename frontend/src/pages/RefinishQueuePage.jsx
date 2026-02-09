import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LanguageSelector from "@/components/LanguageSelector";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Trash2,
  Edit3,
  LogOut,
  Package,
  Wrench,
  CheckCircle2,
  Truck,
  Clock,
  ChevronRight,
  AlertTriangle,
  Plus,
  Download,
  Upload
} from "lucide-react";

const REFINISH_STATUSES = {
  received: { label: "Received", color: "bg-blue-500/20 text-blue-400 border-blue-500/50", icon: Package },
  in_progress: { label: "In Progress", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50", icon: Wrench },
  completed: { label: "Completed", color: "bg-green-500/20 text-green-400 border-green-500/50", icon: CheckCircle2 },
  shipped_back: { label: "Shipped Back", color: "bg-purple-500/20 text-purple-400 border-purple-500/50", icon: Truck }
};

const DEPARTMENTS = [
  { value: "received", label: "Sales" },
  { value: "design", label: "Design" },
  { value: "program", label: "Program" },
  { value: "machine_waiting", label: "Machine Waiting" },
  { value: "machine", label: "Machine" },
  { value: "finishing", label: "Finishing" },
  { value: "powder_coat", label: "Powder Coat" },
  { value: "assemble", label: "Assemble" },
  { value: "showroom", label: "Showroom" }
];

const PRODUCT_TYPES = {
  rim: { label: "Rim", color: "text-red-400 border-red-400" },
  steering_wheel: { label: "Steering Wheel", color: "text-purple-400 border-purple-400" },
  standard_caps: { label: "Standard Caps", color: "text-blue-400 border-blue-400" },
  floater_caps: { label: "Floater Caps", color: "text-cyan-400 border-cyan-400" },
  xxl_caps: { label: "XXL Caps", color: "text-green-400 border-green-400" },
  dually_floating_caps: { label: "Dually Floating Caps", color: "text-yellow-400 border-yellow-400" },
  offroad_floating_caps: { label: "Off-Road Floating Caps", color: "text-orange-400 border-orange-400" },
  custom_caps: { label: "Custom Caps", color: "text-pink-400 border-pink-400" },
  race_car_caps: { label: "Tall Caps", color: "text-amber-400 border-amber-400" }
};

export default function RefinishQueuePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Edit modal state
  const [editModal, setEditModal] = useState({ open: false, entry: null });
  const [editData, setEditData] = useState({ status: "", fix_notes: "", department: "" });
  
  // New Order modal state
  const [newOrderModal, setNewOrderModal] = useState(false);
  const [newOrderData, setNewOrderData] = useState({
    order_number: "",
    customer_name: "",
    phone: "",
    product_type: "rim",
    wheel_specs: "",
    fix_notes: "",
    quantity: 1,
    rim_size: ""
  });
  const [creating, setCreating] = useState(false);

  const isAdmin = user?.role === "admin";
  const isSales = user?.departments?.includes("received") || user?.department === "received";
  const canCreateOrder = isAdmin || isSales;

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const [entriesRes, statsRes] = await Promise.all([
        axios.get(`${API}/refinish-queue`, { params: { status: statusFilter !== "all" ? statusFilter : undefined } }),
        axios.get(`${API}/refinish-queue/stats`)
      ]);
      setEntries(entriesRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error("Error fetching refinish queue:", error);
      toast.error("Failed to load refinish queue");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openEditModal = (entry) => {
    setEditData({
      status: entry.status,
      fix_notes: entry.fix_notes,
      department: entry.current_department
    });
    setEditModal({ open: true, entry });
  };

  const handleUpdateEntry = async () => {
    if (!editModal.entry) return;
    
    try {
      await axios.put(`${API}/refinish-queue/${editModal.entry.id}`, editData);
      toast.success("Entry updated!");
      setEditModal({ open: false, entry: null });
      fetchData(true);
    } catch (error) {
      toast.error("Failed to update entry");
    }
  };

  const handleAdvanceStatus = async (entry) => {
    const statusOrder = ["received", "in_progress", "completed", "shipped_back"];
    const currentIndex = statusOrder.indexOf(entry.status);
    
    if (currentIndex < statusOrder.length - 1) {
      const nextStatus = statusOrder[currentIndex + 1];
      try {
        await axios.put(`${API}/refinish-queue/${entry.id}`, { status: nextStatus });
        toast.success(`Status updated to ${REFINISH_STATUSES[nextStatus].label}`);
        fetchData(true);
      } catch (error) {
        toast.error("Failed to update status");
      }
    }
  };

  const handleDeleteEntry = async (entryId) => {
    if (!confirm("Are you sure you want to remove this entry?")) return;
    
    try {
      await axios.delete(`${API}/refinish-queue/${entryId}`);
      toast.success("Entry removed");
      fetchData(true);
    } catch (error) {
      toast.error("Failed to remove entry");
    }
  };

  // Create new refinish order
  const handleCreateNewOrder = async (e) => {
    e.preventDefault();
    
    if (!newOrderData.order_number.trim()) {
      toast.error("Order number is required");
      return;
    }
    if (!newOrderData.customer_name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!newOrderData.fix_notes.trim()) {
      toast.error("Please describe what needs to be fixed");
      return;
    }
    
    setCreating(true);
    try {
      await axios.post(`${API}/refinish-queue/create-new`, {
        order_number: newOrderData.order_number.trim(),
        customer_name: newOrderData.customer_name.trim(),
        phone: newOrderData.phone.trim(),
        product_type: newOrderData.product_type,
        wheel_specs: newOrderData.wheel_specs.trim(),
        fix_notes: newOrderData.fix_notes.trim(),
        quantity: newOrderData.quantity || 1,
        rim_size: newOrderData.rim_size
      });
      
      toast.success("Refinish order created successfully!");
      setNewOrderModal(false);
      setNewOrderData({
        order_number: "",
        customer_name: "",
        phone: "",
        product_type: "rim",
        wheel_specs: "",
        fix_notes: "",
        quantity: 1,
        rim_size: ""
      });
      fetchData(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create order");
    } finally {
      setCreating(false);
    }
  };

  const filteredEntries = entries.filter(entry => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      entry.order_number?.toLowerCase().includes(q) ||
      entry.customer_name?.toLowerCase().includes(q) ||
      entry.fix_notes?.toLowerCase().includes(q)
    );
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  // Export Refinish Queue to PDF
  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(249, 115, 22); // Orange
    doc.text("CORLEONE FORGED - REFINISH QUEUE", 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
    doc.text(`Total: ${stats?.total || 0} | Pending: ${stats?.pending || 0} | In Progress: ${stats?.in_progress || 0} | Completed: ${stats?.completed || 0}`, 14, 28);
    
    // Table data
    const tableData = filteredEntries.map(entry => [
      entry.order_number || "-",
      entry.customer_name || "-",
      entry.wheel_specs || "-",
      entry.fix_notes?.substring(0, 50) || "-",
      entry.status?.replace("_", " ").toUpperCase() || "-",
      formatDate(entry.created_at),
      formatDate(entry.completed_at)
    ]);
    
    autoTable(doc, {
      startY: 35,
      head: [["Order #", "Customer", "Wheel Specs", "Fix Notes", "Status", "Created", "Completed"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [249, 115, 22], textColor: [0, 0, 0], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    
    doc.save(`refinish-queue-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("Refinish queue exported to PDF!");
  };

  // Export Refinish Queue to CSV
  const exportToCSV = () => {
    const headers = ["Order #", "Customer", "Phone", "Product Type", "Wheel Specs", "Fix Notes", "Status", "Created Date", "Completed Date"];
    const rows = filteredEntries.map(entry => [
      entry.order_number || "",
      entry.customer_name || "",
      entry.phone || "",
      entry.product_type || "",
      entry.wheel_specs || "",
      (entry.fix_notes || "").replace(/,/g, ";"),
      entry.status || "",
      entry.created_at || "",
      entry.completed_at || ""
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `refinish-queue-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Refinish queue exported to CSV!");
  };

  // Import Refinish Queue from CSV
  const handleImportCSV = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        const lines = text.split("\n").filter(line => line.trim());
        
        let imported = 0;
        let errors = 0;
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",");
          if (values.length < 3) continue;
          
          const refinishData = {
            order_number: values[0]?.trim() || `RF-${Date.now()}-${i}`,
            customer_name: values[1]?.trim() || "",
            phone: values[2]?.trim() || "",
            product_type: values[3]?.trim() || "rim",
            wheel_specs: values[4]?.trim() || "",
            fix_notes: values[5]?.trim()?.replace(/;/g, ",") || "",
            status: values[6]?.trim() || "received"
          };
          
          try {
            await axios.post(`${API}/refinish-queue/create-new-order`, refinishData);
            imported++;
          } catch (err) {
            errors++;
            console.error(`Failed to import row ${i}:`, err);
          }
        }
        
        toast.success(`Imported ${imported} refinish orders${errors > 0 ? `, ${errors} failed` : ""}`);
        fetchData();
      } catch (err) {
        toast.error("Failed to parse CSV file");
        console.error(err);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
        <div className="max-w-[1920px] mx-auto px-2 sm:px-4 md:px-6 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-orange-500" />
                <h1 className="font-oswald text-lg sm:text-xl uppercase tracking-widest text-white">
                  {t('refinish.title')}
                </h1>
              </div>
              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/50 font-mono text-xs">
                {stats?.total || 0} {t('common.total')}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {canCreateOrder && (
                <Button
                  size="sm"
                  onClick={() => setNewOrderModal(true)}
                  className="bg-orange-500 hover:bg-orange-400 text-white font-oswald uppercase tracking-wider text-xs"
                  data-testid="create-refinish-order-btn"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">New Order</span>
                </Button>
              )}
              {/* Export PDF Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={exportToPDF}
                className="border-orange-700 text-orange-500 hover:bg-orange-500/10 font-mono text-xs"
                data-testid="export-refinish-pdf-btn"
              >
                <Download className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
              {/* Export CSV Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={exportToCSV}
                className="border-green-700 text-green-500 hover:bg-green-500/10 font-mono text-xs"
                data-testid="export-refinish-csv-btn"
              >
                <Download className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
              {/* Import CSV Button */}
              <label>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-purple-700 text-purple-500 hover:bg-purple-500/10 font-mono text-xs cursor-pointer"
                  data-testid="import-refinish-csv-btn"
                  asChild
                >
                  <span>
                    <Upload className="w-4 h-4 mr-1" />
                    <span className="hidden sm:inline">Import</span>
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  className="hidden"
                />
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="text-zinc-400 hover:text-white"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <LanguageSelector />
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-zinc-400 hover:text-red-500"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-2 sm:p-4 md:p-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
            {Object.entries(REFINISH_STATUSES).map(([key, { label, color, icon: Icon }]) => (
              <Card 
                key={key} 
                className={`bg-zinc-900/50 border-zinc-800 cursor-pointer transition-all hover:border-zinc-700 ${statusFilter === key ? 'ring-2 ring-orange-500' : ''}`}
                onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <Icon className={`w-5 h-5 ${color.split(' ')[1]}`} />
                    <span className="font-mono text-2xl sm:text-3xl text-white font-bold">
                      {stats.by_status[key] || 0}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] sm:text-xs text-zinc-500 mt-1">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search by order #, customer, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 focus:border-orange-500 font-mono text-sm"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-zinc-900 border-zinc-800 font-mono text-sm">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all" className="font-mono">All Statuses</SelectItem>
              {Object.entries(REFINISH_STATUSES).map(([key, { label }]) => (
                <SelectItem key={key} value={key} className="font-mono">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Entries List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-8 text-center">
              <Wrench className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400 font-mono">{t('refinish.noOrders')}</p>
              <p className="text-zinc-500 font-mono text-sm mt-2">
                {t('refinish.useButton')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => {
              const statusInfo = REFINISH_STATUSES[entry.status] || REFINISH_STATUSES.received;
              const StatusIcon = statusInfo.icon;
              const productInfo = PRODUCT_TYPES[entry.product_type] || { label: entry.product_type, color: "text-zinc-400" };
              const isLastStatus = entry.status === "shipped_back";
              
              return (
                <Card key={entry.id} className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-all">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Status Badge */}
                      <div className="flex items-center gap-3 sm:w-48 flex-shrink-0">
                        <Badge className={`${statusInfo.color} font-mono text-xs px-3 py-1`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusInfo.label}
                        </Badge>
                      </div>
                      
                      {/* Order Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm text-red-500 font-bold">
                            #{entry.order_number}
                          </span>
                          <Badge className={`${productInfo.color} bg-transparent text-[10px]`}>
                            {productInfo.label}
                          </Badge>
                        </div>
                        
                        <p className="font-mono text-sm text-white mt-1">
                          {entry.customer_name}
                          {entry.phone && <span className="text-zinc-500 ml-2">• {entry.phone}</span>}
                        </p>
                        
                        {/* Fix Notes */}
                        <div className="mt-2 p-2 bg-zinc-800/50 rounded border border-zinc-700">
                          <div className="flex items-center gap-1 mb-1">
                            <AlertTriangle className="w-3 h-3 text-orange-400" />
                            <span className="font-mono text-[10px] text-orange-400 uppercase tracking-wider">{t('refinish.whatNeedsFixing')}</span>
                          </div>
                          <p className="font-mono text-xs text-zinc-300">{entry.fix_notes || t('common.notes')}</p>
                        </div>
                        
                        {/* Meta Info */}
                        <div className="flex items-center gap-4 mt-2 text-zinc-500 font-mono text-[10px]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {t('refinish.dateReceived')}: {formatDate(entry.date_received)}
                          </span>
                          <span>{t('refinish.addedBy')}: {entry.added_by}</span>
                          <span>{t('refinish.dept')}: {DEPARTMENTS.find(d => d.value === entry.current_department)?.label || entry.current_department}</span>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                        {!isLastStatus && (
                          <Button
                            size="sm"
                            onClick={() => handleAdvanceStatus(entry)}
                            className="bg-orange-500 hover:bg-orange-400 text-white font-oswald uppercase tracking-wider text-xs"
                          >
                            <ChevronRight className="w-3 h-3 mr-1" />
                            Next
                          </Button>
                        )}
                        
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(entry)}
                            className="text-zinc-400 hover:text-white h-8 w-8 p-0"
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="text-zinc-400 hover:text-red-500 h-8 w-8 p-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      <Dialog open={editModal.open} onOpenChange={(open) => !open && setEditModal({ open: false, entry: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-orange-500">
              <Edit3 className="w-5 h-5 inline mr-2" />
              Edit Refinish Entry
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Status
              </Label>
              <Select value={editData.status} onValueChange={(v) => setEditData({ ...editData, status: v })}>
                <SelectTrigger className="bg-zinc-950 border-zinc-700 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {Object.entries(REFINISH_STATUSES).map(([key, { label }]) => (
                    <SelectItem key={key} value={key} className="font-mono">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Current Department
              </Label>
              <Select value={editData.department} onValueChange={(v) => setEditData({ ...editData, department: v })}>
                <SelectTrigger className="bg-zinc-950 border-zinc-700 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {DEPARTMENTS.map(dept => (
                    <SelectItem key={dept.value} value={dept.value} className="font-mono">{dept.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Fix Notes
              </Label>
              <Textarea
                value={editData.fix_notes}
                onChange={(e) => setEditData({ ...editData, fix_notes: e.target.value })}
                className="bg-zinc-950 border-zinc-700 font-mono text-sm min-h-[100px]"
                placeholder="What needs to be fixed..."
              />
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditModal({ open: false, entry: null })}
                className="flex-1 border-zinc-700 font-oswald uppercase tracking-widest"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateEntry}
                className="flex-1 bg-orange-500 hover:bg-orange-400 text-white font-oswald uppercase tracking-widest"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create New Order Modal */}
      <Dialog open={newOrderModal} onOpenChange={setNewOrderModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-orange-500">
              <Plus className="w-5 h-5 inline mr-2" />
              New Refinish Order
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleCreateNewOrder} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Order # *
                </Label>
                <Input
                  value={newOrderData.order_number}
                  onChange={(e) => setNewOrderData({ ...newOrderData, order_number: e.target.value })}
                  className="bg-zinc-950 border-zinc-700 font-mono text-sm"
                  placeholder="CF-XXXX"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Quantity
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={newOrderData.quantity}
                  onChange={(e) => setNewOrderData({ ...newOrderData, quantity: parseInt(e.target.value) || 1 })}
                  className="bg-zinc-950 border-zinc-700 font-mono text-sm"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Customer Name *
              </Label>
              <Input
                value={newOrderData.customer_name}
                onChange={(e) => setNewOrderData({ ...newOrderData, customer_name: e.target.value })}
                className="bg-zinc-950 border-zinc-700 font-mono text-sm"
                placeholder="Customer name"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Phone
              </Label>
              <Input
                value={newOrderData.phone}
                onChange={(e) => setNewOrderData({ ...newOrderData, phone: e.target.value })}
                className="bg-zinc-950 border-zinc-700 font-mono text-sm"
                placeholder="(XXX)-XXX-XXXX"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Product Type *
                </Label>
                <Select 
                  value={newOrderData.product_type} 
                  onValueChange={(v) => setNewOrderData({ ...newOrderData, product_type: v })}
                >
                  <SelectTrigger className="bg-zinc-950 border-zinc-700 font-mono text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {Object.entries(PRODUCT_TYPES).map(([key, { label }]) => (
                      <SelectItem key={key} value={key} className="font-mono">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {newOrderData.product_type === "rim" && (
                <div className="space-y-2">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Rim Size
                  </Label>
                  <Select 
                    value={newOrderData.rim_size} 
                    onValueChange={(v) => setNewOrderData({ ...newOrderData, rim_size: v })}
                  >
                    <SelectTrigger className="bg-zinc-950 border-zinc-700 font-mono text-sm">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {["19", "20", "21", "22", "24", "26", "28", "30", "32", "34"].map(size => (
                        <SelectItem key={size} value={size} className="font-mono">{size}"</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Wheel Specs
              </Label>
              <Input
                value={newOrderData.wheel_specs}
                onChange={(e) => setNewOrderData({ ...newOrderData, wheel_specs: e.target.value })}
                className="bg-zinc-950 border-zinc-700 font-mono text-sm"
                placeholder="22x10 -12 offset"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                What Needs Fixing? *
              </Label>
              <Textarea
                value={newOrderData.fix_notes}
                onChange={(e) => setNewOrderData({ ...newOrderData, fix_notes: e.target.value })}
                className="bg-zinc-950 border-zinc-700 font-mono text-sm min-h-[100px]"
                placeholder="Describe the issue that needs to be fixed..."
                required
              />
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewOrderModal(false)}
                className="flex-1 border-zinc-700 font-oswald uppercase tracking-widest"
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-orange-500 hover:bg-orange-400 text-white font-oswald uppercase tracking-widest"
                disabled={creating}
              >
                {creating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Order
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
