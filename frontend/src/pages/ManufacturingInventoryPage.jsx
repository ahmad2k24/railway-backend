import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Plus,
  Package,
  ArrowRightLeft,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  MapPin,
  FileText,
  Bell,
  Loader2,
  Paintbrush,
  Sparkles,
  Wrench,
  CircleDot,
  Car,
  Truck,
  Warehouse,
  PackageOpen
} from "lucide-react";

// Department icons and colors
const DEPT_CONFIG = {
  receiving: { icon: PackageOpen, color: "bg-blue-500", label: "Receiving" },
  powder_coat: { icon: Paintbrush, color: "bg-purple-500", label: "Powder Coat" },
  polish: { icon: Sparkles, color: "bg-yellow-500", label: "Polish" },
  finishing: { icon: Wrench, color: "bg-orange-500", label: "Finishing" },
  assembly: { icon: CircleDot, color: "bg-green-500", label: "Assembly" },
  steering_wheels: { icon: Car, color: "bg-cyan-500", label: "Steering Wheels" },
  wheel_caps: { icon: CircleDot, color: "bg-pink-500", label: "Wheel Caps" },
  shipping: { icon: Truck, color: "bg-emerald-500", label: "Shipping" },
  storage: { icon: Warehouse, color: "bg-zinc-500", label: "General Storage" }
};

export default function ManufacturingInventoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Selected department
  const [selectedDept, setSelectedDept] = useState(null);
  
  // Data states
  const [items, setItems] = useState([]);
  const [stock, setStock] = useState([]);
  const [locations, setLocations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  
  // Loading states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Search
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  
  // Form states
  const [itemForm, setItemForm] = useState({
    sku: "",
    name: "",
    description: "",
    category: "component",
    unit_of_measure: "each",
    cost_per_unit: 0,
    sell_price: 0,
    reorder_point: null,
    default_location: "",
    supplier: ""
  });
  
  // P&L Report
  const [showPLReport, setShowPLReport] = useState(false);
  const [plReport, setPLReport] = useState(null);
  const [plPeriod, setPLPeriod] = useState("month");
  const [loadingPL, setLoadingPL] = useState(false);
  
  // Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  
  const [receiveForm, setReceiveForm] = useState({
    item_id: "",
    location_id: "",
    quantity: 0,
    unit_cost: 0,
    reference_number: "",
    notes: ""
  });
  
  const [transferForm, setTransferForm] = useState({
    item_id: "",
    from_location_id: "",
    to_location_id: "",
    quantity: 0,
    notes: ""
  });

  const isAdmin = user?.role === "admin" || user?.role === "admin_restricted";

  // Fetch all data
  const fetchAll = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const [itemsRes, stockRes, locationsRes, alertsRes, txRes] = await Promise.all([
        axios.get(`${API}/inventory/items`),
        axios.get(`${API}/inventory/stock`),
        axios.get(`${API}/inventory/locations`),
        axios.get(`${API}/inventory/alerts?acknowledged=false`),
        axios.get(`${API}/inventory/transactions?limit=50`)
      ]);
      
      setItems(itemsRes.data || []);
      setStock(stockRes.data || []);
      setLocations(locationsRes.data || []);
      setAlerts(alertsRes.data || []);
      setTransactions(txRes.data || []);
    } catch (error) {
      console.error("Inventory error:", error);
      toast.error("Failed to load inventory data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Create new item
  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!itemForm.sku || !itemForm.name) {
      toast.error("SKU and Name are required");
      return;
    }
    
    try {
      await axios.post(`${API}/inventory/items`, {
        ...itemForm,
        cost_per_unit: parseFloat(itemForm.cost_per_unit) || 0,
        sell_price: parseFloat(itemForm.sell_price) || 0,
        reorder_point: itemForm.reorder_point ? parseFloat(itemForm.reorder_point) : null,
        default_location: selectedDept?.code || itemForm.default_location
      });
      toast.success("Item created successfully");
      setShowAddItemModal(false);
      setItemForm({
        sku: "", name: "", description: "", category: "component",
        unit_of_measure: "each", cost_per_unit: 0, sell_price: 0, reorder_point: null,
        default_location: "", supplier: ""
      });
      fetchAll(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create item");
    }
  };

  // Receive inventory
  const handleReceive = async (e) => {
    e.preventDefault();
    if (!receiveForm.item_id || !receiveForm.location_id || !receiveForm.quantity) {
      toast.error("Item, location, and quantity are required");
      return;
    }
    
    try {
      await axios.post(`${API}/inventory/receive`, {
        ...receiveForm,
        quantity: parseFloat(receiveForm.quantity),
        unit_cost: parseFloat(receiveForm.unit_cost) || 0
      });
      toast.success("Inventory received successfully");
      setShowReceiveModal(false);
      setReceiveForm({ item_id: "", location_id: "", quantity: 0, unit_cost: 0, reference_number: "", notes: "" });
      fetchAll(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to receive inventory");
    }
  };

  // Transfer inventory
  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferForm.item_id || !transferForm.from_location_id || !transferForm.to_location_id || !transferForm.quantity) {
      toast.error("All transfer fields are required");
      return;
    }
    
    try {
      await axios.post(`${API}/inventory/transfer`, {
        ...transferForm,
        quantity: parseFloat(transferForm.quantity)
      });
      toast.success("Transfer completed successfully");
      setShowTransferModal(false);
      setTransferForm({ item_id: "", from_location_id: "", to_location_id: "", quantity: 0, notes: "" });
      fetchAll(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to transfer inventory");
    }
  };

  // Export CSV
  const handleExportCSV = async (type) => {
    try {
      const response = await axios.get(`${API}/inventory/reports/export/csv?report_type=${type}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory_${type}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("CSV exported successfully");
    } catch (error) {
      toast.error("Failed to export CSV");
    }
  };

  // Fetch P&L Report
  const fetchPLReport = async (period = "month") => {
    setLoadingPL(true);
    try {
      const response = await axios.get(`${API}/inventory/reports/profit-loss?period=${period}`);
      setPLReport(response.data);
    } catch (error) {
      toast.error("Failed to load P&L report");
    } finally {
      setLoadingPL(false);
    }
  };

  // Export P&L CSV
  const exportPLCSV = async () => {
    try {
      const response = await axios.get(`${API}/inventory/reports/profit-loss/export/csv?period=${plPeriod}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `profit_loss_${plPeriod}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("P&L report exported");
    } catch (error) {
      toast.error("Failed to export P&L report");
    }
  };

  // Import from QuickBooks CSV
  const handleImport = async () => {
    if (!importFile) {
      toast.error("Please select a file");
      return;
    }
    
    setImporting(true);
    const formData = new FormData();
    formData.append('file', importFile);
    if (selectedDept) {
      formData.append('default_location', selectedDept.code);
    }
    
    try {
      const response = await axios.post(`${API}/inventory/import/quickbooks-csv`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(response.data);
      if (response.data.success_count > 0) {
        toast.success(`Imported ${response.data.success_count} items successfully!`);
        fetchAll(true);
      }
      if (response.data.error_count > 0) {
        toast.warning(`${response.data.error_count} items had errors`);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // Download import template
  const downloadTemplate = async () => {
    try {
      const response = await axios.get(`${API}/inventory/import/quickbooks-template`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'quickbooks_import_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error("Failed to download template");
    }
  };

  // Get stock for selected department
  const getDeptStock = (locationId) => {
    return stock.filter(s => s.location_id === locationId);
  };

  // Get items that belong to a department (by default_location)
  const getDeptItems = (locationCode) => {
    return items.filter(item => item.default_location === locationCode);
  };

  // Calculate department totals
  const getDeptTotals = (locationId) => {
    const deptStock = getDeptStock(locationId);
    const totalItems = deptStock.length;
    const totalQty = deptStock.reduce((sum, s) => sum + s.quantity, 0);
    const totalValue = deptStock.reduce((sum, s) => {
      const item = items.find(i => i.id === s.item_id);
      return sum + (s.quantity * (item?.cost_per_unit || 0));
    }, 0);
    return { totalItems, totalQty, totalValue };
  };

  // Filter stock by search
  const filteredDeptStock = selectedDept 
    ? getDeptStock(selectedDept.id).filter(s => 
        !searchQuery || 
        s.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.item_sku?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Get recent transactions for selected dept
  const deptTransactions = selectedDept
    ? transactions.filter(tx => 
        tx.from_location_id === selectedDept.id || 
        tx.to_location_id === selectedDept.id
      ).slice(0, 10)
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin mx-auto mb-4" />
          <div className="text-red-500 font-oswald uppercase tracking-widest">Loading Inventory...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => selectedDept ? setSelectedDept(null) : navigate("/")}
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {selectedDept ? "All Departments" : "Back"}
          </Button>
          <h1 className="text-2xl font-oswald text-white uppercase tracking-wider flex items-center gap-2">
            <Boxes className="w-6 h-6 text-red-500" />
            {selectedDept ? `${selectedDept.name} Inventory` : "Manufacturing Inventory"}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          {alerts.length > 0 && (
            <Badge className="bg-red-500 text-white">
              <Bell className="w-3 h-3 mr-1" />
              {alerts.length} Alerts
            </Badge>
          )}
        </div>
      </div>

      {/* Alerts Banner */}
      {alerts.length > 0 && !selectedDept && (
        <Card className="bg-red-500/10 border-red-500 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-400 font-mono text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>{alerts.length} items need attention:</span>
              {alerts.slice(0, 3).map(a => (
                <Badge key={a.id} className="bg-red-500/20 text-red-300 border-red-500">
                  {a.item_sku}
                </Badge>
              ))}
              {alerts.length > 3 && <span className="text-red-300">+{alerts.length - 3} more</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Department Selection View */}
      {!selectedDept ? (
        <>
          {/* Department Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
            {locations.map(loc => {
              const config = DEPT_CONFIG[loc.code] || { icon: Package, color: "bg-zinc-600", label: loc.name };
              const Icon = config.icon;
              const totals = getDeptTotals(loc.id);
              const hasAlerts = alerts.some(a => {
                const item = items.find(i => i.id === a.item_id);
                return item?.default_location === loc.code;
              });
              
              return (
                <Card
                  key={loc.id}
                  onClick={() => setSelectedDept(loc)}
                  className={`cursor-pointer transition-all hover:scale-105 hover:border-red-500 bg-zinc-900 border-zinc-800 ${hasAlerts ? 'ring-2 ring-red-500' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className={`w-12 h-12 ${config.color} rounded-lg flex items-center justify-center mb-3`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-white font-oswald uppercase tracking-wider text-lg mb-2">
                      {config.label}
                    </h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Items:</span>
                        <span className="text-white font-mono">{totals.totalItems}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Value:</span>
                        <span className="text-green-400 font-mono">${totals.totalValue.toFixed(0)}</span>
                      </div>
                    </div>
                    {hasAlerts && (
                      <Badge className="mt-2 bg-red-500 text-white text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Low Stock
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3 mb-6">
            <Button onClick={() => handleExportCSV('stock')} variant="outline" className="border-zinc-700 text-zinc-300">
              <Download className="w-4 h-4 mr-2" />
              Export All Stock
            </Button>
            <Button onClick={() => handleExportCSV('transactions')} variant="outline" className="border-zinc-700 text-zinc-300">
              <FileText className="w-4 h-4 mr-2" />
              Export History
            </Button>
            <Button 
              onClick={() => { setShowPLReport(true); fetchPLReport(plPeriod); }} 
              className="bg-green-600 hover:bg-green-700"
            >
              <FileText className="w-4 h-4 mr-2" />
              Profit & Loss Report
            </Button>
            {isAdmin && (
              <Button onClick={() => setShowImportModal(true)} className="bg-purple-600 hover:bg-purple-700">
                <Upload className="w-4 h-4 mr-2" />
                Import from QuickBooks
              </Button>
            )}
          </div>

          {/* Recent Activity */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white font-oswald uppercase text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {transactions.slice(0, 8).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center gap-3">
                      <Badge className={
                        tx.transaction_type === 'receive' ? 'bg-green-500' :
                        tx.transaction_type === 'transfer' ? 'bg-blue-500' :
                        tx.transaction_type === 'pick' ? 'bg-purple-500' : 'bg-yellow-500'
                      }>
                        {tx.transaction_type}
                      </Badge>
                      <span className="text-cyan-400 font-mono text-sm">{tx.item_sku}</span>
                      <span className="text-zinc-400 text-sm">{tx.item_name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-white font-mono">{tx.quantity}</span>
                      <span className="text-zinc-500">{new Date(tx.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="text-center text-zinc-500 py-8">No recent activity</div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* Department Detail View */
        <>
          {/* Department Header Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4">
                <div className="text-zinc-400 text-xs font-mono uppercase">Items in Stock</div>
                <div className="text-2xl font-oswald text-white">{filteredDeptStock.length}</div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4">
                <div className="text-zinc-400 text-xs font-mono uppercase">Total Units</div>
                <div className="text-2xl font-oswald text-cyan-400">
                  {filteredDeptStock.reduce((sum, s) => sum + s.quantity, 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4">
                <div className="text-zinc-400 text-xs font-mono uppercase">Total Value</div>
                <div className="text-2xl font-oswald text-green-400">
                  ${filteredDeptStock.reduce((sum, s) => {
                    const item = items.find(i => i.id === s.item_id);
                    return sum + (s.quantity * (item?.cost_per_unit || 0));
                  }, 0).toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4">
                <div className="text-zinc-400 text-xs font-mono uppercase">Recent Moves</div>
                <div className="text-2xl font-oswald text-purple-400">{deptTransactions.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Button 
              onClick={() => {
                setItemForm({ ...itemForm, default_location: selectedDept.code });
                setShowAddItemModal(true);
              }} 
              className="bg-red-500 hover:bg-red-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item to {selectedDept.name}
            </Button>
            <Button 
              onClick={() => {
                setReceiveForm({ ...receiveForm, location_id: selectedDept.id });
                setShowReceiveModal(true);
              }} 
              className="bg-green-600 hover:bg-green-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Receive Stock
            </Button>
            <Button 
              onClick={() => {
                setTransferForm({ ...transferForm, from_location_id: selectedDept.id });
                setShowTransferModal(true);
              }} 
              className="bg-blue-600 hover:bg-blue-700"
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Transfer Out
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search items in this department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-700 text-white"
            />
          </div>

          {/* Tabs */}
          <Tabs defaultValue="stock">
            <TabsList className="bg-zinc-900 border border-zinc-800 mb-4">
              <TabsTrigger value="stock" className="data-[state=active]:bg-red-500">
                <Package className="w-4 h-4 mr-2" />
                Current Stock
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-red-500">
                <FileText className="w-4 h-4 mr-2" />
                Activity
              </TabsTrigger>
            </TabsList>

            {/* Stock Tab */}
            <TabsContent value="stock">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  {filteredDeptStock.length === 0 ? (
                    <div className="p-8 text-center">
                      <Package className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                      <div className="text-zinc-500 mb-4">No items in {selectedDept.name} yet</div>
                      <Button 
                        onClick={() => {
                          setItemForm({ ...itemForm, default_location: selectedDept.code });
                          setShowAddItemModal(true);
                        }}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add First Item
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left p-4 text-zinc-400 font-mono text-xs uppercase">SKU</th>
                            <th className="text-left p-4 text-zinc-400 font-mono text-xs uppercase">Item Name</th>
                            <th className="text-left p-4 text-zinc-400 font-mono text-xs uppercase">Category</th>
                            <th className="text-right p-4 text-zinc-400 font-mono text-xs uppercase">In Stock</th>
                            <th className="text-right p-4 text-zinc-400 font-mono text-xs uppercase">Reserved</th>
                            <th className="text-right p-4 text-zinc-400 font-mono text-xs uppercase">Available</th>
                            <th className="text-right p-4 text-zinc-400 font-mono text-xs uppercase">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDeptStock.map(s => {
                            const item = items.find(i => i.id === s.item_id);
                            const isLow = item?.reorder_point && s.quantity <= item.reorder_point;
                            const value = s.quantity * (item?.cost_per_unit || 0);
                            return (
                              <tr key={s.id} className={`border-b border-zinc-800 hover:bg-zinc-800/50 ${isLow ? 'bg-red-500/10' : ''}`}>
                                <td className="p-4 font-mono text-cyan-400">{s.item_sku}</td>
                                <td className="p-4 text-white font-medium">{s.item_name}</td>
                                <td className="p-4">
                                  <Badge className={
                                    item?.category === 'component' ? 'bg-blue-500/20 text-blue-400 border-blue-500' :
                                    item?.category === 'consumable' ? 'bg-purple-500/20 text-purple-400 border-purple-500' : 
                                    'bg-green-500/20 text-green-400 border-green-500'
                                  }>
                                    {item?.category || 'unknown'}
                                  </Badge>
                                </td>
                                <td className={`p-4 text-right font-mono text-lg ${isLow ? 'text-red-400 font-bold' : 'text-white'}`}>
                                  {s.quantity.toLocaleString()} <span className="text-zinc-500 text-sm">{s.unit_of_measure}</span>
                                </td>
                                <td className="p-4 text-right font-mono text-yellow-400">{s.reserved_quantity}</td>
                                <td className="p-4 text-right font-mono text-green-400">{s.available_quantity.toLocaleString()}</td>
                                <td className="p-4 text-right font-mono text-green-400">${value.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  {deptTransactions.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500">
                      No recent activity in {selectedDept.name}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left p-4 text-zinc-400 font-mono text-xs uppercase">Date</th>
                            <th className="text-left p-4 text-zinc-400 font-mono text-xs uppercase">Type</th>
                            <th className="text-left p-4 text-zinc-400 font-mono text-xs uppercase">Item</th>
                            <th className="text-left p-4 text-zinc-400 font-mono text-xs uppercase">Direction</th>
                            <th className="text-right p-4 text-zinc-400 font-mono text-xs uppercase">Qty</th>
                            <th className="text-left p-4 text-zinc-400 font-mono text-xs uppercase">By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deptTransactions.map(tx => {
                            const isIncoming = tx.to_location_id === selectedDept.id;
                            return (
                              <tr key={tx.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                                <td className="p-4 text-zinc-400 text-sm">
                                  {new Date(tx.created_at).toLocaleString()}
                                </td>
                                <td className="p-4">
                                  <Badge className={
                                    tx.transaction_type === 'receive' ? 'bg-green-500' :
                                    tx.transaction_type === 'transfer' ? 'bg-blue-500' :
                                    tx.transaction_type === 'pick' ? 'bg-purple-500' : 'bg-yellow-500'
                                  }>
                                    {tx.transaction_type}
                                  </Badge>
                                </td>
                                <td className="p-4">
                                  <span className="font-mono text-cyan-400">{tx.item_sku}</span>
                                  <span className="text-zinc-400 ml-2 text-sm">{tx.item_name}</span>
                                </td>
                                <td className="p-4">
                                  <Badge className={isIncoming ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                                    {isIncoming ? '↓ IN' : '↑ OUT'}
                                  </Badge>
                                </td>
                                <td className="p-4 text-right font-mono text-white">{tx.quantity}</td>
                                <td className="p-4 text-zinc-400 text-sm">{tx.performed_by_name}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Add Item Modal */}
      <Dialog open={showAddItemModal} onOpenChange={setShowAddItemModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white font-oswald uppercase">
              Add Item {selectedDept ? `to ${selectedDept.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateItem} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-400">SKU *</Label>
                <Input
                  value={itemForm.sku}
                  onChange={(e) => setItemForm({...itemForm, sku: e.target.value.toUpperCase()})}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  placeholder="RAW-LIPS-22"
                />
              </div>
              <div>
                <Label className="text-zinc-400">Category</Label>
                <Select value={itemForm.category} onValueChange={(v) => setItemForm({...itemForm, category: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="component">Component</SelectItem>
                    <SelectItem value="consumable">Consumable</SelectItem>
                    <SelectItem value="finished_good">Finished Good</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-zinc-400">Name *</Label>
              <Input
                value={itemForm.name}
                onChange={(e) => setItemForm({...itemForm, name: e.target.value})}
                className="bg-zinc-800 border-zinc-700 text-white"
                placeholder="Raw Lips 22 inch"
              />
            </div>
            <div>
              <Label className="text-zinc-400">Description</Label>
              <Textarea
                value={itemForm.description}
                onChange={(e) => setItemForm({...itemForm, description: e.target.value})}
                className="bg-zinc-800 border-zinc-700 text-white"
                placeholder="Optional description..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-400">Unit of Measure</Label>
                <Select value={itemForm.unit_of_measure} onValueChange={(v) => setItemForm({...itemForm, unit_of_measure: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="each">Each</SelectItem>
                    <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                    <SelectItem value="kg">Kilograms (kg)</SelectItem>
                    <SelectItem value="ft">Feet (ft)</SelectItem>
                    <SelectItem value="gallons">Gallons</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-400">Cost per Unit ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={itemForm.cost_per_unit}
                  onChange={(e) => setItemForm({...itemForm, cost_per_unit: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  placeholder="Your cost"
                />
              </div>
              <div>
                <Label className="text-zinc-400">Sell Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={itemForm.sell_price}
                  onChange={(e) => setItemForm({...itemForm, sell_price: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  placeholder="What you charge"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-400">Reorder Point</Label>
                <Input
                  type="number"
                  value={itemForm.reorder_point || ""}
                  onChange={(e) => setItemForm({...itemForm, reorder_point: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  placeholder="Alert when below..."
                />
              </div>
              <div>
                <Label className="text-zinc-400">Supplier</Label>
                <Input
                  value={itemForm.supplier}
                  onChange={(e) => setItemForm({...itemForm, supplier: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  placeholder="Vendor name"
                />
              </div>
            </div>
            {!selectedDept && (
              <div>
                <Label className="text-zinc-400">Default Department</Label>
                <Select value={itemForm.default_location} onValueChange={(v) => setItemForm({...itemForm, default_location: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {locations.map(loc => (
                      <SelectItem key={loc.code} value={loc.code}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowAddItemModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-red-500 hover:bg-red-600">Create Item</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Receive Modal */}
      <Dialog open={showReceiveModal} onOpenChange={setShowReceiveModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white font-oswald uppercase">
              Receive Inventory {selectedDept ? `- ${selectedDept.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReceive} className="space-y-4">
            <div>
              <Label className="text-zinc-400">Item *</Label>
              <Select value={receiveForm.item_id} onValueChange={(v) => {
                const item = items.find(i => i.id === v);
                setReceiveForm({
                  ...receiveForm, 
                  item_id: v,
                  unit_cost: item?.cost_per_unit || 0
                });
              }}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Select item..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                  {items.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.sku} - {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!selectedDept && (
              <div>
                <Label className="text-zinc-400">Location *</Label>
                <Select value={receiveForm.location_id} onValueChange={(v) => setReceiveForm({...receiveForm, location_id: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select location..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {locations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-400">Quantity *</Label>
                <Input
                  type="number"
                  value={receiveForm.quantity}
                  onChange={(e) => setReceiveForm({...receiveForm, quantity: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div>
                <Label className="text-zinc-400">Unit Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={receiveForm.unit_cost}
                  onChange={(e) => setReceiveForm({...receiveForm, unit_cost: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
            <div>
              <Label className="text-zinc-400">PO / Reference #</Label>
              <Input
                value={receiveForm.reference_number}
                onChange={(e) => setReceiveForm({...receiveForm, reference_number: e.target.value})}
                className="bg-zinc-800 border-zinc-700 text-white"
                placeholder="PO-2026-001"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowReceiveModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-green-600 hover:bg-green-700">Receive</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white font-oswald uppercase">Transfer Inventory</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTransfer} className="space-y-4">
            <div>
              <Label className="text-zinc-400">Item *</Label>
              <Select value={transferForm.item_id} onValueChange={(v) => setTransferForm({...transferForm, item_id: v})}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Select item..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                  {(selectedDept ? filteredDeptStock : stock).map(s => (
                    <SelectItem key={s.item_id} value={s.item_id}>
                      {s.item_sku} - {s.item_name} ({s.available_quantity} available)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!selectedDept && (
              <div>
                <Label className="text-zinc-400">From Location *</Label>
                <Select value={transferForm.from_location_id} onValueChange={(v) => setTransferForm({...transferForm, from_location_id: v})}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {locations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-zinc-400">To Location *</Label>
              <Select value={transferForm.to_location_id} onValueChange={(v) => setTransferForm({...transferForm, to_location_id: v})}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Select destination..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {locations.filter(l => l.id !== (selectedDept?.id || transferForm.from_location_id)).map(loc => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400">Quantity *</Label>
              <Input
                type="number"
                value={transferForm.quantity}
                onChange={(e) => setTransferForm({...transferForm, quantity: e.target.value})}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div>
              <Label className="text-zinc-400">Notes</Label>
              <Textarea
                value={transferForm.notes}
                onChange={(e) => setTransferForm({...transferForm, notes: e.target.value})}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowTransferModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Transfer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Profit & Loss Report Modal */}
      <Dialog open={showPLReport} onOpenChange={setShowPLReport}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white font-oswald uppercase flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-500" />
              Profit & Loss Report
            </DialogTitle>
          </DialogHeader>
          
          {/* Period Selector */}
          <div className="flex items-center gap-4 mb-4">
            <Label className="text-zinc-400">Period:</Label>
            <Select value={plPeriod} onValueChange={(v) => { setPLPeriod(v); fetchPLReport(v); }}>
              <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="day">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={exportPLCSV} variant="outline" className="border-zinc-700 text-zinc-300">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
          
          {loadingPL ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 text-green-500 animate-spin mx-auto" />
            </div>
          ) : plReport ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card className="bg-zinc-800 border-zinc-700">
                  <CardContent className="p-4">
                    <div className="text-zinc-400 text-xs font-mono uppercase">Total Cost</div>
                    <div className="text-xl font-oswald text-red-400">${plReport.total_cost?.toFixed(2)}</div>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-800 border-zinc-700">
                  <CardContent className="p-4">
                    <div className="text-zinc-400 text-xs font-mono uppercase">Total Revenue</div>
                    <div className="text-xl font-oswald text-blue-400">${plReport.total_revenue?.toFixed(2)}</div>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-800 border-zinc-700">
                  <CardContent className="p-4">
                    <div className="text-zinc-400 text-xs font-mono uppercase">Profit</div>
                    <div className={`text-xl font-oswald ${plReport.total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${plReport.total_profit?.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-800 border-zinc-700">
                  <CardContent className="p-4">
                    <div className="text-zinc-400 text-xs font-mono uppercase">Margin</div>
                    <div className={`text-xl font-oswald ${plReport.overall_margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {plReport.overall_margin?.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Items Table */}
              {plReport.items?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left p-3 text-zinc-400 font-mono text-xs uppercase">SKU</th>
                        <th className="text-left p-3 text-zinc-400 font-mono text-xs uppercase">Item</th>
                        <th className="text-right p-3 text-zinc-400 font-mono text-xs uppercase">Qty Used</th>
                        <th className="text-right p-3 text-zinc-400 font-mono text-xs uppercase">Cost</th>
                        <th className="text-right p-3 text-zinc-400 font-mono text-xs uppercase">Revenue</th>
                        <th className="text-right p-3 text-zinc-400 font-mono text-xs uppercase">Profit</th>
                        <th className="text-right p-3 text-zinc-400 font-mono text-xs uppercase">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plReport.items.map((item, idx) => (
                        <tr key={idx} className="border-b border-zinc-800">
                          <td className="p-3 font-mono text-cyan-400">{item.sku}</td>
                          <td className="p-3 text-white">{item.name}</td>
                          <td className="p-3 text-right text-white">{item.quantity_used} {item.unit_of_measure}</td>
                          <td className="p-3 text-right text-red-400">${item.total_cost?.toFixed(2)}</td>
                          <td className="p-3 text-right text-blue-400">${item.total_revenue?.toFixed(2)}</td>
                          <td className={`p-3 text-right font-mono ${item.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${item.profit?.toFixed(2)}
                          </td>
                          <td className={`p-3 text-right ${item.margin_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {item.margin_percent?.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-zinc-500 py-8">
                  No inventory usage in this period
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-zinc-500 py-8">
              Select a period to view report
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white font-oswald uppercase flex items-center gap-2">
              <Upload className="w-5 h-5 text-purple-500" />
              Import from QuickBooks
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-zinc-800 rounded-lg p-4">
              <p className="text-zinc-300 text-sm mb-3">
                Export your inventory from QuickBooks as CSV, then upload it here. 
                The system will auto-map common column names.
              </p>
              <Button onClick={downloadTemplate} variant="outline" size="sm" className="border-zinc-600 text-zinc-300">
                <Download className="w-4 h-4 mr-2" />
                Download CSV Template
              </Button>
            </div>
            
            <div>
              <Label className="text-zinc-400">Select CSV File</Label>
              <Input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                  setImportResult(null);
                }}
                className="bg-zinc-800 border-zinc-700 text-white file:bg-zinc-700 file:text-white file:border-0"
              />
            </div>
            
            {selectedDept && (
              <div className="bg-blue-500/10 border border-blue-500 rounded p-3">
                <p className="text-blue-400 text-sm">
                  Items will be imported to: <strong>{selectedDept.name}</strong>
                </p>
              </div>
            )}
            
            {importResult && (
              <div className={`rounded p-4 ${importResult.error_count > 0 ? 'bg-yellow-500/10 border border-yellow-500' : 'bg-green-500/10 border border-green-500'}`}>
                <div className="flex items-center gap-4 mb-2">
                  <Badge className="bg-green-500">{importResult.success_count} imported</Badge>
                  {importResult.error_count > 0 && (
                    <Badge className="bg-red-500">{importResult.error_count} errors</Badge>
                  )}
                </div>
                {importResult.errors?.length > 0 && (
                  <div className="mt-2 text-sm text-zinc-300 max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0, 10).map((err, idx) => (
                      <div key={idx} className="text-red-400">
                        Row {err.row}: {err.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { setShowImportModal(false); setImportResult(null); setImportFile(null); }}>
              Close
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={!importFile || importing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
