import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, LogOut, ArrowLeft, Package, Circle, ChevronRight,
  MessageSquare, Send, User, Phone, Truck, CheckCircle2, Clock, Plane, ArrowRightLeft
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PRODUCT_COLORS = {
  rim: { text: "text-cyan-500", border: "border-cyan-500", bg: "bg-cyan-500" },
  steering_wheel: { text: "text-violet-500", border: "border-violet-500", bg: "bg-violet-500" },
  standard_caps: { text: "text-amber-500", border: "border-amber-500", bg: "bg-amber-500" },
  floater_caps: { text: "text-emerald-500", border: "border-emerald-500", bg: "bg-emerald-500" },
  xxl_caps: { text: "text-rose-500", border: "border-rose-500", bg: "bg-rose-500" },
  dually_floating_caps: { text: "text-blue-500", border: "border-blue-500", bg: "bg-blue-500" },
  offroad_floating_caps: { text: "text-orange-500", border: "border-orange-500", bg: "bg-orange-500" },
  custom_caps: { text: "text-purple-500", border: "border-purple-500", bg: "bg-purple-500" },
  race_car_caps: { text: "text-red-500", border: "border-red-500", bg: "bg-red-500" },
};

const PRODUCT_LABELS = {
  rim: "Rim",
  steering_wheel: "Steering Wheel",
  standard_caps: "Standard Caps",
  floater_caps: "Floater Caps",
  xxl_caps: "XXL Caps",
  dually_floating_caps: "Dually Floating Caps",
  offroad_floating_caps: "Off-Road Floating Caps",
  custom_caps: "Custom Caps",
  race_car_caps: "Tall Caps",
};

const LALO_STATUSES = {
  shipped_to_lalo: { label: "Shipped to Lalo", color: "text-blue-400 border-blue-400", icon: Plane },
  at_lalo: { label: "At Lalo (Processing)", color: "text-amber-400 border-amber-400", icon: Clock },
  returned: { label: "Returned from Lalo", color: "text-green-400 border-green-400", icon: CheckCircle2 },
  waiting_shipping: { label: "Waiting for Shipping", color: "text-orange-400 border-orange-400", icon: Truck },
};

// Departments for moving orders
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
  { value: "shipped", label: "Shipped" },
];

export default function LaloQueuePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [newNote, setNewNote] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const isAdmin = user?.role === "admin";

  const fetchData = async (showToast = false) => {
    if (showToast) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/orders/lalo-queue`);
      setOrders(res.data);
      if (showToast) toast.success("Refreshed!");
    } catch (error) {
      toast.error("Failed to fetch Lalo queue");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateLaloStatus = async (orderId, newStatus) => {
    try {
      await axios.put(`${API}/orders/${orderId}/lalo-status`, { lalo_status: newStatus });
      toast.success("Status updated!");
      fetchData();
      if (selectedOrder && selectedOrder.id === orderId) {
        const res = await axios.get(`${API}/orders/${orderId}`);
        setSelectedOrder(res.data);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update status");
    }
  };

  const openOrderDetail = async (orderId) => {
    try {
      const res = await axios.get(`${API}/orders/${orderId}`);
      setSelectedOrder(res.data);
    } catch (error) {
      toast.error("Failed to load order details");
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !selectedOrder) return;
    try {
      const res = await axios.post(`${API}/orders/${selectedOrder.id}/notes`, { text: newNote });
      setSelectedOrder(res.data);
      setNewNote("");
      toast.success("Note added!");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to add note");
    }
  };

  const handleMoveOrder = async (orderId, targetDept) => {
    try {
      await axios.put(`${API}/orders/${orderId}/move`, { target_department: targetDept });
      toast.success(`Order moved to ${DEPARTMENTS.find(d => d.value === targetDept)?.label || targetDept}!`);
      fetchData();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null); // Close modal since order left Lalo queue
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to move order");
    }
  };

  const handleRemoveFromLalo = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/lalo-status`, { lalo_status: "not_sent" });
      toast.success("Removed from Lalo Queue!");
      fetchData();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to remove from Lalo");
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CORLEONE FORGED", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text("Lalo Queue Report", 105, 30, { align: "center" });
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, { align: "center" });
    doc.text(`Total Orders: ${filteredOrders.length}`, 105, 44, { align: "center" });
    
    const tableData = filteredOrders.map(order => [
      order.order_number,
      order.customer_name,
      PRODUCT_LABELS[order.product_type] || order.product_type,
      LALO_STATUSES[order.lalo_status]?.label || order.lalo_status,
      new Date(order.order_date).toLocaleDateString()
    ]);
    
    autoTable(doc, {
      startY: 52,
      head: [["Order #", "Customer", "Type", "Lalo Status", "Date"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    
    doc.save(`corleone-forged-lalo-queue-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("Lalo Queue report exported!");
  };

  // Filter orders by status
  const filteredOrders = statusFilter === "all" 
    ? orders 
    : orders.filter(o => o.lalo_status === statusFilter);

  // Group orders by status for display
  const ordersByStatus = {
    shipped_to_lalo: filteredOrders.filter(o => o.lalo_status === "shipped_to_lalo"),
    at_lalo: filteredOrders.filter(o => o.lalo_status === "at_lalo"),
    returned: filteredOrders.filter(o => o.lalo_status === "returned"),
    waiting_shipping: filteredOrders.filter(o => o.lalo_status === "waiting_shipping"),
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-yellow-500 font-oswald uppercase tracking-widest">Loading Lalo Queue...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
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
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
                  <Plane className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="font-oswald text-2xl uppercase tracking-widest text-white">
                    Lalo Queue
                  </h1>
                  <p className="font-mono text-[10px] text-zinc-500">
                    California Gold/Chrome Dipping
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Badge className="text-lg px-3 py-1 bg-amber-500/20 text-amber-400 border-amber-500">
                {orders.length} Orders
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={exportPDF}
                className="border-zinc-700 text-zinc-400 hover:text-white"
              >
                Export PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="border-zinc-700 text-zinc-400 hover:text-white"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-zinc-400 hover:text-white"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Status Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className={statusFilter === "all" ? "bg-amber-500 text-black" : "border-zinc-700"}
          >
            All ({orders.length})
          </Button>
          {Object.entries(LALO_STATUSES).map(([key, status]) => {
            const StatusIcon = status.icon;
            const count = orders.filter(o => o.lalo_status === key).length;
            return (
              <Button
                key={key}
                variant={statusFilter === key ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(key)}
                className={statusFilter === key ? "bg-amber-500 text-black" : `border-zinc-700 ${status.color.split(' ')[0]}`}
              >
                <StatusIcon className="w-3 h-3 mr-1" />
                {status.label} ({count})
              </Button>
            );
          })}
        </div>

        {/* Orders Grid by Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          {Object.entries(LALO_STATUSES).map(([statusKey, statusInfo]) => {
            const StatusIcon = statusInfo.icon;
            const statusOrders = ordersByStatus[statusKey];
            
            if (statusFilter !== "all" && statusFilter !== statusKey) return null;
            
            return (
              <Card key={statusKey} className="bg-zinc-900/50 border-zinc-800">
                <CardHeader className="border-b border-zinc-800 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-5 h-5 ${statusInfo.color.split(' ')[0]}`} />
                      <CardTitle className={`font-oswald uppercase tracking-wider text-sm ${statusInfo.color.split(' ')[0]}`}>
                        {statusInfo.label}
                      </CardTitle>
                    </div>
                    <Badge className={`${statusInfo.color} bg-transparent`}>
                      {statusOrders.length}
                    </Badge>
                  </div>
                </CardHeader>
                <ScrollArea className="h-[500px]">
                  <CardContent className="p-3 space-y-3">
                    {statusOrders.length === 0 ? (
                      <p className="text-zinc-600 font-mono text-xs text-center py-8">No orders</p>
                    ) : (
                      statusOrders.map((order) => (
                        <div
                          key={order.id}
                          className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 hover:border-amber-500/50 cursor-pointer transition-colors"
                          onClick={() => openOrderDetail(order.id)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-sm text-amber-400">{order.order_number}</span>
                            <Badge className={`text-[9px] ${PRODUCT_COLORS[order.product_type]?.text || "text-zinc-400"} ${PRODUCT_COLORS[order.product_type]?.border || "border-zinc-400"} bg-transparent`}>
                              {PRODUCT_LABELS[order.product_type] || order.product_type}
                            </Badge>
                          </div>
                          <p className="font-mono text-xs text-white">{order.customer_name}</p>
                          {order.phone && (
                            <p className="font-mono text-[10px] text-zinc-500 flex items-center gap-1 mt-1">
                              <Phone className="w-3 h-3" />
                              {order.phone}
                            </p>
                          )}
                          <div className="mt-2 pt-2 border-t border-zinc-700 space-y-2">
                            <Select
                              value={order.lalo_status}
                              onValueChange={(v) => {
                                event?.stopPropagation();
                                handleUpdateLaloStatus(order.id, v);
                              }}
                            >
                              <SelectTrigger 
                                className="h-7 text-[10px] bg-zinc-900 border-zinc-700"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 border-zinc-700">
                                {Object.entries(LALO_STATUSES).map(([key, s]) => (
                                  <SelectItem key={key} value={key} className="text-xs">
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            
                            {/* Move to Department dropdown */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full h-7 text-[10px] bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ArrowRightLeft className="w-3 h-3 mr-1" />
                                  Move to Department
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="bg-zinc-900 border-zinc-700 w-48">
                                {DEPARTMENTS.map((d) => (
                                  <DropdownMenuItem 
                                    key={d.value} 
                                    className="text-xs cursor-pointer hover:bg-zinc-800"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveOrder(order.id, d.value);
                                    }}
                                  >
                                    {d.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </ScrollArea>
              </Card>
            );
          })}
        </div>

        {/* Order Detail Modal */}
        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedOrder && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white flex items-center gap-3">
                    <span className="text-amber-500">{selectedOrder.order_number}</span>
                    <Badge className={`${PRODUCT_COLORS[selectedOrder.product_type]?.text || "text-zinc-400"} ${PRODUCT_COLORS[selectedOrder.product_type]?.border || "border-zinc-400"} bg-transparent`}>
                      {PRODUCT_LABELS[selectedOrder.product_type] || selectedOrder.product_type}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  {/* Customer Info */}
                  <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                    <h3 className="font-oswald uppercase tracking-wider text-xs text-zinc-400 mb-3">Customer Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-zinc-500" />
                        <span className="font-mono text-sm text-white">{selectedOrder.customer_name}</span>
                      </div>
                      {selectedOrder.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-zinc-500" />
                          <span className="font-mono text-sm text-white">{selectedOrder.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Order Details */}
                  <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                    <h3 className="font-oswald uppercase tracking-wider text-xs text-zinc-400 mb-3">Order Details</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-zinc-500 font-mono text-[10px] uppercase">Wheel Specs</span>
                        <p className="text-white font-mono">{selectedOrder.wheel_specs || "-"}</p>
                      </div>
                      {selectedOrder.vehicle_make && (
                        <div>
                          <span className="text-zinc-500 font-mono text-[10px] uppercase">Vehicle</span>
                          <p className="text-white font-mono">{selectedOrder.vehicle_make} {selectedOrder.vehicle_model}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-zinc-500 font-mono text-[10px] uppercase">Order Date</span>
                        <p className="text-white font-mono">{new Date(selectedOrder.order_date).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500 font-mono text-[10px] uppercase">Lalo Status</span>
                        <Select
                          value={selectedOrder.lalo_status || "not_sent"}
                          onValueChange={(v) => handleUpdateLaloStatus(selectedOrder.id, v)}
                        >
                          <SelectTrigger className="mt-1 bg-zinc-900 border-zinc-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700">
                            {Object.entries(LALO_STATUSES).map(([key, s]) => (
                              <SelectItem key={key} value={key}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {selectedOrder.notes && (
                      <div className="mt-3 pt-3 border-t border-zinc-700">
                        <span className="text-zinc-500 font-mono text-[10px] uppercase">Notes</span>
                        <p className="text-white font-mono text-sm mt-1">{selectedOrder.notes}</p>
                      </div>
                    )}
                    
                    {/* Move to Department */}
                    <div className="mt-3 pt-3 border-t border-zinc-700">
                      <span className="text-zinc-500 font-mono text-[10px] uppercase block mb-2">Move to Department</span>
                      <div className="flex flex-wrap gap-2">
                        {DEPARTMENTS.map((d) => (
                          <Button
                            key={d.value}
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-amber-500 hover:text-black hover:border-amber-500"
                            onClick={() => handleMoveOrder(selectedOrder.id, d.value)}
                          >
                            {d.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Order Notes */}
                  <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                    <h3 className="font-oswald uppercase tracking-wider text-xs text-zinc-400 mb-3 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Notes ({selectedOrder.order_notes?.length || 0})
                    </h3>
                    <ScrollArea className="max-h-40">
                      {selectedOrder.order_notes?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedOrder.order_notes.map((note) => (
                            <div key={note.id} className="bg-zinc-900 p-2 rounded border border-zinc-700">
                              <p className="font-mono text-xs text-white">{note.text}</p>
                              <p className="font-mono text-[9px] text-zinc-500 mt-1">
                                {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-zinc-600 font-mono text-xs">No notes yet</p>
                      )}
                    </ScrollArea>
                    <div className="flex gap-2 mt-3">
                      <Input
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add a note..."
                        className="bg-zinc-900 border-zinc-700 font-mono text-sm"
                        onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                      />
                      <Button
                        onClick={handleAddNote}
                        disabled={!newNote.trim()}
                        size="sm"
                        className="bg-amber-500 hover:bg-amber-400 text-black"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
