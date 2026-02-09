import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Users, DollarSign, RefreshCw, Download, Plus, Trash2, Edit3, FileText, Calendar, TrendingUp
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function CommissionPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // State
  const [salespeople, setSalespeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  
  // Date range for report (default to current month)
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  
  // Salesperson modal
  const [spModal, setSpModal] = useState({ open: false, mode: 'add', data: null });
  const [spForm, setSpForm] = useState({ name: '', phone: '', email: '', notes: '' });

  // Fetch salespeople
  const fetchSalespeople = async () => {
    try {
      const res = await axios.get(`${API}/salespeople?active_only=false`);
      setSalespeople(res.data);
    } catch (err) {
      toast.error("Failed to load salespeople");
    } finally {
      setLoading(false);
    }
  };

  // Fetch commission report
  const fetchReport = async () => {
    setLoadingReport(true);
    try {
      const res = await axios.get(`${API}/commission/report`, {
        params: { start_date: startDate, end_date: endDate }
      });
      setReportData(res.data);
    } catch (err) {
      toast.error("Failed to load commission report");
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchSalespeople();
    fetchReport();
  }, [user]);

  // Save salesperson
  const handleSaveSalesperson = async () => {
    try {
      if (spModal.mode === 'add') {
        await axios.post(`${API}/salespeople`, spForm);
        toast.success("Salesperson added!");
      } else {
        await axios.put(`${API}/salespeople/${spModal.data.id}`, spForm);
        toast.success("Salesperson updated!");
      }
      setSpModal({ open: false, mode: 'add', data: null });
      setSpForm({ name: '', phone: '', email: '', notes: '' });
      fetchSalespeople();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save");
    }
  };

  // Delete (deactivate) salesperson
  const handleDeleteSalesperson = async (id) => {
    try {
      await axios.delete(`${API}/salespeople/${id}`);
      toast.success("Salesperson deactivated");
      fetchSalespeople();
    } catch (err) {
      toast.error("Failed to delete");
    }
  };

  // Reactivate salesperson
  const handleReactivate = async (id) => {
    try {
      await axios.put(`${API}/salespeople/${id}`, { is_active: true });
      toast.success("Salesperson reactivated");
      fetchSalespeople();
    } catch (err) {
      toast.error("Failed to reactivate");
    }
  };

  // Export PDF
  const exportPDF = () => {
    if (!reportData) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Header
    doc.setFillColor(24, 24, 27);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(239, 68, 68);
    doc.text("CORLEONE FORGED", 14, 18);
    
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("COMMISSION REPORT", 14, 30);
    
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text(`Period: ${startDate} to ${endDate}`, pageWidth - 14, 14, { align: "right" });
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: "right" });
    doc.text(`Rate: $${reportData.commission_rate} per set of ${reportData.rims_per_set}`, pageWidth - 14, 30, { align: "right" });
    
    // Summary box
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("SUMMARY", 14, 52);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const summary = reportData.summary;
    doc.text(`Total Orders: ${summary.total_orders}`, 14, 62);
    doc.text(`Total Rims Sold: ${summary.total_quantity}`, 14, 70);
    doc.text(`Total Sets: ${summary.total_sets}`, 14, 78);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(239, 68, 68);
    doc.text(`TOTAL COMMISSION: $${summary.total_commission.toFixed(2)}`, 14, 88);
    
    // Salesperson summary table
    const summaryTableData = reportData.by_salesperson.map(sp => [
      sp.salesperson_name,
      sp.total_orders,
      sp.total_quantity,
      sp.total_sets,
      `$${sp.commission.toFixed(2)}`
    ]);
    
    autoTable(doc, {
      startY: 98,
      head: [['Salesperson', 'Orders', 'Rims', 'Sets', 'Commission']],
      body: summaryTableData,
      theme: "striped",
      headStyles: { 
        fillColor: [239, 68, 68], 
        textColor: [255, 255, 255], 
        fontStyle: "bold"
      },
      columnStyles: {
        4: { fontStyle: 'bold', textColor: [239, 68, 68] }
      }
    });
    
    let currentY = doc.lastAutoTable.finalY + 15;
    
    // Detailed order breakdown by salesperson
    reportData.by_salesperson.forEach(sp => {
      if (!sp.orders || sp.orders.length === 0) return;
      
      // Check if we need a new page
      if (currentY > pageHeight - 60) {
        doc.addPage();
        currentY = 20;
      }
      
      // Salesperson header
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(239, 68, 68);
      doc.text(`${sp.salesperson_name} - Order Details`, 14, currentY);
      currentY += 5;
      
      // Order details table
      const orderTableData = sp.orders.map(order => [
        order.order_number || '-',
        order.customer_name || '-',
        order.order_date ? new Date(order.order_date).toLocaleDateString() : '-',
        order.quantity || 0,
        order.sets || 0,
        `$${(order.commission || 0).toFixed(2)}`
      ]);
      
      autoTable(doc, {
        startY: currentY,
        head: [['Order #', 'Customer', 'Date', 'Rims', 'Sets', 'Commission']],
        body: orderTableData,
        theme: "grid",
        headStyles: { 
          fillColor: [100, 100, 100], 
          textColor: [255, 255, 255], 
          fontStyle: "bold",
          fontSize: 8
        },
        bodyStyles: {
          fontSize: 8
        },
        columnStyles: {
          0: { fontStyle: 'bold', textColor: [239, 68, 68] },
          5: { fontStyle: 'bold', textColor: [34, 197, 94] }
        },
        margin: { left: 14, right: 14 }
      });
      
      currentY = doc.lastAutoTable.finalY + 10;
    });
    
    // Add page numbers to all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Page ${i} of ${totalPages} | Corleone Forged © ${new Date().getFullYear()}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }
    
    doc.save(`commission-report-${startDate}-to-${endDate}.pdf`);
    toast.success("PDF exported!");
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <DollarSign className="w-6 h-6 text-green-500" />
                <h1 className="text-xl font-oswald uppercase tracking-widest text-white">
                  Sales Commission
                </h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Salespeople Management */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-oswald uppercase tracking-wider text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              Salespeople
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setSpForm({ name: '', phone: '', email: '', notes: '' });
                setSpModal({ open: true, mode: 'add', data: null });
              }}
              className="bg-amber-500 hover:bg-amber-400 text-black font-oswald uppercase"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Salesperson
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-zinc-500">Loading...</div>
            ) : salespeople.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No salespeople yet. Add your first salesperson above.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {salespeople.map(sp => (
                  <div
                    key={sp.id}
                    className={`p-4 rounded-lg border ${
                      sp.is_active 
                        ? 'bg-zinc-800/50 border-zinc-700' 
                        : 'bg-zinc-900/30 border-zinc-800 opacity-60'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-white">{sp.name}</h3>
                        {sp.phone && <p className="text-sm text-zinc-400">{sp.phone}</p>}
                        {sp.email && <p className="text-sm text-zinc-500">{sp.email}</p>}
                      </div>
                      <div className="flex gap-1">
                        {sp.is_active ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-amber-500 hover:text-amber-400"
                              onClick={() => {
                                setSpForm({
                                  name: sp.name,
                                  phone: sp.phone || '',
                                  email: sp.email || '',
                                  notes: sp.notes || ''
                                });
                                setSpModal({ open: true, mode: 'edit', data: sp });
                              }}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-red-500 hover:text-red-400"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-white">Deactivate Salesperson?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-zinc-400">
                                    This will deactivate {sp.name}. Their commission history will be preserved.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-zinc-800 border-zinc-700">Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteSalesperson(sp.id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    Deactivate
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-500 border-green-500 hover:bg-green-500 hover:text-white"
                            onClick={() => handleReactivate(sp.id)}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </div>
                    {!sp.is_active && (
                      <Badge variant="outline" className="mt-2 text-zinc-500 border-zinc-600">
                        Inactive
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commission Report */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="font-oswald uppercase tracking-wider text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                Commission Report
              </CardTitle>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-400 text-sm">From:</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 w-40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-400 text-sm">To:</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 w-40"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={fetchReport}
                  disabled={loadingReport}
                  className="bg-blue-600 hover:bg-blue-500"
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${loadingReport ? 'animate-spin' : ''}`} />
                  Generate
                </Button>
                {reportData && (
                  <Button
                    size="sm"
                    onClick={exportPDF}
                    className="bg-red-600 hover:bg-red-500"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    PDF
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingReport ? (
              <div className="text-center py-8 text-zinc-500">Loading report...</div>
            ) : !reportData ? (
              <div className="text-center py-8 text-zinc-500">
                Select a date range and click Generate to view commission report.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-zinc-800/50 rounded-lg p-4 text-center">
                    <p className="text-zinc-400 text-sm">Total Orders</p>
                    <p className="text-2xl font-bold text-white">{reportData.summary.total_orders}</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-4 text-center">
                    <p className="text-zinc-400 text-sm">Total Rims</p>
                    <p className="text-2xl font-bold text-white">{reportData.summary.total_quantity}</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-4 text-center">
                    <p className="text-zinc-400 text-sm">Total Sets</p>
                    <p className="text-2xl font-bold text-white">{reportData.summary.total_sets}</p>
                  </div>
                  <div className="bg-green-900/30 border border-green-800 rounded-lg p-4 text-center">
                    <p className="text-green-400 text-sm">Total Commission</p>
                    <p className="text-2xl font-bold text-green-500">
                      ${reportData.summary.total_commission.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Commission rate info */}
                <p className="text-sm text-zinc-500 text-center">
                  Commission Rate: <span className="text-amber-500">${reportData.commission_rate}</span> per set of {reportData.rims_per_set} rims
                </p>

                {/* By Salesperson Table */}
                {reportData.by_salesperson.length > 0 ? (
                  <div className="space-y-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800">
                          <TableHead className="text-zinc-400">Salesperson</TableHead>
                          <TableHead className="text-zinc-400 text-center">Orders</TableHead>
                          <TableHead className="text-zinc-400 text-center">Rims Sold</TableHead>
                          <TableHead className="text-zinc-400 text-center">Sets</TableHead>
                          <TableHead className="text-zinc-400 text-right">Commission</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.by_salesperson.map(sp => (
                          <TableRow key={sp.salesperson_id} className="border-zinc-800">
                            <TableCell className="font-medium text-white">{sp.salesperson_name}</TableCell>
                            <TableCell className="text-center">{sp.total_orders}</TableCell>
                            <TableCell className="text-center">{sp.total_quantity}</TableCell>
                            <TableCell className="text-center">{sp.total_sets}</TableCell>
                            <TableCell className="text-right font-bold text-green-500">
                              ${sp.commission.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    {/* Order Details Section */}
                    <div className="mt-6 space-y-4">
                      <h3 className="text-lg font-oswald uppercase tracking-wider text-amber-500 flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Order Details
                      </h3>
                      {reportData.by_salesperson.map(sp => (
                        sp.orders && sp.orders.length > 0 && (
                          <div key={`orders-${sp.salesperson_id}`} className="bg-zinc-800/30 rounded-lg p-4">
                            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                              <Users className="w-4 h-4 text-amber-500" />
                              {sp.salesperson_name}
                              <Badge variant="outline" className="text-green-500 border-green-500 ml-2">
                                ${sp.commission.toFixed(2)}
                              </Badge>
                            </h4>
                            <Table>
                              <TableHeader>
                                <TableRow className="border-zinc-700">
                                  <TableHead className="text-zinc-500 text-xs">Order #</TableHead>
                                  <TableHead className="text-zinc-500 text-xs">Customer</TableHead>
                                  <TableHead className="text-zinc-500 text-xs">Date</TableHead>
                                  <TableHead className="text-zinc-500 text-xs text-center">Rims</TableHead>
                                  <TableHead className="text-zinc-500 text-xs text-center">Sets</TableHead>
                                  <TableHead className="text-zinc-500 text-xs text-right">Commission</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sp.orders.map((order, idx) => (
                                  <TableRow key={`${sp.salesperson_id}-order-${idx}`} className="border-zinc-700">
                                    <TableCell className="font-mono text-red-400 text-sm">{order.order_number || '-'}</TableCell>
                                    <TableCell className="text-white text-sm">{order.customer_name || '-'}</TableCell>
                                    <TableCell className="text-zinc-400 text-sm">
                                      {order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}
                                    </TableCell>
                                    <TableCell className="text-center text-sm">{order.quantity || 0}</TableCell>
                                    <TableCell className="text-center text-sm">{order.sets || 0}</TableCell>
                                    <TableCell className="text-right text-green-500 font-semibold text-sm">
                                      ${(order.commission || 0).toFixed(2)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-zinc-500">
                    No commission data for this period. Make sure orders have salespeople assigned.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Salesperson Modal */}
      <Dialog open={spModal.open} onOpenChange={(open) => setSpModal(prev => ({ ...prev, open }))}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-wider text-white">
              {spModal.mode === 'add' ? 'Add Salesperson' : 'Edit Salesperson'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-400">Name *</Label>
              <Input
                value={spForm.name}
                onChange={(e) => setSpForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="John Smith"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <Label className="text-zinc-400">Phone</Label>
              <Input
                value={spForm.phone}
                onChange={(e) => setSpForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="555-1234"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <Label className="text-zinc-400">Email</Label>
              <Input
                value={spForm.email}
                onChange={(e) => setSpForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john@example.com"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <Label className="text-zinc-400">Notes</Label>
              <Input
                value={spForm.notes}
                onChange={(e) => setSpForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any notes..."
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSpModal({ open: false, mode: 'add', data: null })}
              className="border-zinc-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSalesperson}
              disabled={!spForm.name.trim()}
              className="bg-amber-500 hover:bg-amber-400 text-black"
            >
              {spModal.mode === 'add' ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
