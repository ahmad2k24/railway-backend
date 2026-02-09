import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, FileText, RefreshCw, Download, Package, Circle
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const DEPT_LABELS = {
  "received": "Sales",
  "design": "Design",
  "program": "Program",
  "machine_waiting": "Machine Waiting",
  "machine": "Machine",
  "finishing": "Finishing",
  "powder_coat": "Powder Coat",
  "assemble": "Assemble",
  "showroom": "Showroom",
  "shipped": "Shipped",
  "completed": "Completed"
};

export default function MyOrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = async (showToast = false) => {
    if (showToast) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/users/my-orders`);
      setOrders(res.data);
      if (showToast) toast.success("Refreshed!");
    } catch (error) {
      toast.error("Failed to fetch your orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const completedCount = orders.filter(o => o.current_department === "completed").length;
  const activeCount = orders.filter(o => o.current_department !== "completed").length;

  const exportMyOrdersPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CORLEONE FORGED", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`My Orders Report - ${user?.name}`, 105, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, { align: "center" });
    doc.text(`Total Orders: ${orders.length} | Active: ${activeCount} | Completed: ${completedCount}`, 105, 44, { align: "center" });
    
    const tableData = orders.map(order => {
      // For steering wheels, include brand
      const brandInfo = order.product_type === "steering_wheel" && order.steering_wheel_brand 
        ? order.steering_wheel_brand 
        : "-";
      return [
        order.order_number,
        order.customer_name,
        order.product_type === "rim" ? "Rim" : "Steering Wheel",
        brandInfo,
        order.wheel_specs.substring(0, 25) + (order.wheel_specs.length > 25 ? "..." : ""),
        DEPT_LABELS[order.current_department] || order.current_department,
        new Date(order.order_date).toLocaleDateString()
      ];
    });
    
    autoTable(doc, {
      startY: 52,
      head: [["Order #", "Customer", "Type", "Brand", "Specs", "Status", "Date"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    
    doc.save(`my-orders-${user?.name?.replace(/\s+/g, '-')}-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("PDF exported!");
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="app-header sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-zinc-400 hover:text-white mr-2"
                data-testid="back-btn"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <img 
                src="https://customer-assets.emergentagent.com/job_31a0c595-a4df-4df8-a9b1-3cd3b62875e2/artifacts/mjago68w_logo_cf_red-removebg-preview%20%281%29.png" 
                alt="Corleone Forged" 
                className="h-8 w-auto cursor-pointer"
                onClick={() => navigate("/")}
                data-testid="logo-home"
              />
              <h1 
                className="font-oswald text-xl md:text-2xl uppercase tracking-widest text-white cursor-pointer"
                onClick={() => navigate("/")}
              >
                My Orders
              </h1>
              <Badge className="ml-2 bg-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-wider border-zinc-700">
                {user?.name}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportMyOrdersPDF}
                className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white font-oswald uppercase tracking-wider text-xs"
                data-testid="export-my-orders-pdf-btn"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchOrders(true)}
                disabled={refreshing}
                className="text-zinc-400 hover:text-white"
                data-testid="refresh-my-orders-btn"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-4 md:p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Total Orders</p>
              <p className="font-oswald text-3xl text-white" data-testid="total-my-orders">{orders.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Active</p>
              <p className="font-oswald text-3xl text-yellow-500" data-testid="active-my-orders">{activeCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Completed</p>
              <p className="font-oswald text-3xl text-green-500" data-testid="completed-my-orders">{completedCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Orders Table */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="border-b border-zinc-800 p-4">
            <CardTitle className="font-oswald uppercase tracking-widest text-sm text-zinc-300">
              <FileText className="w-4 h-4 inline mr-2" />
              Orders I Created
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-red-500 font-oswald uppercase tracking-widest animate-pulse">
                  Loading...
                </div>
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2">
                <p className="text-zinc-600 font-mono text-sm">No orders found</p>
                <p className="text-zinc-700 font-mono text-xs">Orders you create will appear here</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-400px)] min-h-[400px]">
                <Table className="data-table">
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="font-oswald text-zinc-500">Order #</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Customer</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Phone</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Type</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Specs</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Current Status</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Order Date</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Created By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow
                        key={order.id}
                        className="border-zinc-800 hover:bg-zinc-800/50"
                        data-testid={`my-order-row-${order.id}`}
                      >
                        <TableCell className="font-mono text-red-500 text-xs">
                          {order.order_number}
                        </TableCell>
                        <TableCell className="font-mono text-white text-sm">
                          {order.customer_name}
                        </TableCell>
                        <TableCell className="font-mono text-zinc-400 text-xs">
                          {order.phone || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={`badge-industrial bg-transparent ${order.product_type === "rim" ? "text-cyan-500 border-cyan-500" : "text-violet-500 border-violet-500"}`}>
                            {order.product_type === "rim" ? "RIM" : "STEERING WHEEL"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-zinc-400 text-xs max-w-[200px] truncate">
                          {order.wheel_specs}
                        </TableCell>
                        <TableCell>
                          <Badge className={`badge-industrial bg-transparent ${order.current_department === "completed" ? "text-green-500 border-green-500" : "text-yellow-500 border-yellow-500"}`}>
                            {DEPT_LABELS[order.current_department] || order.current_department}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-zinc-500 text-xs">
                          {new Date(order.order_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-mono text-zinc-400 text-xs">
                          {order.created_by_user_name || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
