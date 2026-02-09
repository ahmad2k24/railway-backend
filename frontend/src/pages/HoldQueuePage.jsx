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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ArrowLeft,
  RefreshCw,
  Clock,
  Search,
  Plus,
  Trash2,
  Edit3,
  AlertTriangle,
  LogOut,
  Package,
  Download,
  Upload
} from "lucide-react";

export default function HoldQueuePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [holdOrders, setHoldOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingOrder, setEditingOrder] = useState(null);
  const [editReason, setEditReason] = useState("");
  
  // New Order on Hold state
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const getTodayDate = () => new Date().toISOString().split('T')[0];
  const [newOrder, setNewOrder] = useState({
    order_number: "",
    customer_name: "",
    phone: "",
    product_type: "rim",
    wheel_specs: "",
    notes: "",
    hold_reason: "",
    order_date: getTodayDate()
  });

  const isAdmin = user?.role === "admin";
  const isSales = user?.departments?.includes("received") || user?.department === "received";

  useEffect(() => {
    if (!isAdmin && !isSales) {
      toast.error("Access denied - Sales or Admin only");
      navigate("/");
      return;
    }
    fetchHoldQueue();
  }, []);

  const fetchHoldQueue = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const res = await axios.get(`${API}/hold-queue`);
      setHoldOrders(res.data);
    } catch (error) {
      toast.error("Failed to load hold queue");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const removeFromHold = async (orderId) => {
    try {
      await axios.post(`${API}/hold-queue/remove`, { order_id: orderId });
      toast.success("Order removed from hold");
      fetchHoldQueue(true);
    } catch (error) {
      toast.error("Failed to remove from hold");
    }
  };

  const updateHoldReason = async () => {
    if (!editingOrder || !editReason.trim()) return;
    
    try {
      await axios.put(`${API}/hold-queue/${editingOrder.id}/reason`, {
        order_id: editingOrder.id,
        hold_reason: editReason.trim()
      });
      toast.success("Hold reason updated");
      setEditingOrder(null);
      setEditReason("");
      fetchHoldQueue(true);
    } catch (error) {
      toast.error("Failed to update reason");
    }
  };

  // Create new order directly on hold
  const handleCreateHoldOrder = async (e) => {
    e.preventDefault();
    if (!newOrder.order_number.trim() || !newOrder.customer_name.trim()) {
      toast.error("Order number and customer name are required");
      return;
    }
    if (!newOrder.hold_reason.trim()) {
      toast.error("Please provide a hold reason");
      return;
    }
    
    setCreating(true);
    try {
      // Create the order with is_on_hold flag
      const res = await axios.post(`${API}/orders/hold`, {
        order_number: newOrder.order_number.trim(),
        customer_name: newOrder.customer_name.trim(),
        phone: newOrder.phone.trim(),
        product_type: newOrder.product_type,
        wheel_specs: newOrder.wheel_specs.trim(),
        notes: newOrder.notes.trim(),
        hold_reason: newOrder.hold_reason.trim(),
        order_date: newOrder.order_date
      });
      
      toast.success(`Order #${newOrder.order_number} created on hold!`);
      setNewOrderOpen(false);
      setNewOrder({
        order_number: "",
        customer_name: "",
        phone: "",
        product_type: "rim",
        wheel_specs: "",
        notes: "",
        hold_reason: "",
        order_date: getTodayDate()
      });
      fetchHoldQueue(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create order");
    } finally {
      setCreating(false);
    }
  };

  const filteredOrders = holdOrders.filter(order => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      order.order_number?.toLowerCase().includes(q) ||
      order.customer_name?.toLowerCase().includes(q) ||
      order.hold_reason?.toLowerCase().includes(q)
    );
  });

  const getDaysColor = (days) => {
    if (days >= 90) return "text-red-500 bg-red-500/20";
    if (days >= 60) return "text-orange-500 bg-orange-500/20";
    if (days >= 30) return "text-yellow-500 bg-yellow-500/20";
    return "text-zinc-400 bg-zinc-700";
  };

  // Export Hold Queue to PDF
  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(234, 179, 8); // Yellow
    doc.text("CORLEONE FORGED - HOLD QUEUE", 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
    doc.text(`Total Orders on Hold: ${filteredOrders.length}`, 14, 28);
    
    // Table data
    const tableData = filteredOrders.map(order => [
      order.order_number || "-",
      order.customer_name || "-",
      order.phone || "-",
      order.product_type || "-",
      order.wheel_specs || "-",
      order.hold_reason?.substring(0, 40) || "-",
      `${order.days_on_hold || 0} days`,
      order.order_date ? new Date(order.order_date).toLocaleDateString() : "-"
    ]);
    
    autoTable(doc, {
      startY: 35,
      head: [["Order #", "Customer", "Phone", "Product", "Specs", "Hold Reason", "Days", "Date"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [234, 179, 8], textColor: [0, 0, 0], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    
    doc.save(`hold-queue-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("Hold queue exported to PDF!");
  };

  // Export Hold Queue to CSV
  const exportToCSV = () => {
    const headers = ["Order #", "Customer", "Phone", "Product Type", "Wheel Specs", "Hold Reason", "Notes", "Days on Hold", "Order Date"];
    const rows = filteredOrders.map(order => [
      order.order_number || "",
      order.customer_name || "",
      order.phone || "",
      order.product_type || "",
      order.wheel_specs || "",
      (order.hold_reason || "").replace(/,/g, ";"),
      (order.notes || "").replace(/,/g, ";"),
      order.days_on_hold || 0,
      order.order_date || ""
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hold-queue-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Hold queue exported to CSV!");
  };

  // Import Hold Queue from CSV
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
          
          const holdData = {
            order_number: values[0]?.trim() || `HOLD-${Date.now()}-${i}`,
            customer_name: values[1]?.trim() || "",
            phone: values[2]?.trim() || "",
            product_type: values[3]?.trim() || "rim",
            wheel_specs: values[4]?.trim() || "",
            hold_reason: values[5]?.trim()?.replace(/;/g, ",") || "",
            notes: values[6]?.trim()?.replace(/;/g, ",") || "",
            order_date: values[8]?.trim() || new Date().toISOString().split('T')[0]
          };
          
          try {
            await axios.post(`${API}/hold-queue`, holdData);
            imported++;
          } catch (err) {
            errors++;
            console.error(`Failed to import row ${i}:`, err);
          }
        }
        
        toast.success(`Imported ${imported} hold orders${errors > 0 ? `, ${errors} failed` : ""}`);
        fetchHoldQueue();
      } catch (err) {
        toast.error("Failed to parse CSV file");
        console.error(err);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-yellow-500 font-oswald uppercase tracking-widest animate-pulse">
          Loading Hold Queue...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <h1 className="font-oswald text-xl md:text-2xl uppercase tracking-widest text-yellow-500">
                <AlertTriangle className="w-6 h-6 inline mr-2" />
                Hold Queue
              </h1>
              <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500">
                {holdOrders.length} Orders
              </Badge>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => setNewOrderOpen(true)}
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-mono text-xs"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Hold Order
              </Button>
              {/* Export PDF Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={exportToPDF}
                className="border-yellow-700 text-yellow-500 hover:bg-yellow-500/10 font-mono text-xs"
                data-testid="export-hold-pdf-btn"
              >
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
              {/* Export CSV Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={exportToCSV}
                className="border-green-700 text-green-500 hover:bg-green-500/10 font-mono text-xs"
                data-testid="export-hold-csv-btn"
              >
                <Download className="w-4 h-4 mr-1" />
                CSV
              </Button>
              {/* Import CSV Button */}
              <label>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-purple-700 text-purple-500 hover:bg-purple-500/10 font-mono text-xs cursor-pointer"
                  data-testid="import-hold-csv-btn"
                  asChild
                >
                  <span>
                    <Upload className="w-4 h-4 mr-1" />
                    Import
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
                onClick={() => fetchHoldQueue(true)}
                disabled={refreshing}
                className="text-zinc-400 hover:text-white"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <span className="text-zinc-500 font-mono text-xs hidden md:block">
                {user?.name}
              </span>
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

      <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-6">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search by order #, customer, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
        </div>

        {/* Orders Grid */}
        {filteredOrders.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
              <p className="text-zinc-500 font-mono">
                {searchQuery ? "No orders match your search" : "No orders on hold"}
              </p>
              <Button
                onClick={() => setNewOrderOpen(true)}
                className="mt-4 bg-yellow-500 hover:bg-yellow-400 text-black"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Hold Order
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOrders.map((order) => (
              <Card 
                key={order.id} 
                className="bg-zinc-900/80 border-zinc-800 hover:border-yellow-500/50 transition-colors"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="font-oswald text-lg text-white">
                        #{order.order_number}
                      </CardTitle>
                      <p className="text-sm text-zinc-400 font-mono mt-1">
                        {order.customer_name}
                      </p>
                    </div>
                    <Badge className={`${getDaysColor(order.days_on_hold)} font-mono text-xs`}>
                      <Clock className="w-3 h-3 mr-1" />
                      {order.days_on_hold} days
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Hold Reason */}
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Hold Reason</p>
                    <p className="text-sm text-yellow-400 font-mono">
                      {order.hold_reason || "No reason specified"}
                    </p>
                  </div>

                  {/* Order Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-zinc-500">Product</p>
                      <p className="text-zinc-300 font-mono">{order.product_type}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Department</p>
                      <p className="text-zinc-300 font-mono">{order.current_department}</p>
                    </div>
                  </div>

                  {/* Added By */}
                  <p className="text-xs text-zinc-600">
                    Added by {order.hold_added_by || "Unknown"}
                  </p>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-zinc-800">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingOrder(order);
                        setEditReason(order.hold_reason || "");
                      }}
                      className="flex-1 border-zinc-700 hover:border-yellow-500 text-yellow-500 text-xs"
                    >
                      <Edit3 className="w-3 h-3 mr-1" />
                      Edit Reason
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeFromHold(order.id)}
                      className="flex-1 border-zinc-700 hover:border-green-500 text-green-500 text-xs"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Reason Modal */}
      <Dialog open={!!editingOrder} onOpenChange={() => { setEditingOrder(null); setEditReason(""); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-yellow-500">
              Edit Hold Reason
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-zinc-400 text-sm">
              Order <span className="text-white font-mono">#{editingOrder?.order_number}</span> - {editingOrder?.customer_name}
            </p>
            <Input
              type="text"
              placeholder="Enter hold reason (e.g., Waiting on Payment, Customer MIA)"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white"
            />
            <div className="flex gap-2">
              <Button
                onClick={updateHoldReason}
                disabled={!editReason.trim()}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black"
              >
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => { setEditingOrder(null); setEditReason(""); }}
                className="flex-1 border-zinc-700"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create New Hold Order Modal */}
      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-yellow-500">
              <AlertTriangle className="w-5 h-5 inline mr-2" />
              Create Order on Hold
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateHoldOrder} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase">Order Number *</Label>
                <Input
                  type="text"
                  value={newOrder.order_number}
                  onChange={(e) => setNewOrder({ ...newOrder, order_number: e.target.value })}
                  placeholder="e.g. CF-001"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase">Order Date</Label>
                <Input
                  type="date"
                  value={newOrder.order_date}
                  onChange={(e) => setNewOrder({ ...newOrder, order_date: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase">Customer Name *</Label>
              <Input
                type="text"
                value={newOrder.customer_name}
                onChange={(e) => setNewOrder({ ...newOrder, customer_name: e.target.value })}
                placeholder="Customer name"
                className="bg-zinc-800 border-zinc-700 text-white"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase">Phone (Optional)</Label>
              <Input
                type="text"
                value={newOrder.phone}
                onChange={(e) => setNewOrder({ ...newOrder, phone: e.target.value })}
                placeholder="(555)-555-5555"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase">Product Type</Label>
                <Select
                  value={newOrder.product_type}
                  onValueChange={(val) => setNewOrder({ ...newOrder, product_type: val })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="rim">Rim</SelectItem>
                    <SelectItem value="cap">Cap</SelectItem>
                    <SelectItem value="steering_wheel">Steering Wheel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase">Wheel Specs</Label>
                <Input
                  type="text"
                  value={newOrder.wheel_specs}
                  onChange={(e) => setNewOrder({ ...newOrder, wheel_specs: e.target.value })}
                  placeholder="e.g. 22x10"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase">Notes (Optional)</Label>
              <Textarea
                value={newOrder.notes}
                onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })}
                placeholder="Additional order notes..."
                className="bg-zinc-800 border-zinc-700 text-white min-h-[60px]"
              />
            </div>

            <div className="space-y-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <Label className="text-yellow-500 text-xs uppercase font-bold">Hold Reason *</Label>
              <Input
                type="text"
                value={newOrder.hold_reason}
                onChange={(e) => setNewOrder({ ...newOrder, hold_reason: e.target.value })}
                placeholder="e.g. Waiting on payment, Customer MIA, Parts on backorder..."
                className="bg-zinc-800 border-yellow-600 text-white"
                required
              />
              <p className="text-xs text-yellow-600">This order will stay in the Hold Queue until released.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={creating}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold"
              >
                {creating ? "Creating..." : "Create Hold Order"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewOrderOpen(false)}
                className="border-zinc-700"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
