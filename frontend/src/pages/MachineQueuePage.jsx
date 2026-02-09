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
import {
  RefreshCw, LogOut, ArrowLeft, Package, Circle, ChevronRight,
  MessageSquare, Send, User, Phone, Layers
} from "lucide-react";
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
};

const DEPT_LABELS = {
  machine_waiting: "Machine Waiting",
  machine: "Machine"
};

export default function MachineQueuePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [queueData, setQueueData] = useState({ groups: [], total_orders: 0, product_types: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [newNote, setNewNote] = useState("");

  const isAdmin = user?.role === "admin";

  const fetchData = async (showToast = false) => {
    if (showToast) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/machine-queue`);
      setQueueData(res.data);
      if (showToast) toast.success("Refreshed!");
    } catch (error) {
      toast.error("Failed to fetch machine queue");
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

  const handleAdvanceOrder = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/advance`);
      toast.success("Order advanced to next department!");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to advance order");
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

  const exportGroupPDF = (group) => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CORLEONE FORGED", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`Machine Queue - ${group.label}`, 105, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, { align: "center" });
    doc.text(`Total Orders: ${group.order_count} | Total Quantity: ${group.total_quantity}`, 105, 44, { align: "center" });
    
    const tableData = group.orders.map(order => {
      // For steering wheels, include brand
      const brandInfo = order.product_type === "steering_wheel" && order.steering_wheel_brand 
        ? order.steering_wheel_brand 
        : "-";
      return [
        order.order_number,
        order.customer_name,
        brandInfo,
        order.quantity || 1,
        DEPT_LABELS[order.current_department] || order.current_department,
        order.wheel_specs.substring(0, 35) + (order.wheel_specs.length > 35 ? "..." : ""),
        new Date(order.order_date).toLocaleDateString()
      ];
    });
    
    autoTable(doc, {
      startY: 52,
      head: [["Order #", "Customer", "Brand", "Qty", "Status", "Specs", "Date"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    
    doc.save(`corleone-machine-queue-${group.product_type}-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success(`PDF exported for ${group.label}!`);
  };

  const getProductColor = (productType) => {
    return PRODUCT_COLORS[productType] || { text: "text-zinc-400", border: "border-zinc-400", bg: "bg-zinc-400" };
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="app-header sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="https://customer-assets.emergentagent.com/job_31a0c595-a4df-4df8-a9b1-3cd3b62875e2/artifacts/mjago68w_logo_cf_red-removebg-preview%20%281%29.png" 
                alt="Corleone Forged" 
                className="h-10 w-auto cursor-pointer"
                onClick={() => navigate("/")}
              />
              <h1 
                className="font-oswald text-xl md:text-2xl uppercase tracking-widest text-white cursor-pointer"
                onClick={() => navigate("/")}
              >
                Machine Queue
              </h1>
              <Badge className="ml-2 bg-orange-500/20 text-orange-400 border-orange-500 font-mono text-[10px] uppercase tracking-wider">
                Machinist View
              </Badge>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/")}
                className="border-zinc-700 hover:border-red-500 hover:text-red-500 font-mono text-xs"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Dashboard
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

      <main className="max-w-[1920px] mx-auto p-4 md:p-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Total in Queue</p>
              <p className="font-oswald text-3xl text-white">{queueData.total_orders}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Product Types</p>
              <p className="font-oswald text-3xl text-orange-500">{queueData.groups.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 col-span-2">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">Quick Summary</p>
              <div className="flex flex-wrap gap-2">
                {queueData.groups.map(group => (
                  <Badge 
                    key={group.product_type}
                    className={`${getProductColor(group.product_type).text} ${getProductColor(group.product_type).border} bg-transparent`}
                  >
                    {group.label}: {group.order_count} orders ({group.total_quantity} qty)
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Grouped Orders */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-yellow-500 font-oswald uppercase tracking-widest animate-pulse">
              Loading Queue...
            </div>
          </div>
        ) : queueData.groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Layers className="w-16 h-16 text-zinc-700 mb-4" />
            <p className="text-zinc-500 font-oswald uppercase tracking-widest text-lg">No orders in machine queue</p>
            <p className="text-zinc-600 font-mono text-sm mt-2">Orders will appear here when they reach Machine Waiting or Machine stage</p>
          </div>
        ) : (
          <div className="space-y-6">
            {queueData.groups.map(group => (
              <Card key={group.product_type} className={`bg-zinc-900/50 border-zinc-800 border-l-4 ${getProductColor(group.product_type).border}`}>
                <CardHeader className="border-b border-zinc-800 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className={`font-oswald uppercase tracking-wider text-xl ${getProductColor(group.product_type).text}`}>
                        {group.label}
                      </CardTitle>
                      <Badge className={`${getProductColor(group.product_type).text} ${getProductColor(group.product_type).border} bg-transparent text-sm px-3 py-1`}>
                        {group.order_count} orders
                      </Badge>
                      <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 text-sm px-3 py-1">
                        {group.total_quantity} total qty
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportGroupPDF(group)}
                      className="border-zinc-700 hover:border-red-500 hover:text-red-500 font-mono text-xs"
                    >
                      Export PDF
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {group.orders.map(order => (
                      <div 
                        key={order.id}
                        className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 hover:border-zinc-600 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div 
                            className="cursor-pointer flex-1"
                            onClick={() => openOrderDetail(order.id)}
                          >
                            <p className="font-mono text-sm text-red-500 font-medium">{order.order_number}</p>
                            <p className="font-mono text-base text-white mt-1">{order.customer_name}</p>
                          </div>
                          {order.quantity > 1 && (
                            <Badge className="bg-zinc-700 text-white border-none text-sm">
                              x{order.quantity}
                            </Badge>
                          )}
                        </div>
                        
                        <p className="font-mono text-xs text-zinc-400 mb-3 line-clamp-2">
                          {order.wheel_specs}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <Badge className={`text-[10px] ${order.current_department === "machine" ? "bg-orange-500 text-black" : "bg-yellow-500/20 text-yellow-400 border-yellow-500"}`}>
                            {DEPT_LABELS[order.current_department]}
                          </Badge>
                          
                          {(isAdmin || user?.department === order.current_department) && (
                            <Button
                              size="sm"
                              onClick={() => handleAdvanceOrder(order.id)}
                              className="h-7 px-3 bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-wider text-[10px] font-bold"
                            >
                              <ChevronRight className="w-3 h-3 mr-1" /> Done
                            </Button>
                          )}
                        </div>
                        
                        {/* Notes indicator */}
                        {order.order_notes && order.order_notes.length > 0 && (
                          <div className="flex items-center gap-1 text-yellow-500 text-[10px] mt-2">
                            <MessageSquare className="w-3 h-3" />
                            <span>{order.order_notes.length} note{order.order_notes.length > 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Order Detail Modal */}
        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-hidden">
            {selectedOrder && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white flex items-center gap-3">
                    <span className="text-red-500">{selectedOrder.order_number}</span>
                    <Badge className={`${getProductColor(selectedOrder.product_type).text} ${getProductColor(selectedOrder.product_type).border} bg-transparent`}>
                      {queueData.product_types[selectedOrder.product_type] || selectedOrder.product_type}
                    </Badge>
                    {selectedOrder.quantity > 1 && (
                      <Badge className="bg-zinc-700 text-white border-none">
                        Qty: {selectedOrder.quantity}
                      </Badge>
                    )}
                  </DialogTitle>
                </DialogHeader>
                
                <ScrollArea className="max-h-[70vh] pr-4">
                  <div className="space-y-4 mt-4">
                    {/* Customer Info */}
                    <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                      <h3 className="font-oswald uppercase tracking-wider text-xs text-zinc-400 mb-3">Customer Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-zinc-500" />
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">Customer Name</p>
                            <p className="font-mono text-sm text-white">{selectedOrder.customer_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-zinc-500" />
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">Phone</p>
                            <p className="font-mono text-sm text-white">{selectedOrder.phone || "Not provided"}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Order Details */}
                    <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                      <h3 className="font-oswald uppercase tracking-wider text-xs text-zinc-400 mb-3">Order Details</h3>
                      <div className="space-y-2">
                        <div>
                          <p className="font-mono text-[10px] text-zinc-500">Specs</p>
                          <p className="font-mono text-sm text-white">{selectedOrder.wheel_specs}</p>
                        </div>
                        {selectedOrder.notes && (
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">Notes</p>
                            <p className="font-mono text-sm text-zinc-300">{selectedOrder.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Notes Section */}
                    <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                      <h3 className="font-oswald uppercase tracking-wider text-xs text-zinc-400 mb-3">
                        <MessageSquare className="w-4 h-4 inline mr-2" />
                        Notes ({selectedOrder.order_notes?.length || 0})
                      </h3>
                      
                      <div className="space-y-3 mb-4 max-h-48 overflow-auto">
                        {(!selectedOrder.order_notes || selectedOrder.order_notes.length === 0) ? (
                          <p className="text-zinc-500 font-mono text-xs">No notes yet</p>
                        ) : (
                          selectedOrder.order_notes.map((note) => {
                            const colors = [
                              "text-red-400", "text-blue-400", "text-green-400", "text-yellow-400",
                              "text-purple-400", "text-pink-400", "text-cyan-400", "text-orange-400"
                            ];
                            const borderColors = [
                              "border-red-500", "border-blue-500", "border-green-500", "border-yellow-500",
                              "border-purple-500", "border-pink-500", "border-cyan-500", "border-orange-500"
                            ];
                            const idHash = (note.created_by || note.created_by_name).split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
                            const colorIndex = idHash % colors.length;
                            
                            return (
                              <div key={note.id} className={`bg-zinc-900 p-3 rounded border-l-2 ${borderColors[colorIndex]}`}>
                                <p className="font-mono text-sm text-white">{note.text}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <span className={`font-mono text-[10px] font-bold ${colors[colorIndex]}`}>{note.created_by_name}</span>
                                  <span className="font-mono text-[10px] text-zinc-600">•</span>
                                  <span className="font-mono text-[10px] text-zinc-500">{new Date(note.created_at).toLocaleString()}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Input
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          placeholder="Add a note..."
                          className="bg-zinc-950 border-zinc-700 font-mono text-sm"
                          onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                        />
                        <Button
                          onClick={handleAddNote}
                          disabled={!newNote.trim()}
                          className="bg-red-500 hover:bg-red-400 text-white"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
