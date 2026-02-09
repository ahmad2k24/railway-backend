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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LanguageSelector from "@/components/LanguageSelector";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  LogOut,
  Zap,
  Clock,
  ChevronRight,
  Download,
  AlertTriangle,
  Wrench,
  Eye
} from "lucide-react";

const DEPARTMENTS = [
  { value: "received", label: "Sales" },
  { value: "design", label: "Design" },
  { value: "program", label: "Program" },
  { value: "machine_waiting", label: "Machine Waiting" },
  { value: "machine", label: "Machine" },
  { value: "finishing", label: "Finishing" },
  { value: "powder_coat", label: "Powder Coat" },
  { value: "assemble", label: "Assemble" },
  { value: "showroom", label: "Showroom" },
  { value: "shipped", label: "Shipped" }
];

const DEPT_MAP = Object.fromEntries(DEPARTMENTS.map(d => [d.value, d]));

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

export default function RushQueuePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  
  // Order detail modal
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const isAdmin = user?.role === "admin" || user?.role === "admin_restricted";

  useEffect(() => {
    fetchData();
  }, [deptFilter]);

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const [ordersRes, statsRes] = await Promise.all([
        axios.get(`${API}/rush-queue`),
        axios.get(`${API}/rush-queue/stats`)
      ]);
      
      let filteredOrders = ordersRes.data;
      if (deptFilter !== "all") {
        filteredOrders = filteredOrders.filter(o => o.current_department === deptFilter);
      }
      
      setOrders(filteredOrders);
      setStats(statsRes.data);
    } catch (error) {
      console.error("Error fetching rush queue:", error);
      toast.error("Failed to load rush queue");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRemoveRush = async (orderId) => {
    if (!confirm("Are you sure you want to remove RUSH priority from this order?")) return;
    
    try {
      await axios.put(`${API}/orders/${orderId}/rush`, { is_rush: false });
      toast.success("RUSH priority removed");
      fetchData(true);
    } catch (error) {
      toast.error("Failed to remove RUSH priority");
    }
  };

  const handleAdvanceOrder = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/advance`);
      toast.success("Order advanced to next department!");
      fetchData(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to advance order");
    }
  };

  // Move RUSH order to any department (skip steps)
  const handleMoveToAnyDept = async (orderId, targetDept) => {
    try {
      await axios.put(`${API}/rush-queue/${orderId}/move-to`, { target_department: targetDept });
      toast.success(`Order moved to ${DEPT_MAP[targetDept]?.label || targetDept}!`);
      fetchData(true);
      setMoveModal({ open: false, order: null });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to move order");
    }
  };

  // Move modal state
  const [moveModal, setMoveModal] = useState({ open: false, order: null });

  const openOrderDetail = async (orderId) => {
    try {
      const res = await axios.get(`${API}/orders/${orderId}`);
      setSelectedOrder(res.data);
      setDetailModalOpen(true);
    } catch (error) {
      toast.error("Failed to load order details");
    }
  };

  const filteredOrders = orders.filter(order => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      order.order_number?.toLowerCase().includes(q) ||
      order.customer_name?.toLowerCase().includes(q) ||
      order.rush_reason?.toLowerCase().includes(q)
    );
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatTimeSince = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h ago`;
    return `${diffHours}h ago`;
  };

  // Export RUSH Queue to PDF
  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(239, 68, 68); // Red
    doc.text("CORLEONE FORGED - RUSH ORDERS", 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
    doc.text(`Total RUSH Orders: ${stats?.total || 0}`, 14, 28);
    
    // Table data
    const tableData = filteredOrders.map(order => [
      order.order_number || "-",
      order.customer_name || "-",
      PRODUCT_TYPES[order.product_type]?.label || order.product_type,
      DEPT_MAP[order.current_department]?.label || order.current_department,
      order.rush_reason || "-",
      order.rush_set_by || "-",
      formatDate(order.rush_set_at),
      order.is_refinish ? "YES" : "NO"
    ]);
    
    autoTable(doc, {
      startY: 35,
      head: [["Order #", "Customer", "Type", "Department", "Rush Reason", "Set By", "Rush Date", "Refinish?"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    
    doc.save(`rush-orders-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("Rush orders exported to PDF!");
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
                data-testid="rush-queue-back-btn"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-red-500" />
                <h1 className="font-oswald text-lg sm:text-xl uppercase tracking-widest text-white">
                  Rush Orders
                </h1>
              </div>
              <Badge className="bg-red-500/20 text-red-400 border-red-500/50 font-mono text-xs animate-pulse">
                {stats?.total || 0} RUSH
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Export PDF Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={exportToPDF}
                className="border-red-700 text-red-500 hover:bg-red-500/10 font-mono text-xs"
                data-testid="export-rush-pdf-btn"
              >
                <Download className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
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
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <Zap className="w-5 h-5 text-red-500" />
                  <span className="font-mono text-2xl sm:text-3xl text-white font-bold">
                    {stats.total}
                  </span>
                </div>
                <p className="font-mono text-[10px] sm:text-xs text-zinc-500 mt-1">Total Rush</p>
              </CardContent>
            </Card>
            
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <Wrench className="w-5 h-5 text-orange-500" />
                  <span className="font-mono text-2xl sm:text-3xl text-white font-bold">
                    {stats.refinish_overlap}
                  </span>
                </div>
                <p className="font-mono text-[10px] sm:text-xs text-zinc-500 mt-1">Also Refinish</p>
              </CardContent>
            </Card>
            
            {Object.entries(stats.by_department || {}).slice(0, 2).map(([dept, count]) => (
              <Card key={dept} className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-zinc-400 uppercase">{DEPT_MAP[dept]?.label || dept}</span>
                    <span className="font-mono text-2xl sm:text-3xl text-white font-bold">
                      {count}
                    </span>
                  </div>
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
              placeholder="Search by order #, customer, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 focus:border-red-500 font-mono text-sm"
              data-testid="rush-queue-search"
            />
          </div>
          
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-zinc-900 border-zinc-800 font-mono text-sm">
              <SelectValue placeholder="Filter by department" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all" className="font-mono">All Departments</SelectItem>
              {DEPARTMENTS.map(dept => (
                <SelectItem key={dept.value} value={dept.value} className="font-mono">{dept.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Rush Orders List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-8 text-center">
              <Zap className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400 font-mono">No rush orders found</p>
              <p className="text-zinc-500 font-mono text-sm mt-2">
                Mark orders as RUSH from the main dashboard
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const productInfo = PRODUCT_TYPES[order.product_type] || { label: order.product_type, color: "text-zinc-400" };
              const deptInfo = DEPT_MAP[order.current_department] || { label: order.current_department };
              
              return (
                <Card 
                  key={order.id} 
                  className="bg-zinc-900/50 border-red-900/50 hover:border-red-700/50 transition-all"
                  data-testid={`rush-order-${order.order_number}`}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* RUSH Badge and Refinish indicator */}
                      <div className="flex items-center gap-2 sm:w-48 flex-shrink-0">
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/50 font-mono text-xs px-3 py-1 animate-pulse">
                          <Zap className="w-3 h-3 mr-1" />
                          RUSH
                        </Badge>
                        {order.is_refinish && (
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/50 font-mono text-[10px]">
                            <Wrench className="w-2 h-2 mr-1" />
                            REFINISH
                          </Badge>
                        )}
                      </div>
                      
                      {/* Order Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm text-red-500 font-bold">
                            #{order.order_number}
                          </span>
                          <Badge className={`${productInfo.color} bg-transparent text-[10px]`}>
                            {productInfo.label}
                          </Badge>
                          <Badge className="bg-zinc-800 text-zinc-300 text-[10px]">
                            {deptInfo.label}
                          </Badge>
                        </div>
                        
                        <p className="font-mono text-sm text-white mt-1">
                          {order.customer_name}
                          {order.phone && <span className="text-zinc-500 ml-2">• {order.phone}</span>}
                        </p>
                        
                        {/* Rush Reason */}
                        {order.rush_reason && (
                          <div className="mt-2 p-2 bg-red-900/20 rounded border border-red-800/50">
                            <div className="flex items-center gap-1 mb-1">
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                              <span className="font-mono text-[10px] text-red-400 uppercase tracking-wider">Rush Reason</span>
                            </div>
                            <p className="font-mono text-xs text-zinc-300">{order.rush_reason}</p>
                          </div>
                        )}
                        
                        {/* Refinish Notes (if order is also refinish) */}
                        {order.is_refinish && order.refinish_notes && (
                          <div className="mt-2 p-2 bg-orange-900/20 rounded border border-orange-800/50">
                            <div className="flex items-center gap-1 mb-1">
                              <Wrench className="w-3 h-3 text-orange-400" />
                              <span className="font-mono text-[10px] text-orange-400 uppercase tracking-wider">Refinish Notes</span>
                            </div>
                            <p className="font-mono text-xs text-zinc-300">{order.refinish_notes}</p>
                          </div>
                        )}
                        
                        {/* Meta Info */}
                        <div className="flex items-center gap-4 mt-2 text-zinc-500 font-mono text-[10px]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Rush Set: {formatTimeSince(order.rush_set_at)}
                          </span>
                          <span>By: {order.rush_set_by || "Unknown"}</span>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleAdvanceOrder(order.id)}
                            className="bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-wider text-xs"
                            data-testid={`advance-rush-${order.order_number}`}
                            title="Advance to next department"
                          >
                            <ChevronRight className="w-3 h-3 mr-1" />
                            Next
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMoveModal({ open: true, order })}
                            className="border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black font-oswald uppercase tracking-wider text-xs"
                            data-testid={`move-rush-${order.order_number}`}
                            title="Move to any department"
                          >
                            Move To
                          </Button>
                        </div>
                        
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openOrderDetail(order.id)}
                            className="text-zinc-400 hover:text-white h-8 w-8 p-0"
                            data-testid={`view-rush-${order.order_number}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveRush(order.id)}
                              className="text-zinc-400 hover:text-yellow-500 text-[10px] h-8 px-2"
                              title="Remove RUSH priority"
                            >
                              Remove
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

      {/* Move to Department Modal */}
      <Dialog open={moveModal.open} onOpenChange={(open) => setMoveModal({ open, order: open ? moveModal.order : null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-amber-500">
              Move Rush Order #{moveModal.order?.order_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            <p className="font-mono text-xs text-zinc-400">
              RUSH orders can skip departments. Select target department:
            </p>
            <p className="font-mono text-xs text-zinc-500">
              Current: <span className="text-white">{DEPT_MAP[moveModal.order?.current_department]?.label}</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEPARTMENTS.map(dept => (
                <Button
                  key={dept.value}
                  variant="outline"
                  size="sm"
                  disabled={moveModal.order?.current_department === dept.value}
                  onClick={() => handleMoveToAnyDept(moveModal.order?.id, dept.value)}
                  className={`font-mono text-xs ${moveModal.order?.current_department === dept.value ? 'opacity-50' : 'hover:bg-amber-500 hover:text-black hover:border-amber-500'}`}
                >
                  {dept.label}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMoveToAnyDept(moveModal.order?.id, "completed")}
                className="font-mono text-xs hover:bg-green-500 hover:text-black hover:border-green-500 col-span-2"
              >
                ✓ Mark Completed
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-red-500">
              <Zap className="w-5 h-5 inline mr-2" />
              Rush Order #{selectedOrder?.order_number}
            </DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">Customer</span>
                  <p className="font-mono text-white">{selectedOrder.customer_name}</p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">Phone</span>
                  <p className="font-mono text-white">{selectedOrder.phone || "-"}</p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">Product Type</span>
                  <p className="font-mono text-white">{PRODUCT_TYPES[selectedOrder.product_type]?.label || selectedOrder.product_type}</p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">Department</span>
                  <p className="font-mono text-white">{DEPT_MAP[selectedOrder.current_department]?.label || selectedOrder.current_department}</p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">Wheel Specs</span>
                  <p className="font-mono text-white">{selectedOrder.wheel_specs || "-"}</p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">Order Date</span>
                  <p className="font-mono text-white">{formatDate(selectedOrder.order_date)}</p>
                </div>
              </div>
              
              {selectedOrder.rush_reason && (
                <div className="p-3 bg-red-900/20 rounded border border-red-800/50">
                  <span className="font-mono text-[10px] text-red-400 uppercase">Rush Reason</span>
                  <p className="font-mono text-white mt-1">{selectedOrder.rush_reason}</p>
                  <p className="font-mono text-[10px] text-zinc-500 mt-2">
                    Set by {selectedOrder.rush_set_by} on {formatDate(selectedOrder.rush_set_at)}
                  </p>
                </div>
              )}
              
              {selectedOrder.notes && (
                <div className="p-3 bg-zinc-800/50 rounded border border-zinc-700">
                  <span className="font-mono text-[10px] text-zinc-400 uppercase">Notes</span>
                  <p className="font-mono text-white mt-1">{selectedOrder.notes}</p>
                </div>
              )}
              
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={() => {
                    navigate(`/?order=${selectedOrder.id}`);
                    setDetailModalOpen(false);
                  }}
                  className="flex-1 bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-widest"
                >
                  View Full Details
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
