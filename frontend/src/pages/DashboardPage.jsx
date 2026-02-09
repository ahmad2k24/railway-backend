import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth, API } from "@/App";
import { useTranslation } from "react-i18next";
import { useDynamicTranslation } from "@/hooks/useDynamicTranslation";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import LanguageSelector from "@/components/LanguageSelector";
import { useNotifications } from "@/contexts/NotificationContext";
import MentionInput from "@/components/MentionInput";
import {
  Settings, LogOut, Plus, ChevronRight, FileText, Package,
  Circle, CheckCircle2, Truck, RefreshCw, Download, Paperclip, X, Eye, Trash2,
  Search, Phone, User, MessageSquare, Send, Users, ClipboardList, Layers, KeyRound, ArrowRightLeft,
  Upload, Edit3, CheckSquare, Plane, CircleDot, Database, AlertTriangle, Disc3, Navigation, Zap, BarChart3, Wrench, Bell, Clock, ExternalLink, UserSearch, RotateCcw, Menu, ChevronUp, ChevronDown, DollarSign, Scissors, Activity, Loader2, Boxes
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Checkbox } from "@/components/ui/checkbox";

// Import extracted dashboard components
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { SearchFilter } from "@/components/dashboard/SearchFilter";
import { OrderList } from "@/components/dashboard/OrderList";
import { 
  TireIcon, 
  SteeringWheelIcon, 
  DEPT_COLORS, 
  DEPT_BG_COLORS, 
  PRODUCT_COLORS, 
  CAP_TYPES, 
  RIM_SIZE_COLORS, 
  LALO_STATUSES, 
  RIM_SIZES 
} from "@/components/dashboard/constants";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  
  // Dynamic translation hook for database content
  const { translateBatch, currentLanguage, isTranslating } = useDynamicTranslation();
  
  // Memoize translated departments to prevent recreation on every render
  const DEPARTMENTS = useMemo(() => [
    { value: "received", label: t('departments.received'), color: DEPT_COLORS.received },
    { value: "design", label: t('departments.design'), color: DEPT_COLORS.design },
    { value: "program", label: t('departments.program'), color: DEPT_COLORS.program },
    { value: "machine_waiting", label: t('departments.machine_waiting'), color: DEPT_COLORS.machine_waiting },
    { value: "machine", label: t('departments.machine'), color: DEPT_COLORS.machine },
    { value: "finishing", label: t('departments.finishing'), color: DEPT_COLORS.finishing },
    { value: "powder_coat", label: t('departments.powder_coat'), color: DEPT_COLORS.powder_coat },
    { value: "assemble", label: t('departments.assemble'), color: DEPT_COLORS.assemble },
    { value: "showroom", label: t('departments.showroom'), color: DEPT_COLORS.showroom },
    { value: "shipped", label: t('departments.shipped'), color: DEPT_COLORS.shipped },
  ], [t]);
  
  // Memoize product types
  const PRODUCT_TYPES = useMemo(() => ({
    rim: { label: t('products.rim'), color: PRODUCT_COLORS.rim, icon: null },
    steering_wheel: { label: t('products.steering_wheel'), color: PRODUCT_COLORS.steering_wheel, icon: "steering" },
    standard_caps: { label: t('products.standard_caps'), color: PRODUCT_COLORS.standard_caps, icon: null },
    floater_caps: { label: t('products.floater_caps'), color: PRODUCT_COLORS.floater_caps, icon: null },
    xxl_caps: { label: t('products.xxl_caps'), color: PRODUCT_COLORS.xxl_caps, icon: null },
    dually_floating_caps: { label: t('products.dually_floating_caps'), color: PRODUCT_COLORS.dually_floating_caps, icon: null },
    offroad_floating_caps: { label: t('products.offroad_floating_caps'), color: PRODUCT_COLORS.offroad_floating_caps, icon: null },
    custom_caps: { label: t('products.custom_caps'), color: PRODUCT_COLORS.custom_caps, icon: null },
    race_car_caps: { label: t('products.race_car_caps'), color: PRODUCT_COLORS.race_car_caps },
  }), [t]);
  
  // Memoize DEPT_MAP
  const DEPT_MAP = useMemo(() => 
    Object.fromEntries(DEPARTMENTS.map(d => [d.value, d])),
  [DEPARTMENTS]);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [translatedOrders, setTranslatedOrders] = useState([]);
  const [stats, setStats] = useState({ departments: {}, products: {}, total_active: 0, total_completed: 0 });
  const [productFilter, setProductFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [newNote, setNewNote] = useState("");
  const [editingNote, setEditingNote] = useState(null); // { id: string, text: string } for note being edited
  
  // Translate orders when language changes or orders update
  useEffect(() => {
    const translateOrders = async () => {
      if (currentLanguage === 'en' || orders.length === 0) {
        setTranslatedOrders(orders);
        return;
      }
      
      // Collect all text fields that need translation
      const textsToTranslate = [];
      const fieldMap = []; // Track which field each text belongs to
      
      orders.forEach((order, orderIndex) => {
        // Fields to translate: customer_name, wheel_specs, notes
        if (order.customer_name) {
          textsToTranslate.push(order.customer_name);
          fieldMap.push({ orderIndex, field: 'customer_name' });
        }
        if (order.wheel_specs) {
          textsToTranslate.push(order.wheel_specs);
          fieldMap.push({ orderIndex, field: 'wheel_specs' });
        }
        if (order.notes) {
          textsToTranslate.push(order.notes);
          fieldMap.push({ orderIndex, field: 'notes' });
        }
      });
      
      if (textsToTranslate.length === 0) {
        setTranslatedOrders(orders);
        return;
      }
      
      try {
        const translations = await translateBatch(textsToTranslate);
        
        // Map translations back to orders
        const translated = orders.map(order => ({ ...order }));
        fieldMap.forEach((mapping, index) => {
          const { orderIndex, field } = mapping;
          translated[orderIndex][`${field}_translated`] = translations[index];
        });
        
        setTranslatedOrders(translated);
      } catch (error) {
        console.error('Failed to translate orders:', error);
        setTranslatedOrders(orders);
      }
    };
    
    translateOrders();
  }, [orders, currentLanguage, translateBatch]);
  
  // Helper function to get translated field or original
  const getTranslatedField = useCallback((order, field) => {
    if (currentLanguage === 'en') return order[field] || '';
    // Find the order in translatedOrders and get the translated field
    const translatedOrder = translatedOrders.find(o => o.id === order.id);
    return translatedOrder?.[`${field}_translated`] || order[field] || '';
  }, [currentLanguage, translatedOrders]);
  
  // Helper function to normalize attachment URLs to current backend
  // Handles old URLs from previous domains (e.g., wheelsmith-app.emergent.host)
  // Note: API already ends with /api, so we need to be careful not to double it
  const getAttachmentUrl = useCallback((url) => {
    if (!url) return '';
    // New MongoDB-stored attachments use /api/attachments/ - extract just the attachment ID
    if (url.startsWith('/api/attachments/')) {
      const attachmentId = url.replace('/api/attachments/', '');
      return `${API}/attachments/${attachmentId}`;
    }
    // Legacy file-based attachments use /api/uploads/ - extract just the filename
    if (url.startsWith('/api/uploads/')) {
      const filename = url.replace('/api/uploads/', '');
      return `${API}/uploads/${filename}`;
    }
    // If it's an old absolute URL, extract the path and use current backend
    if (url.includes('/api/uploads/')) {
      const filename = url.split('/api/uploads/').pop();
      return `${API}/uploads/${filename}`;
    }
    if (url.includes('/api/attachments/')) {
      const attachmentId = url.split('/api/attachments/').pop();
      return `${API}/attachments/${attachmentId}`;
    }
    // Fallback - return as-is
    return url;
  }, []);
  
  // Check for newOrder query param to auto-open the new order modal
  useEffect(() => {
    if (searchParams.get("newOrder") === "true") {
      setNewOrderOpen(true);
      // Clear the query param so it doesn't reopen on refresh
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Handle stock data from navigation state (from Stock Inventory page)
  useEffect(() => {
    if (location.state?.newOrder && location.state?.stockData) {
      const stockData = location.state.stockData;
      
      // Pre-fill the new order form with stock data
      setNewOrder(prev => ({
        ...prev,
        product_type: stockData.product_type || (stockData.from_stock_type === "steering_wheel" ? "steering_wheel" : "rim"),
        wheel_specs: stockData.wheel_specs || "",
        notes: stockData.notes || "",
        rim_size: stockData.rim_size || "",
        steering_wheel_brand: stockData.steering_wheel_brand || "",
        has_custom_caps: stockData.has_custom_caps || false,
        // Store stock reference for later
        from_stock_id: stockData.from_stock_id || "",
        from_stock_sku: stockData.from_stock_sku || "",
        from_stock_type: stockData.from_stock_type || "",
      }));
      
      // Open the new order modal
      setNewOrderOpen(true);
      
      // Clear location state to prevent re-triggering
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);
  
  // Check for order query param to auto-open order detail (from notifications)
  useEffect(() => {
    const orderId = searchParams.get("order");
    if (orderId) {
      openOrderDetail(orderId);
      // Clear the query param so it doesn't reopen on refresh
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);
  
  // Get today's date in YYYY-MM-DD format for the date input
  const getTodayDate = () => new Date().toISOString().split('T')[0];
  
  const [newOrder, setNewOrder] = useState({
    order_number: "",
    customer_name: "",
    phone: "",
    product_type: "rim",
    wheel_specs: "",
    notes: "",
    quantity: 1,
    steering_wheel_brand: "",
    order_date: getTodayDate(), // Default to today's date
    rim_size: "", // Rim size for grouping/reporting
    rim_size_rear: "", // Rear rim size for staggered setups
    has_tires: false, // Whether order includes tires
    has_steering_wheel: false, // Whether order includes steering wheel (purple indicator)
    tire_size: "", // Optional tire size (e.g., 275/40R20)
    sold_by: user?.salesperson_id || "", // Auto-fill with user's salesperson ID if they are a salesperson
    payment_total: "", // Total invoice amount
    payment_deposit: "", // Initial deposit amount
  });
  
  // Salespeople list for commission tracking
  const [salespeople, setSalespeople] = useState([]);
  
  // Auto-update sold_by when user changes (e.g., after login)
  useEffect(() => {
    if (user?.salesperson_id) {
      setNewOrder(prev => ({ ...prev, sold_by: user.salesperson_id }));
    }
  }, [user?.salesperson_id]);
  
  // For auto-adding caps when creating rim order
  const [capsToAdd, setCapsToAdd] = useState({
    standard_caps: { selected: false, quantity: 0 },
    floater_caps: { selected: false, quantity: 0 },
    xxl_caps: { selected: false, quantity: 0 },
    dually_floating_caps: { selected: false, quantity: 0 },
    offroad_floating_caps: { selected: false, quantity: 0 },
    custom_caps: { selected: false, quantity: 0 },
    race_car_caps: { selected: false, quantity: 0 },
  });
  
  // Customer autocomplete state
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  // New order attachment state
  const [newOrderAttachment, setNewOrderAttachment] = useState(null);
  
  // Form submission state to prevent double-click duplicates
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  
  // Stats modal state
  const [statsModal, setStatsModal] = useState({ open: false, title: "", filter: null, orders: [] });
  const [statsSelectedOrders, setStatsSelectedOrders] = useState([]); // For checkbox selection in stats modal
  const [statsModalSearch, setStatsModalSearch] = useState(""); // Search filter for stats modal
  
  // PIN modal state
  const [pinModal, setPinModal] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Export modal state for entering steering wheel brands (individual for each order)
  const [exportModal, setExportModal] = useState({ open: false, deptValue: "", deptLabel: "", orders: [] });
  const [exportBrands, setExportBrands] = useState({}); // Object mapping order_id to brand

  // Size report modal state
  const [sizeReportModal, setSizeReportModal] = useState({ open: false });

  // Edit Order state (for admin full editing)
  const [editMode, setEditMode] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  // Hold Queue state
  const [holdModal, setHoldModal] = useState({ open: false, order: null });
  const [holdReason, setHoldReason] = useState("");
  
  // Queue counts for badges
  const [queueCounts, setQueueCounts] = useState({ hold: 0, lalo: 0, refinish: 0, rush: 0, redo: 0 });

  // RUSH Order state
  const [rushModal, setRushModal] = useState({ open: false, order: null });
  const [rushReason, setRushReason] = useState("");

  // Re-Do Order state
  const [redoModal, setRedoModal] = useState({ open: false, order: null });
  const [redoReason, setRedoReason] = useState("");

  // Add Payment Modal state
  const [addPaymentModal, setAddPaymentModal] = useState({ open: false, orderId: null });
  const [addPaymentForm, setAddPaymentForm] = useState({ amount: "", payment_method: "", note: "" });
  const [addPaymentLoading, setAddPaymentLoading] = useState(false);

  // Refinish Queue state
  const [refinishModal, setRefinishModal] = useState({ open: false, order: null });
  const [refinishNotes, setRefinishNotes] = useState("");

  // Department Table Modal state (for clicking on department headers)
  const [deptTableModal, setDeptTableModal] = useState({ open: false, deptValue: "", deptLabel: "", orders: [] });
  const [deptTableSelectedOrders, setDeptTableSelectedOrders] = useState([]);
  const [deptTableBulkLoading, setDeptTableBulkLoading] = useState(false);
  const [deptTableSearch, setDeptTableSearch] = useState(""); // Search filter for dept table modal
  
  // Attachment Preview Modal state
  const [attachmentPreview, setAttachmentPreview] = useState({ open: false, url: "", filename: "", type: "" });
  const [attachmentError, setAttachmentError] = useState(false);
  
  // New Order Notification state
  const [knownOrderIds, setKnownOrderIds] = useState(new Set());
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Export Column Selection state
  const [exportColumnsModal, setExportColumnsModal] = useState({ 
    open: false, 
    deptValue: "", 
    deptLabel: "", 
    orders: [],
    selectedColumns: {
      order_number: true,
      customer: true,
      type: true,
      size: true,
      brand: true,
      qty: true,
      specs: false, // PSpecs - off by default
      department: true,
      order_date: true,
      dept_date: true,
      status: true
    },
    // Cap type filters - all selected by default
    selectedCapTypes: {
      standard_caps: true,
      floater_caps: true,
      xxl_caps: true,
      dually_floating_caps: true,
      offroad_floating_caps: true,
      custom_caps: true,
      race_car_caps: true
    }
  });

  // Customer Lookup state
  const [customerLookup, setCustomerLookup] = useState({ 
    open: false, 
    search: "", 
    suggestions: [],
    selectedCustomer: null,
    customerOrders: [],
    loading: false,
    stats: null,
    orderSearch: ""  // Search within customer's orders
  });

  // Bulk Import modal state
  const [bulkImportModal, setBulkImportModal] = useState({ open: false });
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [importLoading, setImportLoading] = useState(false);

  // Bulk Edit state
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [bulkEditModal, setBulkEditModal] = useState({ open: false });
  const [bulkDeleteModal, setBulkDeleteModal] = useState({ open: false });
  const [bulkMoveModal, setBulkMoveModal] = useState({ open: false, targetDept: "" });
  const [bulkMoveLoading, setBulkMoveLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    order_date: "",
    wheel_specs: "",
    rim_size: "",
    vehicle_make: "",
    vehicle_model: "",
    notes: "",
    cut_status: "",
    steering_wheel_brand: "",
    current_department: "",
    phone: ""
  });

  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = user?.role === "admin";
  const isAdminRestricted = user?.role === "admin_restricted";
  const isAnyAdmin = isAdmin || isAdminRestricted;
  const isSales = user?.departments?.includes("received") || user?.department === "received";
  const hasSalesAccess = isAnyAdmin || isSales;
  
  // Phone number formatting function
  const formatPhoneNumber = (value) => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Format as (XXX)-XXX-XXXX
    if (digits.length <= 3) {
      return digits.length > 0 ? `(${digits}` : '';
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)})-${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };
  
  // Customer autocomplete function
  const searchCustomers = async (query) => {
    if (query.length < 2) {
      setCustomerSuggestions([]);
      setShowCustomerDropdown(false);
      return;
    }
    
    try {
      const res = await axios.get(`${API}/customers/autocomplete?q=${encodeURIComponent(query)}`);
      setCustomerSuggestions(res.data.customers || []);
      setShowCustomerDropdown(res.data.customers?.length > 0);
    } catch (error) {
      console.error("Failed to fetch customer suggestions:", error);
      setCustomerSuggestions([]);
    }
  };
  
  // Select customer from autocomplete
  const selectCustomer = (customer) => {
    setNewOrder({
      ...newOrder,
      customer_name: customer.customer_name,
      phone: customer.phone || ""
    });
    setShowCustomerDropdown(false);
    setCustomerSuggestions([]);
  };

  // Customer Lookup functions
  const searchCustomersForLookup = async (query) => {
    if (!query || query.length < 2) {
      setCustomerLookup(prev => ({ ...prev, suggestions: [] }));
      return;
    }
    try {
      const res = await axios.get(`${API}/customers/search?q=${encodeURIComponent(query)}`);
      setCustomerLookup(prev => ({ ...prev, suggestions: res.data || [] }));
    } catch (error) {
      console.error("Customer search error:", error);
    }
  };

  const loadCustomerOrders = async (customerName) => {
    setCustomerLookup(prev => ({ ...prev, loading: true, selectedCustomer: customerName }));
    try {
      const res = await axios.get(`${API}/customers/${encodeURIComponent(customerName)}/orders`);
      setCustomerLookup(prev => ({ 
        ...prev, 
        loading: false, 
        customerOrders: res.data.orders || [],
        stats: {
          total: res.data.total_orders,
          active: res.data.active_orders,
          completed: res.data.completed_orders,
          rush: res.data.rush_orders,
          byDepartment: res.data.by_department
        },
        suggestions: []
      }));
    } catch (error) {
      toast.error("Failed to load customer orders");
      setCustomerLookup(prev => ({ ...prev, loading: false }));
    }
  };

  const resetCustomerLookup = () => {
    setCustomerLookup({
      open: false,
      search: "",
      suggestions: [],
      selectedCustomer: null,
      customerOrders: [],
      loading: false,
      stats: null,
      orderSearch: ""
    });
  };

  // Export customer orders to PDF
  const exportCustomerOrdersPDF = () => {
    if (!customerLookup.selectedCustomer || !customerLookup.customerOrders.length) return;
    
    const doc = new jsPDF({ orientation: "landscape" });
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(16, 185, 129); // Emerald color
    doc.text(`CORLEONE FORGED - ${customerLookup.selectedCustomer}`, 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
    doc.text(`Total Orders: ${customerLookup.stats?.total || 0} | Active: ${customerLookup.stats?.active || 0} | Completed: ${customerLookup.stats?.completed || 0}`, 14, 28);
    
    // Table data
    const tableData = customerLookup.customerOrders.map(order => [
      order.order_number || "-",
      PRODUCT_TYPES[order.product_type]?.label || order.product_type,
      order.wheel_specs || "-",
      DEPARTMENTS.find(d => d.value === order.current_department)?.label || order.current_department,
      order.order_date ? new Date(order.order_date).toLocaleDateString() : "-",
      order.days_since_order !== null ? `${order.days_since_order} days` : "-",
      order.is_rush ? "YES" : "NO",
      order.is_redo ? "YES" : "NO"
    ]);
    
    autoTable(doc, {
      startY: 35,
      head: [["Order #", "Product", "Specs", "Department", "Order Date", "Days", "Rush", "Re-Do"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    
    doc.save(`${customerLookup.selectedCustomer.replace(/\s+/g, '_')}_orders_${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("Customer orders exported to PDF!");
  };

  // Get orders grouped by rim size
  const getOrdersBySize = () => {
    const sizeGroups = {};
    RIM_SIZES.forEach(size => {
      sizeGroups[size] = orders.filter(o => o.rim_size === size && o.status !== "done");
    });
    // Add "No Size" group for orders without rim_size
    sizeGroups["none"] = orders.filter(o => !o.rim_size && o.status !== "done" && (o.product_type === "rim" || CAP_TYPES.includes(o.product_type)));
    return sizeGroups;
  };

  // Export size report PDF
  const exportSizeReportPDF = (size, sizeOrders) => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CORLEONE FORGED", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    const sizeLabel = size === "none" ? 'No Size Assigned' : size + '"';
    doc.text(`Size Report - ${sizeLabel}`, 105, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, { align: "center" });
    doc.text(`Total Orders: ${sizeOrders.length}`, 105, 44, { align: "center" });
    
    const tableData = sizeOrders.map(order => [
      order.order_number,
      order.customer_name,
      order.phone || "-",
      PRODUCT_TYPES[order.product_type]?.label || order.product_type,
      order.quantity || 1,
      DEPT_MAP[order.current_department]?.label || order.current_department,
      new Date(order.order_date).toLocaleDateString()
    ]);
    
    autoTable(doc, {
      startY: 52,
      head: [['Order #', 'Customer', 'Phone', 'Type', 'Qty', 'Dept', 'Date']],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    
    doc.save(`corleone-forged-size-${size}-report-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success(`Size Report ${sizeLabel} exported!`);
  };

  // Export all sizes report
  const exportAllSizesReportPDF = () => {
    const doc = new jsPDF();
    const sizeGroups = getOrdersBySize();
    
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CORLEONE FORGED", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text('Complete Size Report', 105, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, { align: "center" });
    
    let startY = 50;
    
    // Add each size group
    [...RIM_SIZES, "none"].forEach(size => {
      const sizeOrders = sizeGroups[size];
      if (sizeOrders && sizeOrders.length > 0) {
        // Check if we need a new page
        if (startY > 250) {
          doc.addPage();
          startY = 20;
        }
        
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        const sizeLabel = size === "none" ? 'No Size Assigned' : size + '"';
        doc.text(`${sizeLabel} (${sizeOrders.length} orders)`, 14, startY);
        
        const tableData = sizeOrders.map(order => [
          order.order_number,
          order.customer_name,
          PRODUCT_TYPES[order.product_type]?.label || order.product_type,
          order.quantity || 1,
          DEPT_MAP[order.current_department]?.label || order.current_department
        ]);
        
        autoTable(doc, {
          startY: startY + 5,
          head: [['Order #', 'Customer', 'Type', 'Qty', 'Dept']],
          body: tableData,
          theme: "grid",
          headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
          styles: { fontSize: 7, cellPadding: 2 },
          margin: { left: 14, right: 14 },
        });
        
        startY = doc.lastAutoTable.finalY + 15;
      }
    });
    
    doc.save(`corleone-forged-all-sizes-report-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success('Complete Size Report exported!');
    setSizeReportModal({ open: false });
  };

  // Handle PIN setup
  const handleSetPin = async () => {
    if (newPin.length !== 4 || !newPin.match(/^\d{4}$/)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("PINs don't match");
      return;
    }
    try {
      await axios.post(`${API}/auth/set-pin`, { pin: newPin });
      toast.success("PIN set successfully! You can now use Quick PIN login.");
      setPinModal(false);
      setNewPin("");
      setConfirmPin("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to set PIN");
    }
  };

  // Play notification sound for new orders
  const playNotificationSound = () => {
    try {
      // Create an audio context for a notification sound
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Pleasant notification sound - two tones
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
      oscillator.frequency.setValueAtTime(1046.5, audioContext.currentTime + 0.1); // C6
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.log("Could not play notification sound:", e);
    }
  };

  // Check if an order is new (created within last 24 hours)
  const isNewOrder = (order) => {
    if (!order.created_at) return false;
    const createdAt = new Date(order.created_at);
    const now = new Date();
    const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
    return hoursDiff < 24;
  };

  const fetchData = async (showToast = false) => {
    if (showToast) setRefreshing(true);
    try {
      const [ordersRes, statsRes, salespeopleRes] = await Promise.all([
        axios.get(`${API}/orders`, { params: { product_type: productFilter } }),
        axios.get(`${API}/stats`),
        axios.get(`${API}/salespeople`).catch(() => ({ data: [] })), // Fetch salespeople for commission dropdown
      ]);
      
      // Update salespeople list
      if (salespeopleRes.data) {
        setSalespeople(salespeopleRes.data);
      }
      
      const newOrdersData = ordersRes.data;
      
      // New order notifications disabled - bell icon system handles notifications
      // Previously showed toast popups for each new order which caused visual noise on login
      
      // Update known order IDs
      setKnownOrderIds(new Set(newOrdersData.map(o => o.id)));
      setIsInitialLoad(false);
      
      // Filter out refinish orders from main dashboard
      const filteredOrders = newOrdersData.filter(o => !o.is_refinish);
      setOrders(filteredOrders);
      setStats(statsRes.data);
      
      // Fetch queue counts for badges
      try {
        const [holdRes, laloRes, refinishRes, rushRes, redoRes] = await Promise.all([
          axios.get(`${API}/hold-queue`).catch(() => ({ data: [] })),
          axios.get(`${API}/orders/lalo-queue`).catch(() => ({ data: [] })),
          axios.get(`${API}/refinish-queue`).catch(() => ({ data: [] })),
          axios.get(`${API}/rush-queue`).catch(() => ({ data: [] })),
          axios.get(`${API}/redo-queue`).catch(() => ({ data: [] }))
        ]);
        setQueueCounts({
          hold: holdRes.data?.length || 0,
          lalo: laloRes.data?.length || 0,
          refinish: refinishRes.data?.length || 0,
          rush: rushRes.data?.length || 0,
          redo: redoRes.data?.length || 0
        });
      } catch (err) {
        console.log("Could not fetch queue counts:", err);
      }
      
      if (showToast) toast.success(t('messages.refreshed') || "Refreshed!");
    } catch (error) {
      toast.error(t('errors.failedToFetch') || "Failed to fetch data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Mobile-optimized polling - only poll when tab is visible and use longer interval on mobile
  useEffect(() => {
    fetchData();
    
    // Detect if mobile device
    const isMobile = window.innerWidth < 768;
    const pollInterval = isMobile ? 30000 : 15000; // 30s on mobile, 15s on desktop
    
    let interval = null;
    
    const startPolling = () => {
      if (!interval && document.visibilityState === 'visible') {
        interval = setInterval(() => fetchData(false), pollInterval);
      }
    };
    
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    
    // Handle visibility change - stop polling when tab is hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData(false); // Refresh when tab becomes visible
        startPolling();
      } else {
        stopPolling();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    startPolling();
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
    };
  }, [productFilter]);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmittingOrder) {
      return;
    }
    
    try {
      setIsSubmittingOrder(true);
      
      // Validate steering wheel brand if steering wheel is checked
      if (newOrder.has_steering_wheel && !newOrder.steering_wheel_brand?.trim()) {
        toast.error("Please enter a steering wheel brand");
        setIsSubmittingOrder(false);
        return;
      }
      
      // Create the main order
      // For steering wheels, use brand as wheel_specs if wheel_specs is empty
      const orderData = {
        ...newOrder,
        quantity: newOrder.quantity || 1,
        wheel_specs: newOrder.product_type === "steering_wheel" 
          ? (newOrder.steering_wheel_brand || "Steering Wheel") 
          : newOrder.wheel_specs,
        // Include stock reference if present
        from_stock_id: newOrder.from_stock_id || null,
        from_stock_sku: newOrder.from_stock_sku || null,
        from_stock_type: newOrder.from_stock_type || null,
        // Include payment info if provided
        payment_total: newOrder.payment_total ? parseFloat(newOrder.payment_total) : 0,
        payment_deposit: newOrder.payment_deposit ? parseFloat(newOrder.payment_deposit) : 0,
      };
      const mainOrderRes = await axios.post(`${API}/orders`, orderData);
      const mainOrderId = mainOrderRes.data.id;
      const mainOrderNumber = mainOrderRes.data.order_number;
      
      // If order was created from stock, mark the stock item as sold
      if (newOrder.from_stock_id && newOrder.from_stock_type) {
        try {
          const stockEndpoint = newOrder.from_stock_type === "steering_wheel" 
            ? `${API}/stock-steering-wheels/${newOrder.from_stock_id}/mark-sold`
            : `${API}/stock-inventory/${newOrder.from_stock_id}/mark-sold`;
          
          await axios.put(stockEndpoint, { 
            sold_to_order_number: mainOrderNumber 
          });
          toast.success(`Stock item ${newOrder.from_stock_sku} marked as sold!`);
        } catch (stockError) {
          console.error("Failed to mark stock as sold:", stockError);
          // Don't fail the whole operation, just warn
          toast.warning("Order created, but couldn't update stock status. Please update manually.");
        }
      }
      
      let additionalOrdersCount = 0;
      
      // If it's a rim order, auto-create cap orders and steering wheel order
      if (newOrder.product_type === "rim") {
        const additionalPromises = [];
        
        // Create cap orders
        for (const [capType, capData] of Object.entries(capsToAdd)) {
          if (capData.selected && capData.quantity > 0) {
            additionalPromises.push(
              axios.post(`${API}/orders`, {
                order_number: newOrder.order_number,
                customer_name: newOrder.customer_name,
                phone: newOrder.phone,
                product_type: capType,
                wheel_specs: `Caps for ${newOrder.wheel_specs}`,
                quantity: capData.quantity,
                linked_order_id: mainOrderId,
                order_date: newOrder.order_date
              }).catch(err => {
                console.error(`Failed to create ${capType}:`, err);
                return null;
              })
            );
          }
        }
        
        // Create steering wheel order if checked
        if (newOrder.has_steering_wheel && newOrder.steering_wheel_brand) {
          additionalPromises.push(
            axios.post(`${API}/orders`, {
              order_number: newOrder.order_number,
              customer_name: newOrder.customer_name,
              phone: newOrder.phone,
              product_type: "steering_wheel",
              wheel_specs: newOrder.steering_wheel_brand,
              steering_wheel_brand: newOrder.steering_wheel_brand,
              quantity: 1,
              linked_order_id: mainOrderId,
              order_date: newOrder.order_date
            }).catch(err => {
              console.error(`Failed to create steering wheel order:`, err);
              return null;
            })
          );
        }
        
        if (additionalPromises.length > 0) {
          const results = await Promise.all(additionalPromises);
          additionalOrdersCount = results.filter(r => r !== null).length;
          
          if (newOrder.has_steering_wheel) {
            toast.success(`Order created with ${additionalOrdersCount} additional order(s) including steering wheel!`);
          } else {
            toast.success(`Order created with ${additionalOrdersCount} cap order(s)!`);
          }
        } else {
          toast.success("Order created!");
        }
      } else {
        toast.success("Order created!");
      }
      
      // Upload attachment if provided
      if (newOrderAttachment) {
        try {
          const formData = new FormData();
          formData.append("file", newOrderAttachment);
          await axios.post(`${API}/orders/${mainOrderId}/attachment`, formData, {
            headers: { "Content-Type": "multipart/form-data" }
          });
          toast.success("Attachment uploaded!");
        } catch (attachError) {
          console.error("Failed to upload attachment:", attachError);
          toast.error("Order created but attachment upload failed");
        }
      }
      
      setNewOrderOpen(false);
      setNewOrder({ 
        order_number: "", 
        customer_name: "", 
        phone: "", 
        product_type: "rim", 
        wheel_specs: "", 
        notes: "", 
        quantity: 1, 
        steering_wheel_brand: "", 
        order_date: getTodayDate(), 
        rim_size: "", 
        rim_size_rear: "", 
        has_tires: false, 
        has_steering_wheel: false, 
        tire_size: "",
        // Clear stock reference fields
        from_stock_id: "",
        from_stock_sku: "",
        from_stock_type: "",
        // Clear payment fields
        payment_total: "",
        payment_deposit: "",
      });
      setNewOrderAttachment(null);
      setCapsToAdd({
        standard_caps: { selected: false, quantity: 0 },
        floater_caps: { selected: false, quantity: 0 },
        xxl_caps: { selected: false, quantity: 0 },
        dually_floating_caps: { selected: false, quantity: 0 },
        offroad_floating_caps: { selected: false, quantity: 0 },
        custom_caps: { selected: false, quantity: 0 },
        race_car_caps: { selected: false, quantity: 0 },
      });
      setCustomerSuggestions([]);
      setShowCustomerDropdown(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create order");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleAdvanceOrder = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/advance`);
      toast.success("Order advanced to next department!");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to advance order");
    }
  };

  // Mark order as fulfilled/completed (Admin only)
  const handleMarkFulfilled = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/move`, { target_department: "completed" });
      toast.success("Order marked as FULFILLED! 🎉");
      fetchData();
      // Close the detail modal if open
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to mark as fulfilled");
    }
  };

  const handleMoveOrder = async (orderId, targetDepartment) => {
    try {
      await axios.put(`${API}/orders/${orderId}/move`, { target_department: targetDepartment });
      toast.success(`Order moved to ${DEPT_MAP[targetDepartment]?.label || targetDepartment}!`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to move order");
    }
  };

  // Reorder order within department (move up/down)
  const handleReorderOrder = async (orderId, direction) => {
    try {
      await axios.put(`${API}/orders/${orderId}/reorder`, { direction });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to reorder");
    }
  };

  // Toggle cut status for caps and steering wheels
  const handleToggleCutStatus = async (orderId, currentStatus) => {
    try {
      const newStatus = currentStatus === "cut" ? "waiting" : "cut";
      await axios.put(`${API}/orders/${orderId}/cut-status`, { cut_status: newStatus });
      toast.success(`Marked as ${newStatus === "cut" ? "Cut" : "Waiting"}!`);
      fetchData();
      // Refresh stats modal if open
      if (statsModal.open) {
        const updatedOrders = statsModal.orders.map(o => 
          o.id === orderId ? { ...o, cut_status: newStatus } : o
        );
        setStatsModal({ ...statsModal, orders: updatedOrders });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update cut status");
    }
  };

  const handleToggleTires = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/tires`);
      toast.success("Tires status updated!");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update tires status");
    }
  };

  const handleToggleSteeringWheel = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/steering-wheel`);
      toast.success("Steering Wheel status updated!");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update steering wheel status");
    }
  };

  const handleSendToLalo = async (orderId, status = "shipped_to_lalo") => {
    try {
      await axios.put(`${API}/orders/${orderId}/lalo-status`, { lalo_status: status });
      toast.success("Sent to Lalo Queue!");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to send to Lalo");
    }
  };

  // Hold Queue functions
  const handleAddToHold = async () => {
    if (!holdModal.order || !holdReason.trim()) return;
    
    try {
      await axios.post(`${API}/hold-queue/add`, {
        order_id: holdModal.order.id,
        hold_reason: holdReason.trim()
      });
      toast.success("Order added to Hold Queue");
      setHoldModal({ open: false, order: null });
      setHoldReason("");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to add to hold queue");
    }
  };

  const handleRemoveFromHold = async (orderId) => {
    try {
      await axios.post(`${API}/hold-queue/remove`, { order_id: orderId });
      toast.success("Order removed from Hold Queue");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to remove from hold queue");
    }
  };

  // Refinish Queue functions
  const handleAddToRefinish = async () => {
    if (!refinishModal.order || !refinishNotes.trim()) return;
    
    try {
      await axios.post(`${API}/refinish-queue/add`, {
        order_id: refinishModal.order.id,
        fix_notes: refinishNotes.trim()
      });
      toast.success("Order added to Refinish Queue!");
      setRefinishModal({ open: false, order: null });
      setRefinishNotes("");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to add to refinish queue");
    }
  };

  // RUSH Order functions (Admin only)
  const handleSetRush = async () => {
    if (!rushModal.order) return;
    
    try {
      await axios.put(`${API}/orders/${rushModal.order.id}/rush`, {
        is_rush: true,
        rush_reason: rushReason.trim() || null
      });
      toast.success("Order marked as RUSH!");
      setRushModal({ open: false, order: null });
      setRushReason("");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to set rush");
    }
  };

  const handleRemoveRush = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/rush`, {
        is_rush: false
      });
      toast.success("Rush removed from order");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to remove rush");
    }
  };

  // Re-Do Order functions (for customer issues)
  const handleSetRedo = async () => {
    if (!redoModal.order) return;
    
    try {
      await axios.put(`${API}/orders/${redoModal.order.id}/redo`, {
        is_redo: true,
        redo_reason: redoReason.trim() || null
      });
      toast.success("Order marked as Re-Do!");
      setRedoModal({ open: false, order: null });
      setRedoReason("");
      fetchData();
      // Also refresh selected order if open
      if (selectedOrder?.id === redoModal.order.id) {
        openOrderDetail(redoModal.order.id);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to set re-do");
    }
  };

  const handleRemoveRedo = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/redo`, {
        is_redo: false
      });
      toast.success("Re-Do status removed from order");
      fetchData();
      // Also refresh selected order if open
      if (selectedOrder?.id === orderId) {
        openOrderDetail(orderId);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to remove re-do");
    }
  };

  // Add Payment to Order
  const handleAddPayment = async () => {
    if (!addPaymentModal.orderId) return;
    
    const amount = parseFloat(addPaymentForm.amount);
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }
    
    setAddPaymentLoading(true);
    try {
      const res = await axios.post(`${API}/orders/${addPaymentModal.orderId}/add-payment`, {
        amount: amount,
        payment_method: addPaymentForm.payment_method || "",
        note: addPaymentForm.note || ""
      });
      
      toast.success(`Payment of $${amount.toFixed(2)} added! ${res.data.production_priority === "ready_production" ? "🎉 Ready for Production!" : ""}`);
      
      // Reset form and close modal
      setAddPaymentForm({ amount: "", payment_method: "", note: "" });
      setAddPaymentModal({ open: false, orderId: null });
      
      // Refresh data
      fetchData();
      
      // Update selected order if still viewing it
      if (selectedOrder?.id === addPaymentModal.orderId) {
        setSelectedOrder(res.data.order);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to add payment");
    } finally {
      setAddPaymentLoading(false);
    }
  };

  // Fetch orders for stats modal
  const openStatsModal = async (title, filterType, filterValue) => {
    try {
      let fetchedOrders = [];
      
      if (filterType === "active") {
        // All active orders (not completed) - EXCLUDE CUT orders (they go to Cut Orders section)
        const res = await axios.get(`${API}/orders`);
        fetchedOrders = res.data.filter(o => o.cut_status !== "cut");
      } else if (filterType === "completed") {
        // All completed orders
        const res = await axios.get(`${API}/orders/completed`);
        fetchedOrders = res.data;
      } else if (filterType === "product") {
        // Filter by product type - EXCLUDE CUT orders (they go to Cut Orders section)
        if (filterValue === "caps") {
          const res = await axios.get(`${API}/orders`, { params: { product_type: "caps" } });
          fetchedOrders = res.data.filter(o => o.cut_status !== "cut");
        } else {
          const res = await axios.get(`${API}/orders`, { params: { product_type: filterValue } });
          fetchedOrders = res.data.filter(o => o.cut_status !== "cut");
        }
      } else if (filterType === "machine") {
        // Orders in machine_waiting or machine departments - EXCLUDE CUT orders
        const res = await axios.get(`${API}/machine-queue`);
        fetchedOrders = res.data.groups.flatMap(g => g.orders).filter(o => o.cut_status !== "cut");
      } else if (filterType === "department") {
        // Filter by specific department - EXCLUDE CUT orders (they go to Cut Orders section)
        const res = await axios.get(`${API}/orders`);
        fetchedOrders = res.data.filter(o => o.current_department === filterValue && o.cut_status !== "cut");
      } else if (filterType === "cut_orders") {
        // All orders marked as CUT - this is the ONLY place CUT orders should show
        const res = await axios.get(`${API}/orders`);
        fetchedOrders = res.data.filter(o => o.cut_status === "cut");
      }
      
      setStatsModal({ open: true, title, filter: { type: filterType, value: filterValue }, orders: fetchedOrders });
    } catch (error) {
      toast.error("Failed to load orders");
    }
  };

  // State for stats modal export with brand input
  const [statsExportModal, setStatsExportModal] = useState({ open: false });
  const [statsExportBrands, setStatsExportBrands] = useState({}); // Object mapping order_id to brand
  const [statsExportFilter, setStatsExportFilter] = useState("all"); // "all", "waiting", "cut"

  // Open stats export modal - initialize brands object for each steering wheel order
  const openStatsExportModal = () => {
    const initialBrands = {};
    statsModal.orders?.forEach(order => {
      if (order.product_type === "steering_wheel") {
        initialBrands[order.id] = order.steering_wheel_brand || "";
      }
    });
    setStatsExportBrands(initialBrands);
    setStatsExportFilter("all"); // Reset filter when opening modal
    setStatsExportModal({ open: true });
  };

  // Toggle stats modal order selection
  const toggleStatsOrderSelection = (orderId) => {
    setStatsSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  // Toggle select all in stats modal
  const toggleStatsSelectAll = () => {
    if (statsSelectedOrders.length === statsModal.orders.length) {
      setStatsSelectedOrders([]);
    } else {
      setStatsSelectedOrders(statsModal.orders.map(o => o.id));
    }
  };

  // Get filtered orders for export based on filter selection AND checkbox selection
  const getFilteredExportOrders = () => {
    // If orders are selected via checkboxes, only export those
    if (statsSelectedOrders.length > 0) {
      let selectedOrders = statsModal.orders.filter(o => statsSelectedOrders.includes(o.id));
      // Apply cut status filter on top of selection
      if (statsExportFilter === "waiting") return selectedOrders.filter(o => o.cut_status !== "cut");
      if (statsExportFilter === "cut") return selectedOrders.filter(o => o.cut_status === "cut");
      return selectedOrders;
    }
    // Otherwise, use existing filter logic
    if (statsExportFilter === "all") return statsModal.orders;
    if (statsExportFilter === "waiting") return statsModal.orders.filter(o => o.cut_status !== "cut");
    if (statsExportFilter === "cut") return statsModal.orders.filter(o => o.cut_status === "cut");
    return statsModal.orders;
  };

  // Export stats modal PDF with individual brands for each steering wheel
  const exportStatsModalPDF = () => {
    const doc = new jsPDF();
    const filteredOrders = getFilteredExportOrders();
    
    if (filteredOrders.length === 0) {
      toast.error(t('messages.noOrdersToExport') || "No orders to export with current filter");
      return;
    }
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Professional header with dark bar
    doc.setFillColor(24, 24, 27); // zinc-900
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    // Main title
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(239, 68, 68); // red-500
    doc.text("CORLEONE FORGED", 14, 18);
    
    // Subtitle
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    const filterLabel = statsExportFilter === "waiting" ? ' (Waiting to Cut)' : statsExportFilter === "cut" ? ' (Already Cut)' : "";
    doc.text(`${statsModal.title?.toUpperCase()}${filterLabel}`, 14, 30);
    
    // Report info on right
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 14, { align: "right" });
    doc.text(`Total Orders: ${filteredOrders.length}`, pageWidth - 14, 22, { align: "right" });
    doc.text(`Report ID: STATS-${Date.now().toString(36).toUpperCase()}`, pageWidth - 14, 30, { align: "right" });
    
    // Reset text color
    doc.setTextColor(0, 0, 0);
    
    // Check if this is a steering wheel or caps report (needs cut status)
    const isSteeringWheelReport = statsModal.title?.toLowerCase().includes("steering") || 
      filteredOrders.every(o => o.product_type === "steering_wheel");
    const isCapsReport = statsModal.title?.toLowerCase().includes("cap");
    const needsCutStatus = isSteeringWheelReport || isCapsReport;
    
    let tableData, tableHeaders;
    
    if (isSteeringWheelReport) {
      // Steering wheel report: Order #, Customer, Type, Design, Qty, Paid%, Status, Dept, Date (NO Size)
      tableHeaders = [['Order #', 'Customer', 'Type', 'Design', 'Qty', 'Paid%', 'Status', 'Dept', 'Date']];
      tableData = filteredOrders.map(order => {
        const brandInfo = statsExportBrands[order.id]?.trim() || order.steering_wheel_brand || order.wheel_specs || "-";
        const cutStatus = order.cut_status === "cut" ? 'CUT' : 'WAITING';
        const paidPct = order.percentage_paid > 0 ? `${Math.round(order.percentage_paid)}%` : '-';
        return [
          order.order_number,
          order.customer_name,
          PRODUCT_TYPES[order.product_type]?.label || order.product_type,
          brandInfo,
          order.quantity || 1,
          paidPct,
          cutStatus,
          DEPT_MAP[order.current_department]?.label || order.current_department,
          new Date(order.order_date).toLocaleDateString()
        ];
      });
    } else if (isCapsReport) {
      // Caps report: Order #, Customer, Type, Qty, Paid%, Status, Dept, Date (NO Size, NO Brand)
      tableHeaders = [['Order #', 'Customer', 'Type', 'Qty', 'Paid%', 'Status', 'Dept', 'Date']];
      tableData = filteredOrders.map(order => {
        const cutStatus = order.cut_status === "cut" ? 'CUT' : 'WAITING';
        const paidPct = order.percentage_paid > 0 ? `${Math.round(order.percentage_paid)}%` : '-';
        return [
          order.order_number,
          order.customer_name,
          PRODUCT_TYPES[order.product_type]?.label || order.product_type,
          order.quantity || 1,
          paidPct,
          cutStatus,
          DEPT_MAP[order.current_department]?.label || order.current_department,
          new Date(order.order_date).toLocaleDateString()
        ];
      });
    } else {
      // Standard report with sizes (rims, etc)
      tableHeaders = [['Order #', 'Customer', 'Type', 'Size', 'Design', 'Qty', 'Paid%', 'Dept', 'Date']];
      tableData = filteredOrders.map(order => {
        let brandInfo = "-";
        if (order.product_type === "steering_wheel") {
          brandInfo = statsExportBrands[order.id]?.trim() || order.steering_wheel_brand || "-";
        }
        const paidPct = order.percentage_paid > 0 ? `${Math.round(order.percentage_paid)}%` : '-';
        return [
          order.order_number,
          order.customer_name,
          PRODUCT_TYPES[order.product_type]?.label || order.product_type,
          order.rim_size ? `${order.rim_size}"` : "-",
          brandInfo,
          order.quantity || 1,
          paidPct,
          DEPT_MAP[order.current_department]?.label || order.current_department,
          new Date(order.order_date).toLocaleDateString()
        ];
      });
    }
    
    autoTable(doc, {
      startY: 48,
      head: tableHeaders,
      body: tableData,
      theme: "striped",
      headStyles: { 
        fillColor: [239, 68, 68], 
        textColor: [255, 255, 255], 
        fontStyle: "bold",
        fontSize: 9,
        cellPadding: 3,
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 2.5
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [239, 68, 68] }, // Order # in red
      },
      styles: { 
        fontSize: 8, 
        cellPadding: 2.5,
        overflow: 'linebreak'
      },
      didDrawPage: function (data) {
        // Footer on each page
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Page ${doc.internal.getCurrentPageInfo().pageNumber} | Corleone Forged © ${new Date().getFullYear()}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }
    });
    
    const filterSuffix = statsExportFilter !== "all" ? `-${statsExportFilter}` : "";
    const filename = statsModal.title.toLowerCase().replace(/\s+/g, '-');
    doc.save(`corleone-forged-${filename}${filterSuffix}-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success(t('messages.pdfExported') || "PDF exported!");
    setStatsExportModal({ open: false });
    setStatsExportBrands({});
  };

  const handleUploadAttachment = async (orderId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await axios.post(`${API}/orders/${orderId}/attachment`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success("Attachment uploaded!");
      fetchData();
      // Refresh the selected order if it's open
      if (selectedOrder && selectedOrder.id === orderId) {
        openOrderDetail(orderId);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to upload attachment");
    }
  };

  const handleDeleteAttachment = async (orderId, attachmentId = null) => {
    try {
      const url = attachmentId 
        ? `${API}/orders/${orderId}/attachment?attachment_id=${attachmentId}`
        : `${API}/orders/${orderId}/attachment`;
      await axios.delete(url);
      toast.success("Attachment deleted");
      fetchData();
      // Refresh the selected order if it's open
      if (selectedOrder && selectedOrder.id === orderId) {
        openOrderDetail(orderId);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete attachment");
    }
  };

  // Open attachment preview modal
  const openAttachmentPreview = (url, filename, contentType = "") => {
    const normalizedUrl = getAttachmentUrl(url);
    // Determine file type from filename or content type
    const ext = filename?.toLowerCase()?.split('.').pop() || "";
    const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext) || contentType?.startsWith("image/");
    const isPdf = ext === "pdf" || contentType === "application/pdf";
    
    setAttachmentError(false); // Reset error state
    setAttachmentPreview({ 
      open: true, 
      url: normalizedUrl, 
      filename: filename || "Attachment",
      type: isImage ? "image" : (isPdf ? "pdf" : "other")
    });
  };

  const handleDeleteOrder = async (orderId, orderNumber) => {
    try {
      await axios.delete(`${API}/orders/${orderId}`);
      toast.success(`Order ${orderNumber} deleted permanently`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete order");
    }
  };

  // Bulk mark orders as cut (for caps and steering wheels)
  const handleBulkMarkCut = async (orderIds, cutStatus = "cut") => {
    try {
      const res = await axios.put(`${API}/admin/orders/bulk-cut`, {
        order_ids: orderIds,
        cut_status: cutStatus
      });
      toast.success(`${res.data.modified_count} orders marked as ${cutStatus.toUpperCase()}!`);
      fetchData();
      // Refresh stats modal if open
      if (statsModal.open) {
        // Re-fetch the orders for the modal
        const updatedOrders = statsModal.orders.map(o => 
          orderIds.includes(o.id) ? { ...o, cut_status: cutStatus } : o
        );
        setStatsModal({ ...statsModal, orders: updatedOrders });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to mark orders as cut");
    }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.length < 1) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await axios.get(`${API}/orders/search`, { params: { q: query } });
      setSearchResults(res.data);
    } catch (error) {
      console.error("Search failed", error);
    }
  };

  // CSV Import handlers
  const handleCsvFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        
        const preview = [];
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
          });
          preview.push(row);
        }
        setCsvPreview(preview);
      } catch (err) {
        toast.error("Failed to parse CSV file");
      }
    };
    reader.readAsText(file);
  };

  const handleBulkImport = async () => {
    if (!csvFile) {
      toast.error("Please select a CSV file");
      return;
    }
    
    setImportLoading(true);
    try {
      const text = await csvFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      
      const orders = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        
        // Map to expected fields
        orders.push({
          order_number: row.order_number || row['order number'] || row['order#'] || '',
          customer_name: row.customer_name || row['customer name'] || row.customer || row.name || '',
          phone: row.phone || row.tel || row.telephone || '',
          product_type: row.product_type || row['product type'] || row.type || 'rim',
          wheel_specs: row.wheel_specs || row['wheel specs'] || row.specs || '',
          notes: row.notes || row.note || '',
          vehicle_make: row.vehicle_make || row['vehicle make'] || row.make || '',
          vehicle_model: row.vehicle_model || row['vehicle model'] || row.model || '',
          rim_size: row.rim_size || row['rim size'] || row.size || '',
          steering_wheel_brand: row.steering_wheel_brand || row['steering wheel brand'] || row.brand || '',
          order_date: row.order_date || row['order date'] || row.date || '',
          quantity: parseInt(row.quantity || row.qty || '1') || 1
        });
      }
      
      const res = await axios.post(`${API}/admin/orders/bulk-import`, { orders });
      
      toast.success(`Imported ${res.data.imported} orders`);
      if (res.data.skipped.length > 0) {
        toast.warning(`Skipped ${res.data.skipped.length} duplicate orders`);
      }
      if (res.data.errors.length > 0) {
        toast.error(`${res.data.errors.length} errors occurred`);
        console.error("Import errors:", res.data.errors);
      }
      
      setBulkImportModal({ open: false });
      setCsvFile(null);
      setCsvPreview([]);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Import failed");
    } finally {
      setImportLoading(false);
    }
  };

  // Bulk Edit handlers
  const toggleOrderSelection = (orderId) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const selectAllOrdersInDept = (deptOrders) => {
    const deptOrderIds = deptOrders.map(o => o.id);
    const allSelected = deptOrderIds.every(id => selectedOrders.includes(id));
    
    if (allSelected) {
      setSelectedOrders(prev => prev.filter(id => !deptOrderIds.includes(id)));
    } else {
      setSelectedOrders(prev => [...new Set([...prev, ...deptOrderIds])]);
    }
  };

  const handleBulkEdit = async () => {
    if (selectedOrders.length === 0) {
      toast.error("No orders selected");
      return;
    }
    
    // Filter out empty values
    const updates = {};
    Object.entries(bulkEditData).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) {
        updates[key] = value;
      }
    });
    
    if (Object.keys(updates).length === 0) {
      toast.error("No changes to apply");
      return;
    }
    
    try {
      const res = await axios.put(`${API}/admin/orders/bulk-edit`, {
        order_ids: selectedOrders,
        updates
      });
      
      toast.success(`Updated ${res.data.modified_count} orders`);
      setBulkEditModal({ open: false });
      setBulkEditMode(false);
      setSelectedOrders([]);
      setBulkEditData({
        order_date: "",
        wheel_specs: "",
        rim_size: "",
        vehicle_make: "",
        vehicle_model: "",
        notes: "",
        cut_status: "",
        steering_wheel_brand: "",
        current_department: "",
        phone: ""
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Bulk edit failed");
    }
  };

  // Bulk delete selected orders (Admin only)
  const handleBulkDelete = async () => {
    if (selectedOrders.length === 0) {
      toast.error("No orders selected");
      return;
    }
    
    try {
      const res = await axios.delete(`${API}/admin/orders/bulk-delete`, {
        data: { order_ids: selectedOrders }
      });
      
      toast.success(`Deleted ${res.data.deleted_count} orders`);
      setBulkDeleteModal({ open: false });
      setBulkEditMode(false);
      setSelectedOrders([]);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Bulk delete failed");
    }
  };

  // Bulk move selected orders to a department (Admin only)
  const handleBulkMove = async () => {
    if (selectedOrders.length === 0) {
      toast.error("No orders selected");
      return;
    }
    
    if (!bulkMoveModal.targetDept) {
      toast.error("Please select a target department");
      return;
    }
    
    setBulkMoveLoading(true);
    try {
      const res = await axios.put(`${API}/admin/orders/bulk-move`, {
        order_ids: selectedOrders,
        target_department: bulkMoveModal.targetDept
      });
      
      const deptLabel = DEPARTMENTS.find(d => d.value === bulkMoveModal.targetDept)?.label || bulkMoveModal.targetDept;
      toast.success(`Moved ${res.data.moved_count} orders to ${deptLabel}`);
      
      if (res.data.errors && res.data.errors.length > 0) {
        toast.warning(`${res.data.errors.length} orders had errors`);
      }
      
      setBulkMoveModal({ open: false, targetDept: "" });
      setBulkEditMode(false);
      setSelectedOrders([]);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Bulk move failed");
    } finally {
      setBulkMoveLoading(false);
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

  // Edit a note (users can only edit their own notes)
  const handleEditNote = async (noteId) => {
    if (!editingNote?.text.trim() || !selectedOrder) return;
    try {
      const res = await axios.put(`${API}/orders/${selectedOrder.id}/notes/${noteId}`, { text: editingNote.text });
      setSelectedOrder(res.data);
      setEditingNote(null);
      toast.success("Note updated!");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update note");
    }
  };

  // Delete a note (users can only delete their own notes)
  const handleDeleteNote = async (noteId) => {
    if (!selectedOrder) return;
    try {
      await axios.delete(`${API}/orders/${selectedOrder.id}/notes/${noteId}`);
      // Update the local state to remove the deleted note
      setSelectedOrder(prev => ({
        ...prev,
        order_notes: prev.order_notes.filter(n => n.id !== noteId)
      }));
      toast.success("Note deleted!");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete note");
    }
  };

  const openOrderDetail = async (orderId) => {
    try {
      const res = await axios.get(`${API}/orders/${orderId}`);
      setSelectedOrder(res.data);
      setEditMode(false);
      setEditFormData({});
    } catch (error) {
      toast.error("Failed to load order details");
    }
  };

  const startEditOrder = () => {
    if (!selectedOrder) return;
    setEditFormData({
      order_number: selectedOrder.order_number || "",
      customer_name: selectedOrder.customer_name || "",
      phone: selectedOrder.phone || "",
      product_type: selectedOrder.product_type || "rim",
      wheel_specs: selectedOrder.wheel_specs || "",
      notes: selectedOrder.notes || "",
      vehicle_make: selectedOrder.vehicle_make || "",
      vehicle_model: selectedOrder.vehicle_model || "",
      rim_size: selectedOrder.rim_size || "",
      rim_size_front: selectedOrder.rim_size_front || "",
      rim_size_rear: selectedOrder.rim_size_rear || "",
      steering_wheel_brand: selectedOrder.steering_wheel_brand || "",
      quantity: selectedOrder.quantity || 1,
      has_tires: selectedOrder.has_tires || false,
      has_steering_wheel: selectedOrder.has_steering_wheel || false,
      lalo_status: selectedOrder.lalo_status || "not_sent",
      tire_size: selectedOrder.tire_size || "",
      // Payment fields
      payment_status: selectedOrder.payment_status || "unpaid",
      payment_total: selectedOrder.payment_total || 0,
      deposit_amount: selectedOrder.deposit_amount || 0,
      balance_due: selectedOrder.balance_due || 0,
      payment_notes: selectedOrder.payment_notes || "",
    });
    setEditMode(true);
  };

  const saveOrderEdits = async () => {
    if (!selectedOrder) return;
    try {
      await axios.put(`${API}/orders/${selectedOrder.id}`, editFormData);
      toast.success("Order updated successfully!");
      // Refresh order details
      const res = await axios.get(`${API}/orders/${selectedOrder.id}`);
      setSelectedOrder(res.data);
      setEditMode(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update order");
    }
  };

  const getOrdersByDepartment = (dept) => {
    // Sort orders by order_number for easier finding
    // CUT orders NOW APPEAR in FINISHING department (they auto-move there when cut)
    // CUT orders are EXCLUDED from earlier departments (design, program, machine_waiting, machine)
    // CUT orders ALSO appear in Cut Orders modal for tracking
    return orders
      .filter(o => {
        if (o.current_department !== dept) return false;
        
        // For FINISHING and later departments, show ALL orders including CUT
        // (finishing, powder_coat, assemble, showroom, shipped)
        const laterDepartments = ["finishing", "powder_coat", "assemble", "showroom", "shipped"];
        if (laterDepartments.includes(dept)) {
          return true; // Show all orders including CUT
        }
        
        // For earlier departments, EXCLUDE CUT orders (they should be in finishing)
        return o.cut_status !== "cut";
      })
      .sort((a, b) => {
        // Try numeric sort first, then string sort
        const numA = parseInt(a.order_number) || 0;
        const numB = parseInt(b.order_number) || 0;
        if (numA && numB) return numA - numB;
        return (a.order_number || '').localeCompare(b.order_number || '');
      });
  };

  const getDepartmentsToShow = () => {
    if (isAnyAdmin) return DEPARTMENTS;
    // Use departments array if available, fallback to single department
    const userDepts = user?.departments?.length > 0 ? user.departments : [user?.department];
    // Return departments in the order the user has them (primary department first)
    return userDepts
      .map(deptValue => DEPARTMENTS.find(d => d.value === deptValue))
      .filter(Boolean); // Remove any undefined entries
  };

  // Open department table modal (when clicking department header)
  const openDeptTableModal = (deptValue, deptLabel, deptOrders) => {
    setDeptTableSelectedOrders([]); // Reset selection when opening
    setDeptTableModal({ open: true, deptValue, deptLabel, orders: deptOrders });
  };

  // Toggle single order selection in dept table
  const toggleDeptTableOrderSelection = (orderId) => {
    setDeptTableSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  // Select/deselect all orders in dept table
  const toggleDeptTableSelectAll = () => {
    if (deptTableSelectedOrders.length === deptTableModal.orders.length) {
      setDeptTableSelectedOrders([]);
    } else {
      setDeptTableSelectedOrders(deptTableModal.orders.map(o => o.id));
    }
  };

  // Bulk mark selected orders as CUT
  const bulkMarkAsCut = async () => {
    if (deptTableSelectedOrders.length === 0) {
      toast.error("Please select at least one order");
      return;
    }
    
    setDeptTableBulkLoading(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const orderId of deptTableSelectedOrders) {
      try {
        await axios.put(`${API}/orders/${orderId}/cut-status`, 
          { cut_status: "cut" },
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );
        successCount++;
      } catch (err) {
        console.error(`Failed to mark order ${orderId} as cut:`, err);
        failCount++;
      }
    }
    
    setDeptTableBulkLoading(false);
    
    if (successCount > 0) {
      toast.success(`Marked ${successCount} order(s) as CUT`);
      fetchData(); // Refresh data
      // Update the modal's orders list
      setDeptTableModal(prev => ({
        ...prev,
        orders: prev.orders.map(o => 
          deptTableSelectedOrders.includes(o.id) 
            ? { ...o, cut_status: "cut" }
            : o
        )
      }));
    }
    if (failCount > 0) {
      toast.error(`Failed to mark ${failCount} order(s)`);
    }
    setDeptTableSelectedOrders([]);
  };

  // Bulk mark selected orders as WAITING
  const bulkMarkAsWaiting = async () => {
    if (deptTableSelectedOrders.length === 0) {
      toast.error("Please select at least one order");
      return;
    }
    
    setDeptTableBulkLoading(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const orderId of deptTableSelectedOrders) {
      try {
        await axios.put(`${API}/orders/${orderId}/cut-status`, 
          { cut_status: "waiting" },
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );
        successCount++;
      } catch (err) {
        console.error(`Failed to mark order ${orderId} as waiting:`, err);
        failCount++;
      }
    }
    
    setDeptTableBulkLoading(false);
    
    if (successCount > 0) {
      toast.success(`Marked ${successCount} order(s) as WAITING`);
      fetchData();
      setDeptTableModal(prev => ({
        ...prev,
        orders: prev.orders.map(o => 
          deptTableSelectedOrders.includes(o.id) 
            ? { ...o, cut_status: "waiting" }
            : o
        )
      }));
    }
    if (failCount > 0) {
      toast.error(`Failed to mark ${failCount} order(s)`);
    }
    setDeptTableSelectedOrders([]);
  };

  // Bulk move selected orders to a department
  const bulkMoveToDepart = async (targetDept) => {
    if (deptTableSelectedOrders.length === 0) {
      toast.error("Please select at least one order");
      return;
    }
    
    setDeptTableBulkLoading(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const orderId of deptTableSelectedOrders) {
      try {
        await axios.put(`${API}/orders/${orderId}/move`, 
          { target_department: targetDept },
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );
        successCount++;
      } catch (err) {
        console.error(`Failed to move order ${orderId}:`, err);
        failCount++;
      }
    }
    
    setDeptTableBulkLoading(false);
    
    if (successCount > 0) {
      toast.success(`Moved ${successCount} order(s) to ${DEPT_MAP[targetDept]?.label || targetDept}`);
      fetchData();
      // Remove moved orders from the modal
      setDeptTableModal(prev => ({
        ...prev,
        orders: prev.orders.filter(o => !deptTableSelectedOrders.includes(o.id))
      }));
    }
    if (failCount > 0) {
      toast.error(`Failed to move ${failCount} order(s)`);
    }
    setDeptTableSelectedOrders([]);
  };

  // Bulk delete selected orders
  const bulkDeleteFromTable = async () => {
    if (deptTableSelectedOrders.length === 0) {
      toast.error("Please select at least one order");
      return;
    }
    
    if (!window.confirm(`Are you sure you want to DELETE ${deptTableSelectedOrders.length} order(s)? This cannot be undone.`)) {
      return;
    }
    
    setDeptTableBulkLoading(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const orderId of deptTableSelectedOrders) {
      try {
        await axios.delete(`${API}/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        successCount++;
      } catch (err) {
        console.error(`Failed to delete order ${orderId}:`, err);
        failCount++;
      }
    }
    
    setDeptTableBulkLoading(false);
    
    if (successCount > 0) {
      toast.success(`Deleted ${successCount} order(s)`);
      fetchData();
      setDeptTableModal(prev => ({
        ...prev,
        orders: prev.orders.filter(o => !deptTableSelectedOrders.includes(o.id))
      }));
    }
    if (failCount > 0) {
      toast.error(`Failed to delete ${failCount} order(s)`);
    }
    setDeptTableSelectedOrders([]);
  };

  // Open export modal with column selection
  const openExportColumnsModal = (deptValue, deptLabel, deptOrders) => {
    const initialBrands = {};
    deptOrders.forEach(order => {
      if (order.product_type === "steering_wheel") {
        initialBrands[order.id] = order.steering_wheel_brand || "";
      }
    });
    setExportBrands(initialBrands);
    setExportColumnsModal({ 
      open: true, 
      deptValue, 
      deptLabel, 
      orders: deptOrders,
      selectedColumns: {
        order_number: true,
        customer: true,
        type: true,
        size: true,
        brand: true,
        qty: true,
        specs: false, // PSpecs - off by default per user request
        department: true,
        order_date: true,
        dept_date: true,
        status: true
      }
    });
  };

  // Toggle export column selection
  const toggleExportColumn = (column) => {
    setExportColumnsModal(prev => ({
      ...prev,
      selectedColumns: {
        ...prev.selectedColumns,
        [column]: !prev.selectedColumns[column]
      }
    }));
  };

  // Toggle cap type filter in export
  const toggleExportCapType = (capType) => {
    setExportColumnsModal(prev => ({
      ...prev,
      selectedCapTypes: {
        ...prev.selectedCapTypes,
        [capType]: !prev.selectedCapTypes[capType]
      }
    }));
  };

  // Export PDF with selected columns only
  const exportWithSelectedColumns = () => {
    const { deptValue, deptLabel, orders: deptOrders, selectedColumns, selectedCapTypes } = exportColumnsModal;
    
    // Filter orders by selected cap types if this is a caps export
    const capTypes = ["standard_caps", "floater_caps", "xxl_caps", "dually_floating_caps", "offroad_floating_caps", "custom_caps", "race_car_caps"];
    const hasCapsOrders = deptOrders.some(o => capTypes.includes(o.product_type));
    
    let filteredOrders = deptOrders;
    if (hasCapsOrders && selectedCapTypes) {
      filteredOrders = deptOrders.filter(order => {
        // If it's a cap type, check if it's selected
        if (capTypes.includes(order.product_type)) {
          return selectedCapTypes[order.product_type];
        }
        // Non-cap orders always included
        return true;
      });
    }
    
    if (filteredOrders.length === 0) {
      toast.error("No orders to export with selected filters");
      return;
    }
    
    const doc = new jsPDF({ orientation: 'landscape' });
    
    // Professional Header with Logo-style text
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Add header background bar
    doc.setFillColor(24, 24, 27); // zinc-900
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    // Main title
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(239, 68, 68); // red-500
    doc.text("CORLEONE FORGED", 14, 18);
    
    // Subtitle - Department name
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(`${deptLabel.toUpperCase()} DEPARTMENT REPORT`, 14, 28);
    
    // Report info on right side
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 14, { align: "right" });
    doc.text(`Total Orders: ${filteredOrders.length}`, pageWidth - 14, 21, { align: "right" });
    doc.text(`Report ID: ${deptValue.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`, pageWidth - 14, 28, { align: "right" });
    
    // Reset text color for table
    doc.setTextColor(0, 0, 0);
    
    // Build headers and data based on selected columns - USE ENGLISH for PDF (jsPDF doesn't support non-Latin fonts)
    const headers = [];
    const columnKeys = [];
    
    if (selectedColumns.order_number) { headers.push('Order #'); columnKeys.push("order_number"); }
    if (selectedColumns.customer) { headers.push('Customer'); columnKeys.push("customer"); }
    if (selectedColumns.type) { headers.push('Type'); columnKeys.push("type"); }
    if (selectedColumns.size) { headers.push('Size'); columnKeys.push("size"); }
    if (selectedColumns.brand) { headers.push('Brand'); columnKeys.push("brand"); }
    if (selectedColumns.qty) { headers.push('Qty'); columnKeys.push("qty"); }
    if (selectedColumns.specs) { headers.push('Specs'); columnKeys.push("specs"); }
    if (selectedColumns.department) { headers.push('Dept'); columnKeys.push("department"); }
    if (selectedColumns.order_date) { headers.push('Order Date'); columnKeys.push("order_date"); }
    if (selectedColumns.dept_date) { headers.push('Dept Date'); columnKeys.push("dept_date"); }
    if (selectedColumns.status) { headers.push('Status'); columnKeys.push("status"); }
    
    const tableData = filteredOrders.map(order => {
      const row = [];
      columnKeys.forEach(key => {
        switch(key) {
          case "order_number": row.push(order.order_number); break;
          case "customer": row.push(order.customer_name); break;
          case "type": row.push(PRODUCT_TYPES[order.product_type]?.label || order.product_type); break;
          case "size": row.push(order.rim_size ? `${order.rim_size}"` : "-"); break;
          case "brand": 
            row.push(order.product_type === "steering_wheel" 
              ? (exportBrands[order.id]?.trim() || order.steering_wheel_brand || "-")
              : "-"); 
            break;
          case "qty": row.push(order.quantity || 1); break;
          case "specs": row.push(order.wheel_specs?.substring(0, 30) + (order.wheel_specs?.length > 30 ? "..." : "") || "-"); break;
          case "department": row.push(DEPT_MAP[order.current_department]?.label || order.current_department); break;
          case "order_date": row.push(new Date(order.order_date).toLocaleDateString()); break;
          case "dept_date": 
            // Get when order arrived in current department
            const deptHistory = order.department_history?.find(h => h.department === order.current_department && !h.completed_at);
            row.push(deptHistory?.started_at ? new Date(deptHistory.started_at).toLocaleDateString() : "-");
            break;
          case "status": row.push(order.cut_status === "cut" ? 'CUT' : (order.cut_status === "waiting" ? 'WAITING' : "-")); break;
          default: row.push("-");
        }
      });
      return row;
    });
    
    // Check if this is a caps export - if so, group by cap type
    const isCapsExport = filteredOrders.some(o => capTypes.includes(o.product_type));
    
    if (isCapsExport && filteredOrders.length > 1) {
      // Group orders by cap type for organized export
      const capTypeLabels = {
        standard_caps: "STANDARD CAPS",
        floater_caps: "FLOATER CAPS", 
        xxl_caps: "XXL CAPS",
        dually_floating_caps: "DUALLY FLOATING CAPS",
        offroad_floating_caps: "OFF-ROAD FLOATING CAPS",
        custom_caps: "CUSTOM CAPS",
        race_car_caps: "TALL CAPS"
      };
      
      let currentY = 42;
      
      // Export each cap type as a separate section
      capTypes.forEach(capType => {
        const capOrders = filteredOrders.filter(o => o.product_type === capType);
        if (capOrders.length === 0) return;
        
        // Check if we need a new page
        if (currentY > pageHeight - 80) {
          doc.addPage();
          currentY = 20;
        }
        
        // Section header for cap type
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(239, 68, 68);
        doc.text(`${capTypeLabels[capType] || capType.toUpperCase()} (${capOrders.length})`, 14, currentY);
        currentY += 5;
        
        // Build table data for this cap type
        const sectionData = capOrders.map(order => {
          const row = [];
          columnKeys.forEach(key => {
            switch(key) {
              case "order_number": row.push(order.order_number); break;
              case "customer": row.push(order.customer_name); break;
              case "type": row.push(PRODUCT_TYPES[order.product_type]?.label || order.product_type); break;
              case "size": row.push(order.rim_size ? `${order.rim_size}"` : "-"); break;
              case "brand": row.push("-"); break;
              case "qty": row.push(order.quantity || 1); break;
              case "specs": row.push(order.wheel_specs?.substring(0, 30) + (order.wheel_specs?.length > 30 ? "..." : "") || "-"); break;
              case "department": row.push(DEPT_MAP[order.current_department]?.label || order.current_department); break;
              case "order_date": row.push(new Date(order.order_date).toLocaleDateString()); break;
              case "dept_date": 
                const deptHist = order.department_history?.find(h => h.department === order.current_department && !h.completed_at);
                row.push(deptHist?.started_at ? new Date(deptHist.started_at).toLocaleDateString() : "-");
                break;
              case "status": row.push(order.cut_status === "cut" ? 'CUT' : (order.cut_status === "waiting" ? 'WAITING' : "-")); break;
              default: row.push("-");
            }
          });
          return row;
        });
        
        autoTable(doc, {
          startY: currentY,
          head: [headers],
          body: sectionData,
          theme: "striped",
          headStyles: { 
            fillColor: [100, 100, 100], 
            textColor: [255, 255, 255], 
            fontStyle: "bold",
            fontSize: 8,
            cellPadding: 3,
            halign: 'center'
          },
          bodyStyles: {
            fontSize: 8,
            cellPadding: 2
          },
          alternateRowStyles: {
            fillColor: [250, 250, 250]
          },
          columnStyles: {
            0: { fontStyle: 'bold', textColor: [239, 68, 68] },
          },
          styles: { 
            fontSize: 8, 
            cellPadding: 2,
            overflow: 'linebreak'
          },
          margin: { left: 14, right: 14 }
        });
        
        currentY = doc.lastAutoTable.finalY + 15;
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
    } else {
      // Standard export (non-caps or single type)
      autoTable(doc, {
        startY: 42,
        head: [headers],
        body: tableData,
        theme: "striped",
        headStyles: { 
          fillColor: [239, 68, 68], 
          textColor: [255, 255, 255], 
          fontStyle: "bold",
          fontSize: 9,
          cellPadding: 4,
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 8,
          cellPadding: 3
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250]
        },
        columnStyles: {
          0: { fontStyle: 'bold', textColor: [239, 68, 68] }, // Order # in red
        },
        styles: { 
          fontSize: 8, 
          cellPadding: 3,
          overflow: 'linebreak'
        },
        didDrawPage: function (data) {
          // Footer on each page
          doc.setFontSize(8);
          doc.setTextColor(128, 128, 128);
          doc.text(
            `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${doc.internal.getNumberOfPages()} | Corleone Forged © ${new Date().getFullYear()}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
        }
      });
    }
    
    doc.save(`corleone-forged-${deptValue}-orders-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success(`PDF exported for ${deptLabel}!`);
    setExportColumnsModal(prev => ({ ...prev, open: false }));
    setExportBrands({});
  };

  // Open export modal to enter brands before exporting - initialize individual brands
  const openExportModal = (deptValue, deptLabel, deptOrders) => {
    const initialBrands = {};
    deptOrders.forEach(order => {
      if (order.product_type === "steering_wheel") {
        initialBrands[order.id] = order.steering_wheel_brand || "";
      }
    });
    setExportBrands(initialBrands);
    setExportModal({ open: true, deptValue, deptLabel, orders: deptOrders });
  };

  // Actually export the PDF with individual brands for each steering wheel
  const exportDepartmentPDF = () => {
    const { deptValue, deptLabel, orders: deptOrders } = exportModal;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CORLEONE FORGED", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`${deptLabel} Department - Order Report`, 105, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, { align: "center" });
    doc.text(`Total Orders: ${deptOrders.length}`, 105, 44, { align: "center" });
    
    // Check if this is mostly steering wheel orders (for the steering wheel section export)
    const steeringWheelOrders = deptOrders.filter(o => o.product_type === "steering_wheel");
    const isSteeringWheelReport = steeringWheelOrders.length === deptOrders.length || 
      (steeringWheelOrders.length > 0 && steeringWheelOrders.length >= deptOrders.length * 0.8);
    
    let tableData, tableHeaders, columnStyles;
    
    if (isSteeringWheelReport) {
      // Steering wheel report: Order #, Customer, Type, Brand, Qty, Dept, Date (NO Size/Specs)
      tableHeaders = [['Order #', 'Customer', 'Type', 'Brand', 'Qty', 'Dept', 'Date']];
      tableData = deptOrders.map(order => {
        const brandInfo = exportBrands[order.id]?.trim() || order.steering_wheel_brand || order.wheel_specs || "-";
        return [
          order.order_number,
          order.customer_name,
          PRODUCT_TYPES[order.product_type]?.label || order.product_type,
          brandInfo,
          order.quantity || 1,
          DEPT_MAP[order.current_department]?.label || order.current_department,
          new Date(order.order_date).toLocaleDateString()
        ];
      });
      columnStyles = {
        0: { cellWidth: 30 },
        1: { cellWidth: 35 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 15 },
        5: { cellWidth: 25 },
        6: { cellWidth: 25 }
      };
    } else {
      // Standard report with sizes and specs
      tableHeaders = [['Order #', 'Customer', 'Type', 'Size', 'Brand', 'Qty', 'Specs', 'Date']];
      tableData = deptOrders.map(order => {
        const specs = order.wheel_specs.substring(0, 25) + (order.wheel_specs.length > 25 ? "..." : "");
        let brandInfo = "-";
        if (order.product_type === "steering_wheel") {
          brandInfo = exportBrands[order.id]?.trim() || order.steering_wheel_brand || "-";
        }
        return [
          order.order_number,
          order.customer_name,
          PRODUCT_TYPES[order.product_type]?.label || order.product_type,
          order.rim_size ? `${order.rim_size}"` : "-",
          brandInfo,
          order.quantity || 1,
          specs,
          new Date(order.order_date).toLocaleDateString()
        ];
      });
      columnStyles = {
        0: { cellWidth: 28 },
        1: { cellWidth: 25 },
        2: { cellWidth: 25 },
        3: { cellWidth: 22 },
        4: { cellWidth: 12 },
        5: { cellWidth: 40 },
        6: { cellWidth: 20 }
      };
    }
    
    autoTable(doc, {
      startY: 52,
      head: tableHeaders,
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles
    });
    
    doc.save(`corleone-forged-${deptValue}-orders-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success(`PDF exported for ${deptLabel}!`);
    setExportModal({ open: false, deptValue: "", deptLabel: "", orders: [] });
    setExportBrands({});
  };

  // Notification Bell Component
  const NotificationBell = () => {
    const { unreadCount, togglePanel } = useNotifications();
    
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={togglePanel}
        className="relative border-zinc-700 hover:border-yellow-500 hover:bg-yellow-500/10 font-mono text-[10px] sm:text-xs h-7 sm:h-8 px-1.5 sm:px-3"
        data-testid="notification-bell-btn"
        title={t('notifications.title', 'Notifications')}
      >
        <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      {/* CORPORATE DARK HEADER */}
      <header className="app-header sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md">
        <div className="h-1 bg-red-500" />
        <div className="max-w-[1920px] mx-auto px-2 sm:px-4 md:px-6 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            {/* Left side - Logo, Title and brand */}
            <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
              <img 
                src="https://customer-assets.emergentagent.com/job_26da8dbb-ce20-47a9-b85a-ce7603ab0699/artifacts/11fn1dzu_Corleone%20Forged%20Logo%20Red.png" 
                alt="Corleone Forged" 
                className="h-8 sm:h-10 w-auto cursor-pointer flex-shrink-0"
                onClick={() => navigate("/")}
                data-testid="logo-home"
              />
              {/* Title Section - Hidden on small screens, shows on lg+ */}
              <div className="hidden lg:block flex-shrink-0" data-testid="header-title">
                <p className="text-[10px] xl:text-xs text-zinc-400 tracking-[0.2em] uppercase font-mono whitespace-nowrap">
                  — Order Management System —
                </p>
              </div>
              <Badge className="bg-red-500/20 text-red-500 font-mono text-[8px] sm:text-[10px] uppercase tracking-wider border-red-500/50 whitespace-nowrap">
                {isAdmin ? "Admin" : (
                  user?.departments?.length > 0 
                    ? user.departments.slice(0, 2).map(d => DEPT_MAP[d]?.label || d).join(", ") + (user.departments.length > 2 ? '...' : '')
                    : (DEPT_MAP[user?.department]?.label || user?.department)
                )}
              </Badge>
            </div>
            
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden text-zinc-400 hover:text-red-500 h-8 w-8 p-0"
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Desktop Navigation - hidden on mobile */}
            <div className="hidden lg:flex items-center gap-1.5 flex-wrap justify-end">
              {/* Orders Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white font-mono text-[10px] h-7 px-3 relative shadow-md"
                    data-testid="orders-dropdown-btn"
                  >
                    <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                    Orders
                    <ChevronDown className="w-3 h-3 ml-1.5" />
                    {(queueCounts.hold + queueCounts.refinish + queueCounts.rush + queueCounts.redo) > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-white text-red-600 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow">
                        {(queueCounts.hold + queueCounts.refinish + queueCounts.rush + queueCounts.redo) > 9 ? '9+' : (queueCounts.hold + queueCounts.refinish + queueCounts.rush + queueCounts.redo)}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-700">
                  <DropdownMenuItem 
                    onClick={() => navigate("/my-orders")}
                    className="text-zinc-300 hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                    data-testid="my-orders-btn"
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    {t('nav.myOrders')}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => navigate("/completed")}
                    className="text-zinc-300 hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                    data-testid="completed-orders-btn"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {t('nav.completed')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-zinc-700" />
                  {hasSalesAccess && (
                    <DropdownMenuItem 
                      onClick={() => navigate("/hold-queue")}
                      className="text-yellow-500 hover:bg-yellow-500/10 cursor-pointer"
                      data-testid="hold-queue-btn"
                    >
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      {t('nav.holdQueue')}
                      {queueCounts.hold > 0 && (
                        <span className="ml-auto bg-yellow-500 text-black text-[9px] font-bold rounded-full px-1.5">
                          {queueCounts.hold > 9 ? '9+' : queueCounts.hold}
                        </span>
                      )}
                    </DropdownMenuItem>
                  )}
                  {hasSalesAccess && (
                    <DropdownMenuItem 
                      onClick={() => navigate("/stock-inventory")}
                      className="text-cyan-500 hover:bg-cyan-500/10 cursor-pointer"
                      data-testid="stock-inventory-btn"
                    >
                      <CircleDot className="w-4 h-4 mr-2" />
                      {t('nav.stockSets')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem 
                    onClick={() => navigate("/refinish-queue")}
                    className="text-orange-500 hover:bg-orange-500/10 cursor-pointer"
                    data-testid="refinish-queue-btn"
                  >
                    <Wrench className="w-4 h-4 mr-2" />
                    {t('nav.refinish')}
                    {queueCounts.refinish > 0 && (
                      <span className="ml-auto bg-orange-500 text-white text-[9px] font-bold rounded-full px-1.5">
                        {queueCounts.refinish > 9 ? '9+' : queueCounts.refinish}
                      </span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => navigate("/rush-queue")}
                    className="text-red-500 hover:bg-red-500/10 cursor-pointer"
                    data-testid="rush-queue-btn"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    {t('nav.rushOrders')}
                    {queueCounts.rush > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-[9px] font-bold rounded-full px-1.5 animate-pulse">
                        {queueCounts.rush > 9 ? '9+' : queueCounts.rush}
                      </span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => navigate("/redo-queue")}
                    className="text-amber-500 hover:bg-amber-500/10 cursor-pointer"
                    data-testid="redo-queue-btn"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Re-Do Orders
                    {queueCounts.redo > 0 && (
                      <span className="ml-auto bg-amber-500 text-black text-[9px] font-bold rounded-full px-1.5 animate-pulse">
                        {queueCounts.redo > 9 ? '9+' : queueCounts.redo}
                      </span>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Manufacturing Inventory Button - Standalone for Admin */}
              {isAdmin && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate("/manufacturing-inventory")}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-mono text-[10px] h-7 px-3 shadow-md"
                  data-testid="manufacturing-inventory-top-btn"
                >
                  <Boxes className="w-3.5 h-3.5 mr-1.5" />
                  Manufacturing Inventory
                </Button>
              )}

              {/* Admin Tools Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white font-mono text-[10px] h-7 px-3 shadow-md"
                    data-testid="admin-tools-dropdown-btn"
                  >
                    <Settings className="w-3.5 h-3.5 mr-1.5" />
                    Tools
                    <ChevronDown className="w-3 h-3 ml-1.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-700">
                  <DropdownMenuItem 
                    onClick={() => setCustomerLookup(prev => ({ ...prev, open: true }))}
                    className="text-emerald-500 hover:bg-emerald-500/10 cursor-pointer"
                    data-testid="customer-lookup-btn"
                  >
                    <UserSearch className="w-4 h-4 mr-2" />
                    Customer Lookup
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem 
                      onClick={() => navigate("/users")}
                      className="text-zinc-300 hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                      data-testid="users-btn"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      {t('nav.users')}
                    </DropdownMenuItem>
                  )}
                  {isAnyAdmin && (
                    <>
                      <DropdownMenuSeparator className="bg-zinc-700" />
                      <DropdownMenuItem 
                        onClick={() => navigate("/commission")}
                        className="text-green-500 hover:bg-green-500/10 cursor-pointer"
                        data-testid="commission-btn"
                      >
                        <DollarSign className="w-4 h-4 mr-2" />
                        Commission
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => navigate("/data-migration")}
                        className="text-blue-500 hover:bg-blue-500/10 cursor-pointer"
                        data-testid="data-migration-btn"
                      >
                        <Database className="w-4 h-4 mr-2" />
                        {t('nav.migrate')}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => navigate("/performance")}
                        className="text-green-500 hover:bg-green-500/10 cursor-pointer"
                        data-testid="performance-btn"
                      >
                        <BarChart3 className="w-4 h-4 mr-2" />
                        {t('nav.reports')}
                      </DropdownMenuItem>
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator className="bg-zinc-700" />
                      <DropdownMenuItem 
                        onClick={() => navigate("/manufacturing-inventory")}
                        className="text-orange-500 hover:bg-orange-500/10 cursor-pointer"
                        data-testid="manufacturing-inventory-btn"
                      >
                        <Boxes className="w-4 h-4 mr-2" />
                        Manufacturing Inventory
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => navigate("/activity-log")}
                        className="text-purple-500 hover:bg-purple-500/10 cursor-pointer"
                        data-testid="activity-log-btn"
                      >
                        <Activity className="w-4 h-4 mr-2" />
                        Activity Log
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => navigate("/rim-overlay")}
                        className="text-cyan-500 hover:bg-cyan-500/10 cursor-pointer"
                        data-testid="rim-overlay-btn"
                      >
                        <Disc3 className="w-4 h-4 mr-2" />
                        Rim Preview
                      </DropdownMenuItem>
                    </>
                  )}
                  {isAdmin && user?.email === "digitalebookdepot@gmail.com" && (
                    <>
                      <DropdownMenuSeparator className="bg-zinc-700" />
                      <DropdownMenuItem 
                        onClick={() => navigate("/admin-control")}
                        className="text-purple-500 hover:bg-purple-500/10 cursor-pointer"
                        data-testid="admin-control-btn"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Control Center
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPinModal(true)}
                className="border-amber-500/50 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500 font-mono text-[10px] h-7 px-2"
                title={t('auth.setPin')}
              >
                <KeyRound className="w-3.5 h-3.5 mr-1" />
                {t('auth.setPin')}
              </Button>
              <NotificationBell />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="text-zinc-400 hover:text-red-500 h-7 w-7 p-0"
                data-testid="refresh-btn"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <LanguageSelector />
              <span className="text-zinc-400 font-mono text-[10px] hidden xl:block max-w-[100px] truncate">
                {user?.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-zinc-400 hover:text-red-500 h-7 w-7 p-0"
                data-testid="logout-btn"
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Mobile essentials - always visible */}
            <div className="flex lg:hidden items-center gap-1">
              <NotificationBell />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="text-zinc-400 hover:text-red-500 h-7 w-7 p-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-zinc-400 hover:text-red-500 h-7 w-7 p-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-zinc-900 border-t border-zinc-800 shadow-lg">
            <div className="max-w-[1920px] mx-auto px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigate("/my-orders"); setMobileMenuOpen(false); }}
                className="border-zinc-700 text-zinc-300 bg-zinc-800/50 font-mono text-xs h-9 justify-start"
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                {t('nav.myOrders')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigate("/completed"); setMobileMenuOpen(false); }}
                className="border-zinc-700 text-zinc-300 bg-zinc-800/50 font-mono text-xs h-9 justify-start"
              >
                <FileText className="w-4 h-4 mr-2" />
                {t('nav.completed')}
              </Button>
              {hasSalesAccess && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate("/hold-queue"); setMobileMenuOpen(false); }}
                  className="border-yellow-500/50 text-yellow-500 bg-yellow-500/10 font-mono text-xs h-9 justify-start relative"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  {t('nav.holdQueue')}
                  {queueCounts.hold > 0 && (
                    <span className="ml-auto bg-yellow-500 text-black text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {queueCounts.hold}
                    </span>
                  )}
                </Button>
              )}
              {hasSalesAccess && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate("/stock-inventory"); setMobileMenuOpen(false); }}
                  className="border-cyan-500/50 text-cyan-500 bg-cyan-500/10 font-mono text-xs h-9 justify-start"
                >
                  <CircleDot className="w-4 h-4 mr-2" />
                  {t('nav.stockSets')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigate("/refinish-queue"); setMobileMenuOpen(false); }}
                className="border-orange-500/50 text-orange-500 bg-orange-500/10 font-mono text-xs h-9 justify-start relative"
              >
                <Wrench className="w-4 h-4 mr-2" />
                {t('nav.refinish')}
                {queueCounts.refinish > 0 && (
                  <span className="ml-auto bg-orange-500 text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {queueCounts.refinish}
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigate("/rush-queue"); setMobileMenuOpen(false); }}
                className="border-red-500/50 text-red-500 bg-red-500/10 font-mono text-xs h-9 justify-start relative"
              >
                <Zap className="w-4 h-4 mr-2" />
                {t('nav.rushOrders')}
                {queueCounts.rush > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {queueCounts.rush}
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigate("/redo-queue"); setMobileMenuOpen(false); }}
                className="border-amber-500/50 text-amber-500 bg-amber-500/10 font-mono text-xs h-9 justify-start relative"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Re-Do
                {queueCounts.redo > 0 && (
                  <span className="ml-auto bg-amber-500 text-black text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {queueCounts.redo}
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCustomerLookup(prev => ({ ...prev, open: true })); setMobileMenuOpen(false); }}
                className="border-emerald-500/50 text-emerald-500 bg-emerald-500/10 font-mono text-xs h-9 justify-start"
              >
                <UserSearch className="w-4 h-4 mr-2" />
                Customer
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate("/users"); setMobileMenuOpen(false); }}
                  className="border-zinc-700 text-zinc-300 bg-zinc-800/50 font-mono text-xs h-9 justify-start"
                >
                  <Users className="w-4 h-4 mr-2" />
                  {t('nav.users')}
                </Button>
              )}
              {isAnyAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate("/data-migration"); setMobileMenuOpen(false); }}
                  className="border-blue-500/50 text-blue-500 bg-blue-500/10 font-mono text-xs h-9 justify-start"
                >
                  <Database className="w-4 h-4 mr-2" />
                  {t('nav.migrate')}
                </Button>
              )}
              {isAnyAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate("/performance"); setMobileMenuOpen(false); }}
                  className="border-green-500/50 text-green-500 bg-green-500/10 font-mono text-xs h-9 justify-start"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  {t('nav.reports')}
                </Button>
              )}
              {isAnyAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate("/commission"); setMobileMenuOpen(false); }}
                  className="border-emerald-500/50 text-emerald-500 bg-emerald-500/10 font-mono text-xs h-9 justify-start"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Commission
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate("/activity-log"); setMobileMenuOpen(false); }}
                  className="border-purple-500/50 text-purple-500 bg-purple-500/10 font-mono text-xs h-9 justify-start"
                >
                  <Activity className="w-4 h-4 mr-2" />
                  Activity Log
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate("/rim-overlay"); setMobileMenuOpen(false); }}
                  className="border-cyan-500/50 text-cyan-500 bg-cyan-500/10 font-mono text-xs h-9 justify-start"
                >
                  <Disc3 className="w-4 h-4 mr-2" />
                  Rim Preview
                </Button>
              )}
              {isAdmin && user?.email === "digitalebookdepot@gmail.com" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate("/admin-control"); setMobileMenuOpen(false); }}
                  className="border-purple-500/50 text-purple-500 bg-purple-500/10 font-mono text-xs h-9 justify-start"
                  data-testid="admin-control-mobile-btn"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Control Center
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setPinModal(true); setMobileMenuOpen(false); }}
                className="border-amber-500/50 text-amber-500 bg-amber-500/10 font-mono text-xs h-9 justify-start"
              >
                <KeyRound className="w-4 h-4 mr-2" />
                {t('auth.setPin')}
              </Button>
              {/* Language selector - translates UI text only, NOT form data sent to database */}
              <div className="col-span-2 sm:col-span-3 flex justify-center">
                <LanguageSelector />
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Set PIN Modal */}
      <Dialog open={pinModal} onOpenChange={setPinModal}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-amber-500">
              <KeyRound className="w-5 h-5 inline mr-2" />
              Set Quick Login PIN
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-zinc-400 text-sm font-mono">
              Create a unique PIN for instant login. No email needed!
            </p>
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                New PIN
              </Label>
              <Input
                type="password"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="bg-zinc-950 border-zinc-700 font-mono text-2xl text-center tracking-[0.5em]"
                placeholder="• • • •"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Confirm PIN
              </Label>
              <Input
                type="password"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="bg-zinc-950 border-zinc-700 font-mono text-2xl text-center tracking-[0.5em]"
                placeholder="• • • •"
              />
            </div>
            <Button
              onClick={handleSetPin}
              disabled={newPin.length !== 4 || confirmPin.length !== 4}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-oswald uppercase tracking-widest"
            >
              Set PIN
            </Button>
            <p className="text-zinc-500 text-[10px] font-mono text-center">
              After setting, use "Quick PIN" tab on login page
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <main className="max-w-[1920px] mx-auto p-2 sm:p-4 md:p-6">
        {/* Search Bar */}
        <div className="relative mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                type="text"
                placeholder={t('dashboard.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 bg-white border-2 border-red-500 focus:border-red-600 font-mono text-sm text-black placeholder:text-zinc-500"
                data-testid="search-input"
              />
            </div>
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                className="text-zinc-400"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          
          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-50 top-full left-0 mt-1 w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded shadow-lg max-h-96 overflow-auto">
              {searchResults.map((order) => {
                const isLastDept = order.current_department === "shipped" || order.current_department === "completed";
                const canAdvanceOrder = isAdmin || (user?.departments?.length > 0 ? user.departments.includes(order.current_department) : user?.department === order.current_department);
                const hasMultipleDepts = user?.departments && user.departments.length > 1;
                const movableDepts = hasMultipleDepts 
                  ? DEPARTMENTS.filter(d => user.departments.includes(d.value) && d.value !== order.current_department)
                  : [];
                
                return (
                  <div
                    key={order.id}
                    className="p-3 hover:bg-zinc-800 border-b border-zinc-800 last:border-0"
                    data-testid={`search-result-${order.id}`}
                  >
                    {/* Clickable area for order details */}
                    <div 
                      className="cursor-pointer"
                      onClick={() => { openOrderDetail(order.id); setSearchQuery(""); setSearchResults([]); }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-red-500">{order.order_number}</span>
                        <Badge className={`text-[9px] ${PRODUCT_TYPES[order.product_type]?.color || "text-zinc-400 border-zinc-400"} bg-transparent`}>
                          {PRODUCT_TYPES[order.product_type]?.label || order.product_type}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-white mt-1">{order.customer_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {order.phone && <p className="font-mono text-[10px] text-zinc-400">{order.phone}</p>}
                        <p className="font-mono text-[10px] text-zinc-500">{DEPT_MAP[order.current_department]?.label || order.current_department}</p>
                      </div>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-800">
                      {/* Done/Advance button - Show department name */}
                      {canAdvanceOrder && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdvanceOrder(order.id);
                            setSearchResults(searchResults.filter(o => o.id !== order.id));
                          }}
                          className={`h-7 px-3 text-white font-oswald uppercase tracking-wider text-[10px] font-bold ${
                            isLastDept 
                              ? "bg-green-600 hover:bg-green-500" 
                              : DEPT_MAP[order.current_department]?.bgColor || "bg-red-500 hover:bg-red-400"
                          }`}
                          data-testid={`search-advance-${order.id}`}
                        >
                          {isLastDept ? (
                            <><CheckCircle2 className="w-3 h-3 mr-1" /> Complete</>
                          ) : (
                            <><ChevronRight className="w-3 h-3 mr-1" /> {DEPT_MAP[order.current_department]?.label || order.current_department}</>
                          )}
                        </Button>
                      )}
                      
                      {/* Move dropdown for multi-department staff */}
                      {!isAdmin && hasMultipleDepts && movableDepts.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-[10px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ArrowRightLeft className="w-3 h-3 mr-1" />
                              Move
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-zinc-900 border-zinc-800 w-40">
                            <DropdownMenuItem className="text-xs text-zinc-300 font-mono" disabled>
                              Move to:
                            </DropdownMenuItem>
                            {movableDepts.map((d) => (
                              <DropdownMenuItem 
                                key={d.value} 
                                className="text-xs cursor-pointer hover:bg-zinc-800"
                                onClick={() => {
                                  handleMoveOrder(order.id, d.value);
                                  setSearchResults(searchResults.filter(o => o.id !== order.id));
                                }}
                              >
                                {d.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      
                      {/* Mark as Cut button - for steering wheels and caps */}
                      {(order.product_type === "steering_wheel" || order.product_type?.includes("caps")) && (
                        <Button
                          size="sm"
                          variant={order.cut_status === "cut" ? "default" : "outline"}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCutStatus(order.id, order.cut_status);
                            // Update local search results state
                            setSearchResults(searchResults.map(o => 
                              o.id === order.id 
                                ? { ...o, cut_status: o.cut_status === "cut" ? "waiting" : "cut" } 
                                : o
                            ));
                          }}
                          className={`h-7 px-3 text-[10px] font-bold uppercase tracking-wider ${
                            order.cut_status === "cut" 
                              ? "bg-green-600 hover:bg-green-500 text-white" 
                              : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                          }`}
                          data-testid={`search-cut-${order.id}`}
                        >
                          <Scissors className="w-3 h-3 mr-1" />
                          {order.cut_status === "cut" ? "Cut ✓" : "Mark Cut"}
                        </Button>
                      )}
                      
                      {/* Actions dropdown for admin/admin_restricted */}
                      {isAnyAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-[10px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t('common.actions')}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-zinc-900 border-zinc-800 w-48">
                            <DropdownMenuItem className="text-xs text-zinc-300 font-mono" disabled>
                              Move to Department:
                            </DropdownMenuItem>
                            {DEPARTMENTS.map((d) => (
                              <DropdownMenuItem 
                                key={d.value} 
                                className="text-xs cursor-pointer hover:bg-zinc-800"
                                onClick={() => {
                                  handleMoveOrder(order.id, d.value);
                                  setSearchResults(searchResults.filter(o => o.id !== order.id));
                                }}
                              >
                                {d.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Order Status Overview - Using extracted DashboardStats component */}
        <DashboardStats 
          stats={stats}
          orders={orders}
          onOpenStatsModal={openStatsModal}
          t={t}
        />

        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
          <Tabs value={productFilter} onValueChange={setProductFilter} className="w-full sm:flex-1 overflow-x-auto">
            <TabsList className="bg-white border-2 border-red-500 p-1 flex flex-nowrap w-max sm:w-auto sm:flex-wrap h-auto rounded-lg">
              <TabsTrigger
                value="all"
                className="font-oswald uppercase tracking-wider text-[10px] sm:text-xs text-red-500 data-[state=active]:bg-red-500 data-[state=active]:text-white px-2 sm:px-3 rounded"
                data-testid="filter-all-btn"
              >
                {t('common.all')}
              </TabsTrigger>
              <TabsTrigger
                value="rim"
                className="font-oswald uppercase tracking-wider text-[10px] sm:text-xs text-red-500 data-[state=active]:bg-red-500 data-[state=active]:text-white px-2 sm:px-3 rounded"
                data-testid="filter-rims-btn"
              >
                <Circle className="w-3 h-3 sm:mr-1" />
                <span className="hidden sm:inline">{t('dashboard.rims')}</span>
              </TabsTrigger>
              <TabsTrigger
                value="steering_wheel"
                className="font-oswald uppercase tracking-wider text-[10px] sm:text-xs text-red-500 data-[state=active]:bg-red-500 data-[state=active]:text-white px-2 sm:px-3 rounded"
                data-testid="filter-steering-btn"
              >
                <Package className="w-3 h-3 sm:mr-1" />
                <span className="hidden sm:inline">{t('dashboard.steeringWheels')}</span>
              </TabsTrigger>
              <TabsTrigger
                value="caps"
                className="font-oswald uppercase tracking-wider text-[10px] sm:text-xs text-red-500 data-[state=active]:bg-red-500 data-[state=active]:text-white px-2 sm:px-3 rounded"
                data-testid="filter-caps-btn"
              >
                {t('dashboard.caps')}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSizeReportModal({ open: true })}
              className="border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-black font-oswald uppercase tracking-wider text-[10px] sm:text-xs h-7 sm:h-8"
              data-testid="size-report-btn"
            >
              <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.sizeReport')}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/machine-queue")}
              className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-black font-oswald uppercase tracking-wider text-[10px] sm:text-xs h-7 sm:h-8"
              data-testid="machine-queue-btn"
            >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.machineQueue')}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/lalo-queue")}
              className="border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black font-oswald uppercase tracking-wider text-[10px] sm:text-xs h-7 sm:h-8 relative"
              data-testid="lalo-queue-btn"
            >
              <Plane className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('nav.laloQueue')}</span>
              {queueCounts.lalo > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {queueCounts.lalo > 9 ? '9+' : queueCounts.lalo}
                </span>
              )}
            </Button>
          </div>

          {(isAdmin || user?.department === "received") && (
            <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
              <DialogTrigger asChild>
                <Button
                  className="bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-widest font-bold glow-red"
                  data-testid="new-order-btn"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('dashboard.newOrder')}
                </Button>
              </DialogTrigger>

          {/* Admin/Admin Restricted Bulk Actions */}
          {isAnyAdmin && (
            <>
              {/* Export CSV Button */}
              <Button
                variant="outline"
                className="border-blue-600 text-blue-500 hover:bg-blue-600 hover:text-white font-oswald uppercase tracking-widest"
                onClick={async () => {
                  try {
                    const response = await axios.get(`${API}/admin/orders/bulk-export`, {
                      responseType: 'blob'
                    });
                    const url = window.URL.createObjectURL(new Blob([response.data]));
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `corleone-backup-${new Date().toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    toast.success("CSV backup downloaded!");
                  } catch (error) {
                    toast.error(error.response?.data?.detail || "Failed to export CSV");
                  }
                }}
                data-testid="bulk-export-btn"
              >
                <Download className="w-4 h-4 mr-2" />
                {t('dashboard.exportCsv')}
              </Button>
              
              <Dialog open={bulkImportModal.open} onOpenChange={(open) => setBulkImportModal({ open })}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-emerald-600 text-emerald-500 hover:bg-emerald-600 hover:text-white font-oswald uppercase tracking-widest"
                    data-testid="bulk-import-btn"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {t('dashboard.importCsv')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white">
                      Bulk Import Orders from CSV
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        CSV File
                      </Label>
                      <Input
                        type="file"
                        accept=".csv"
                        onChange={handleCsvFileChange}
                        className="bg-zinc-950 border-zinc-800 font-mono"
                      />
                      <p className="text-[10px] text-zinc-500 font-mono">
                        Required columns: order_number, customer_name, product_type
                      </p>
                      <p className="text-[10px] text-zinc-500 font-mono">
                        Optional: phone, wheel_specs, notes, vehicle_make, vehicle_model, rim_size, steering_wheel_brand, order_date, quantity
                      </p>
                      <p className="text-[10px] text-emerald-500 font-mono mt-2">
                        💡 TIP: Use "Export CSV" to download a backup, then re-import it anytime!
                      </p>
                      <p className="text-[10px] text-zinc-500 font-mono">
                        Product types: rim, steering_wheel, standard_caps, floater_caps, xxl_caps, dually_floating_caps, offroad_floating_caps
                      </p>
                    </div>
                    
                    {csvPreview.length > 0 && (
                      <div className="space-y-2">
                        <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-500">
                          Preview (First 5 rows)
                        </Label>
                        <div className="bg-zinc-950 rounded border border-zinc-800 overflow-x-auto">
                          <table className="w-full text-[10px] font-mono">
                            <thead>
                              <tr className="border-b border-zinc-800">
                                <th className="p-2 text-left text-white font-bold">Order #</th>
                                <th className="p-2 text-left text-white font-bold">Customer</th>
                                <th className="p-2 text-left text-white font-bold">Type</th>
                                <th className="p-2 text-left text-white font-bold">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {csvPreview.map((row, idx) => (
                                <tr key={idx} className="border-b border-zinc-800/50">
                                  <td className="p-2 text-white">{row.order_number || row['order number'] || '-'}</td>
                                  <td className="p-2 text-white">{row.customer_name || row['customer name'] || row.customer || '-'}</td>
                                  <td className="p-2 text-white">{row.product_type || row['product type'] || row.type || '-'}</td>
                                  <td className="p-2 text-white">{row.order_date || row['order date'] || row.date || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <Button
                        onClick={handleBulkImport}
                        disabled={!csvFile || importLoading}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-oswald uppercase"
                      >
                        {importLoading ? "Importing..." : `Import ${csvPreview.length > 0 ? csvPreview.length + "+ Orders" : ""}`}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => { setBulkImportModal({ open: false }); setCsvFile(null); setCsvPreview([]); }}
                        className="border-zinc-700"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Button
                variant={bulkEditMode ? "default" : "outline"}
                className={bulkEditMode 
                  ? "bg-amber-600 hover:bg-amber-500 text-white font-oswald uppercase tracking-widest"
                  : "border-amber-600 text-amber-500 hover:bg-amber-600 hover:text-white font-oswald uppercase tracking-widest"
                }
                onClick={() => {
                  if (bulkEditMode && selectedOrders.length > 0) {
                    setBulkEditModal({ open: true });
                  } else {
                    setBulkEditMode(!bulkEditMode);
                    setSelectedOrders([]);
                  }
                }}
                data-testid="bulk-edit-btn"
              >
                {bulkEditMode ? (
                  <>
                    <CheckSquare className="w-4 h-4 mr-2" />
                    {t('common.edit')} {selectedOrders.length > 0 ? `(${selectedOrders.length})` : ""}
                  </>
                ) : (
                  <>
                    <Edit3 className="w-4 h-4 mr-2" />
                    {t('dashboard.bulkEdit')}
                  </>
                )}
              </Button>

              {/* Bulk Delete Button - only show when in bulk edit mode with selections */}
              {bulkEditMode && selectedOrders.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-600 text-red-500 hover:bg-red-600 hover:text-white font-oswald uppercase tracking-widest"
                  onClick={() => setBulkDeleteModal({ open: true })}
                  data-testid="bulk-delete-btn"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('common.delete')} ({selectedOrders.length})
                </Button>
              )}

              {/* Bulk Move Button - only show when in bulk edit mode with selections (Admin/Admin Restricted) */}
              {bulkEditMode && selectedOrders.length > 0 && isAnyAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-600 text-blue-500 hover:bg-blue-600 hover:text-white font-oswald uppercase tracking-widest"
                  onClick={() => setBulkMoveModal({ open: true, targetDept: "" })}
                  data-testid="bulk-move-btn"
                >
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  {t('orders.moveOrder') || 'Move'} ({selectedOrders.length})
                </Button>
              )}

              {bulkEditMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setBulkEditMode(false); setSelectedOrders([]); }}
                  className="text-zinc-400"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
              <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white">
                    {t('modal.createOrder')}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateOrder} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      {t('orders.orderNumber')} *
                    </Label>
                    <Input
                      value={newOrder.order_number}
                      onChange={(e) => setNewOrder({ ...newOrder, order_number: e.target.value.toUpperCase() })}
                      className="bg-zinc-950 border-zinc-800 font-mono"
                      placeholder="e.g. CF-001, INV-2024-001"
                      required
                      data-testid="order-number-input"
                    />
                  </div>
                  <div className="space-y-2 relative">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      {t('orders.customerName')} *
                    </Label>
                    <Input
                      value={newOrder.customer_name}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setNewOrder({ ...newOrder, customer_name: value });
                        searchCustomers(value);
                      }}
                      onFocus={() => {
                        if (customerSuggestions.length > 0) setShowCustomerDropdown(true);
                      }}
                      onBlur={() => {
                        // Delay hiding to allow click on dropdown
                        setTimeout(() => setShowCustomerDropdown(false), 200);
                      }}
                      className="bg-zinc-950 border-zinc-800 font-mono uppercase"
                      placeholder="Start typing to see suggestions..."
                      required
                      data-testid="order-customer-name-input"
                      autoComplete="off"
                    />
                    {/* Customer autocomplete dropdown */}
                    {showCustomerDropdown && customerSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-lg max-h-48 overflow-auto">
                        {customerSuggestions.map((customer, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-zinc-800 border-b border-zinc-800 last:border-b-0"
                            onClick={() => selectCustomer(customer)}
                          >
                            <div className="font-mono text-sm text-white">{customer.customer_name}</div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              {customer.phone && <span>📞 {customer.phone}</span>}
                              <span>({customer.order_count} orders)</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Phone (Optional)
                    </Label>
                    <Input
                      value={newOrder.phone}
                      onChange={(e) => setNewOrder({ ...newOrder, phone: formatPhoneNumber(e.target.value) })}
                      className="bg-zinc-950 border-zinc-800 font-mono"
                      placeholder="(555)-555-5555"
                      data-testid="order-phone-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Order Date *
                    </Label>
                    <Input
                      type="date"
                      value={newOrder.order_date}
                      onChange={(e) => setNewOrder({ ...newOrder, order_date: e.target.value })}
                      className="bg-zinc-950 border-zinc-800 font-mono text-white"
                      data-testid="order-date-input"
                      required
                    />
                  </div>
                  
                  {/* Sold By - Salesperson for commission tracking */}
                  {newOrder.product_type === "rim" && salespeople.length > 0 && (
                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-green-500">
                        Sold By (Commission)
                      </Label>
                      {/* If user is a salesperson, show their name (read-only) */}
                      {user?.salesperson_id ? (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3">
                          <p className="font-mono text-green-400 text-sm">
                            {salespeople.find(sp => sp.id === user.salesperson_id)?.name || "You"}
                          </p>
                        </div>
                      ) : (
                        /* Admin can select any salesperson */
                        <>
                          <Select
                            value={newOrder.sold_by || "none"}
                            onValueChange={(value) => setNewOrder({ ...newOrder, sold_by: value === "none" ? "" : value })}
                          >
                            <SelectTrigger className="bg-zinc-950 border-green-500/30 font-mono" data-testid="order-sold-by-select">
                              <SelectValue placeholder="Select salesperson..." />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              <SelectItem value="none" className="font-mono text-zinc-500">No salesperson</SelectItem>
                              {salespeople.map((sp) => (
                                <SelectItem key={sp.id} value={sp.id} className="font-mono">
                                  {sp.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Product Type *
                    </Label>
                    <Select
                      value={newOrder.product_type}
                      onValueChange={(value) => setNewOrder({ ...newOrder, product_type: value })}
                    >
                      <SelectTrigger className="bg-zinc-950 border-zinc-800 font-mono" data-testid="order-product-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="rim" className="font-mono">Rim</SelectItem>
                        <SelectItem value="steering_wheel" className="font-mono">Steering Wheel</SelectItem>
                        <SelectItem value="standard_caps" className="font-mono">Standard Caps</SelectItem>
                        <SelectItem value="floater_caps" className="font-mono">Floater Caps</SelectItem>
                        <SelectItem value="xxl_caps" className="font-mono">XXL Caps</SelectItem>
                        <SelectItem value="dually_floating_caps" className="font-mono">Dually Floating Caps</SelectItem>
                        <SelectItem value="offroad_floating_caps" className="font-mono">Off-Road Floating Caps</SelectItem>
                        <SelectItem value="custom_caps" className="font-mono">Custom Caps</SelectItem>
                        <SelectItem value="race_car_caps" className="font-mono">Tall Caps</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Brand field for steering wheels */}
                  {newOrder.product_type === "steering_wheel" && (
                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        Steering Wheel Brand *
                      </Label>
                      <Input
                        value={newOrder.steering_wheel_brand}
                        onChange={(e) => setNewOrder({ ...newOrder, steering_wheel_brand: e.target.value })}
                        className="bg-zinc-950 border-zinc-800 font-mono"
                        placeholder="e.g. Grant, Momo, NRG, Sparco"
                        data-testid="order-steering-wheel-brand-input"
                      />
                    </div>
                  )}
                  
                  {/* Quantity field for caps */}
                  {CAP_TYPES.includes(newOrder.product_type) && (
                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        Quantity *
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={newOrder.quantity}
                        onChange={(e) => setNewOrder({ ...newOrder, quantity: parseInt(e.target.value) || 1 })}
                        className="bg-zinc-950 border-zinc-800 font-mono"
                        data-testid="order-quantity-input"
                      />
                    </div>
                  )}
                  
                  {/* Auto-add caps section when creating Rim order */}
                  {newOrder.product_type === "rim" && (
                    <div className="space-y-3 p-4 bg-zinc-800/50 rounded border border-zinc-700">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-500">
                        Auto-Add Caps (Optional)
                      </Label>
                      <p className="text-zinc-500 text-xs font-mono">Select caps to automatically create with this rim order</p>
                      
                      {Object.entries({
                        standard_caps: "Standard Caps",
                        floater_caps: "Floater Caps",
                        xxl_caps: "XXL Caps",
                        dually_floating_caps: "Dually Floating Caps",
                        offroad_floating_caps: "Off-Road Floating Caps",
                        custom_caps: "Custom Caps",
                        race_car_caps: "Tall Caps"
                      }).map(([capType, capLabel]) => (
                        <div key={capType} className="flex items-center gap-3">
                          <Checkbox
                            id={capType}
                            checked={capsToAdd[capType]?.selected || false}
                            onCheckedChange={(checked) => 
                              setCapsToAdd({
                                ...capsToAdd,
                                [capType]: { ...capsToAdd[capType], selected: checked, quantity: checked ? (capsToAdd[capType]?.quantity || 1) : 0 }
                              })
                            }
                            className="border-zinc-600"
                          />
                          <label htmlFor={capType} className="font-mono text-sm text-zinc-300 flex-1 cursor-pointer">
                            {capLabel}
                          </label>
                          {capsToAdd[capType]?.selected && (
                            <Input
                              type="number"
                              min="1"
                              value={capsToAdd[capType]?.quantity || 1}
                              onChange={(e) => 
                                setCapsToAdd({
                                  ...capsToAdd,
                                  [capType]: { ...capsToAdd[capType], quantity: parseInt(e.target.value) || 1 }
                                })
                              }
                              className="w-20 bg-zinc-950 border-zinc-700 font-mono text-sm"
                              placeholder="Qty"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Rim Size dropdown - only for rims and caps */}
                  {(newOrder.product_type === "rim" || CAP_TYPES.includes(newOrder.product_type)) && (
                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        Rim Size * (or Front Size for staggered)
                      </Label>
                      <Select
                        value={newOrder.rim_size}
                        onValueChange={(value) => setNewOrder({ ...newOrder, rim_size: value })}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 font-mono" data-testid="order-rim-size-select">
                          <SelectValue placeholder="Select rim size" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          {RIM_SIZES.map((size) => (
                            <SelectItem key={size} value={size} className="font-mono">
                              {size}"
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {/* Rear Rim Size for staggered setups - only for rims */}
                  {newOrder.product_type === "rim" && (
                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        Rear Rim Size (for staggered setups)
                      </Label>
                      <Select
                        value={newOrder.rim_size_rear || "same"}
                        onValueChange={(value) => setNewOrder({ ...newOrder, rim_size_rear: value === "same" ? "" : value })}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 font-mono">
                          <SelectValue placeholder="Same as front (optional)" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          <SelectItem value="same" className="font-mono">Same as front</SelectItem>
                          {RIM_SIZES.map((size) => (
                            <SelectItem key={size} value={size} className="font-mono">
                              {size}"
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {/* Has Tires checkbox - only for rims */}
                  {newOrder.product_type === "rim" && (
                    <div className="space-y-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="has-tires-new"
                          checked={newOrder.has_tires || false}
                          onCheckedChange={(v) => setNewOrder({ ...newOrder, has_tires: v, tire_size: v ? newOrder.tire_size : "" })}
                          className="border-cyan-500 data-[state=checked]:bg-cyan-500"
                        />
                        <Label htmlFor="has-tires-new" className="font-mono text-xs text-cyan-400 uppercase">
                          Order includes Tires
                        </Label>
                      </div>
                      {/* Tire Size field - only shown when has_tires is checked */}
                      {newOrder.has_tires && (
                        <div className="space-y-2 pl-6">
                          <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400">
                            Tire Size (Optional)
                          </Label>
                          <Input
                            value={newOrder.tire_size || ""}
                            onChange={(e) => setNewOrder({ ...newOrder, tire_size: e.target.value })}
                            className="bg-zinc-950 border-cyan-500/50 font-mono"
                            placeholder="e.g. 275/40R20, 305/35R24"
                            data-testid="new-order-tire-size"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Has Steering Wheel checkbox - only for rims (purple indicator) */}
                  {newOrder.product_type === "rim" && (
                    <div className="space-y-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="has-steering-wheel-new"
                          checked={newOrder.has_steering_wheel || false}
                          onCheckedChange={(v) => setNewOrder({ ...newOrder, has_steering_wheel: v, steering_wheel_brand: v ? newOrder.steering_wheel_brand : "" })}
                          className="border-purple-500 data-[state=checked]:bg-purple-500"
                        />
                        <Label htmlFor="has-steering-wheel-new" className="font-mono text-xs text-purple-400 uppercase">
                          Add Steering Wheel Order
                        </Label>
                      </div>
                      {newOrder.has_steering_wheel && (
                        <div className="space-y-2 pl-6">
                          <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-400">
                            Steering Wheel Brand *
                          </Label>
                          <Input
                            value={newOrder.steering_wheel_brand || ""}
                            onChange={(e) => setNewOrder({ ...newOrder, steering_wheel_brand: e.target.value.toUpperCase() })}
                            className="bg-zinc-950 border-purple-500/50 font-mono uppercase"
                            placeholder="e.g. GRANT, MOMO, NRG, SPARCO"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Hide wheel specs for steering wheels since they have brand field */}
                  {newOrder.product_type !== "steering_wheel" && (
                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        {CAP_TYPES.includes(newOrder.product_type) ? "Cap Specs (Optional)" : "Wheel Specs (Optional)"}
                      </Label>
                      <Textarea
                        value={newOrder.wheel_specs}
                        onChange={(e) => setNewOrder({ ...newOrder, wheel_specs: e.target.value })}
                        className="bg-zinc-950 border-zinc-800 font-mono min-h-[80px]"
                        placeholder={CAP_TYPES.includes(newOrder.product_type) ? "Cap details, color, etc." : "Size, finish, color, etc."}
                        data-testid="order-wheel-specs-input"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Notes
                    </Label>
                    <Textarea
                      value={newOrder.notes}
                      onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })}
                      className="bg-zinc-950 border-zinc-800 font-mono min-h-[60px]"
                      data-testid="order-notes-input"
                    />
                  </div>
                  
                  {/* Payment Information Section */}
                  <div className="space-y-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Payment Information (Optional)
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                          Total Invoice $
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newOrder.payment_total}
                          onChange={(e) => setNewOrder({ ...newOrder, payment_total: e.target.value })}
                          className="bg-zinc-950 border-emerald-500/50 font-mono"
                          placeholder="0.00"
                          data-testid="order-payment-total-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                          Deposit $
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newOrder.payment_deposit}
                          onChange={(e) => setNewOrder({ ...newOrder, payment_deposit: e.target.value })}
                          className="bg-zinc-950 border-emerald-500/50 font-mono"
                          placeholder="0.00"
                          data-testid="order-payment-deposit-input"
                        />
                      </div>
                    </div>
                    {/* Show calculated percentage */}
                    {newOrder.payment_total && parseFloat(newOrder.payment_total) > 0 && (
                      <div className="flex items-center justify-between text-sm font-mono mt-2">
                        <span className="text-zinc-400">Percentage Paid:</span>
                        <span className={`font-bold ${
                          (parseFloat(newOrder.payment_deposit || 0) / parseFloat(newOrder.payment_total)) * 100 >= 100
                            ? "text-green-400"
                            : (parseFloat(newOrder.payment_deposit || 0) / parseFloat(newOrder.payment_total)) * 100 >= 50
                              ? "text-emerald-400"
                              : "text-yellow-400"
                        }`}>
                          {Math.round((parseFloat(newOrder.payment_deposit || 0) / parseFloat(newOrder.payment_total)) * 100)}%
                          {(parseFloat(newOrder.payment_deposit || 0) / parseFloat(newOrder.payment_total)) * 100 >= 50 && (
                            <span className="ml-2 text-xs text-emerald-400">(Ready for Production)</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Attachment Upload */}
                  <div className="space-y-2">
                    <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Attachment (Optional)
                    </Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        id="new-order-attachment"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files[0]) {
                            setNewOrderAttachment(e.target.files[0]);
                          }
                        }}
                        data-testid="order-attachment-input"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 border-zinc-700 hover:bg-zinc-800"
                        onClick={() => document.getElementById('new-order-attachment').click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {newOrderAttachment ? 'Change File' : 'Choose File'}
                      </Button>
                      {newOrderAttachment && (
                        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 px-3 py-2 rounded text-xs">
                          <Paperclip className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-green-400 truncate max-w-[120px]" title={newOrderAttachment.name}>
                            {newOrderAttachment.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setNewOrderAttachment(null)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                    <Button
                      type="submit"
                      className="w-full bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-widest font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="submit-order-btn"
                      disabled={isSubmittingOrder}
                    >
                      {isSubmittingOrder ? "Creating Order..." : t('orders.createOrder')}
                    </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Department Columns - Using extracted OrderList component */}
        <OrderList
          orders={orders}
          stats={stats}
          loading={loading}
          isAdmin={isAdmin}
          isAdminRestricted={isAdminRestricted}
          userDepartments={user?.departments?.length > 0 ? user.departments : [user?.department]}
          bulkEditMode={bulkEditMode}
          selectedOrders={selectedOrders}
          DEPARTMENTS={DEPARTMENTS}
          PRODUCT_TYPES={PRODUCT_TYPES}
          DEPT_MAP={DEPT_MAP}
          salespeople={salespeople}
          onAdvance={handleAdvanceOrder}
          onMove={handleMoveOrder}
          onReorder={handleReorderOrder}
          onUploadAttachment={handleUploadAttachment}
          onDeleteAttachment={handleDeleteAttachment}
          onDeleteOrder={handleDeleteOrder}
          onOpenDetail={openOrderDetail}
          onToggleCutStatus={handleToggleCutStatus}
          onToggleTires={handleToggleTires}
          onToggleSteeringWheel={handleToggleSteeringWheel}
          onSendToLalo={handleSendToLalo}
          onToggleOrderSelection={toggleOrderSelection}
          onSelectAllInDept={selectAllOrdersInDept}
          onExportPDF={openExportColumnsModal}
          onOpenDeptTable={openDeptTableModal}
          onOpenAttachmentPreview={openAttachmentPreview}
          getTranslatedField={getTranslatedField}
          getAttachmentUrl={getAttachmentUrl}
          isNewOrder={isNewOrder}
          t={t}
        />

        {/* Order Detail Modal */}
        <Dialog open={!!selectedOrder} onOpenChange={(open) => { if (!open) { setSelectedOrder(null); setEditMode(false); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 w-[95vw] max-w-2xl max-h-[90vh] overflow-hidden p-3 sm:p-6">
            {selectedOrder && (
              <>
                <DialogHeader className="space-y-3">
                  {/* Order Number & Badges - Mobile Friendly */}
                  <DialogTitle className="font-oswald uppercase tracking-widest text-base sm:text-lg text-white">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-red-500 text-lg sm:text-xl">{selectedOrder.order_number}</span>
                      <Badge className={`${PRODUCT_TYPES[selectedOrder.product_type]?.color || "text-zinc-400 border-zinc-400"} bg-transparent text-xs`}>
                        {PRODUCT_TYPES[selectedOrder.product_type]?.label || selectedOrder.product_type}
                      </Badge>
                      {selectedOrder.quantity > 1 && (
                        <Badge className="bg-zinc-700 text-white border-none text-xs">
                          Qty: {selectedOrder.quantity}
                        </Badge>
                      )}
                    </div>
                    {/* Status badges - wrap on mobile */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {selectedOrder.has_tires && (
                        <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500 text-xs">
                          <TireIcon className="w-3 h-3 mr-1" /> TIRES {selectedOrder.tire_size && `(${selectedOrder.tire_size})`}
                        </Badge>
                      )}
                      {selectedOrder.has_steering_wheel && (
                        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500 text-xs">
                          <SteeringWheelIcon className="w-3 h-3 mr-1" /> STEERING
                        </Badge>
                      )}
                      {selectedOrder.on_hold && (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500 text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" /> ON HOLD
                        </Badge>
                      )}
                      {selectedOrder.is_rush && (
                        <Badge className="bg-red-500/30 text-red-400 border-red-500 animate-pulse font-bold text-xs">
                          <Zap className="w-3 h-3 mr-1" /> RUSH
                        </Badge>
                      )}
                      {selectedOrder.is_redo && (
                        <Badge className="bg-amber-500/30 text-amber-400 border-amber-500 animate-pulse font-bold text-xs">
                          <RotateCcw className="w-3 h-3 mr-1" /> RE-DO
                        </Badge>
                      )}
                    </div>
                  </DialogTitle>
                  
                  {/* Action Buttons - Separate row, mobile-friendly */}
                  {hasSalesAccess && !editMode && (
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-2 border-t border-zinc-800">
                      {selectedOrder.on_hold ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveFromHold(selectedOrder.id)}
                          className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black text-xs px-2 py-1 h-auto"
                        >
                          <CheckCircle2 className="w-3 h-3 sm:mr-1" />
                          <span className="hidden sm:inline">Remove Hold</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setHoldModal({ open: true, order: selectedOrder })}
                          className="border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black text-xs px-2 py-1 h-auto"
                        >
                          <AlertTriangle className="w-3 h-3 sm:mr-1" />
                          <span className="hidden sm:inline">Hold</span>
                        </Button>
                      )}
                      {/* RUSH Button - Admin/Admin Restricted */}
                      {isAnyAdmin && (
                        selectedOrder.is_rush ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemoveRush(selectedOrder.id)}
                            className="border-red-400 text-red-400 hover:bg-red-500 hover:text-white text-xs px-2 py-1 h-auto"
                          >
                            <Zap className="w-3 h-3 sm:mr-1" />
                            <span className="hidden sm:inline">Remove RUSH</span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRushModal({ open: true, order: selectedOrder })}
                            className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white text-xs px-2 py-1 h-auto"
                          >
                            <Zap className="w-3 h-3 sm:mr-1" />
                            <span className="hidden sm:inline">RUSH</span>
                          </Button>
                        )
                      )}
                      {/* Mark for Refinish Button */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRefinishModal({ open: true, order: selectedOrder })}
                        className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white text-xs px-2 py-1 h-auto"
                      >
                        <Wrench className="w-3 h-3 sm:mr-1" />
                        <span className="hidden sm:inline">Refinish</span>
                      </Button>
                      {/* Mark as Re-Do Button - visible to all users */}
                      {selectedOrder.is_redo ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveRedo(selectedOrder.id)}
                          className="border-amber-400 text-amber-400 hover:bg-amber-500 hover:text-black text-xs px-2 py-1 h-auto"
                        >
                          <RotateCcw className="w-3 h-3 sm:mr-1" />
                          <span className="hidden sm:inline">Remove Re-Do</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRedoModal({ open: true, order: selectedOrder })}
                          className="border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black text-xs px-2 py-1 h-auto"
                        >
                          <RotateCcw className="w-3 h-3 sm:mr-1" />
                          <span className="hidden sm:inline">Re-Do</span>
                        </Button>
                      )}
                      {isAnyAdmin && selectedOrder.current_department !== "completed" && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkFulfilled(selectedOrder.id)}
                          className="bg-green-600 hover:bg-green-500 text-white text-xs px-2 py-1 h-auto"
                        >
                          <CheckCircle2 className="w-3 h-3 sm:mr-1" />
                          <span className="hidden sm:inline">Fulfilled</span>
                        </Button>
                      )}
                      {isAnyAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={startEditOrder}
                          className="border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black text-xs px-2 py-1 h-auto"
                        >
                          <Edit3 className="w-3 h-3 sm:mr-1" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                      )}
                      {/* Delete Order Button - Admin/Admin Restricted */}
                      {isAnyAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white text-xs px-2 py-1 h-auto"
                              data-testid="delete-order-detail-btn"
                            >
                              <Trash2 className="w-3 h-3 sm:mr-1" />
                              <span className="hidden sm:inline">Delete</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-oswald uppercase tracking-widest text-white">
                                Delete Order?
                              </AlertDialogTitle>
                              <AlertDialogDescription className="font-mono text-zinc-400">
                                Are you sure you want to permanently delete order <span className="text-red-500">{selectedOrder?.order_number}</span>? 
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  handleDeleteOrder(selectedOrder.id, selectedOrder.order_number);
                                  setSelectedOrder(null);
                                }}
                                className="bg-red-500 hover:bg-red-600 text-white"
                              >
                                Delete Permanently
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}
                </DialogHeader>
                
                <ScrollArea className="max-h-[55vh] sm:max-h-[65vh] pr-2 sm:pr-4">
                  {editMode ? (
                    /* Edit Mode Form */
                    <div className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
                      <div className="bg-amber-500/10 p-2 sm:p-3 rounded border border-amber-500/30 mb-3 sm:mb-4">
                        <p className="text-amber-400 font-mono text-[10px] sm:text-xs uppercase">Edit Mode - Admin Only</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Order Number</Label>
                          <Input
                            value={editFormData.order_number}
                            onChange={(e) => setEditFormData({ ...editFormData, order_number: e.target.value })}
                            className="bg-zinc-950 border-zinc-700 font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Product Type</Label>
                          <Select
                            value={editFormData.product_type || "rim"}
                            onValueChange={(v) => setEditFormData({ ...editFormData, product_type: v })}
                          >
                            <SelectTrigger className="bg-zinc-950 border-zinc-700 font-mono">
                              <SelectValue placeholder="Select type..." />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              {Object.entries(PRODUCT_TYPES).map(([key, pt]) => (
                                <SelectItem key={key} value={key}>{pt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Customer Name</Label>
                          <Input
                            value={editFormData.customer_name}
                            onChange={(e) => setEditFormData({ ...editFormData, customer_name: e.target.value })}
                            className="bg-zinc-950 border-zinc-700 font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Phone</Label>
                          <Input
                            value={editFormData.phone}
                            onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                            className="bg-zinc-950 border-zinc-700 font-mono"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Vehicle Make</Label>
                          <Input
                            value={editFormData.vehicle_make}
                            onChange={(e) => setEditFormData({ ...editFormData, vehicle_make: e.target.value })}
                            className="bg-zinc-950 border-zinc-700 font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Vehicle Model</Label>
                          <Input
                            value={editFormData.vehicle_model}
                            onChange={(e) => setEditFormData({ ...editFormData, vehicle_model: e.target.value })}
                            className="bg-zinc-950 border-zinc-700 font-mono"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Rim Size</Label>
                          <Select
                            value={editFormData.rim_size || "none"}
                            onValueChange={(v) => setEditFormData({ ...editFormData, rim_size: v === "none" ? "" : v })}
                          >
                            <SelectTrigger className="bg-zinc-950 border-zinc-700 font-mono">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              <SelectItem value="none">None</SelectItem>
                              {RIM_SIZES.map((size) => (
                                <SelectItem key={size} value={size}>{size}"</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Quantity</Label>
                          <Input
                            type="number"
                            min="1"
                            value={editFormData.quantity}
                            onChange={(e) => setEditFormData({ ...editFormData, quantity: parseInt(e.target.value) || 1 })}
                            className="bg-zinc-950 border-zinc-700 font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Steering Brand</Label>
                          <Input
                            value={editFormData.steering_wheel_brand}
                            onChange={(e) => setEditFormData({ ...editFormData, steering_wheel_brand: e.target.value })}
                            className="bg-zinc-950 border-zinc-700 font-mono"
                            placeholder="e.g., Grant, Momo"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="font-mono text-[10px] uppercase text-zinc-500">Wheel Specs</Label>
                        <Input
                          value={editFormData.wheel_specs}
                          onChange={(e) => setEditFormData({ ...editFormData, wheel_specs: e.target.value })}
                          className="bg-zinc-950 border-zinc-700 font-mono"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="font-mono text-[10px] uppercase text-zinc-500">Notes</Label>
                        <Textarea
                          value={editFormData.notes}
                          onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                          className="bg-zinc-950 border-zinc-700 font-mono min-h-[80px]"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={editFormData.has_tires}
                            onCheckedChange={(v) => setEditFormData({ ...editFormData, has_tires: v, tire_size: v ? editFormData.tire_size : "" })}
                            className="border-cyan-500 data-[state=checked]:bg-cyan-500"
                          />
                          <Label className="font-mono text-xs text-cyan-400">Has Tires</Label>
                        </div>
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={editFormData.has_steering_wheel}
                            onCheckedChange={(v) => setEditFormData({ ...editFormData, has_steering_wheel: v })}
                            className="border-purple-500 data-[state=checked]:bg-purple-500"
                          />
                          <Label className="font-mono text-xs text-purple-400">Has Steering Wheel</Label>
                        </div>
                      </div>
                      
                      {/* Tire Size field - only shown when has_tires */}
                      {editFormData.has_tires && (
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-cyan-400">Tire Size (Optional)</Label>
                          <Input
                            value={editFormData.tire_size || ""}
                            onChange={(e) => setEditFormData({ ...editFormData, tire_size: e.target.value })}
                            className="bg-zinc-950 border-cyan-500/50 font-mono"
                            placeholder="e.g. 275/40R20, 305/35R24"
                          />
                        </div>
                      )}
                      
                      {/* Steering Wheel Brand - only shown when has_steering_wheel */}
                      {editFormData.has_steering_wheel && (
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-purple-400">Steering Wheel Brand</Label>
                          <Input
                            value={editFormData.steering_wheel_brand || ""}
                            onChange={(e) => setEditFormData({ ...editFormData, steering_wheel_brand: e.target.value.toUpperCase() })}
                            className="bg-zinc-950 border-purple-500/50 font-mono uppercase"
                            placeholder="e.g. GRANT, MOMO, NRG"
                          />
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div></div>
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Lalo Status</Label>
                          <Select
                            value={editFormData.lalo_status || "not_sent"}
                            onValueChange={(v) => setEditFormData({ ...editFormData, lalo_status: v })}
                          >
                            <SelectTrigger className="bg-zinc-950 border-zinc-700 font-mono">
                              <SelectValue placeholder="Select status..." />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              {Object.entries(LALO_STATUSES).map(([key, s]) => (
                                <SelectItem key={key} value={key}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      {/* Payment Information Section */}
                      <div className="bg-emerald-900/20 border border-emerald-700/50 p-4 rounded-lg space-y-4">
                        <h4 className="font-oswald text-sm uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          Payment Information
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="font-mono text-[10px] uppercase text-zinc-500">Payment Status</Label>
                            <Select
                              value={editFormData.payment_status || "unpaid"}
                              onValueChange={(v) => setEditFormData({ ...editFormData, payment_status: v })}
                            >
                              <SelectTrigger className="bg-zinc-950 border-zinc-700 font-mono">
                                <SelectValue placeholder="Select status..." />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 border-zinc-800">
                                <SelectItem value="unpaid">Unpaid</SelectItem>
                                <SelectItem value="deposit">Deposit Received</SelectItem>
                                <SelectItem value="paid_in_full">Paid in Full</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="font-mono text-[10px] uppercase text-zinc-500">Total Amount ($)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editFormData.payment_total || ""}
                              onChange={(e) => {
                                const total = parseFloat(e.target.value) || 0;
                                const deposit = parseFloat(editFormData.deposit_amount) || 0;
                                setEditFormData({ 
                                  ...editFormData, 
                                  payment_total: total,
                                  balance_due: Math.max(0, total - deposit)
                                });
                              }}
                              className="bg-zinc-950 border-zinc-700 font-mono"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="font-mono text-[10px] uppercase text-zinc-500">Deposit ($)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editFormData.deposit_amount || ""}
                              onChange={(e) => {
                                const deposit = parseFloat(e.target.value) || 0;
                                const total = parseFloat(editFormData.payment_total) || 0;
                                setEditFormData({ 
                                  ...editFormData, 
                                  deposit_amount: deposit,
                                  balance_due: Math.max(0, total - deposit),
                                  payment_status: deposit > 0 && deposit < total ? "deposit" : 
                                                 deposit >= total && total > 0 ? "paid_in_full" : "unpaid"
                                });
                              }}
                              className="bg-zinc-950 border-zinc-700 font-mono"
                              placeholder="0.00"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="font-mono text-[10px] uppercase text-zinc-500">Balance Due ($)</Label>
                            <Input
                              type="number"
                              value={editFormData.balance_due || ""}
                              className="bg-zinc-950 border-zinc-700 font-mono text-red-400"
                              disabled
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="font-mono text-[10px] uppercase text-zinc-500">Payment Notes</Label>
                          <Input
                            value={editFormData.payment_notes || ""}
                            onChange={(e) => setEditFormData({ ...editFormData, payment_notes: e.target.value })}
                            className="bg-zinc-950 border-zinc-700 font-mono"
                            placeholder="e.g., Cash, Zelle, Check #123..."
                          />
                        </div>
                      </div>
                      
                      <div className="flex gap-3 pt-4">
                        <Button
                          onClick={saveOrderEdits}
                          className="bg-amber-500 hover:bg-amber-400 text-black font-oswald uppercase"
                        >
                          Save Changes
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditMode(false)}
                          className="border-zinc-700"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
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
                        {/* Show Rim Size if available */}
                        {selectedOrder.rim_size && (
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">Rim Size</p>
                            <p className="font-mono text-sm text-blue-400 font-bold">{selectedOrder.rim_size}"</p>
                          </div>
                        )}
                        {/* Show Brand for steering wheels */}
                        {selectedOrder.product_type === "steering_wheel" && selectedOrder.steering_wheel_brand && (
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">Steering Wheel Brand</p>
                            <p className="font-mono text-sm text-violet-400 font-bold">{selectedOrder.steering_wheel_brand}</p>
                          </div>
                        )}
                        <div>
                          <p className="font-mono text-[10px] text-zinc-500">Wheel Specs</p>
                          <p className="font-mono text-sm text-white">{selectedOrder.wheel_specs}</p>
                        </div>
                        {selectedOrder.notes && (
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">Admin Notes</p>
                            <p className="font-mono text-sm text-zinc-300">{selectedOrder.notes}</p>
                          </div>
                        )}
                        {/* Lalo Status */}
                        {selectedOrder.lalo_status && selectedOrder.lalo_status !== "not_sent" && (
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">Lalo Status</p>
                            <p className={`font-mono text-sm font-bold ${LALO_STATUSES[selectedOrder.lalo_status]?.color || 'text-amber-400'}`}>
                              {LALO_STATUSES[selectedOrder.lalo_status]?.label || selectedOrder.lalo_status}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Payment Information - View Mode */}
                    <div className="bg-emerald-900/20 p-4 rounded border border-emerald-700/50">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-oswald uppercase tracking-wider text-xs text-emerald-400 flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          Payment Information
                        </h3>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7 px-3"
                          onClick={() => {
                            setAddPaymentModal({ open: true, orderId: selectedOrder.id });
                            setAddPaymentForm({ amount: "", payment_method: "", note: "" });
                          }}
                          data-testid="add-payment-btn"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add Payment
                        </Button>
                      </div>
                      
                      {/* Production Priority Badge */}
                      {selectedOrder.payment_total > 0 && (
                        <div className="mb-3 p-2 rounded bg-zinc-900/50 border border-zinc-700">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400">Production Status:</span>
                            <Badge className={`text-xs px-2 py-0.5 border ${
                              selectedOrder.production_priority === "fully_paid" ? "bg-green-500/20 text-green-400 border-green-500" :
                              selectedOrder.production_priority === "ready_production" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500" :
                              "bg-red-500/20 text-red-400 border-red-500"
                            }`}>
                              {selectedOrder.production_priority === "fully_paid" ? "✓ Fully Paid" :
                               selectedOrder.production_priority === "ready_production" ? "✓ Ready to Cut (50%+)" : 
                               "⏳ Waiting for Deposit"}
                            </Badge>
                          </div>
                          {selectedOrder.percentage_paid !== undefined && (
                            <div className="mt-2">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-zinc-500">Percentage Paid</span>
                                <span className={`font-bold ${
                                  selectedOrder.percentage_paid >= 100 ? "text-green-400" :
                                  selectedOrder.percentage_paid >= 50 ? "text-emerald-400" : "text-red-400"
                                }`}>{Math.round(selectedOrder.percentage_paid || 0)}%</span>
                              </div>
                              <div className="w-full bg-zinc-800 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full transition-all ${
                                    selectedOrder.percentage_paid >= 100 ? "bg-green-500" :
                                    selectedOrder.percentage_paid >= 50 ? "bg-emerald-500" : "bg-red-500"
                                  }`}
                                  style={{ width: `${Math.min(100, selectedOrder.percentage_paid || 0)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="font-mono text-[10px] text-zinc-500">Status</p>
                          <Badge className={`text-xs px-2 py-0.5 border ${
                            selectedOrder.payment_status === "paid_in_full" ? "bg-green-500/20 text-green-400 border-green-500" :
                            selectedOrder.payment_status === "deposit" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500" :
                            "bg-red-500/20 text-red-400 border-red-500"
                          }`}>
                            {selectedOrder.payment_status === "paid_in_full" ? "Paid in Full" :
                             selectedOrder.payment_status === "deposit" ? "Deposit Received" : "Unpaid"}
                          </Badge>
                        </div>
                        <div>
                          <p className="font-mono text-[10px] text-zinc-500">Total</p>
                          <p className="font-mono text-sm text-white font-bold">
                            ${(selectedOrder.payment_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="font-mono text-[10px] text-zinc-500">Deposit</p>
                          <p className="font-mono text-sm text-green-400">
                            ${(selectedOrder.deposit_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="font-mono text-[10px] text-zinc-500">Balance Due</p>
                          <p className={`font-mono text-sm font-bold ${(selectedOrder.balance_due || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            ${(selectedOrder.balance_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        {selectedOrder.payment_notes && (
                          <div className="col-span-2">
                            <p className="font-mono text-[10px] text-zinc-500">Payment History</p>
                            <p className="font-mono text-xs text-zinc-300 whitespace-pre-wrap">{selectedOrder.payment_notes}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Timing & Status */}
                    <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                      <h3 className="font-oswald uppercase tracking-wider text-xs text-zinc-400 mb-3">Timing & Status</h3>
                      <div className="space-y-2">
                        <div className="flex gap-4 mt-2">
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">Current Department</p>
                            <p className="font-mono text-sm text-yellow-500">{DEPT_MAP[selectedOrder.current_department]?.label || selectedOrder.current_department}</p>
                          </div>
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">Order Date</p>
                            <div className="flex items-center gap-2">
                              <Input
                                type="date"
                                value={selectedOrder.order_date ? new Date(selectedOrder.order_date).toISOString().split('T')[0] : ''}
                                onChange={async (e) => {
                                  if (e.target.value) {
                                    try {
                                      const newDate = new Date(e.target.value).toISOString();
                                      await axios.put(`${API}/orders/${selectedOrder.id}`, { order_date: newDate });
                                      setSelectedOrder({ ...selectedOrder, order_date: newDate });
                                      fetchData();
                                      toast.success("Order date updated!");
                                    } catch (error) {
                                      toast.error("Failed to update date");
                                    }
                                  }
                                }}
                                className="bg-zinc-950 border-zinc-700 font-mono text-sm h-8 w-36"
                              />
                            </div>
                          </div>
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">Days In</p>
                            <p className={`font-mono text-sm font-bold ${
                              (() => {
                                const diffDays = Math.floor(Math.abs(new Date() - new Date(selectedOrder.order_date)) / (1000 * 60 * 60 * 24));
                                return diffDays >= 45 ? "text-red-400" : "text-green-400";
                              })()
                            }`}>
                              {(() => {
                                const diffDays = Math.floor(Math.abs(new Date() - new Date(selectedOrder.order_date)) / (1000 * 60 * 60 * 24));
                                return diffDays === 0 ? "Today" : diffDays === 1 ? "1 day" : `${diffDays} days`;
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Last Moved By Info - Admin visible */}
                      {selectedOrder.last_moved_by_name && (
                        <div className="mt-4 p-3 bg-blue-500/10 rounded border border-blue-500/30">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                            <span className="font-mono text-[10px] uppercase tracking-wider text-blue-400">Last Movement</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="font-mono text-[10px] text-zinc-500">Moved By</p>
                              <p className="font-mono text-sm text-blue-300 font-semibold">{selectedOrder.last_moved_by_name}</p>
                            </div>
                            <div>
                              <p className="font-mono text-[10px] text-zinc-500">When</p>
                              <p className="font-mono text-sm text-zinc-300">
                                {selectedOrder.last_moved_at 
                                  ? new Date(selectedOrder.last_moved_at).toLocaleString() 
                                  : 'N/A'}
                              </p>
                            </div>
                            {selectedOrder.last_moved_from && selectedOrder.last_moved_to && (
                              <div className="col-span-2">
                                <p className="font-mono text-[10px] text-zinc-500">Movement</p>
                                <p className="font-mono text-sm text-zinc-300">
                                  <span className="text-yellow-400">{DEPT_MAP[selectedOrder.last_moved_from]?.label || selectedOrder.last_moved_from}</span>
                                  {' → '}
                                  <span className="text-green-400">{DEPT_MAP[selectedOrder.last_moved_to]?.label || selectedOrder.last_moved_to}</span>
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Department Timing - Admin/Admin Restricted only */}
                      {(user?.role === "admin" || user?.role === "admin_restricted") && selectedOrder.department_history && selectedOrder.department_history.length > 0 && (
                        <div className="mt-4 p-3 bg-purple-500/10 rounded border border-purple-500/30">
                          <div className="flex items-center gap-2 mb-3">
                            <Clock className="w-4 h-4 text-purple-400" />
                            <span className="font-mono text-[10px] uppercase tracking-wider text-purple-400">Department Timing</span>
                          </div>
                          <div className="space-y-2">
                            {selectedOrder.department_history.map((hist, idx) => {
                              const startTime = hist.started_at ? new Date(hist.started_at) : null;
                              const endTime = hist.completed_at ? new Date(hist.completed_at) : (hist.department === selectedOrder.current_department ? new Date() : null);
                              
                              let duration = "In Progress";
                              let durationColor = "text-amber-400";
                              
                              if (startTime && endTime) {
                                const diffMs = endTime - startTime;
                                const diffMins = Math.floor(diffMs / (1000 * 60));
                                const diffHours = Math.floor(diffMins / 60);
                                const diffDays = Math.floor(diffHours / 24);
                                
                                if (diffDays > 0) {
                                  duration = `${diffDays}d ${diffHours % 24}h`;
                                  durationColor = diffDays >= 3 ? "text-red-400" : diffDays >= 1 ? "text-yellow-400" : "text-green-400";
                                } else if (diffHours > 0) {
                                  duration = `${diffHours}h ${diffMins % 60}m`;
                                  durationColor = diffHours >= 8 ? "text-yellow-400" : "text-green-400";
                                } else {
                                  duration = `${diffMins}m`;
                                  durationColor = "text-green-400";
                                }
                              }
                              
                              const isCurrentDept = hist.department === selectedOrder.current_department && !hist.completed_at;
                              
                              return (
                                <div 
                                  key={idx} 
                                  className={`flex items-center justify-between p-2 rounded ${isCurrentDept ? "bg-purple-500/20 border border-purple-500/40" : "bg-zinc-800/50"}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`font-mono text-xs ${isCurrentDept ? "text-purple-300 font-semibold" : "text-zinc-400"}`}>
                                      {DEPT_MAP[hist.department]?.label || hist.department}
                                    </span>
                                    {hist.moved_by_name && (
                                      <span className="font-mono text-[9px] text-zinc-500">
                                        by {hist.moved_by_name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className={`font-mono text-sm font-bold ${durationColor}`}>
                                      {duration}
                                    </span>
                                    {isCurrentDept && (
                                      <Badge className="bg-purple-500/30 text-purple-300 border-purple-500 text-[9px] animate-pulse">
                                        ACTIVE
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            
                            {/* Total Time */}
                            {selectedOrder.order_date && (
                              <div className="flex items-center justify-between p-2 mt-2 bg-zinc-800 rounded border border-zinc-700">
                                <span className="font-mono text-xs text-zinc-300 font-semibold">TOTAL TIME</span>
                                <span className={`font-mono text-sm font-bold ${
                                  (() => {
                                    const diffDays = Math.floor((new Date() - new Date(selectedOrder.order_date)) / (1000 * 60 * 60 * 24));
                                    return diffDays >= 14 ? "text-red-400" : diffDays >= 7 ? "text-yellow-400" : "text-green-400";
                                  })()
                                }`}>
                                  {(() => {
                                    const diffMs = new Date() - new Date(selectedOrder.order_date);
                                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                    return diffDays > 0 ? `${diffDays}d ${diffHours}h` : `${diffHours}h`;
                                  })()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Attachments - Multiple support */}
                    <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-oswald uppercase tracking-wider text-xs text-zinc-400">
                          <Paperclip className="w-4 h-4 inline mr-2" />
                          Attachments ({selectedOrder.attachments?.length || (selectedOrder.attachment_url ? 1 : 0)})
                        </h3>
                        <label className="flex items-center gap-1 bg-green-500 hover:bg-green-400 text-black px-3 py-1.5 rounded text-xs font-bold cursor-pointer transition-colors">
                          <Plus className="w-3 h-3" />
                          Add File
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => {
                              if (e.target.files[0]) {
                                handleUploadAttachment(selectedOrder.id, e.target.files[0]);
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                      
                      {/* Show attachments */}
                      {selectedOrder.attachments && selectedOrder.attachments.length > 0 ? (
                        <div className="space-y-2">
                          {selectedOrder.attachments.map((att, index) => (
                            <div key={att.id || index} className="flex items-center justify-between bg-zinc-900 p-2 rounded border border-zinc-700">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Paperclip className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="font-mono text-sm text-white truncate">{att.name}</span>
                                <span className="font-mono text-[10px] text-zinc-500">by {att.uploaded_by}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button 
                                  onClick={() => openAttachmentPreview(att.url, att.name, att.content_type)}
                                  className="flex items-center gap-1 bg-green-500 hover:bg-green-400 text-black px-2 py-1 rounded text-[10px] font-bold"
                                >
                                  <Eye className="w-3 h-3" /> Preview
                                </button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteAttachment(selectedOrder.id, att.id)}
                                  className="h-6 w-6 p-0 text-zinc-500 hover:text-red-500"
                                  title="Delete attachment"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : selectedOrder.attachment_url ? (
                        // Legacy single attachment support
                        <div className="flex items-center justify-between bg-zinc-900 p-2 rounded border border-zinc-700">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Paperclip className="w-4 h-4 text-green-500 flex-shrink-0" />
                            <span className="font-mono text-sm text-white truncate">{selectedOrder.attachment_name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button 
                              onClick={() => openAttachmentPreview(selectedOrder.attachment_url, selectedOrder.attachment_name)}
                              className="flex items-center gap-1 bg-green-500 hover:bg-green-400 text-black px-2 py-1 rounded text-[10px] font-bold"
                            >
                              <Eye className="w-3 h-3" /> Preview
                            </button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAttachment(selectedOrder.id)}
                              className="h-6 w-6 p-0 text-zinc-500 hover:text-red-500"
                              title="Delete attachment"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-zinc-500 font-mono text-xs">No attachments yet. Click "Add File" to upload.</p>
                      )}
                    </div>

                    {/* Notes Section */}
                    <div className="bg-zinc-800/50 p-4 rounded border border-zinc-700">
                      <h3 className="font-oswald uppercase tracking-wider text-xs text-zinc-400 mb-3">
                        <MessageSquare className="w-4 h-4 inline mr-2" />
                        Notes ({selectedOrder.order_notes?.length || 0})
                      </h3>
                      
                      {/* Existing Notes */}
                      <div className="space-y-3 mb-4 max-h-48 overflow-auto">
                        {(!selectedOrder.order_notes || selectedOrder.order_notes.length === 0) ? (
                          <p className="text-zinc-500 font-mono text-xs">No notes yet</p>
                        ) : (
                          selectedOrder.order_notes.map((note, index) => {
                            // Check if this is an admin note
                            const isAdminNote = note.department === "admin" || note.department?.toLowerCase().includes("admin");
                            // Check if current user owns this note
                            const isOwnNote = note.created_by === user?.id;
                            // Check if editing this note
                            const isEditing = editingNote?.id === note.id;
                            
                            // Generate unique color for each user based on their ID + name
                            const userColors = [
                              { text: "text-blue-400", border: "border-blue-500", bg: "bg-blue-500/10" },
                              { text: "text-green-400", border: "border-green-500", bg: "bg-green-500/10" },
                              { text: "text-purple-400", border: "border-purple-500", bg: "bg-purple-500/10" },
                              { text: "text-pink-400", border: "border-pink-500", bg: "bg-pink-500/10" },
                              { text: "text-cyan-400", border: "border-cyan-500", bg: "bg-cyan-500/10" },
                              { text: "text-orange-400", border: "border-orange-500", bg: "bg-orange-500/10" },
                              { text: "text-lime-400", border: "border-lime-500", bg: "bg-lime-500/10" },
                              { text: "text-emerald-400", border: "border-emerald-500", bg: "bg-emerald-500/10" },
                              { text: "text-violet-400", border: "border-violet-500", bg: "bg-violet-500/10" },
                              { text: "text-teal-400", border: "border-teal-500", bg: "bg-teal-500/10" },
                              { text: "text-indigo-400", border: "border-indigo-500", bg: "bg-indigo-500/10" },
                              { text: "text-fuchsia-400", border: "border-fuchsia-500", bg: "bg-fuchsia-500/10" },
                            ];
                            
                            // Use created_by (user ID) for truly unique color
                            const idHash = (note.created_by || note.created_by_name || '').split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
                            const colorIndex = idHash % userColors.length;
                            const userColor = userColors[colorIndex];
                            
                            // Admin notes have special styling
                            if (isAdminNote) {
                              return (
                                <div key={note.id} className="bg-red-500/20 p-4 rounded-lg border-2 border-red-500 shadow-lg shadow-red-500/20">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">⚠️ ADMIN NOTE</span>
                                    {isOwnNote && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => setEditingNote({ id: note.id, text: note.text })}
                                          className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-700"
                                          title="Edit note"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteNote(note.id)}
                                          className="text-zinc-400 hover:text-red-400 p-1 rounded hover:bg-zinc-700"
                                          title="Delete note"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {isEditing ? (
                                    <div className="space-y-2">
                                      <Textarea
                                        value={editingNote.text}
                                        onChange={(e) => setEditingNote({ ...editingNote, text: e.target.value })}
                                        className="bg-zinc-900 border-zinc-700 text-white text-sm"
                                        rows={2}
                                      />
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={() => handleEditNote(note.id)} className="bg-green-500 hover:bg-green-400 text-white text-xs">
                                          Save
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingNote(null)} className="text-zinc-400 text-xs">
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      <p className="font-mono text-sm text-white font-semibold">{note.text}</p>
                                      {/* Show English translation for non-English notes */}
                                      {note.is_translated && note.english_translation && (
                                        <div className="flex items-start gap-1.5 mt-1 p-2 bg-blue-500/10 rounded border border-blue-500/20">
                                          <span className="text-blue-400 text-xs" title="Auto-translated to English">🌐</span>
                                          <p className="font-mono text-xs text-blue-300 italic">{note.english_translation}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="font-mono text-[10px] font-bold text-red-400">{note.created_by_name}</span>
                                    <span className="font-mono text-[10px] text-zinc-500">•</span>
                                    <span className="font-mono text-[10px] text-zinc-400">{new Date(note.created_at).toLocaleString()}</span>
                                    {note.edited_at && <span className="font-mono text-[10px] text-zinc-500">(edited)</span>}
                                    {note.detected_language && note.detected_language !== 'en' && (
                                      <span className="font-mono text-[10px] text-blue-400" title={`Original language: ${note.detected_language}`}>
                                        ({note.detected_language.toUpperCase()})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                            
                            // Regular user notes with unique colors
                            return (
                              <div key={note.id} className={`${userColor.bg} p-3 rounded border-l-4 ${userColor.border}`}>
                                <div className="flex justify-between items-start">
                                  {isEditing ? (
                                    <div className="flex-1 space-y-2">
                                      <Textarea
                                        value={editingNote.text}
                                        onChange={(e) => setEditingNote({ ...editingNote, text: e.target.value })}
                                        className="bg-zinc-900 border-zinc-700 text-white text-sm"
                                        rows={2}
                                      />
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={() => handleEditNote(note.id)} className="bg-green-500 hover:bg-green-400 text-white text-xs">
                                          Save
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingNote(null)} className="text-zinc-400 text-xs">
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex-1 space-y-1">
                                      <p className="font-mono text-sm text-white">{note.text}</p>
                                      {/* Show English translation for non-English notes */}
                                      {note.is_translated && note.english_translation && (
                                        <div className="flex items-start gap-1.5 mt-1 p-2 bg-blue-500/10 rounded border border-blue-500/20">
                                          <span className="text-blue-400 text-xs" title="Auto-translated to English">🌐</span>
                                          <p className="font-mono text-xs text-blue-300 italic">{note.english_translation}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {isOwnNote && !isEditing && (
                                    <div className="flex items-center gap-1 ml-2">
                                      <button
                                        onClick={() => setEditingNote({ id: note.id, text: note.text })}
                                        className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-700/50"
                                        title="Edit note"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteNote(note.id)}
                                        className="text-zinc-400 hover:text-red-400 p-1 rounded hover:bg-zinc-700/50"
                                        title="Delete note"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <span className={`font-mono text-[10px] font-bold ${userColor.text}`}>{note.created_by_name}</span>
                                  <span className="font-mono text-[10px] text-zinc-600">•</span>
                                  <span className="font-mono text-[10px] text-zinc-500">{note.department}</span>
                                  <span className="font-mono text-[10px] text-zinc-600">•</span>
                                  <span className="font-mono text-[10px] text-zinc-500">{new Date(note.created_at).toLocaleString()}</span>
                                  {note.edited_at && <span className="font-mono text-[10px] text-zinc-500">(edited)</span>}
                                  {note.detected_language && note.detected_language !== 'en' && (
                                    <span className="font-mono text-[10px] text-blue-400" title={`Original language: ${note.detected_language}`}>
                                      ({note.detected_language.toUpperCase()})
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Add New Note with @mention support */}
                      <div className="space-y-2">
                        <MentionInput
                          value={newNote}
                          onChange={setNewNote}
                          placeholder={t('orders.addNotePlaceholder', 'Add a note... Use @username to tag someone')}
                          className="bg-zinc-950 border-zinc-700 text-sm min-h-[60px]"
                          rows={2}
                          onSubmit={handleAddNote}
                        />
                        <div className="flex justify-end">
                          <Button
                            onClick={handleAddNote}
                            disabled={!newNote.trim()}
                            className="bg-red-500 hover:bg-red-400 text-white"
                            data-testid="add-note-btn"
                          >
                            <Send className="w-4 h-4 mr-2" />
                            {t('orders.sendNote', 'Send Note')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}
                </ScrollArea>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Stats List Modal */}
        <Dialog open={statsModal.open} onOpenChange={(open) => { if (!open) { setStatsModal({ ...statsModal, open: false }); setStatsSelectedOrders([]); setStatsModalSearch(""); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{statsModal.title}</span>
                  <Badge className="bg-zinc-800 text-white border-zinc-700">
                    {statsModal.orders.length} orders
                  </Badge>
                  {statsSelectedOrders.length > 0 && (
                    <Badge className="bg-amber-500 text-black border-none">
                      {statsSelectedOrders.length} Selected
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Mark All as Cut button - available for caps and steering wheels for ANYONE */}
                  {(statsModal.title?.toLowerCase().includes("cap") || statsModal.title?.toLowerCase().includes("steering")) && statsModal.orders.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => {
                        // If orders are selected, only mark those. Otherwise mark all.
                        const targetOrders = statsSelectedOrders.length > 0 
                          ? statsModal.orders.filter(o => statsSelectedOrders.includes(o.id))
                          : statsModal.orders;
                        const orderIds = targetOrders.filter(o => o.cut_status !== "cut").map(o => o.id);
                        if (orderIds.length === 0) {
                          toast.info("All orders are already marked as cut!");
                          return;
                        }
                        handleBulkMarkCut(orderIds, "cut");
                      }}
                      className="bg-green-600 hover:bg-green-500 text-white font-mono text-xs"
                    >
                      <CheckSquare className="w-4 h-4 mr-2" />
                      {statsSelectedOrders.length > 0 ? `Mark ${statsSelectedOrders.length} CUT` : "Mark All CUT"}
                    </Button>
                  )}
                  
                  {/* Bulk Order Fulfill button - only for Cut Orders section, ONLY when orders are selected */}
                  {statsModal.filter?.type === "cut_orders" && statsSelectedOrders.length > 0 && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        const targetOrders = statsModal.orders.filter(o => statsSelectedOrders.includes(o.id));
                        
                        if (targetOrders.length === 0) {
                          toast.info("No orders selected!");
                          return;
                        }
                        
                        let successCount = 0;
                        let failCount = 0;
                        
                        for (const order of targetOrders) {
                          try {
                            // Move order to "done" status (fulfill)
                            await axios.put(`${API}/orders/${order.id}/move`, 
                              { target_department: "done" },
                              { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
                            );
                            successCount++;
                          } catch (err) {
                            console.error(`Failed to fulfill order ${order.id}:`, err);
                            failCount++;
                          }
                        }
                        
                        if (successCount > 0) {
                          toast.success(`Fulfilled ${successCount} order(s)!`);
                          fetchData();
                          // Remove fulfilled orders from modal
                          setStatsModal(prev => ({
                            ...prev,
                            orders: prev.orders.filter(o => !statsSelectedOrders.includes(o.id))
                          }));
                        }
                        if (failCount > 0) {
                          toast.error(`Failed to fulfill ${failCount} order(s)`);
                        }
                        setStatsSelectedOrders([]);
                      }}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs"
                    >
                      <Package className="w-4 h-4 mr-2" />
                      Fulfill {statsSelectedOrders.length}
                    </Button>
                  )}
                  
                  {/* Bulk Move Dropdown - appears when orders are selected */}
                  {statsSelectedOrders.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white font-mono text-xs"
                        >
                          <ArrowRightLeft className="w-4 h-4 mr-2" />
                          Move {statsSelectedOrders.length} to...
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-zinc-900 border-zinc-800 max-h-60 overflow-y-auto">
                        {DEPARTMENTS
                          .filter(d => {
                            // Admin/admin_restricted can move to any department
                            if (isAnyAdmin) return true;
                            // Staff can only move to their assigned departments
                            const userDepts = user?.departments || [user?.department];
                            return userDepts.includes(d.value);
                          })
                          .map(dept => (
                          <DropdownMenuItem 
                            key={dept.value}
                            onClick={async () => {
                              // Bulk move selected orders to this department
                              let successCount = 0;
                              let failCount = 0;
                              for (const orderId of statsSelectedOrders) {
                                try {
                                  await axios.put(`${API}/orders/${orderId}/move`, 
                                    { target_department: dept.value },
                                    { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
                                  );
                                  successCount++;
                                } catch (err) {
                                  console.error(`Failed to move order ${orderId}:`, err);
                                  failCount++;
                                }
                              }
                              if (successCount > 0) {
                                toast.success(`Moved ${successCount} order(s) to ${dept.label}`);
                                fetchData();
                                // Update modal orders
                                setStatsModal(prev => ({
                                  ...prev,
                                  orders: prev.orders.filter(o => !statsSelectedOrders.includes(o.id))
                                }));
                              }
                              if (failCount > 0) {
                                toast.error(`Failed to move ${failCount} order(s)`);
                              }
                              setStatsSelectedOrders([]);
                            }}
                            className="text-xs cursor-pointer hover:bg-zinc-800"
                          >
                            <span className={dept.color.split(' ')[0]}>{dept.label}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  
                  <Button
                    size="sm"
                    onClick={openStatsExportModal}
                    className="bg-red-500 hover:bg-red-400 text-white font-mono text-xs"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {statsSelectedOrders.length > 0 ? `Export ${statsSelectedOrders.length}` : "Export PDF"}
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>
            
            {/* Search Bar */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search by order # or customer name..."
                value={statsModalSearch}
                onChange={(e) => setStatsModalSearch(e.target.value)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 font-mono"
                data-testid="stats-modal-search"
              />
              {statsModalSearch && (
                <button
                  onClick={() => setStatsModalSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* ========================================================================
                === SECTION: ORDERS BY PRODUCT TYPE ===
                Orders grouped by product type with checkboxes for selection
                ======================================================================== */}
            <ScrollArea className="max-h-[65vh]">
              {statsModal.orders.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-zinc-500 font-mono">No orders found</p>
                </div>
              ) : (
                <div className="overflow-x-auto" data-section="orders-by-product-type">
                  {/* Section Title */}
                  <h3 className="font-oswald text-xs uppercase tracking-[0.2em] text-white font-bold mb-3 border-b border-zinc-800 pb-2">
                    ORDERS BY PRODUCT TYPE
                  </h3>
                  {/* Group orders by product type */}
                  {(() => {
                    // Filter orders first based on search
                    const filteredOrders = statsModal.orders.filter(order => {
                      if (!statsModalSearch) return true;
                      const searchLower = statsModalSearch.toLowerCase();
                      return (
                        order.order_number?.toString().toLowerCase().includes(searchLower) ||
                        order.customer_name?.toLowerCase().includes(searchLower)
                      );
                    });
                    
                    // Group by product type
                    const groups = {};
                    const productOrder = ['rim', 'steering_wheel', 'standard_caps', 'floater_caps', 'xxl_caps', 'dually_floating_caps', 'offroad_floating_caps', 'custom_caps', 'race_car_caps'];
                    
                    filteredOrders.forEach(order => {
                      const type = order.product_type || 'other';
                      if (!groups[type]) groups[type] = [];
                      groups[type].push(order);
                    });
                    
                    // Sort orders within each group by order_number
                    Object.keys(groups).forEach(type => {
                      groups[type].sort((a, b) => (a.order_number || 0) - (b.order_number || 0));
                    });
                    
                    // Build sorted groups array
                    const sortedGroups = [];
                    productOrder.forEach(type => {
                      if (groups[type] && groups[type].length > 0) {
                        sortedGroups.push({
                          type,
                          label: PRODUCT_TYPES[type]?.label || type,
                          color: PRODUCT_TYPES[type]?.color || 'text-zinc-400 border-zinc-400',
                          orders: groups[type]
                        });
                      }
                    });
                    Object.keys(groups).forEach(type => {
                      if (!productOrder.includes(type) && groups[type].length > 0) {
                        sortedGroups.push({
                          type,
                          label: PRODUCT_TYPES[type]?.label || type,
                          color: PRODUCT_TYPES[type]?.color || 'text-zinc-400 border-zinc-400',
                          orders: groups[type]
                        });
                      }
                    });
                    
                    if (filteredOrders.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <p className="text-zinc-500 font-mono">No orders matching "{statsModalSearch}"</p>
                        </div>
                      );
                    }
                    
                    return sortedGroups.map((group) => (
                      <div key={group.type} className="mb-4">
                        {/* Product Type Group Header */}
                        <div className={`flex items-center gap-2 px-3 py-2 bg-zinc-800 border-l-4 ${group.color.split(' ')[1] || 'border-zinc-500'} sticky top-0 z-10`}>
                          <span className={`font-oswald text-sm uppercase tracking-wider font-bold ${group.color.split(' ')[0]}`}>
                            {group.label}
                          </span>
                          <span className="bg-white text-red-500 text-xs font-bold px-2 py-0.5 rounded-full">
                            {group.orders.length}
                          </span>
                        </div>
                        
                        {/* Orders Table for this group */}
                        <table className="w-full text-sm">
                          <thead className="bg-zinc-900 sticky top-10">
                            <tr className="border-2 border-red-500">
                              <th className="px-2 py-1.5 text-center w-10">
                                <Checkbox
                                  checked={group.orders.every(o => statsSelectedOrders.includes(o.id))}
                                  onCheckedChange={() => {
                                    const groupIds = group.orders.map(o => o.id);
                                    const allSelected = group.orders.every(o => statsSelectedOrders.includes(o.id));
                                    if (allSelected) {
                                      setStatsSelectedOrders(prev => prev.filter(id => !groupIds.includes(id)));
                                    } else {
                                      setStatsSelectedOrders(prev => [...new Set([...prev, ...groupIds])]);
                                    }
                                  }}
                                  className="border-amber-500 data-[state=checked]:bg-amber-500"
                                />
                              </th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Order #</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Customer</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Qty</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-emerald-400 font-bold uppercase">Paid %</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Dept</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Status</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Order Date</th>
                              {statsModal.filter?.type === "cut_orders" && (
                                <th className="px-2 py-1.5 text-left text-[10px] font-mono text-yellow-400 font-bold uppercase">Cut Date</th>
                              )}
                              <th className="px-2 py-1.5 text-center text-[10px] font-mono text-white font-bold uppercase">View</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/50">
                            {group.orders.map((order) => {
                              const deptHistory = order.department_history?.find(h => h.department === order.current_department && !h.completed_at);
                              const deptDate = deptHistory?.started_at ? new Date(deptHistory.started_at).toLocaleDateString() : "-";
                              const isSelected = statsSelectedOrders.includes(order.id);
                              const isCut = order.cut_status === "cut";
                              
                              return (
                                <tr 
                                  key={order.id} 
                                  className={`hover:bg-zinc-800/50 ${isCut ? 'bg-green-500/10' : ''} ${isSelected ? 'bg-amber-500/20' : ''}`}
                                >
                                  <td className="px-2 py-2 text-center">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleStatsOrderSelection(order.id)}
                                      className="border-amber-500 data-[state=checked]:bg-amber-500"
                                    />
                                  </td>
                                  <td className="px-2 py-2 font-mono text-red-500 font-bold text-xs">{order.order_number}</td>
                                  <td className="px-2 py-2 font-mono text-white text-xs truncate max-w-[120px]">{getTranslatedField(order, 'customer_name')}</td>
                                  <td className="px-2 py-2 font-mono text-zinc-300 text-xs">{order.quantity || 1}</td>
                                  <td className="px-2 py-2">
                                    {order.percentage_paid > 0 ? (
                                      <Badge className={`text-[10px] ${
                                        order.percentage_paid >= 100 
                                          ? "bg-green-500/20 text-green-400 border-green-500" 
                                          : order.percentage_paid >= 50 
                                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500"
                                            : "bg-yellow-500/20 text-yellow-400 border-yellow-500"
                                      }`}>
                                        <DollarSign className="w-2.5 h-2.5 mr-0.5" />
                                        {Math.round(order.percentage_paid)}%
                                      </Badge>
                                    ) : (
                                      <span className="text-zinc-500 text-[10px]">-</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2">
                                    <Badge className={`${DEPT_MAP[order.current_department]?.color || "text-zinc-400 border-zinc-400"} bg-transparent text-[10px]`}>
                                      {DEPT_MAP[order.current_department]?.label || order.current_department}
                                    </Badge>
                                  </td>
                                  <td className="px-2 py-2">
                                    <Badge 
                                      className={`text-[10px] cursor-pointer transition-all hover:scale-105 ${isCut ? "bg-green-500/20 text-green-400 border-green-500 hover:bg-green-500/40" : "bg-yellow-500/20 text-yellow-400 border-yellow-500 hover:bg-yellow-500/40"}`}
                                      onClick={() => handleToggleCutStatus(order.id, order.cut_status)}
                                      title="Click to toggle status"
                                    >
                                      {isCut ? "✓ CUT" : "WAITING"}
                                    </Badge>
                                  </td>
                                  <td className="px-2 py-2 font-mono text-zinc-400 text-[10px]">
                                    {new Date(order.order_date).toLocaleDateString()}
                                  </td>
                                  {statsModal.filter?.type === "cut_orders" && (
                                    <td className="px-2 py-2 font-mono text-yellow-400 font-semibold text-[10px]">
                                      {order.cut_at ? new Date(order.cut_at).toLocaleString() : "-"}
                                    </td>
                                  )}
                                  <td className="px-2 py-2 text-center">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => { setStatsModal({ ...statsModal, open: false }); setStatsSelectedOrders([]); setStatsModalSearch(""); openOrderDetail(order.id); }}
                                      className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Export PDF Modal - Enter Steering Wheel Designs (Individual) */}
        <Dialog open={exportModal.open} onOpenChange={(open) => !open && setExportModal({ ...exportModal, open: false })}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-red-500" />
                Export PDF - {exportModal.deptLabel}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <p className="text-zinc-400 font-mono text-sm">
                Exporting {exportModal.orders?.length || 0} orders from {exportModal.deptLabel} department.
              </p>
              
              {/* List each steering wheel order with its own design input */}
              {exportModal.orders?.filter(o => o.product_type === "steering_wheel").length > 0 && (
                <div className="space-y-3 p-4 bg-violet-500/10 border border-violet-500/30 rounded max-h-[300px] overflow-y-auto">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-violet-400">
                    Steering Wheel Designs
                  </Label>
                  {exportModal.orders?.filter(o => o.product_type === "steering_wheel").map(order => (
                    <div key={order.id} className="flex flex-col gap-1 p-2 bg-zinc-800/50 rounded">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-red-500 font-bold">{order.order_number}</span>
                        <span className="font-mono text-[10px] text-zinc-500">{getTranslatedField(order, 'customer_name')}</span>
                      </div>
                      <Input
                        value={exportBrands[order.id] || ""}
                        onChange={(e) => setExportBrands({ ...exportBrands, [order.id]: e.target.value })}
                        className="bg-zinc-950 border-zinc-700 font-mono text-sm h-8"
                        placeholder="Enter design (e.g. Grant, Momo)"
                      />
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setExportModal({ open: false, deptValue: "", deptLabel: "", orders: [] })}
                  className="flex-1 border-zinc-700 hover:border-zinc-500"
                >
                  Cancel
                </Button>
                <Button
                  onClick={exportDepartmentPDF}
                  className="flex-1 bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-widest"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Stats Export Modal - Enter Steering Wheel Designs (Individual) */}
        <Dialog open={statsExportModal.open} onOpenChange={(open) => !open && setStatsExportModal({ open: false })}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-red-500" />
                Export PDF - {statsModal.title}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              {/* Export Filter - Choose which orders to export */}
              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded space-y-3">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                  Filter Orders to Export
                </Label>
                <Select value={statsExportFilter} onValueChange={setStatsExportFilter}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="all">All Orders ({statsModal.orders?.length || 0})</SelectItem>
                    <SelectItem value="waiting">
                      ⏳ Waiting to be Cut ({statsModal.orders?.filter(o => o.cut_status !== "cut").length || 0})
                    </SelectItem>
                    <SelectItem value="cut">
                      ✓ Already Cut ({statsModal.orders?.filter(o => o.cut_status === "cut").length || 0})
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-zinc-500 font-mono text-[10px]">
                  {statsExportFilter === "waiting" && "Only orders that still need to be cut will be exported"}
                  {statsExportFilter === "cut" && "Only orders already marked as cut will be exported"}
                  {statsExportFilter === "all" && "All orders will be exported"}
                </p>
              </div>
              
              <p className="text-zinc-400 font-mono text-sm">
                Exporting {getFilteredExportOrders()?.length || 0} orders.
              </p>
              
              {/* List each steering wheel order with its own brand input */}
              {getFilteredExportOrders()?.filter(o => o.product_type === "steering_wheel").length > 0 && (
                <div className="space-y-3 p-4 bg-violet-500/10 border border-violet-500/30 rounded max-h-[300px] overflow-y-auto">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-violet-400">
                    Steering Wheel Designs
                  </Label>
                  {getFilteredExportOrders()?.filter(o => o.product_type === "steering_wheel").map(order => (
                    <div key={order.id} className="flex flex-col gap-1 p-2 bg-zinc-800/50 rounded">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-red-500 font-bold">{order.order_number}</span>
                        <span className="font-mono text-[10px] text-zinc-500">{getTranslatedField(order, 'customer_name')}</span>
                      </div>
                      <Input
                        value={statsExportBrands[order.id] || ""}
                        onChange={(e) => setStatsExportBrands({ ...statsExportBrands, [order.id]: e.target.value })}
                        className="bg-zinc-950 border-zinc-700 font-mono text-sm h-8"
                        placeholder="Enter design (e.g. Grant, Momo)"
                      />
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setStatsExportModal({ open: false })}
                  className="flex-1 border-zinc-700 hover:border-zinc-500"
                >
                  Cancel
                </Button>
                <Button
                  onClick={exportStatsModalPDF}
                  disabled={getFilteredExportOrders()?.length === 0}
                  className="flex-1 bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-widest disabled:opacity-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Size Report Modal */}
        <Dialog open={sizeReportModal.open} onOpenChange={(open) => setSizeReportModal({ open })}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-500" />
                Size Report
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-zinc-400 font-mono text-sm">
                  View and export orders grouped by rim size
                </p>
                <Button
                  onClick={exportAllSizesReportPDF}
                  className="bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-wider text-xs"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export All Sizes
                </Button>
              </div>
              
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {[...RIM_SIZES, "none"].map(size => {
                    const sizeOrders = getOrdersBySize()[size];
                    const orderCount = sizeOrders?.length || 0;
                    if (orderCount === 0) return null;
                    
                    return (
                      <div key={size} className="p-4 bg-zinc-800/50 rounded border border-zinc-700">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="font-oswald text-2xl text-blue-400 font-bold">
                              {size === "none" ? "N/A" : `${size}"`}
                            </span>
                            <Badge className="bg-zinc-700 text-white border-none">
                              {orderCount} order{orderCount !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => exportSizeReportPDF(size, sizeOrders)}
                            className="bg-blue-500 hover:bg-blue-400 text-white font-mono text-xs"
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Export
                          </Button>
                        </div>
                        
                        {/* Show first 3 orders as preview */}
                        <div className="space-y-1">
                          {sizeOrders.slice(0, 3).map(order => (
                            <div key={order.id} className="flex items-center justify-between text-xs">
                              <span className="text-red-400 font-mono font-bold">{order.order_number}</span>
                              <span className="text-zinc-400 font-mono">{getTranslatedField(order, 'customer_name')}</span>
                              <span className="text-zinc-500 font-mono">{PRODUCT_TYPES[order.product_type]?.label}</span>
                            </div>
                          ))}
                          {sizeOrders.length > 3 && (
                            <p className="text-zinc-600 font-mono text-[10px]">
                              +{sizeOrders.length - 3} more orders...
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Edit Modal */}
        <Dialog open={bulkEditModal.open} onOpenChange={(open) => setBulkEditModal({ open })}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white">
                Bulk Edit {selectedOrders.length} Orders
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <p className="text-[10px] text-zinc-500 font-mono uppercase">
                Only fill in fields you want to change. Empty fields will be left unchanged.
              </p>
              
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Order Date
                </Label>
                <Input
                  type="date"
                  value={bulkEditData.order_date}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, order_date: e.target.value })}
                  className="bg-zinc-950 border-zinc-800 font-mono"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Department
                </Label>
                <Select
                  value={bulkEditData.current_department}
                  onValueChange={(v) => setBulkEditData({ ...bulkEditData, current_department: v })}
                >
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 font-mono">
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept.value} value={dept.value}>
                        {dept.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Rim Size
                </Label>
                <Select
                  value={bulkEditData.rim_size}
                  onValueChange={(v) => setBulkEditData({ ...bulkEditData, rim_size: v })}
                >
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 font-mono">
                    <SelectValue placeholder="Select size..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {RIM_SIZES.map((size) => (
                      <SelectItem key={size} value={size}>{size}"</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Wheel Specs
                </Label>
                <Input
                  value={bulkEditData.wheel_specs}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, wheel_specs: e.target.value })}
                  className="bg-zinc-950 border-zinc-800 font-mono"
                  placeholder="e.g. 22x10 -12 offset"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Vehicle Make
                  </Label>
                  <Input
                    value={bulkEditData.vehicle_make}
                    onChange={(e) => setBulkEditData({ ...bulkEditData, vehicle_make: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 font-mono"
                    placeholder="e.g. Ford"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Vehicle Model
                  </Label>
                  <Input
                    value={bulkEditData.vehicle_model}
                    onChange={(e) => setBulkEditData({ ...bulkEditData, vehicle_model: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 font-mono"
                    placeholder="e.g. F-150"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Phone
                </Label>
                <Input
                  value={bulkEditData.phone}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, phone: e.target.value })}
                  className="bg-zinc-950 border-zinc-800 font-mono"
                  placeholder="e.g. 555-1234"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Cut Status
                </Label>
                <Select
                  value={bulkEditData.cut_status}
                  onValueChange={(v) => setBulkEditData({ ...bulkEditData, cut_status: v })}
                >
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 font-mono">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="waiting">Waiting</SelectItem>
                    <SelectItem value="cut">Cut</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Steering Wheel Design
                </Label>
                <Input
                  value={bulkEditData.steering_wheel_brand}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, steering_wheel_brand: e.target.value })}
                  className="bg-zinc-950 border-zinc-800 font-mono"
                  placeholder="e.g. Grant, Momo"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Notes
                </Label>
                <Textarea
                  value={bulkEditData.notes}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, notes: e.target.value })}
                  className="bg-zinc-950 border-zinc-800 font-mono min-h-[60px]"
                  placeholder="Additional notes..."
                />
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleBulkEdit}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-oswald uppercase"
                >
                  Apply Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setBulkEditModal({ open: false })}
                  className="border-zinc-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Confirmation Modal */}
        <AlertDialog open={bulkDeleteModal.open} onOpenChange={(open) => setBulkDeleteModal({ open })}>
          <AlertDialogContent className="bg-zinc-900 border-zinc-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-oswald uppercase tracking-widest text-red-500 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Delete {selectedOrders.length} Orders?
              </AlertDialogTitle>
              <AlertDialogDescription className="font-mono text-zinc-400">
                <div className="bg-red-500/10 border border-red-500/30 rounded p-3 my-3">
                  <p className="text-red-400 font-bold uppercase text-sm">⚠️ This action cannot be undone!</p>
                </div>
                <p className="mb-2">You are about to permanently delete <span className="text-red-400 font-bold">{selectedOrders.length}</span> orders.</p>
                <p>All order data, notes, and attachments will be lost forever.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 font-oswald uppercase">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                className="bg-red-600 hover:bg-red-500 text-white font-oswald uppercase"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete {selectedOrders.length} Orders
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Move Modal - Admin only */}
        <Dialog open={bulkMoveModal.open} onOpenChange={(open) => setBulkMoveModal({ open, targetDept: "" })}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-blue-500 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5" />
                Bulk Move {selectedOrders.length} Orders
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3">
                <p className="text-blue-400 font-mono text-sm">
                  Select a department to move all {selectedOrders.length} selected orders.
                </p>
              </div>
              
              <div>
                <Label className="font-mono text-xs text-zinc-400 mb-2 block">Target Department *</Label>
                <Select 
                  value={bulkMoveModal.targetDept} 
                  onValueChange={(v) => setBulkMoveModal(prev => ({ ...prev, targetDept: v }))}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 max-h-64">
                    {DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept.value} value={dept.value}>
                        <span className={dept.color.split(' ')[0]}>{dept.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleBulkMove}
                  disabled={!bulkMoveModal.targetDept || bulkMoveLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-oswald uppercase"
                >
                  {bulkMoveLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Moving...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-4 h-4 mr-2" />
                      Move {selectedOrders.length} Orders
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setBulkMoveModal({ open: false, targetDept: "" })}
                  className="flex-1 border-zinc-700"
                  disabled={bulkMoveLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add to Hold Modal */}
        <Dialog open={holdModal.open} onOpenChange={(open) => { if (!open) { setHoldModal({ open: false, order: null }); setHoldReason(""); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-yellow-500 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Add to Hold Queue
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {holdModal.order && (
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="font-oswald text-white">Order #{holdModal.order.order_number}</p>
                  <p className="text-sm text-zinc-400">{getTranslatedField(holdModal.order, 'customer_name')}</p>
                </div>
              )}
              <div>
                <Label className="font-mono text-xs text-zinc-400">Hold Reason *</Label>
                <Input
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="e.g., Waiting on Payment, Customer MIA, Ready to Resell"
                  className="bg-zinc-800 border-zinc-700 mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddToHold}
                  disabled={!holdReason.trim()}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black"
                >
                  Add to Hold
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setHoldModal({ open: false, order: null }); setHoldReason(""); }}
                  className="flex-1 border-zinc-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* RUSH Order Modal */}
        <Dialog open={rushModal.open} onOpenChange={(open) => { if (!open) { setRushModal({ open: false, order: null }); setRushReason(""); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-red-500 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Mark as RUSH Order
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {rushModal.order && (
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="font-oswald text-white">Order #{rushModal.order.order_number}</p>
                  <p className="text-sm text-zinc-400">{getTranslatedField(rushModal.order, 'customer_name')}</p>
                </div>
              )}
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-red-400 text-sm font-mono">
                  RUSH orders will be highlighted and displayed prominently to all staff.
                </p>
              </div>
              <div>
                <Label className="font-mono text-xs text-zinc-400">Rush Reason (optional)</Label>
                <Input
                  value={rushReason}
                  onChange={(e) => setRushReason(e.target.value)}
                  placeholder="e.g., Customer pickup today, VIP order"
                  className="bg-zinc-800 border-zinc-700 mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSetRush}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                >
                  <Zap className="w-4 h-4 mr-1" />
                  Mark as RUSH
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setRushModal({ open: false, order: null }); setRushReason(""); }}
                  className="flex-1 border-zinc-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Refinish Queue Modal */}
        <Dialog open={refinishModal.open} onOpenChange={(open) => { if (!open) { setRefinishModal({ open: false, order: null }); setRefinishNotes(""); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-orange-500 flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                Mark for Refinish
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {refinishModal.order && (
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="font-oswald text-white">Order #{refinishModal.order.order_number}</p>
                  <p className="text-sm text-zinc-400">{getTranslatedField(refinishModal.order, 'customer_name')}</p>
                </div>
              )}
              <div className="bg-orange-500/10 p-3 rounded border border-orange-500/30">
                <p className="font-mono text-xs text-orange-400">
                  This order will be added to the Refinish Queue for tracking repairs and fixes.
                </p>
              </div>
              <div>
                <Label className="font-mono text-xs text-zinc-400">What needs to be fixed? *</Label>
                <Textarea
                  value={refinishNotes}
                  onChange={(e) => setRefinishNotes(e.target.value)}
                  placeholder="Describe what needs to be repaired or refinished..."
                  className="bg-zinc-800 border-zinc-700 mt-1 min-h-[100px]"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddToRefinish}
                  disabled={!refinishNotes.trim()}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Wrench className="w-4 h-4 mr-1" />
                  Add to Refinish Queue
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setRefinishModal({ open: false, order: null }); setRefinishNotes(""); }}
                  className="flex-1 border-zinc-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Re-Do Order Modal */}
        <Dialog open={redoModal.open} onOpenChange={(open) => { if (!open) { setRedoModal({ open: false, order: null }); setRedoReason(""); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-amber-500 flex items-center gap-2">
                <RotateCcw className="w-5 h-5" />
                Mark as Re-Do Order
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {redoModal.order && (
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="font-oswald text-white">Order #{redoModal.order.order_number}</p>
                  <p className="text-sm text-zinc-400">{getTranslatedField(redoModal.order, 'customer_name')}</p>
                </div>
              )}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-amber-400 text-sm font-mono">
                  Re-Do orders are for fixing customer issues. They can be moved to any department and will be tracked separately.
                </p>
              </div>
              <div>
                <Label className="font-mono text-xs text-zinc-400">Re-Do Reason (optional)</Label>
                <Input
                  value={redoReason}
                  onChange={(e) => setRedoReason(e.target.value)}
                  placeholder="e.g., Color wrong, Customer not satisfied, etc."
                  className="bg-zinc-800 border-zinc-700 mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSetRedo}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-black"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Mark as Re-Do
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setRedoModal({ open: false, order: null }); setRedoReason(""); }}
                  className="flex-1 border-zinc-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Payment Modal */}
        <Dialog open={addPaymentModal.open} onOpenChange={(open) => { if (!open) { setAddPaymentModal({ open: false, orderId: null }); setAddPaymentForm({ amount: "", payment_method: "", note: "" }); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Add Payment
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {selectedOrder && (
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="font-oswald text-white">Order #{selectedOrder.order_number}</p>
                  <p className="text-sm text-zinc-400">{getTranslatedField(selectedOrder, 'customer_name')}</p>
                  <div className="flex justify-between mt-2 text-xs">
                    <span className="text-zinc-500">Total: ${(selectedOrder.payment_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span className="text-zinc-500">Balance: ${(selectedOrder.balance_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
              
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                <p className="text-emerald-400 text-sm font-mono">
                  50% deposit required for production. Orders will be marked "Ready to Cut" when 50%+ is paid.
                </p>
              </div>
              
              <div>
                <Label className="font-mono text-xs text-zinc-400">Payment Amount ($) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={addPaymentForm.amount}
                  onChange={(e) => setAddPaymentForm({ ...addPaymentForm, amount: e.target.value })}
                  placeholder="e.g., 500.00"
                  className="bg-zinc-800 border-zinc-700 mt-1 text-lg font-mono"
                  data-testid="payment-amount-input"
                />
              </div>
              
              <div>
                <Label className="font-mono text-xs text-zinc-400">Payment Method</Label>
                <Select
                  value={addPaymentForm.payment_method}
                  onValueChange={(v) => setAddPaymentForm({ ...addPaymentForm, payment_method: v })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1">
                    <SelectValue placeholder="Select method..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="zelle">Zelle</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                    <SelectItem value="wire">Wire Transfer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="font-mono text-xs text-zinc-400">Note (optional)</Label>
                <Input
                  value={addPaymentForm.note}
                  onChange={(e) => setAddPaymentForm({ ...addPaymentForm, note: e.target.value })}
                  placeholder="e.g., Check #1234, Confirmation code, etc."
                  className="bg-zinc-800 border-zinc-700 mt-1"
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={handleAddPayment}
                  disabled={addPaymentLoading || !addPaymentForm.amount}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                  data-testid="confirm-payment-btn"
                >
                  {addPaymentLoading ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Processing...</>
                  ) : (
                    <><DollarSign className="w-4 h-4 mr-1" /> Add Payment</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setAddPaymentModal({ open: false, orderId: null }); setAddPaymentForm({ amount: "", payment_method: "", note: "" }); }}
                  className="flex-1 border-zinc-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Department Table Modal - Shows all orders in a department as a table */}
        <Dialog open={deptTableModal.open} onOpenChange={(open) => { if (!open) { setDeptTableModal({ open: false, deptValue: "", deptLabel: "", orders: [] }); setDeptTableSelectedOrders([]); setDeptTableSearch(""); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden p-3 sm:p-6">
            <DialogHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-2 border-b border-zinc-800 gap-2">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <DialogTitle className="font-oswald uppercase tracking-widest text-base sm:text-lg text-white">
                  {deptTableModal.deptLabel}
                </DialogTitle>
                <Badge className="bg-red-500 text-white border-none text-xs">
                  {deptTableModal.orders.length}
                </Badge>
                {deptTableSelectedOrders.length > 0 && (
                  <Badge className="bg-amber-500 text-black border-none text-xs">
                    {deptTableSelectedOrders.length} Sel
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // If orders are selected, export only those. Otherwise export all.
                    const ordersToExport = deptTableSelectedOrders.length > 0 
                      ? deptTableModal.orders.filter(o => deptTableSelectedOrders.includes(o.id))
                      : deptTableModal.orders;
                    openExportColumnsModal(deptTableModal.deptValue, deptTableModal.deptLabel, ordersToExport);
                  }}
                  className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white text-xs"
                >
                  <Download className="w-3.5 h-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">{deptTableSelectedOrders.length > 0 ? `Export ${deptTableSelectedOrders.length}` : "Export PDF"}</span>
                </Button>
              </div>
            </DialogHeader>
            
            {/* Search Bar */}
            <div className="relative my-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder={t('common.searchPlaceholder', 'Search by order # or customer name...')}
                value={deptTableSearch}
                onChange={(e) => setDeptTableSearch(e.target.value)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 font-mono"
                data-testid="dept-table-search"
              />
              {deptTableSearch && (
                <button
                  onClick={() => setDeptTableSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* Bulk Actions Bar - appears when orders are selected */}
            {deptTableSelectedOrders.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 sm:p-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-amber-400 font-mono text-[10px] sm:text-xs mr-1 sm:mr-2 w-full sm:w-auto">
                  {deptTableSelectedOrders.length} selected:
                </span>
                <Button
                  size="sm"
                  onClick={bulkMarkAsCut}
                  disabled={deptTableBulkLoading}
                  className="h-6 sm:h-7 bg-green-500 hover:bg-green-600 text-white text-[10px] sm:text-xs px-2"
                >
                  <CheckCircle2 className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Mark</span> CUT
                </Button>
                <Button
                  size="sm"
                  onClick={bulkMarkAsWaiting}
                  disabled={deptTableBulkLoading}
                  className="h-6 sm:h-7 bg-yellow-500 hover:bg-yellow-600 text-black text-[10px] sm:text-xs px-2"
                >
                  <Clock className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Mark</span> WAIT
                </Button>
                
                {/* Move to Department Dropdown - Admin sees all, Users see only their departments */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deptTableBulkLoading}
                      className="h-6 sm:h-7 border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white text-[10px] sm:text-xs px-2"
                    >
                      <ArrowRightLeft className="w-3 h-3 sm:mr-1" />
                      <span className="hidden sm:inline">Move to...</span>
                      <span className="sm:hidden">Move</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-800 max-h-60 overflow-y-auto">
                    {DEPARTMENTS
                      .filter(d => d.value !== deptTableModal.deptValue)
                      .filter(d => {
                        // Admin/admin_restricted can move to any department
                        if (isAnyAdmin) return true;
                        // Staff can only move to their assigned departments
                        const userDepts = user?.departments || [user?.department];
                        return userDepts.includes(d.value);
                      })
                      .map(dept => (
                      <DropdownMenuItem 
                        key={dept.value}
                        onClick={() => bulkMoveToDepart(dept.value)}
                        className="text-xs cursor-pointer hover:bg-zinc-800"
                      >
                        <span className={dept.color.split(' ')[0]}>{dept.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                
                {isAnyAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={bulkDeleteFromTable}
                    disabled={deptTableBulkLoading}
                    className="h-6 sm:h-7 border-red-500 text-red-400 hover:bg-red-500 hover:text-white text-[10px] sm:text-xs px-2 sm:ml-auto"
                  >
                    <Trash2 className="w-3 h-3 sm:mr-1" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                )}
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeptTableSelectedOrders([])}
                  className="h-6 sm:h-7 text-zinc-400 hover:text-white text-[10px] sm:text-xs px-2"
                >
                  Clear
                </Button>
              </div>
            )}
            
            <ScrollArea className="h-[calc(90vh-180px)]">
              {/* ========================================================================
                  === SECTION: ORDERS BY PRODUCT TYPE ===
                  Department orders grouped by product type
                  ======================================================================== */}
              <div data-section="dept-orders-by-product-type">
                <h3 className="font-oswald text-xs uppercase tracking-[0.2em] text-white font-bold mb-3 border-b border-zinc-800 pb-2">
                  ORDERS BY PRODUCT TYPE
                </h3>
                
                {(() => {
                  // Filter orders first based on search
                  const filteredOrders = deptTableModal.orders.filter(order => {
                    if (!deptTableSearch) return true;
                    const searchLower = deptTableSearch.toLowerCase();
                    return (
                      order.order_number?.toString().toLowerCase().includes(searchLower) ||
                      order.customer_name?.toLowerCase().includes(searchLower)
                    );
                  });
                  
                  // Group by product type
                  const groups = {};
                  const productOrder = ['rim', 'steering_wheel', 'standard_caps', 'floater_caps', 'xxl_caps', 'dually_floating_caps', 'offroad_floating_caps', 'custom_caps', 'race_car_caps'];
                  
                  filteredOrders.forEach(order => {
                    const type = order.product_type || 'other';
                    if (!groups[type]) groups[type] = [];
                    groups[type].push(order);
                  });
                  
                  // Sort orders within each group by order_number
                  Object.keys(groups).forEach(type => {
                    groups[type].sort((a, b) => (parseInt(a.order_number) || 0) - (parseInt(b.order_number) || 0));
                  });
                  
                  // Build sorted groups array
                  const sortedGroups = [];
                  productOrder.forEach(type => {
                    if (groups[type] && groups[type].length > 0) {
                      sortedGroups.push({
                        type,
                        label: PRODUCT_TYPES[type]?.label || type,
                        color: PRODUCT_TYPES[type]?.color || 'text-zinc-400 border-zinc-400',
                        orders: groups[type]
                      });
                    }
                  });
                  Object.keys(groups).forEach(type => {
                    if (!productOrder.includes(type) && groups[type].length > 0) {
                      sortedGroups.push({
                        type,
                        label: PRODUCT_TYPES[type]?.label || type,
                        color: PRODUCT_TYPES[type]?.color || 'text-zinc-400 border-zinc-400',
                        orders: groups[type]
                      });
                    }
                  });
                  
                  if (filteredOrders.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <p className="text-zinc-500 font-mono">{deptTableSearch ? `No orders matching "${deptTableSearch}"` : 'No orders'}</p>
                      </div>
                    );
                  }
                  
                  return sortedGroups.map((group) => (
                    <div key={group.type} className="mb-4">
                      {/* Product Type Group Header */}
                      <div className={`flex items-center gap-2 px-3 py-2 bg-zinc-800 border-l-4 ${group.color.split(' ')[1] || 'border-zinc-500'} sticky top-0 z-10`}>
                        <Checkbox
                          checked={group.orders.every(o => deptTableSelectedOrders.includes(o.id))}
                          onCheckedChange={() => {
                            const groupIds = group.orders.map(o => o.id);
                            const allSelected = group.orders.every(o => deptTableSelectedOrders.includes(o.id));
                            if (allSelected) {
                              setDeptTableSelectedOrders(prev => prev.filter(id => !groupIds.includes(id)));
                            } else {
                              setDeptTableSelectedOrders(prev => [...new Set([...prev, ...groupIds])]);
                            }
                          }}
                          className="border-amber-500 data-[state=checked]:bg-amber-500"
                        />
                        <span className={`font-oswald text-sm uppercase tracking-wider font-bold ${group.color.split(' ')[0]}`}>
                          {group.label}
                        </span>
                        <span className="bg-zinc-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          {group.orders.length}
                        </span>
                      </div>
                      
                      {/* Mobile Card View for this group */}
                      <div className="sm:hidden space-y-2 mt-2">
                        {group.orders.map((order) => {
                          const isCut = order.cut_status === "cut";
                          const isSelected = deptTableSelectedOrders.includes(order.id);
                          
                          return (
                            <div 
                              key={order.id}
                              className={`p-3 rounded-lg border ${isCut ? 'bg-green-500/10 border-green-500/30' : 'bg-zinc-800/50 border-zinc-700'} ${isSelected ? 'ring-2 ring-amber-500' : ''}`}
                              onClick={() => toggleDeptTableOrderSelection(order.id)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleDeptTableOrderSelection(order.id)}
                                    className="border-amber-500 data-[state=checked]:bg-amber-500"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <div>
                                    <div className="font-mono text-red-500 font-bold text-sm">#{order.order_number}</div>
                                    <div className="font-mono text-white text-sm">{order.customer_name}</div>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeptTableModal({ open: false, deptValue: "", deptLabel: "", orders: [] });
                                    setDeptTableSelectedOrders([]);
                                    openOrderDetail(order.id);
                                  }}
                                  className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                <span className="text-zinc-400 text-[10px]">x{order.quantity || 1}</span>
                                {order.cut_status === "cut" ? (
                                  <Badge className="bg-green-500/20 text-green-400 border-green-500 text-[10px]">
                                    <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                    CUT
                                  </Badge>
                                ) : order.cut_status === "waiting" && (
                                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500 text-[10px]">
                                    WAITING
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Desktop Table View for this group */}
                      <div className="hidden sm:block">
                        <table className="w-full text-sm">
                          <thead className="bg-zinc-900">
                            <tr className="border-2 border-red-500">
                              <th className="px-2 py-1.5 text-center w-10"></th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Order #</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Customer</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Qty</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Status</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Order Date</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-mono text-white font-bold uppercase">Dept Date</th>
                              <th className="px-2 py-1.5 text-center text-[10px] font-mono text-white font-bold uppercase">View</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/50">
                            {group.orders.map((order) => {
                              const deptHistory = order.department_history?.find(h => h.department === order.current_department && !h.completed_at);
                              const deptDate = deptHistory?.started_at ? new Date(deptHistory.started_at).toLocaleDateString() : "-";
                              const isCut = order.cut_status === "cut";
                              const isSelected = deptTableSelectedOrders.includes(order.id);
                              
                              return (
                                <tr 
                                  key={order.id} 
                                  className={`hover:bg-zinc-800/50 ${isCut ? 'bg-green-500/10' : ''} ${isSelected ? 'bg-amber-500/20' : ''}`}
                                >
                                  <td className="px-2 py-2 text-center">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleDeptTableOrderSelection(order.id)}
                                      className="border-amber-500 data-[state=checked]:bg-amber-500"
                                    />
                                  </td>
                                  <td className="px-2 py-2 font-mono text-red-500 font-bold text-xs">{order.order_number}</td>
                                  <td className="px-2 py-2 font-mono text-white text-xs truncate max-w-[150px]">{order.customer_name}</td>
                                  <td className="px-2 py-2 font-mono text-zinc-300 text-xs">{order.quantity || 1}</td>
                                  <td className="px-2 py-2">
                                    <Badge 
                                      className={`text-[10px] cursor-pointer transition-all hover:scale-105 ${isCut ? "bg-green-500/20 text-green-400 border-green-500 hover:bg-green-500/40" : "bg-yellow-500/20 text-yellow-400 border-yellow-500 hover:bg-yellow-500/40"}`}
                                      onClick={() => handleToggleCutStatus(order.id, order.cut_status)}
                                      title="Click to toggle status"
                                    >
                                      {isCut ? "✓ CUT" : "WAITING"}
                                    </Badge>
                                  </td>
                                  <td className="px-2 py-2 font-mono text-zinc-400 text-[10px]">
                                    {new Date(order.order_date).toLocaleDateString()}
                                  </td>
                                  <td className="px-2 py-2 font-mono text-zinc-400 text-[10px]">
                                    {deptDate}
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setDeptTableModal({ open: false, deptValue: "", deptLabel: "", orders: [] });
                                        setDeptTableSelectedOrders([]);
                                        openOrderDetail(order.id);
                                      }}
                                      className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Export Column Selection Modal */}
        <Dialog open={exportColumnsModal.open} onOpenChange={(open) => { if (!open) setExportColumnsModal(prev => ({ ...prev, open: false })); }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-red-500" />
                Export {exportColumnsModal.deptLabel} Report
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <p className="text-sm text-zinc-400 font-mono">
                {t('export.selectColumns', 'Select columns to include in the PDF export:')}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "order_number", label: t('export.orderNumber', 'Order #') },
                  { key: "customer", label: t('export.customer', 'Customer') },
                  { key: "type", label: t('export.type', 'Type') },
                  { key: "size", label: t('export.size', 'Size') },
                  { key: "brand", label: t('export.brand', 'Brand') },
                  { key: "qty", label: t('export.qty', 'Qty') },
                  { key: "specs", label: t('export.specsLabel', 'Specs (PSpecs)') },
                  { key: "department", label: t('export.department', 'Department') },
                  { key: "order_date", label: t('export.orderDate', 'Order Date') },
                  { key: "dept_date", label: t('export.deptDate', 'Dept Date') },
                  { key: "status", label: t('export.status', 'Status') },
                ].map(col => (
                  <div key={col.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`export-col-${col.key}`}
                      checked={exportColumnsModal.selectedColumns?.[col.key] || false}
                      onCheckedChange={() => toggleExportColumn(col.key)}
                      className="border-red-500 data-[state=checked]:bg-red-500"
                    />
                    <Label 
                      htmlFor={`export-col-${col.key}`} 
                      className={`font-mono text-xs ${col.key === 'specs' ? 'text-yellow-400' : 'text-zinc-300'}`}
                    >
                      {col.label}
                    </Label>
                  </div>
                ))}
              </div>
              
              {/* Cap Type Filters - Only show when exporting caps */}
              {exportColumnsModal.orders?.some(o => ["standard_caps", "floater_caps", "xxl_caps", "dually_floating_caps", "offroad_floating_caps", "custom_caps", "race_car_caps"].includes(o.product_type)) && (
                <div className="pt-3 border-t border-zinc-800">
                  <p className="text-sm text-amber-400 font-mono mb-2">
                    Filter by Cap Type:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "standard_caps", label: "Standard Caps" },
                      { key: "floater_caps", label: "Floater Caps" },
                      { key: "xxl_caps", label: "XXL Caps" },
                      { key: "dually_floating_caps", label: "Dually Floating" },
                      { key: "offroad_floating_caps", label: "Off-Road Floating" },
                      { key: "custom_caps", label: "Custom Caps" },
                      { key: "race_car_caps", label: "Tall Caps" },
                    ].filter(ct => exportColumnsModal.orders?.some(o => o.product_type === ct.key)).map(capType => (
                      <div key={capType.key} className="flex items-center gap-2">
                        <Checkbox
                          id={`export-cap-${capType.key}`}
                          checked={exportColumnsModal.selectedCapTypes?.[capType.key] ?? true}
                          onCheckedChange={() => toggleExportCapType(capType.key)}
                          className="border-amber-500 data-[state=checked]:bg-amber-500"
                        />
                        <Label 
                          htmlFor={`export-cap-${capType.key}`} 
                          className="font-mono text-xs text-amber-300"
                        >
                          {capType.label} ({exportColumnsModal.orders?.filter(o => o.product_type === capType.key).length || 0})
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExportColumnsModal(prev => ({
                        ...prev,
                        selectedCapTypes: {
                          standard_caps: true, floater_caps: true, xxl_caps: true, 
                          dually_floating_caps: true, offroad_floating_caps: true, 
                          custom_caps: true, race_car_caps: true
                        }
                      }))}
                      className="text-xs border-amber-700 text-amber-400"
                    >
                      All Caps
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExportColumnsModal(prev => ({
                        ...prev,
                        selectedCapTypes: {
                          standard_caps: true, floater_caps: false, xxl_caps: false, 
                          dually_floating_caps: false, offroad_floating_caps: false, 
                          custom_caps: false, race_car_caps: false
                        }
                      }))}
                      className="text-xs border-amber-700 text-amber-400"
                    >
                      Standard Only
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExportColumnsModal(prev => ({
                        ...prev,
                        selectedCapTypes: {
                          standard_caps: false, floater_caps: true, xxl_caps: false, 
                          dually_floating_caps: false, offroad_floating_caps: false, 
                          custom_caps: false, race_car_caps: false
                        }
                      }))}
                      className="text-xs border-amber-700 text-amber-400"
                    >
                      Floater Only
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Quick presets */}
              <div className="flex gap-2 pt-2 border-t border-zinc-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExportColumnsModal(prev => ({
                    ...prev,
                    selectedColumns: {
                      order_number: true, customer: true, type: true, size: true, brand: true, 
                      qty: true, specs: true, department: true, order_date: true, dept_date: true, status: true
                    }
                  }))}
                  className="text-xs border-zinc-700"
                >
                  {t('export.selectAll', 'Select All')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExportColumnsModal(prev => ({
                    ...prev,
                    selectedColumns: {
                      order_number: true, customer: true, type: true, size: false, brand: false, 
                      qty: true, specs: false, department: true, order_date: true, dept_date: true, status: true
                    }
                  }))}
                  className="text-xs border-zinc-700"
                >
                  {t('export.basicReport', 'Basic Report')}
                </Button>
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={exportWithSelectedColumns}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-oswald uppercase"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setExportColumnsModal(prev => ({ ...prev, open: false }))}
                  className="flex-1 border-zinc-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Attachment Preview Modal */}
        <Dialog open={attachmentPreview.open} onOpenChange={(open) => { if (!open) { setAttachmentPreview({ open: false, url: "", filename: "", type: "" }); setAttachmentError(false); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl max-h-[90vh] overflow-hidden p-0">
            <DialogHeader className="p-4 border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <DialogTitle className="font-oswald uppercase tracking-widest text-lg text-white flex items-center gap-2">
                  <Paperclip className="w-5 h-5 text-green-500" />
                  {attachmentPreview.filename}
                </DialogTitle>
                <div className="flex items-center gap-2">
                  <a
                    href={attachmentPreview.url}
                    download={attachmentPreview.filename}
                    className="flex items-center gap-1 bg-green-500 hover:bg-green-400 text-black px-3 py-1.5 rounded text-xs font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                  <a
                    href={attachmentPreview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-xs font-bold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open in New Tab
                  </a>
                </div>
              </div>
            </DialogHeader>
            <div className="p-4 flex items-center justify-center min-h-[400px] max-h-[calc(90vh-100px)] overflow-auto bg-zinc-950">
              {attachmentError ? (
                <div className="text-center p-8">
                  <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                  <p className="text-red-400 font-mono text-lg mb-2">
                    Attachment Not Found
                  </p>
                  <p className="text-zinc-500 text-sm mb-4">
                    This file may have been deleted or moved. Try uploading it again.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => { setAttachmentPreview({ open: false, url: "", filename: "", type: "" }); setAttachmentError(false); }}
                    className="border-zinc-600 text-zinc-300"
                  >
                    Close
                  </Button>
                </div>
              ) : attachmentPreview.type === "image" ? (
                <img 
                  src={attachmentPreview.url} 
                  alt={attachmentPreview.filename}
                  className="max-w-full max-h-[70vh] object-contain rounded shadow-lg"
                  onError={(e) => {
                    setAttachmentError(true);
                  }}
                />
              ) : attachmentPreview.type === "pdf" ? (
                <iframe
                  src={attachmentPreview.url}
                  title={attachmentPreview.filename}
                  className="w-full h-[70vh] rounded border border-zinc-700"
                  onError={() => setAttachmentError(true)}
                />
              ) : (
                <div className="text-center p-8">
                  <Paperclip className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-400 font-mono">
                    Preview not available for this file type.
                  </p>
                  <p className="text-zinc-500 text-sm mt-2">
                    Click "Download" or "Open in New Tab" to view.
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Customer Lookup Modal */}
        <Dialog open={customerLookup.open} onOpenChange={(open) => {
          if (!open) resetCustomerLookup();
          else setCustomerLookup(prev => ({ ...prev, open }));
        }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="font-oswald uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                <UserSearch className="w-5 h-5" />
                {t('customerLookup.title') || 'Customer / Dealer Lookup'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="flex flex-col flex-1 overflow-hidden space-y-4">
              {/* Search Input */}
              <div className="relative flex-shrink-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  value={customerLookup.search}
                  onChange={(e) => {
                    setCustomerLookup(prev => ({ ...prev, search: e.target.value, selectedCustomer: null, customerOrders: [], stats: null }));
                    searchCustomersForLookup(e.target.value);
                  }}
                  placeholder={t('customerLookup.searchPlaceholder') || "Search customer or dealer name..."}
                  className="pl-10 bg-zinc-950 border-zinc-700 font-mono"
                  data-testid="customer-lookup-search"
                />
              </div>
              
              {/* Suggestions Dropdown - shown when searching and no customer selected */}
              {customerLookup.suggestions.length > 0 && !customerLookup.selectedCustomer && (
                <div className="flex-shrink-0 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-60 overflow-auto">
                  {customerLookup.suggestions.map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => loadCustomerOrders(c.name)}
                      className="w-full px-4 py-3 text-left hover:bg-zinc-700 transition-colors border-b border-zinc-700 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-white">{c.name}</span>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50 text-xs">
                          {c.order_count} {t('customerLookup.orders') || 'orders'}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {/* Loading State */}
              {customerLookup.loading && (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin" />
                </div>
              )}
              
              {/* Customer Orders Results */}
              {customerLookup.selectedCustomer && customerLookup.stats && (
                <div className="flex flex-col flex-1 overflow-hidden space-y-4">
                  {/* Customer Header & Stats */}
                  <div className="flex-shrink-0 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-oswald text-lg text-emerald-400 uppercase tracking-wider">
                        {customerLookup.selectedCustomer}
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={exportCustomerOrdersPDF}
                        className="border-emerald-500 text-emerald-500 hover:bg-emerald-500 hover:text-black font-mono text-xs"
                        data-testid="export-customer-pdf"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Export PDF
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="font-mono text-2xl text-white font-bold">{customerLookup.stats.total}</p>
                        <p className="font-mono text-[10px] text-zinc-500 uppercase">{t('customerLookup.totalOrders') || 'Total Orders'}</p>
                      </div>
                      <div className="text-center">
                        <p className="font-mono text-2xl text-amber-400 font-bold">{customerLookup.stats.active}</p>
                        <p className="font-mono text-[10px] text-zinc-500 uppercase">{t('customerLookup.active') || 'Active'}</p>
                      </div>
                      <div className="text-center">
                        <p className="font-mono text-2xl text-green-400 font-bold">{customerLookup.stats.completed}</p>
                        <p className="font-mono text-[10px] text-zinc-500 uppercase">{t('customerLookup.completed') || 'Completed'}</p>
                      </div>
                      <div className="text-center">
                        <p className="font-mono text-2xl text-red-400 font-bold">{customerLookup.stats.rush}</p>
                        <p className="font-mono text-[10px] text-zinc-500 uppercase">{t('customerLookup.rush') || 'Rush'}</p>
                      </div>
                    </div>
                    
                    {/* Department Breakdown */}
                    <div className="mt-4 pt-4 border-t border-emerald-500/30">
                      <p className="font-mono text-[10px] text-zinc-500 uppercase mb-2">{t('customerLookup.ordersByDepartment') || 'Orders by Department'}:</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(customerLookup.stats.byDepartment || {}).map(([dept, count]) => (
                          <Badge key={dept} className="bg-zinc-800 text-zinc-300 border-zinc-700 text-xs">
                            {t(`departments.${dept}`) || DEPARTMENTS.find(d => d.value === dept)?.label || dept}: {count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Search within Orders */}
                  <div className="flex-shrink-0 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input
                      value={customerLookup.orderSearch}
                      onChange={(e) => setCustomerLookup(prev => ({ ...prev, orderSearch: e.target.value }))}
                      placeholder="Search by order #..."
                      className="pl-10 bg-zinc-950 border-zinc-700 font-mono text-sm"
                      data-testid="customer-order-search"
                    />
                  </div>
                  
                  {/* Orders List - Scrollable */}
                  <div className="flex-1 overflow-auto min-h-0 pr-2">
                    <div className="space-y-2">
                      {customerLookup.customerOrders
                        .filter(order => {
                          if (!customerLookup.orderSearch) return true;
                          const q = customerLookup.orderSearch.toLowerCase();
                          return order.order_number?.toLowerCase().includes(q);
                        })
                        .map((order) => (
                        <div 
                          key={order.id}
                          className={`p-3 rounded border cursor-pointer hover:border-emerald-500/50 transition-colors ${
                            order.current_department === 'completed' 
                              ? 'bg-zinc-800/30 border-zinc-700' 
                              : 'bg-zinc-800/50 border-zinc-700'
                          }`}
                          onClick={() => {
                            setSelectedOrder(order);
                            setCustomerLookup(prev => ({ ...prev, open: false }));
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-red-500 font-bold">#{order.order_number}</span>
                              <Badge className={`${PRODUCT_TYPES[order.product_type]?.color || "text-zinc-400 border-zinc-400"} bg-transparent text-[10px]`}>
                                {t(`products.${order.product_type}`) || PRODUCT_TYPES[order.product_type]?.label || order.product_type}
                              </Badge>
                              {order.is_rush && (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-[10px] animate-pulse">
                                  <Zap className="w-2 h-2 mr-1" /> {t('orders.rush') || 'RUSH'}
                                </Badge>
                              )}
                              {order.is_redo && (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/50 text-[10px] animate-pulse">
                                  <RotateCcw className="w-2 h-2 mr-1" /> {t('orders.redo') || 'RE-DO'}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {order.days_since_order !== null && (
                                <span className={`font-mono text-[10px] ${order.days_since_order > 14 ? 'text-red-400' : order.days_since_order > 7 ? 'text-amber-400' : 'text-zinc-500'}`}>
                                  {order.days_since_order}d
                                </span>
                              )}
                              <Badge className={`text-[10px] ${
                                order.current_department === 'completed' 
                                  ? 'bg-green-500/20 text-green-400 border-green-500/50'
                                  : 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                              }`}>
                                {t(`departments.${order.current_department}`) || DEPARTMENTS.find(d => d.value === order.current_department)?.label || order.current_department}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-zinc-500 font-mono text-[10px]">
                            <span>{t('orders.wheelSpecs') || 'Specs'}: {order.wheel_specs || '-'}</span>
                            <span>{t('common.date') || 'Date'}: {order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}</span>
                            {order.days_since_order !== null && (
                              <span className={order.days_since_order > 14 ? 'text-red-400' : order.days_since_order > 7 ? 'text-amber-400' : ''}>
                                ({order.days_since_order} days ago)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Empty State */}
              {!customerLookup.loading && !customerLookup.selectedCustomer && customerLookup.search.length < 2 && (
                <div className="text-center py-8">
                  <UserSearch className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-400 font-mono text-sm">Enter a customer or dealer name to search</p>
                  <p className="text-zinc-500 font-mono text-xs mt-2">View all orders and their current department status</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
