import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Settings, ArrowLeft, Truck, Package, CheckCircle2, Circle,
  FileText, Calendar, RefreshCw, Download, CalendarDays
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";

export default function CompletedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const fetchOrders = async (showToast = false) => {
    if (showToast) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/orders/completed`, {
        params: {
          final_status: statusFilter,
          product_type: productFilter,
        },
      });
      setOrders(res.data);
      if (showToast) toast.success("Refreshed!");
    } catch (error) {
      toast.error("Failed to fetch completed orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, productFilter, startDate, endDate]);

  const handleChangeStatus = async (orderId, newStatus) => {
    try {
      await axios.put(`${API}/orders/${orderId}/final-status`, { final_status: newStatus });
      toast.success(`Order marked as ${newStatus}!`);
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update status");
    }
  };

  // Filter orders by date range
  const filteredOrders = orders.filter(order => {
    const orderDate = new Date(order.order_date);
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (orderDate < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (orderDate > end) return false;
    }
    return true;
  });

  const pickupCount = filteredOrders.filter(o => o.final_status === "pickup" || !o.final_status).length;
  const shippedCount = filteredOrders.filter(o => o.final_status === "shipped").length;

  const exportCompletedPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CORLEONE FORGED", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text("Completed Orders Report", 105, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, { align: "center" });
    
    // Show date range if selected
    let dateRangeText = "All Dates";
    if (startDate && endDate) {
      dateRangeText = `${format(startDate, "MMM dd, yyyy")} - ${format(endDate, "MMM dd, yyyy")}`;
    } else if (startDate) {
      dateRangeText = `From ${format(startDate, "MMM dd, yyyy")}`;
    } else if (endDate) {
      dateRangeText = `Until ${format(endDate, "MMM dd, yyyy")}`;
    }
    doc.text(`Date Range: ${dateRangeText}`, 105, 44, { align: "center" });
    doc.text(`Total Orders: ${filteredOrders.length}`, 105, 50, { align: "center" });
    
    const tableData = filteredOrders.map(order => {
      // For steering wheels, include brand
      const brandInfo = order.product_type === "steering_wheel" && order.steering_wheel_brand 
        ? order.steering_wheel_brand 
        : "-";
      return [
        order.order_number,
        order.customer_name,
        order.product_type === "rim" ? "Rim" : "Steering Wheel",
        brandInfo,
        order.wheel_specs.substring(0, 30) + (order.wheel_specs.length > 30 ? "..." : ""),
        new Date(order.order_date).toLocaleDateString(),
        order.status === "done" ? "Completed" : "In Progress"
      ];
    });
    
    autoTable(doc, {
      startY: 58,
      head: [["Order #", "Customer", "Type", "Brand", "Specs", "Date", "Status"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 7, cellPadding: 2 },
    });
    
    doc.save(`corleone-forged-completed-orders-${new Date().toISOString().split("T")[0]}.pdf`);
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
                Corleone Forged
              </h1>
              <Badge className="ml-2 bg-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-wider border-zinc-700">
                Completed Orders
              </Badge>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={exportCompletedPDF}
              className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white font-oswald uppercase tracking-wider text-xs"
              data-testid="export-completed-pdf-btn"
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
              data-testid="refresh-completed-btn"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-4 md:p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Total Completed</p>
              <p className="font-oswald text-3xl text-green-500" data-testid="total-completed">{filteredOrders.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Ready for Pickup</p>
              <p className="font-oswald text-3xl text-red-500" data-testid="pickup-count">{pickupCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Shipped</p>
              <p className="font-oswald text-3xl text-blue-500" data-testid="shipped-count">{shippedCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Report</p>
              <p className="font-oswald text-xl text-zinc-400">
                <Calendar className="w-6 h-6 inline" />
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* Date Range Filters */}
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-zinc-500" />
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="h-9 bg-zinc-800 border-zinc-700 text-zinc-300 font-mono text-xs hover:bg-zinc-700"
                  data-testid="start-date-btn"
                >
                  {startDate ? format(startDate, "MMM dd, yyyy") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  className="rounded-md border border-zinc-800"
                />
              </PopoverContent>
            </Popover>
            <span className="text-zinc-500">to</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="h-9 bg-zinc-800 border-zinc-700 text-zinc-300 font-mono text-xs hover:bg-zinc-700"
                  data-testid="end-date-btn"
                >
                  {endDate ? format(endDate, "MMM dd, yyyy") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  className="rounded-md border border-zinc-800"
                />
              </PopoverContent>
            </Popover>
            {(startDate || endDate) && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { setStartDate(null); setEndDate(null); }}
                className="text-zinc-400 hover:text-red-500"
                data-testid="clear-dates-btn"
              >
                Clear
              </Button>
            )}
          </div>

          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="bg-zinc-800/50 p-1">
              <TabsTrigger
                value="all"
                className="font-oswald uppercase tracking-wider text-xs data-[state=active]:bg-red-500 data-[state=active]:text-white"
                data-testid="filter-status-all"
              >
                All Status
              </TabsTrigger>
              <TabsTrigger
                value="pickup"
                className="font-oswald uppercase tracking-wider text-xs data-[state=active]:bg-red-500 data-[state=active]:text-white"
                data-testid="filter-status-pickup"
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Pickup
              </TabsTrigger>
              <TabsTrigger
                value="shipped"
                className="font-oswald uppercase tracking-wider text-xs data-[state=active]:bg-blue-500 data-[state=active]:text-black"
                data-testid="filter-status-shipped"
              >
                <Truck className="w-3 h-3 mr-1" />
                Shipped
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={productFilter} onValueChange={setProductFilter}>
            <TabsList className="bg-zinc-800/50 p-1">
              <TabsTrigger
                value="all"
                className="font-oswald uppercase tracking-wider text-xs data-[state=active]:bg-zinc-600 data-[state=active]:text-white"
                data-testid="filter-product-all"
              >
                All Products
              </TabsTrigger>
              <TabsTrigger
                value="rim"
                className="font-oswald uppercase tracking-wider text-xs data-[state=active]:bg-cyan-500 data-[state=active]:text-black"
                data-testid="filter-product-rim"
              >
                <Circle className="w-3 h-3 mr-1" />
                Rims
              </TabsTrigger>
              <TabsTrigger
                value="steering_wheel"
                className="font-oswald uppercase tracking-wider text-xs data-[state=active]:bg-violet-500 data-[state=active]:text-black"
                data-testid="filter-product-steering"
              >
                <Package className="w-3 h-3 mr-1" />
                Steering
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Orders Table */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="border-b border-zinc-800 p-4">
            <CardTitle className="font-oswald uppercase tracking-widest text-sm text-zinc-300">
              <FileText className="w-4 h-4 inline mr-2" />
              Completed Orders Report
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-yellow-500 font-oswald uppercase tracking-widest animate-pulse">
                  Loading...
                </div>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-zinc-600 font-mono text-sm">No completed orders found</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-450px)] min-h-[400px]">
                <Table className="data-table">
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="font-oswald text-zinc-500">Order #</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Customer</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Phone</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Product</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Specs</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Order Date</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Status</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => (
                      <TableRow
                        key={order.id}
                        className="border-zinc-800 hover:bg-zinc-800/50"
                        data-testid={`completed-order-${order.id}`}
                      >
                        <TableCell className="font-mono text-yellow-500 text-xs">
                          {order.order_number}
                        </TableCell>
                        <TableCell className="font-mono text-white text-sm">
                          {order.customer_name}
                        </TableCell>
                        <TableCell className="font-mono text-zinc-400 text-xs">
                          {order.phone || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`badge-industrial bg-transparent ${
                              order.product_type === "rim"
                                ? "text-cyan-500 border-cyan-500"
                                : "text-violet-500 border-violet-500"
                            }`}
                          >
                            {order.product_type === "rim" ? "RIM" : "STEERING WHEEL"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-zinc-400 text-xs max-w-[200px] truncate">
                          {order.wheel_specs}
                        </TableCell>
                        <TableCell className="font-mono text-zinc-500 text-xs">
                          {new Date(order.order_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`badge-industrial bg-transparent ${
                              order.final_status === "shipped"
                                ? "text-blue-500 border-blue-500"
                                : "text-red-500 border-red-500"
                            }`}
                          >
                            {order.final_status === "shipped" ? (
                              <><Truck className="w-3 h-3 mr-1" /> SHIPPED</>
                            ) : (
                              <><CheckCircle2 className="w-3 h-3 mr-1" /> PICKUP</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={order.final_status || "pickup"} 
                            onValueChange={(value) => handleChangeStatus(order.id, value)}
                          >
                            <SelectTrigger 
                              className="h-7 w-24 bg-zinc-800 border-zinc-700 text-[10px]"
                              data-testid={`status-select-${order.id}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              <SelectItem value="pickup" className="text-xs">
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-yellow-500" /> Pickup
                                </span>
                              </SelectItem>
                              <SelectItem value="shipped" className="text-xs">
                                <span className="flex items-center gap-1">
                                  <Truck className="w-3 h-3 text-blue-500" /> Shipped
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
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
