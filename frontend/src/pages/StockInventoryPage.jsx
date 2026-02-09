import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  Edit3,
  ShoppingCart,
  LogOut,
  MapPin,
  Filter,
  Download,
  Upload
} from "lucide-react";

// Rim/Wheel icon component
const RimIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="5" x2="12" y2="9" />
    <line x1="12" y1="15" x2="12" y2="19" />
    <line x1="5" y1="12" x2="9" y2="12" />
    <line x1="15" y1="12" x2="19" y2="12" />
    <line x1="6.5" y1="6.5" x2="9.5" y2="9.5" />
    <line x1="14.5" y1="14.5" x2="17.5" y2="17.5" />
    <line x1="6.5" y1="17.5" x2="9.5" y2="14.5" />
    <line x1="14.5" y1="9.5" x2="17.5" y2="6.5" />
  </svg>
);

// Steering Wheel icon component
const SteeringWheelIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="9" x2="12" y2="2" />
    <line x1="9.5" y1="14" x2="4" y2="18" />
    <line x1="14.5" y1="14" x2="20" y2="18" />
  </svg>
);

const STATUS_COLORS = {
  available: "bg-green-500/20 text-green-400 border-green-500",
  reserved: "bg-yellow-500/20 text-yellow-400 border-yellow-500",
  sold: "bg-zinc-500/20 text-zinc-400 border-zinc-500"
};

const SIZE_COLORS = {
  "19": "bg-pink-500/20 text-pink-400",
  "20": "bg-blue-500/20 text-blue-400",
  "22": "bg-green-500/20 text-green-400",
  "24": "bg-yellow-500/20 text-yellow-400",
  "26": "bg-orange-500/20 text-orange-400",
  "28": "bg-red-500/20 text-red-400"
};

const emptyRimForm = {
  sku: "",
  name: "",
  size: "",
  bolt_pattern: "",
  cf_caps: "",
  finish: "",
  original_order_number: "",
  fitment: "",
  cubby_number: "",
  notes: ""
};

const emptyWheelForm = {
  sku: "",
  brand: "",
  model: "",
  finish: "",
  original_order_number: "",
  cubby_number: "",
  notes: ""
};

export default function StockInventoryPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  // Active tab
  const [activeTab, setActiveTab] = useState("rims");
  
  // Rims state
  const [stockSets, setStockSets] = useState([]);
  const [rimSearchQuery, setRimSearchQuery] = useState("");
  const [rimStatusFilter, setRimStatusFilter] = useState("all");
  const [rimSizeFilter, setRimSizeFilter] = useState("all");
  
  // Steering Wheels state
  const [steeringWheels, setSteeringWheels] = useState([]);
  const [wheelSearchQuery, setWheelSearchQuery] = useState("");
  const [wheelStatusFilter, setWheelStatusFilter] = useState("all");
  
  // Common state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Modals - Rims
  const [showAddRimModal, setShowAddRimModal] = useState(false);
  const [editingRim, setEditingRim] = useState(null);
  const [sellRimModal, setSellRimModal] = useState(null);
  const [rimFormData, setRimFormData] = useState(emptyRimForm);
  const [sellRimFormData, setSellRimFormData] = useState({ customer_name: "", phone: "", notes: "" });
  const [rimCubbyModal, setRimCubbyModal] = useState(null);
  const [rimCubbyValue, setRimCubbyValue] = useState("");
  
  // Modals - Steering Wheels
  const [showAddWheelModal, setShowAddWheelModal] = useState(false);
  const [editingWheel, setEditingWheel] = useState(null);
  const [sellWheelModal, setSellWheelModal] = useState(null);
  const [wheelFormData, setWheelFormData] = useState(emptyWheelForm);
  const [sellWheelFormData, setSellWheelFormData] = useState({ customer_name: "", phone: "", notes: "" });
  const [wheelCubbyModal, setWheelCubbyModal] = useState(null);
  const [wheelCubbyValue, setWheelCubbyValue] = useState("");

  const isAdmin = user?.role === "admin";
  const isSales = user?.departments?.includes("received") || user?.department === "received";

  useEffect(() => {
    if (!isAdmin && !isSales) {
      toast.error("Access denied - Sales or Admin only");
      navigate("/");
      return;
    }
    fetchAll();
  }, []);

  const fetchAll = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const [rimsRes, wheelsRes] = await Promise.all([
        axios.get(`${API}/stock-inventory`),
        axios.get(`${API}/stock-steering-wheels`)
      ]);
      setStockSets(rimsRes.data || []);
      setSteeringWheels(wheelsRes.data || []);
    } catch (error) {
      console.error("Stock inventory error:", error);
      toast.error("Failed to load stock inventory");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ============ RIM FUNCTIONS ============
  const handleRimCubbyUpdate = async () => {
    if (!rimCubbyModal) return;
    try {
      await axios.put(`${API}/stock-inventory/${rimCubbyModal.id}`, { cubby_number: rimCubbyValue });
      toast.success(`Cubby updated to #${rimCubbyValue}`);
      setRimCubbyModal(null);
      setRimCubbyValue("");
      fetchAll(true);
    } catch (error) {
      toast.error("Failed to update cubby");
    }
  };

  const handleRimSubmit = async (e) => {
    e.preventDefault();
    if (!rimFormData.sku || !rimFormData.name || !rimFormData.size || !rimFormData.bolt_pattern) {
      toast.error("SKU, Name, Size, and Bolt Pattern are required");
      return;
    }
    try {
      if (editingRim) {
        await axios.put(`${API}/stock-inventory/${editingRim.id}`, rimFormData);
        toast.success("Stock set updated");
      } else {
        await axios.post(`${API}/stock-inventory`, rimFormData);
        toast.success("Stock set added");
      }
      setShowAddRimModal(false);
      setEditingRim(null);
      setRimFormData(emptyRimForm);
      fetchAll(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save stock set");
    }
  };

  const deleteRim = async (stockId) => {
    if (!confirm("Are you sure you want to delete this stock set?")) return;
    try {
      await axios.delete(`${API}/stock-inventory/${stockId}`);
      toast.success("Stock set deleted");
      fetchAll(true);
    } catch (error) {
      toast.error("Failed to delete stock set");
    }
  };

  const createOrderFromRim = () => {
    if (!sellRimModal) return;
    
    // Navigate to dashboard with stock data pre-filled
    const stockData = {
      from_stock_type: "rim",
      from_stock_id: sellRimModal.id,
      from_stock_sku: sellRimModal.sku,
      wheel_specs: `${sellRimModal.name || ""} - ${sellRimModal.size || ""} - ${sellRimModal.bolt_pattern || ""}`.trim(),
      rim_size: sellRimModal.size?.replace('"', '') || "",
      has_custom_caps: !!sellRimModal.cf_caps,
      notes: `From Stock: SKU ${sellRimModal.sku}`,
      fitment: sellRimModal.fitment || ""
    };
    
    // Navigate with state
    navigate("/", { 
      state: { 
        newOrder: true, 
        stockData 
      } 
    });
    
    setSellRimModal(null);
    setSellRimFormData({ customer_name: "", phone: "", notes: "" });
  };

  const openEditRimModal = (stock) => {
    setEditingRim(stock);
    setRimFormData({
      sku: stock.sku || "",
      name: stock.name || "",
      size: stock.size || "",
      bolt_pattern: stock.bolt_pattern || "",
      cf_caps: stock.cf_caps || "",
      finish: stock.finish || "",
      original_order_number: stock.original_order_number || "",
      fitment: stock.fitment || "",
      cubby_number: stock.cubby_number || "",
      notes: stock.notes || ""
    });
    setShowAddRimModal(true);
  };

  // ============ STEERING WHEEL FUNCTIONS ============
  const handleWheelCubbyUpdate = async () => {
    if (!wheelCubbyModal) return;
    try {
      await axios.put(`${API}/stock-steering-wheels/${wheelCubbyModal.id}`, { cubby_number: wheelCubbyValue });
      toast.success(`Cubby updated to #${wheelCubbyValue}`);
      setWheelCubbyModal(null);
      setWheelCubbyValue("");
      fetchAll(true);
    } catch (error) {
      toast.error("Failed to update cubby");
    }
  };

  const handleWheelSubmit = async (e) => {
    e.preventDefault();
    if (!wheelFormData.sku || !wheelFormData.brand) {
      toast.error("SKU and Brand are required");
      return;
    }
    try {
      if (editingWheel) {
        await axios.put(`${API}/stock-steering-wheels/${editingWheel.id}`, wheelFormData);
        toast.success("Steering wheel updated");
      } else {
        await axios.post(`${API}/stock-steering-wheels`, wheelFormData);
        toast.success("Steering wheel added");
      }
      setShowAddWheelModal(false);
      setEditingWheel(null);
      setWheelFormData(emptyWheelForm);
      fetchAll(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save steering wheel");
    }
  };

  const deleteWheel = async (wheelId) => {
    if (!confirm("Are you sure you want to delete this steering wheel?")) return;
    try {
      await axios.delete(`${API}/stock-steering-wheels/${wheelId}`);
      toast.success("Steering wheel deleted");
      fetchAll(true);
    } catch (error) {
      toast.error("Failed to delete steering wheel");
    }
  };

  // Auto-generate next SKU for new steering wheel
  const openAddWheelModal = async () => {
    try {
      const res = await axios.get(`${API}/stock-steering-wheels/next-sku`);
      setWheelFormData({ ...emptyWheelForm, sku: res.data.next_sku });
    } catch (error) {
      // Fallback to empty SKU if API fails
      setWheelFormData(emptyWheelForm);
    }
    setEditingWheel(null);
    setShowAddWheelModal(true);
  };

  const createOrderFromWheel = () => {
    if (!sellWheelModal) return;
    
    // Navigate to dashboard with stock data pre-filled
    const stockData = {
      from_stock_type: "steering_wheel",
      from_stock_id: sellWheelModal.id,
      from_stock_sku: sellWheelModal.sku,
      steering_wheel_brand: sellWheelModal.brand || "",
      wheel_specs: `${sellWheelModal.brand || ""} ${sellWheelModal.model || ""}`.trim(),
      notes: `From Stock: SKU ${sellWheelModal.sku}`,
      product_type: "steering_wheel"
    };
    
    // Navigate with state
    navigate("/", { 
      state: { 
        newOrder: true, 
        stockData 
      } 
    });
    
    setSellWheelModal(null);
    setSellWheelFormData({ customer_name: "", phone: "", notes: "" });
  };

  const openEditWheelModal = (wheel) => {
    setEditingWheel(wheel);
    setWheelFormData({
      sku: wheel.sku || "",
      brand: wheel.brand || "",
      model: wheel.model || "",
      finish: wheel.finish || "",
      original_order_number: wheel.original_order_number || "",
      cubby_number: wheel.cubby_number || "",
      notes: wheel.notes || ""
    });
    setShowAddWheelModal(true);
  };

  // ============ FILTERING ============
  const filteredRims = stockSets.filter(stock => {
    if (rimStatusFilter !== "all" && stock.status !== rimStatusFilter) return false;
    if (rimSizeFilter !== "all" && !stock.size?.includes(rimSizeFilter)) return false;
    if (rimSearchQuery) {
      const q = rimSearchQuery.toLowerCase();
      return (
        stock.sku?.toLowerCase().includes(q) ||
        stock.name?.toLowerCase().includes(q) ||
        stock.bolt_pattern?.toLowerCase().includes(q) ||
        stock.cubby_number?.toLowerCase().includes(q) ||
        stock.fitment?.toLowerCase().includes(q) ||
        stock.original_order_number?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredWheels = steeringWheels.filter(wheel => {
    if (wheelStatusFilter !== "all" && wheel.status !== wheelStatusFilter) return false;
    if (wheelSearchQuery) {
      const q = wheelSearchQuery.toLowerCase();
      return (
        wheel.sku?.toLowerCase().includes(q) ||
        wheel.brand?.toLowerCase().includes(q) ||
        wheel.model?.toLowerCase().includes(q) ||
        wheel.cubby_number?.toLowerCase().includes(q) ||
        wheel.original_order_number?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Stats
  const rimAvailable = stockSets.filter(s => s.status === "available").length;
  const rimReserved = stockSets.filter(s => s.status === "reserved").length;
  const rimSold = stockSets.filter(s => s.status === "sold").length;
  
  const wheelAvailable = steeringWheels.filter(s => s.status === "available").length;
  const wheelReserved = steeringWheels.filter(s => s.status === "reserved").length;
  const wheelSold = steeringWheels.filter(s => s.status === "sold").length;

  const uniqueSizes = [...new Set(stockSets.map(s => s.size?.replace('"', '').replace('"', '').split('/')[0]))].filter(Boolean).sort();

  // Export functions
  const exportRimsToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(20);
    doc.setTextColor(0, 180, 200);
    doc.text("CORLEONE FORGED - STOCK RIMS", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
    doc.text(`Total: ${filteredRims.length} sets | Available: ${rimAvailable} | Reserved: ${rimReserved} | Sold: ${rimSold}`, 14, 28);
    
    const tableData = filteredRims.map(stock => [
      stock.sku || "-", stock.name || "-", stock.size || "-", stock.bolt_pattern || "-",
      stock.finish || "-", stock.cf_caps || "-", stock.cubby_number || "-", stock.fitment || "-",
      stock.status?.toUpperCase() || "-"
    ]);
    
    autoTable(doc, {
      startY: 35,
      head: [["SKU", "Name", "Size", "Bolt Pattern", "Finish", "CF Caps", "Cubby #", "Fitment", "Status"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [0, 180, 200], textColor: [0, 0, 0], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    
    doc.save(`stock-rims-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("Stock rims exported to PDF!");
  };

  const exportWheelsToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(20);
    doc.setTextColor(138, 43, 226);
    doc.text("CORLEONE FORGED - STOCK STEERING WHEELS", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
    doc.text(`Total: ${filteredWheels.length} | Available: ${wheelAvailable} | Reserved: ${wheelReserved} | Sold: ${wheelSold}`, 14, 28);
    
    const tableData = filteredWheels.map(wheel => [
      wheel.sku || "-", wheel.brand || "-", wheel.model || "-", wheel.finish || "-",
      wheel.cubby_number || "-", wheel.original_order_number || "-", wheel.status?.toUpperCase() || "-"
    ]);
    
    autoTable(doc, {
      startY: 35,
      head: [["SKU", "Brand", "Model", "Finish", "Cubby #", "Original Order", "Status"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [138, 43, 226], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    
    doc.save(`stock-steering-wheels-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("Stock steering wheels exported to PDF!");
  };

  // Import CSV for rims
  const handleImportRimCSV = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        const lines = text.split("\n").filter(line => line.trim());
        let imported = 0, errors = 0;
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",");
          if (values.length < 3) continue;
          const stockData = {
            sku: values[0]?.trim() || `IMPORT-${Date.now()}-${i}`,
            name: values[1]?.trim() || "",
            size: values[2]?.trim() || "",
            bolt_pattern: values[3]?.trim() || "",
            finish: values[4]?.trim() || "",
            cf_caps: values[5]?.trim() || "",
            cubby_number: values[6]?.trim() || "",
            fitment: values[7]?.trim() || "",
            original_order_number: values[8]?.trim() || "",
            notes: values[9]?.trim()?.replace(/;/g, ",") || ""
          };
          try {
            await axios.post(`${API}/stock-inventory`, stockData);
            imported++;
          } catch (err) {
            errors++;
          }
        }
        toast.success(`Imported ${imported} stock sets${errors > 0 ? `, ${errors} failed` : ""}`);
        fetchAll();
      } catch (err) {
        toast.error("Failed to parse CSV file");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-cyan-500 font-oswald uppercase tracking-widest animate-pulse">
          Loading Stock Inventory...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-zinc-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <h1 className="font-oswald text-xl md:text-2xl uppercase tracking-widest text-cyan-500">
                Stock Inventory
              </h1>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => navigate("/?newOrder=true")} className="bg-red-500 hover:bg-red-400 text-white font-mono text-xs">
                <Plus className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">New Order</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => fetchAll(true)} disabled={refreshing} className="text-zinc-400 hover:text-white">
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <span className="text-zinc-500 font-mono text-xs hidden md:block">{user?.name}</span>
              <Button variant="ghost" size="sm" onClick={logout} className="text-zinc-400 hover:text-red-500">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-zinc-900 border border-zinc-800 mb-6">
            <TabsTrigger 
              value="rims" 
              className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black font-oswald uppercase tracking-wider"
              data-testid="rims-tab"
            >
              <RimIcon className="w-4 h-4 mr-2" />
              Stock Rims ({stockSets.length})
            </TabsTrigger>
            <TabsTrigger 
              value="steering" 
              className="data-[state=active]:bg-violet-500 data-[state=active]:text-white font-oswald uppercase tracking-wider"
              data-testid="steering-wheels-tab"
            >
              <SteeringWheelIcon className="w-4 h-4 mr-2" />
              Steering Wheels ({steeringWheels.length})
            </TabsTrigger>
          </TabsList>

          {/* RIMS TAB */}
          <TabsContent value="rims">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="bg-green-500/10 border-green-500/30">
                <CardContent className="py-4 text-center">
                  <p className="text-3xl font-oswald text-green-400">{rimAvailable}</p>
                  <p className="text-xs text-green-500 uppercase tracking-wider">Available</p>
                </CardContent>
              </Card>
              <Card className="bg-yellow-500/10 border-yellow-500/30">
                <CardContent className="py-4 text-center">
                  <p className="text-3xl font-oswald text-yellow-400">{rimReserved}</p>
                  <p className="text-xs text-yellow-500 uppercase tracking-wider">Reserved</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-500/10 border-zinc-500/30">
                <CardContent className="py-4 text-center">
                  <p className="text-3xl font-oswald text-zinc-400">{rimSold}</p>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Sold</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters & Actions */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  type="text"
                  placeholder="Search SKU, name, bolt pattern..."
                  value={rimSearchQuery}
                  onChange={(e) => setRimSearchQuery(e.target.value)}
                  className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>
              
              <Select value={rimStatusFilter} onValueChange={setRimStatusFilter}>
                <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-700">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                </SelectContent>
              </Select>

              <Select value={rimSizeFilter} onValueChange={setRimSizeFilter}>
                <SelectTrigger className="w-[130px] bg-zinc-900 border-zinc-700">
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="all">All Sizes</SelectItem>
                  {uniqueSizes.map(size => (
                    <SelectItem key={size} value={size}>{size}&quot;</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button size="sm" onClick={() => { setEditingRim(null); setRimFormData(emptyRimForm); setShowAddRimModal(true); }} className="bg-cyan-500 hover:bg-cyan-600 text-black font-mono text-xs">
                <Plus className="w-4 h-4 mr-1" />
                Add Rim
              </Button>
              <Button size="sm" variant="outline" onClick={exportRimsToPDF} className="border-cyan-700 text-cyan-500 hover:bg-cyan-500/10 font-mono text-xs">
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
              <label>
                <Button size="sm" variant="outline" className="border-purple-700 text-purple-500 hover:bg-purple-500/10 font-mono text-xs cursor-pointer" asChild>
                  <span><Upload className="w-4 h-4 mr-1" />Import</span>
                </Button>
                <input type="file" accept=".csv" onChange={handleImportRimCSV} className="hidden" />
              </label>
            </div>

            {/* Rims Grid */}
            {filteredRims.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="py-12 text-center">
                  <RimIcon className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
                  <p className="text-zinc-500 font-mono">
                    {rimSearchQuery || rimStatusFilter !== "all" || rimSizeFilter !== "all" 
                      ? "No stock sets match your filters" 
                      : "No stock sets in inventory"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredRims.map((stock) => (
                  <Card key={stock.id} className={`bg-zinc-900/80 border-zinc-800 hover:border-cyan-500/50 transition-colors ${stock.status === 'sold' ? 'opacity-60' : ''}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="font-mono text-sm text-cyan-400">{stock.sku}</CardTitle>
                          <p className="font-oswald text-lg text-white mt-1">{stock.name}</p>
                        </div>
                        <Badge className={STATUS_COLORS[stock.status] || STATUS_COLORS.available}>{stock.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-zinc-500">Size</p>
                          <Badge className={SIZE_COLORS[stock.size?.replace('"', '').split('/')[0]] || "bg-zinc-700"}>{stock.size}</Badge>
                        </div>
                        <div>
                          <p className="text-zinc-500">Bolt Pattern</p>
                          <p className="text-zinc-300 font-mono">{stock.bolt_pattern}</p>
                        </div>
                        {stock.cf_caps && <div><p className="text-zinc-500">Caps</p><p className="text-zinc-300 font-mono">{stock.cf_caps}</p></div>}
                        {stock.finish && <div><p className="text-zinc-500">Finish</p><p className="text-zinc-300 font-mono">{stock.finish}</p></div>}
                        {stock.fitment && <div className="col-span-2"><p className="text-zinc-500">Fitment</p><p className="text-zinc-300 font-mono">{stock.fitment}</p></div>}
                      </div>
                      <div 
                        className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 cursor-pointer hover:bg-amber-500/20 transition-colors"
                        onClick={(e) => { e.stopPropagation(); setRimCubbyModal(stock); setRimCubbyValue(stock.cubby_number || ""); }}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-amber-400" />
                          <span className="text-sm text-amber-400 font-mono font-bold">{stock.cubby_number ? `Cubby #${stock.cubby_number}` : "No Cubby Set"}</span>
                        </div>
                        <Edit3 className="w-3 h-3 text-amber-400" />
                      </div>
                      {stock.original_order_number && <p className="text-xs text-zinc-600">Original Order: #{stock.original_order_number}</p>}
                      {stock.status === "sold" && stock.sold_to_order_number && (
                        <div className="bg-zinc-800/50 rounded px-2 py-1"><p className="text-xs text-zinc-500">Sold as Order #{stock.sold_to_order_number}</p></div>
                      )}
                      {stock.status !== "sold" && (
                        <div className="flex gap-2 pt-2 border-t border-zinc-800">
                          <Button size="sm" variant="outline" onClick={() => openEditRimModal(stock)} className="flex-1 border-zinc-700 hover:border-cyan-500 text-cyan-500 text-xs"><Edit3 className="w-3 h-3 mr-1" />Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => setSellRimModal(stock)} className="flex-1 border-zinc-700 hover:border-green-500 text-green-500 text-xs"><ShoppingCart className="w-3 h-3 mr-1" />Sell</Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteRim(stock.id)} className="text-red-500 hover:text-red-400 text-xs px-2"><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* STEERING WHEELS TAB */}
          <TabsContent value="steering">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="bg-green-500/10 border-green-500/30">
                <CardContent className="py-4 text-center">
                  <p className="text-3xl font-oswald text-green-400">{wheelAvailable}</p>
                  <p className="text-xs text-green-500 uppercase tracking-wider">Available</p>
                </CardContent>
              </Card>
              <Card className="bg-yellow-500/10 border-yellow-500/30">
                <CardContent className="py-4 text-center">
                  <p className="text-3xl font-oswald text-yellow-400">{wheelReserved}</p>
                  <p className="text-xs text-yellow-500 uppercase tracking-wider">Reserved</p>
                </CardContent>
              </Card>
              <Card className="bg-zinc-500/10 border-zinc-500/30">
                <CardContent className="py-4 text-center">
                  <p className="text-3xl font-oswald text-zinc-400">{wheelSold}</p>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Sold</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters & Actions */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  type="text"
                  placeholder="Search SKU, brand, model..."
                  value={wheelSearchQuery}
                  onChange={(e) => setWheelSearchQuery(e.target.value)}
                  className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>
              
              <Select value={wheelStatusFilter} onValueChange={setWheelStatusFilter}>
                <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-700">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                </SelectContent>
              </Select>

              <Button size="sm" onClick={openAddWheelModal} className="bg-violet-500 hover:bg-violet-600 text-white font-mono text-xs" data-testid="add-steering-wheel-btn">
                <Plus className="w-4 h-4 mr-1" />
                Add Steering Wheel
              </Button>
              <Button size="sm" variant="outline" onClick={exportWheelsToPDF} className="border-violet-700 text-violet-500 hover:bg-violet-500/10 font-mono text-xs">
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
            </div>

            {/* Steering Wheels Grid */}
            {filteredWheels.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="py-12 text-center">
                  <SteeringWheelIcon className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
                  <p className="text-zinc-500 font-mono">
                    {wheelSearchQuery || wheelStatusFilter !== "all" 
                      ? "No steering wheels match your filters" 
                      : "No steering wheels in inventory. Click 'Add Steering Wheel' to add one."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredWheels.map((wheel) => (
                  <Card key={wheel.id} className={`bg-zinc-900/80 border-zinc-800 hover:border-violet-500/50 transition-colors ${wheel.status === 'sold' ? 'opacity-60' : ''}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="font-mono text-sm text-violet-400">{wheel.sku}</CardTitle>
                          <p className="font-oswald text-lg text-white mt-1">{wheel.brand}</p>
                          {wheel.model && <p className="text-sm text-zinc-400">{wheel.model}</p>}
                        </div>
                        <Badge className={STATUS_COLORS[wheel.status] || STATUS_COLORS.available}>{wheel.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {wheel.finish && <div><p className="text-zinc-500">Finish</p><p className="text-zinc-300 font-mono">{wheel.finish}</p></div>}
                        {wheel.original_order_number && <div><p className="text-zinc-500">Original Order</p><p className="text-zinc-300 font-mono">#{wheel.original_order_number}</p></div>}
                      </div>
                      {wheel.notes && <p className="text-xs text-zinc-500 italic">{wheel.notes}</p>}
                      <div 
                        className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 cursor-pointer hover:bg-amber-500/20 transition-colors"
                        onClick={(e) => { e.stopPropagation(); setWheelCubbyModal(wheel); setWheelCubbyValue(wheel.cubby_number || ""); }}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-amber-400" />
                          <span className="text-sm text-amber-400 font-mono font-bold">{wheel.cubby_number ? `Cubby #${wheel.cubby_number}` : "No Cubby Set"}</span>
                        </div>
                        <Edit3 className="w-3 h-3 text-amber-400" />
                      </div>
                      {wheel.status === "sold" && wheel.sold_to_order_number && (
                        <div className="bg-zinc-800/50 rounded px-2 py-1"><p className="text-xs text-zinc-500">Sold as Order #{wheel.sold_to_order_number}</p></div>
                      )}
                      {wheel.status !== "sold" && (
                        <div className="flex gap-2 pt-2 border-t border-zinc-800">
                          <Button size="sm" variant="outline" onClick={() => openEditWheelModal(wheel)} className="flex-1 border-zinc-700 hover:border-violet-500 text-violet-500 text-xs"><Edit3 className="w-3 h-3 mr-1" />Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => setSellWheelModal(wheel)} className="flex-1 border-zinc-700 hover:border-green-500 text-green-500 text-xs"><ShoppingCart className="w-3 h-3 mr-1" />Sell</Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteWheel(wheel.id)} className="text-red-500 hover:text-red-400 text-xs px-2"><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ============ MODALS - RIMS ============ */}
      {/* Add/Edit Rim Modal */}
      <Dialog open={showAddRimModal} onOpenChange={() => { setShowAddRimModal(false); setEditingRim(null); setRimFormData(emptyRimForm); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-cyan-500">
              {editingRim ? "Edit Stock Rim" : "Add Stock Rim"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRimSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400">SKU # *</Label><Input value={rimFormData.sku} onChange={(e) => setRimFormData({ ...rimFormData, sku: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="SF-1234" required /></div>
              <div><Label className="text-zinc-400">Name *</Label><Input value={rimFormData.name} onChange={(e) => setRimFormData({ ...rimFormData, name: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="BARBOZA" required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400">Size *</Label><Input value={rimFormData.size} onChange={(e) => setRimFormData({ ...rimFormData, size: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder='26"' required /></div>
              <div><Label className="text-zinc-400">Bolt Pattern *</Label><Input value={rimFormData.bolt_pattern} onChange={(e) => setRimFormData({ ...rimFormData, bolt_pattern: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="5X5" required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400">CF Caps</Label><Input value={rimFormData.cf_caps} onChange={(e) => setRimFormData({ ...rimFormData, cf_caps: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="XXL CAP" /></div>
              <div><Label className="text-zinc-400">Finish</Label><Input value={rimFormData.finish} onChange={(e) => setRimFormData({ ...rimFormData, finish: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="CHROME" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400">Original Order #</Label><Input value={rimFormData.original_order_number} onChange={(e) => setRimFormData({ ...rimFormData, original_order_number: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="5622" /></div>
              <div><Label className="text-zinc-400">Fitment</Label><Input value={rimFormData.fitment} onChange={(e) => setRimFormData({ ...rimFormData, fitment: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="FORD TRUCK" /></div>
            </div>
            <div><Label className="text-zinc-400">Cubby # (Location)</Label><Input value={rimFormData.cubby_number} onChange={(e) => setRimFormData({ ...rimFormData, cubby_number: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="12" /></div>
            <div><Label className="text-zinc-400">Notes</Label><Input value={rimFormData.notes} onChange={(e) => setRimFormData({ ...rimFormData, notes: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="Additional notes..." /></div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-black">{editingRim ? "Update" : "Add Stock Rim"}</Button>
              <Button type="button" variant="outline" onClick={() => { setShowAddRimModal(false); setEditingRim(null); setRimFormData(emptyRimForm); }} className="flex-1 border-zinc-700">Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sell Rim Modal - Now just shows info and navigates to order form */}
      <Dialog open={!!sellRimModal} onOpenChange={() => { setSellRimModal(null); setSellRimFormData({ customer_name: "", phone: "", notes: "" }); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-green-500">
              <ShoppingCart className="w-5 h-5 inline mr-2" />Create Order from Stock Rim
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {sellRimModal && (
              <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1">
                <p className="font-mono text-sm text-cyan-400">{sellRimModal.sku}</p>
                <p className="font-oswald text-white">{sellRimModal.name}</p>
                <p className="text-xs text-zinc-400">{sellRimModal.size} - {sellRimModal.bolt_pattern}</p>
                {sellRimModal.fitment && <p className="text-xs text-zinc-500">Fitment: {sellRimModal.fitment}</p>}
                {sellRimModal.cf_caps && <p className="text-xs text-zinc-500">Caps: {sellRimModal.cf_caps}</p>}
              </div>
            )}
            <p className="text-sm text-zinc-400">
              This will open the new order form with stock rim details pre-filled. You can add customer information and additional details there.
            </p>
            <div className="flex gap-2 pt-4">
              <Button onClick={createOrderFromRim} className="flex-1 bg-green-500 hover:bg-green-600 text-black">
                <Plus className="w-4 h-4 mr-1" />
                Continue to Order Form
              </Button>
              <Button variant="outline" onClick={() => { setSellRimModal(null); setSellRimFormData({ customer_name: "", phone: "", notes: "" }); }} className="flex-1 border-zinc-700">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rim Cubby Edit Modal */}
      <Dialog open={!!rimCubbyModal} onOpenChange={() => { setRimCubbyModal(null); setRimCubbyValue(""); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-amber-500 flex items-center gap-2">
              <MapPin className="w-5 h-5" />Set Cubby Location
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {rimCubbyModal && (
              <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1">
                <p className="font-mono text-sm text-cyan-400">{rimCubbyModal.sku}</p>
                <p className="font-oswald text-white">{rimCubbyModal.name}</p>
                <p className="text-xs text-zinc-400">{rimCubbyModal.size} - {rimCubbyModal.bolt_pattern}</p>
              </div>
            )}
            <div>
              <Label className="text-zinc-400">Cubby Number</Label>
              <Input type="text" value={rimCubbyValue} onChange={(e) => setRimCubbyValue(e.target.value)} className="bg-zinc-800 border-zinc-700 text-2xl text-center font-mono font-bold mt-1" placeholder="Enter cubby #" autoFocus />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleRimCubbyUpdate} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black"><MapPin className="w-4 h-4 mr-1" />Save Cubby</Button>
              <Button variant="outline" onClick={() => { setRimCubbyModal(null); setRimCubbyValue(""); }} className="flex-1 border-zinc-700">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ MODALS - STEERING WHEELS ============ */}
      {/* Add/Edit Wheel Modal */}
      <Dialog open={showAddWheelModal} onOpenChange={() => { setShowAddWheelModal(false); setEditingWheel(null); setWheelFormData(emptyWheelForm); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-violet-500">
              <SteeringWheelIcon className="w-5 h-5 inline mr-2" />
              {editingWheel ? "Edit Steering Wheel" : "Add Steering Wheel"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleWheelSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400">SKU # *</Label><Input value={wheelFormData.sku} onChange={(e) => setWheelFormData({ ...wheelFormData, sku: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="SW-001" required data-testid="wheel-sku-input" /></div>
              <div><Label className="text-zinc-400">DESIGN *</Label><Input value={wheelFormData.brand} onChange={(e) => setWheelFormData({ ...wheelFormData, brand: e.target.value.toUpperCase() })} className="bg-zinc-800 border-zinc-700 uppercase" placeholder="GRANT" required data-testid="wheel-brand-input" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400">Model</Label><Input value={wheelFormData.model} onChange={(e) => setWheelFormData({ ...wheelFormData, model: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="Classic 500" /></div>
              <div><Label className="text-zinc-400">Finish</Label><Input value={wheelFormData.finish} onChange={(e) => setWheelFormData({ ...wheelFormData, finish: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="Black / Chrome" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400">Original Order #</Label><Input value={wheelFormData.original_order_number} onChange={(e) => setWheelFormData({ ...wheelFormData, original_order_number: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="5622" /></div>
              <div><Label className="text-zinc-400">Cubby # (Location)</Label><Input value={wheelFormData.cubby_number} onChange={(e) => setWheelFormData({ ...wheelFormData, cubby_number: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="12" /></div>
            </div>
            <div><Label className="text-zinc-400">Notes</Label><Input value={wheelFormData.notes} onChange={(e) => setWheelFormData({ ...wheelFormData, notes: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="Additional notes..." /></div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1 bg-violet-500 hover:bg-violet-600 text-white" data-testid="submit-wheel-btn">{editingWheel ? "Update" : "Add Steering Wheel"}</Button>
              <Button type="button" variant="outline" onClick={() => { setShowAddWheelModal(false); setEditingWheel(null); setWheelFormData(emptyWheelForm); }} className="flex-1 border-zinc-700">Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sell Wheel Modal - Now just shows info and navigates to order form */}
      <Dialog open={!!sellWheelModal} onOpenChange={() => { setSellWheelModal(null); setSellWheelFormData({ customer_name: "", phone: "", notes: "" }); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-green-500">
              <ShoppingCart className="w-5 h-5 inline mr-2" />Create Order from Steering Wheel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {sellWheelModal && (
              <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1">
                <p className="font-mono text-sm text-violet-400">{sellWheelModal.sku}</p>
                <p className="font-oswald text-white">{sellWheelModal.brand} {sellWheelModal.model}</p>
                {sellWheelModal.finish && <p className="text-xs text-zinc-400">Finish: {sellWheelModal.finish}</p>}
              </div>
            )}
            <p className="text-sm text-zinc-400">
              This will open the new order form with steering wheel details pre-filled. You can add customer information and additional details there.
            </p>
            <div className="flex gap-2 pt-4">
              <Button onClick={createOrderFromWheel} className="flex-1 bg-green-500 hover:bg-green-600 text-black">
                <Plus className="w-4 h-4 mr-1" />
                Continue to Order Form
              </Button>
              <Button variant="outline" onClick={() => { setSellWheelModal(null); setSellWheelFormData({ customer_name: "", phone: "", notes: "" }); }} className="flex-1 border-zinc-700">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wheel Cubby Edit Modal */}
      <Dialog open={!!wheelCubbyModal} onOpenChange={() => { setWheelCubbyModal(null); setWheelCubbyValue(""); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-amber-500 flex items-center gap-2">
              <MapPin className="w-5 h-5" />Set Cubby Location
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {wheelCubbyModal && (
              <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1">
                <p className="font-mono text-sm text-violet-400">{wheelCubbyModal.sku}</p>
                <p className="font-oswald text-white">{wheelCubbyModal.brand} {wheelCubbyModal.model}</p>
              </div>
            )}
            <div>
              <Label className="text-zinc-400">Cubby Number</Label>
              <Input type="text" value={wheelCubbyValue} onChange={(e) => setWheelCubbyValue(e.target.value)} className="bg-zinc-800 border-zinc-700 text-2xl text-center font-mono font-bold mt-1" placeholder="Enter cubby #" autoFocus />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleWheelCubbyUpdate} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black"><MapPin className="w-4 h-4 mr-1" />Save Cubby</Button>
              <Button variant="outline" onClick={() => { setWheelCubbyModal(null); setWheelCubbyValue(""); }} className="flex-1 border-zinc-700">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
