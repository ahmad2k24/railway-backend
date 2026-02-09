import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { API, useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  RefreshCw, 
  Activity,
  ArrowRightLeft,
  MessageSquare,
  LogIn,
  AlertCircle,
  User,
  Clock,
  Filter,
  Calendar,
  FileText,
  Package,
  Pencil,
  Trash2,
  ShoppingCart,
  DollarSign,
  Scissors,
  CheckSquare
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const ACTION_ICONS = {
  move: ArrowRightLeft,
  note: MessageSquare,
  login: LogIn,
  status_change: AlertCircle,
  stock_add: Package,
  stock_update: Pencil,
  stock_delete: Trash2,
  stock_sold: ShoppingCart,
  stock_bulk_import: Package,
  cut_status_change: Scissors,
  bulk_cut_status: CheckSquare
};

// Product type labels for display
const PRODUCT_TYPE_LABELS = {
  rim: "Rim",
  steering_wheel: "Steering Wheel",
  standard_caps: "Standard Caps",
  floater_caps: "Floater Caps",
  xxl_caps: "XXL Caps",
  dually_floating_caps: "Dually Floating Caps",
  offroad_floating_caps: "Off-Road Floating Caps",
  custom_caps: "Custom Caps",
  race_car_caps: "Tall Caps"
};

const ACTION_COLORS = {
  move: "bg-blue-500/20 text-blue-400 border-blue-500",
  note: "bg-green-500/20 text-green-400 border-green-500",
  login: "bg-purple-500/20 text-purple-400 border-purple-500",
  status_change: "bg-orange-500/20 text-orange-400 border-orange-500",
  stock_add: "bg-emerald-500/20 text-emerald-400 border-emerald-500",
  stock_update: "bg-yellow-500/20 text-yellow-400 border-yellow-500",
  stock_delete: "bg-red-500/20 text-red-400 border-red-500",
  stock_sold: "bg-pink-500/20 text-pink-400 border-pink-500",
  stock_bulk_import: "bg-cyan-500/20 text-cyan-400 border-cyan-500",
  cut_status_change: "bg-amber-500/20 text-amber-400 border-amber-500",
  bulk_cut_status: "bg-rose-500/20 text-rose-400 border-rose-500"
};

const ACTION_LABELS = {
  move: "Order Move",
  note: "Note Added",
  login: "Login",
  status_change: "Status Change",
  stock_add: "Stock Added",
  stock_update: "Stock Updated",
  stock_delete: "Stock Deleted",
  stock_sold: "Stock Sold",
  stock_bulk_import: "Bulk Stock Import",
  cut_status_change: "Cut Status Change",
  bulk_cut_status: "Bulk Cut Status"
};

export default function ActivityLogPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activityData, setActivityData] = useState(null);
  
  // Filters
  const [selectedUser, setSelectedUser] = useState("all");
  const [actionType, setActionType] = useState("all");
  const [days, setDays] = useState("7");
  
  // Users list for filter
  const [users, setUsers] = useState([]);
  
  // Auto-refresh settings
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5); // seconds

  // Payout Report Modal
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutEmployee, setPayoutEmployee] = useState("");
  const [payoutHourlyRate, setPayoutHourlyRate] = useState("");
  const [payoutHoursWorked, setPayoutHoursWorked] = useState("");
  const [payoutDateFrom, setPayoutDateFrom] = useState("");
  const [payoutDateTo, setPayoutDateTo] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "admin_restricted";

  useEffect(() => {
    fetchUsers();
    fetchActivity();
  }, []);

  useEffect(() => {
    fetchActivity();
  }, [selectedUser, actionType, days]);
  
  // Auto-refresh effect
  useEffect(() => {
    let intervalId;
    if (autoRefresh) {
      intervalId = setInterval(() => {
        fetchActivity(false, true); // silent refresh
      }, refreshInterval * 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval, selectedUser, actionType, days]);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API}/admin/users`);
      setUsers(res.data || []);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  };

  const fetchActivity = async (showRefresh = false, silent = false) => {
    if (showRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);

    try {
      const params = new URLSearchParams();
      if (selectedUser !== "all") params.append("user_id", selectedUser);
      if (actionType !== "all") params.append("action_type", actionType);
      params.append("days", days);
      params.append("limit", "200");
      
      const res = await axios.get(`${API}/activity-log?${params.toString()}`);
      setActivityData(res.data);
      if (showRefresh) toast.success("Refreshed!");
    } catch (error) {
      if (!silent) toast.error("Failed to fetch activity log");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return "N/A";
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Separate function for PDF export - always shows actual date/time
  const formatTimestampForPDF = (ts) => {
    if (!ts) return "N/A";
    const date = new Date(ts);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const exportPDF = () => {
    try {
      if (!activityData || !activityData.activities || activityData.activities.length === 0) {
        toast.error("No activity data to export");
        return;
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(220, 38, 38); // Red color
      doc.text("CORLEONE FORGED", pageWidth / 2, 20, { align: "center" });
      
      doc.setFontSize(14);
      doc.setTextColor(100, 100, 100);
      doc.text("Activity Log Report", pageWidth / 2, 28, { align: "center" });
      
      // Report info
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      const reportDate = new Date().toLocaleString();
      doc.text(`Generated: ${reportDate}`, 14, 40);
      
      // Filter info
      let filterText = `Time Range: Last ${days} days`;
      if (selectedUser !== "all") {
        const selectedUserObj = users.find(u => u.id === selectedUser);
        filterText += ` | User: ${selectedUserObj?.name || selectedUserObj?.email || selectedUser}`;
      }
      if (actionType !== "all") {
        filterText += ` | Action: ${ACTION_LABELS[actionType] || actionType}`;
      }
      doc.text(filterText, 14, 46);
      doc.text(`Total Activities: ${activityData.total_activities}`, 14, 52);
      
      let currentY = 60;
      
      // User Summary Table
      if (activityData.user_summary && activityData.user_summary.length > 0) {
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text("User Summary", 14, currentY);
        
        const userSummaryData = activityData.user_summary.map(us => [
          us.user_name || "Unknown",
          us.total_actions || 0,
          us.moves || 0,
          us.notes || 0,
          us.logins || 0
        ]);
        
        autoTable(doc, {
          startY: currentY + 4,
          head: [["User", "Total", "Moves", "Notes", "Logins"]],
          body: userSummaryData,
          theme: "striped",
          headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
          styles: { fontSize: 9 },
          margin: { left: 14, right: 14 }
        });
        
        currentY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : currentY + 50;
      }
      
      // Activity Detail Table
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text("Activity Details", 14, currentY);
      
      const activityTableData = activityData.activities.map(act => [
        act.user_name || "Unknown",
        ACTION_LABELS[act.action_type] || act.action_type,
        act.order_number ? `#${act.order_number}` : "-",
        PRODUCT_TYPE_LABELS[act.product_type] || act.product_type || "-",
        (act.description || "").substring(0, 40) + ((act.description || "").length > 40 ? "..." : ""),
        formatTimestampForPDF(act.timestamp)
      ]);
      
      autoTable(doc, {
        startY: currentY + 4,
        head: [["User", "Action", "Order", "Item Type", "Description", "Date/Time"]],
        body: activityTableData,
        theme: "striped",
        headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 22 },
          2: { cellWidth: 18 },
          3: { cellWidth: 25 },
          4: { cellWidth: 50 },
          5: { cellWidth: 35 }
        },
        margin: { left: 14, right: 14 }
      });
      
      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} of ${pageCount} - Corleone Forged Activity Log`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: "center" }
        );
      }
      
      // Download
      const filename = `activity_log_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      toast.success("PDF report exported successfully!");
    } catch (error) {
      console.error("PDF Export Error:", error);
      toast.error("Failed to export PDF: " + (error.message || "Unknown error"));
    }
  };

  // Export Employee Payout Report PDF
  const exportPayoutPDF = () => {
    try {
      if (!payoutEmployee || !payoutHourlyRate || !payoutHoursWorked) {
        toast.error("Please fill in all required fields");
        return;
      }

      const selectedUserObj = users.find(u => u.id === payoutEmployee);
      const employeeName = selectedUserObj?.name || selectedUserObj?.email || "Unknown";
      const hourlyRate = parseFloat(payoutHourlyRate) || 0;
      const hoursWorked = parseFloat(payoutHoursWorked) || 0;
      const totalPay = hourlyRate * hoursWorked;

      // Filter activities for this employee
      let employeeActivities = activityData?.activities?.filter(act => act.user_id === payoutEmployee) || [];
      
      // Filter by date range if provided
      if (payoutDateFrom) {
        const fromDate = new Date(payoutDateFrom);
        employeeActivities = employeeActivities.filter(act => {
          const actDate = new Date(act.timestamp);
          return actDate >= fromDate;
        });
      }
      if (payoutDateTo) {
        const toDate = new Date(payoutDateTo);
        toDate.setHours(23, 59, 59, 999); // Include the entire day
        employeeActivities = employeeActivities.filter(act => {
          const actDate = new Date(act.timestamp);
          return actDate <= toDate;
        });
      }

      // Count orders completed (moves)
      const orderMoves = employeeActivities.filter(act => act.action_type === "move");
      const uniqueOrders = [...new Set(orderMoves.map(act => act.order_number).filter(Boolean))];

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(220, 38, 38);
      doc.text("CORLEONE FORGED", pageWidth / 2, 20, { align: "center" });
      
      doc.setFontSize(14);
      doc.setTextColor(100, 100, 100);
      doc.text("Employee Payout Report", pageWidth / 2, 28, { align: "center" });
      
      // Report info
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      const reportDate = new Date().toLocaleString();
      doc.text(`Generated: ${reportDate}`, 14, 40);
      
      // Date range
      let dateRangeText = "Date Range: ";
      if (payoutDateFrom && payoutDateTo) {
        dateRangeText += `${new Date(payoutDateFrom).toLocaleDateString()} - ${new Date(payoutDateTo).toLocaleDateString()}`;
      } else if (payoutDateFrom) {
        dateRangeText += `From ${new Date(payoutDateFrom).toLocaleDateString()}`;
      } else if (payoutDateTo) {
        dateRangeText += `Until ${new Date(payoutDateTo).toLocaleDateString()}`;
      } else {
        dateRangeText += `Last ${days} days`;
      }
      doc.text(dateRangeText, 14, 46);

      let currentY = 58;

      // Employee Summary Box
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(14, currentY, pageWidth - 28, 50, 3, 3, 'F');
      
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text("Employee Summary", 20, currentY + 12);
      
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.text(`Employee: ${employeeName}`, 20, currentY + 24);
      doc.text(`Hourly Rate: $${hourlyRate.toFixed(2)}`, 20, currentY + 32);
      doc.text(`Hours Worked: ${hoursWorked}`, 20, currentY + 40);
      
      // Total Pay - highlighted
      doc.setFontSize(14);
      doc.setTextColor(220, 38, 38);
      doc.text(`Total Pay: $${totalPay.toFixed(2)}`, pageWidth - 60, currentY + 32);
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text(`Orders Processed: ${uniqueOrders.length}`, pageWidth - 60, currentY + 42);

      currentY += 60;

      // Work Summary Table
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text("Work Summary", 14, currentY);

      // Group activities by type
      const activityCounts = {};
      employeeActivities.forEach(act => {
        const type = ACTION_LABELS[act.action_type] || act.action_type;
        activityCounts[type] = (activityCounts[type] || 0) + 1;
      });

      const summaryData = Object.entries(activityCounts).map(([type, count]) => [type, count]);
      if (summaryData.length === 0) {
        summaryData.push(["No activities found", "-"]);
      }

      autoTable(doc, {
        startY: currentY + 4,
        head: [["Activity Type", "Count"]],
        body: summaryData,
        theme: "striped",
        headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
        styles: { fontSize: 10 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 40 }
        },
        margin: { left: 14, right: 14 }
      });

      currentY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : currentY + 40;

      // Orders Processed Table (only moves)
      if (orderMoves.length > 0) {
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text("Orders Processed", 14, currentY);

        const orderTableData = orderMoves.map(act => [
          act.order_number ? `#${act.order_number}` : "-",
          PRODUCT_TYPE_LABELS[act.product_type] || act.product_type || "-",
          act.customer_name || "-",
          (act.description || "").substring(0, 35) + ((act.description || "").length > 35 ? "..." : ""),
          formatTimestampForPDF(act.timestamp)
        ]);

        autoTable(doc, {
          startY: currentY + 4,
          head: [["Order #", "Item Type", "Customer", "Action", "Date/Time"]],
          body: orderTableData,
          theme: "striped",
          headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 30 },
            2: { cellWidth: 35 },
            3: { cellWidth: 50 },
            4: { cellWidth: 35 }
          },
          margin: { left: 14, right: 14 }
        });
      }

      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} of ${pageCount} - Corleone Forged Employee Payout Report`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: "center" }
        );
      }

      // Download
      const filename = `payout_report_${employeeName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      toast.success("Payout report exported successfully!");
      setShowPayoutModal(false);
      
      // Reset form
      setPayoutEmployee("");
      setPayoutHourlyRate("");
      setPayoutHoursWorked("");
      setPayoutDateFrom("");
      setPayoutDateTo("");
    } catch (error) {
      console.error("Payout PDF Export Error:", error);
      toast.error("Failed to export payout report: " + (error.message || "Unknown error"));
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-red-500 font-oswald uppercase">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
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
              />
              <h1 
                className="font-oswald text-xl md:text-2xl uppercase tracking-widest text-white cursor-pointer"
                onClick={() => navigate("/")}
              >
                Activity Log
              </h1>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPayoutModal(true)}
                disabled={loading || !activityData?.activities?.length}
                className="bg-green-500/10 border-green-500 text-green-400 hover:bg-green-500/20 hover:text-green-300"
                data-testid="payout-report-btn"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Payout Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportPDF}
                disabled={loading || !activityData?.activities?.length}
                className="bg-red-500/10 border-red-500 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                data-testid="export-pdf-btn"
              >
                <FileText className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchActivity(true)}
                disabled={refreshing}
                className="text-zinc-400 hover:text-white"
                data-testid="refresh-btn"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-4 md:p-6">
        {/* Filters */}
        <Card className="bg-zinc-900 border-zinc-800 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="font-oswald text-lg uppercase tracking-wider text-white flex items-center gap-2">
              <Filter className="w-5 h-5 text-red-500" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label className="text-zinc-400 text-xs uppercase mb-2 block">User</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="all" className="text-white">All Users</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id} className="text-white">
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-zinc-400 text-xs uppercase mb-2 block">Action Type</Label>
                <Select value={actionType} onValueChange={setActionType}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="all" className="text-white">All Actions</SelectItem>
                    <SelectItem value="move" className="text-white">Order Moves</SelectItem>
                    <SelectItem value="note" className="text-white">Notes Added</SelectItem>
                    <SelectItem value="login" className="text-white">Logins</SelectItem>
                    <SelectItem value="status_change" className="text-white">Status Changes</SelectItem>
                    <SelectItem value="cut_status_change" className="text-white">Cut Status Changes</SelectItem>
                    <SelectItem value="bulk_cut_status" className="text-white">Bulk Cut Status</SelectItem>
                    <SelectItem value="stock_add" className="text-white">Stock Added</SelectItem>
                    <SelectItem value="stock_update" className="text-white">Stock Updated</SelectItem>
                    <SelectItem value="stock_delete" className="text-white">Stock Deleted</SelectItem>
                    <SelectItem value="stock_sold" className="text-white">Stock Sold</SelectItem>
                    <SelectItem value="stock_bulk_import" className="text-white">Bulk Imports</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-zinc-400 text-xs uppercase mb-2 block">Time Range</Label>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Last 7 days" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="1" className="text-white">Last 24 hours</SelectItem>
                    <SelectItem value="3" className="text-white">Last 3 days</SelectItem>
                    <SelectItem value="7" className="text-white">Last 7 days</SelectItem>
                    <SelectItem value="14" className="text-white">Last 14 days</SelectItem>
                    <SelectItem value="30" className="text-white">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Real-time Auto-refresh Controls */}
            <div className="flex items-center gap-4 pt-4 border-t border-zinc-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoRefresh ? 'bg-green-500' : 'bg-zinc-700'
                  }`}
                  data-testid="auto-refresh-toggle"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoRefresh ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <Label className="text-zinc-400 text-xs uppercase">
                  {autoRefresh ? (
                    <span className="text-green-400 flex items-center gap-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      LIVE
                    </span>
                  ) : (
                    'Auto-Refresh OFF'
                  )}
                </Label>
              </div>
              
              {autoRefresh && (
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-500 text-xs">Refresh every:</Label>
                  <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white w-24 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="3" className="text-white">3 sec</SelectItem>
                      <SelectItem value="5" className="text-white">5 sec</SelectItem>
                      <SelectItem value="10" className="text-white">10 sec</SelectItem>
                      <SelectItem value="30" className="text-white">30 sec</SelectItem>
                      <SelectItem value="60" className="text-white">1 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="ml-auto text-zinc-500 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {activityData?.total_activities || 0} activities
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* User Summary Cards */}
            <div className="lg:col-span-1">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-3">
                  <CardTitle className="font-oswald text-lg uppercase tracking-wider text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-red-500" />
                    User Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-3">
                      {activityData?.user_summary?.map((us, idx) => (
                        <div 
                          key={idx}
                          className="p-3 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 cursor-pointer transition-colors"
                          onClick={() => setSelectedUser(us.user_id || "all")}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-sm text-white font-medium">{us.user_name}</span>
                            <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500 text-xs">
                              {us.total_actions}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-1 text-[10px]">
                            {us.moves > 0 && (
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/50">
                                {us.moves} moves
                              </Badge>
                            )}
                            {us.notes > 0 && (
                              <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/50">
                                {us.notes} notes
                              </Badge>
                            )}
                            {us.logins > 0 && (
                              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/50">
                                {us.logins} logins
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2 text-[10px] text-zinc-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Last: {formatTimestamp(us.last_activity)}
                          </div>
                        </div>
                      ))}
                      {(!activityData?.user_summary || activityData.user_summary.length === 0) && (
                        <div className="text-center py-8 text-zinc-500">
                          No user activity found
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Activity Feed */}
            <div className="lg:col-span-3">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-3">
                  <CardTitle className="font-oswald text-lg uppercase tracking-wider text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-red-500" />
                    Recent Activity
                    {activityData && (
                      <Badge variant="outline" className="ml-2 bg-zinc-800 text-zinc-400 border-zinc-700">
                        {activityData.total_activities} activities
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-2">
                      {activityData?.activities?.map((act, idx) => {
                        const IconComponent = ACTION_ICONS[act.action_type] || Activity;
                        const colorClass = ACTION_COLORS[act.action_type] || "bg-zinc-500/20 text-zinc-400 border-zinc-500";
                        
                        return (
                          <div 
                            key={idx}
                            className="p-3 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg ${colorClass.split(' ')[0]}`}>
                                <IconComponent className={`w-4 h-4 ${colorClass.split(' ')[1]}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm text-white font-medium">
                                    {act.user_name}
                                  </span>
                                  <Badge variant="outline" className={`text-[10px] ${colorClass}`}>
                                    {ACTION_LABELS[act.action_type] || act.action_type}
                                  </Badge>
                                  <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatTimestamp(act.timestamp)}
                                  </span>
                                </div>
                                <p className="text-sm text-zinc-300 mt-1">
                                  {act.description}
                                </p>
                                {/* Show order numbers for bulk cut status */}
                                {act.action_type === "bulk_cut_status" && act.order_numbers && act.order_numbers.length > 0 && (
                                  <div className="mt-2 p-2 bg-zinc-900 rounded border border-zinc-700">
                                    <p className="text-xs text-zinc-400 mb-1 font-medium">Affected Orders ({act.order_count || act.order_numbers.length}):</p>
                                    <div className="flex flex-wrap gap-1">
                                      {act.order_numbers.map((orderNum, i) => (
                                        <Badge 
                                          key={i} 
                                          variant="outline" 
                                          className="text-[10px] bg-red-500/10 text-red-400 border-red-500/50 cursor-pointer hover:bg-red-500/20"
                                        >
                                          #{orderNum}
                                        </Badge>
                                      ))}
                                      {act.order_count > 20 && (
                                        <span className="text-[10px] text-zinc-500">+{act.order_count - 20} more</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {act.order_number && (
                                  <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                                    <span>Order: <span className="text-red-400">#{act.order_number}</span></span>
                                    {act.customer_name && (
                                      <span>• {act.customer_name}</span>
                                    )}
                                    {act.product_type && (
                                      <Badge variant="outline" className="text-[9px] bg-zinc-700/50 border-zinc-600">
                                        {PRODUCT_TYPE_LABELS[act.product_type] || act.product_type}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                                {/* Show old/new status for cut status changes */}
                                {act.action_type === "cut_status_change" && act.old_cut_status && (
                                  <div className="flex items-center gap-2 mt-2 text-xs">
                                    <Badge variant="outline" className="text-[9px] bg-zinc-700/50 border-zinc-600 text-zinc-400">
                                      {act.old_cut_status}
                                    </Badge>
                                    <span className="text-zinc-500">→</span>
                                    <Badge variant="outline" className="text-[9px] bg-amber-500/20 border-amber-500/50 text-amber-400">
                                      {act.new_cut_status}
                                    </Badge>
                                  </div>
                                )}
                                {act.note_preview && (
                                  <p className="text-xs text-zinc-500 mt-1 italic truncate">
                                    &ldquo;{act.note_preview}&rdquo;
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {(!activityData?.activities || activityData.activities.length === 0) && (
                        <div className="text-center py-20 text-zinc-500">
                          <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No activity found for the selected filters</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Payout Report Modal */}
      <Dialog open={showPayoutModal} onOpenChange={setShowPayoutModal}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald text-xl uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              Employee Payout Report
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Generate a payout report for an employee showing their work and calculated pay.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-zinc-400 text-xs uppercase mb-2 block">Employee *</Label>
              <Select value={payoutEmployee} onValueChange={setPayoutEmployee}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white" data-testid="payout-employee-select">
                  <SelectValue placeholder="Select Employee" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id} className="text-white">
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-400 text-xs uppercase mb-2 block">Hourly Rate ($) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g., 15.00"
                  value={payoutHourlyRate}
                  onChange={(e) => setPayoutHourlyRate(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  data-testid="payout-hourly-rate"
                />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase mb-2 block">Hours Worked *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="e.g., 8"
                  value={payoutHoursWorked}
                  onChange={(e) => setPayoutHoursWorked(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  data-testid="payout-hours-worked"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-400 text-xs uppercase mb-2 block">Date From</Label>
                <Input
                  type="date"
                  value={payoutDateFrom}
                  onChange={(e) => setPayoutDateFrom(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  data-testid="payout-date-from"
                />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase mb-2 block">Date To</Label>
                <Input
                  type="date"
                  value={payoutDateTo}
                  onChange={(e) => setPayoutDateTo(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  data-testid="payout-date-to"
                />
              </div>
            </div>

            {payoutHourlyRate && payoutHoursWorked && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-400 text-sm font-medium">Calculated Total Pay:</p>
                <p className="text-green-300 text-2xl font-bold font-mono">
                  ${(parseFloat(payoutHourlyRate || 0) * parseFloat(payoutHoursWorked || 0)).toFixed(2)}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowPayoutModal(false)}
              className="text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={exportPayoutPDF}
              disabled={!payoutEmployee || !payoutHourlyRate || !payoutHoursWorked}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="export-payout-btn"
            >
              <FileText className="w-4 h-4 mr-2" />
              Export Payout Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
