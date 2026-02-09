// Dashboard Shared Components - Extracted from DashboardPage.jsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronRight, Phone, Clock, AlertTriangle, Zap, RotateCcw,
  Scissors, DollarSign
} from "lucide-react";
import { 
  DEPT_COLORS, DEPT_BG_COLORS, PRODUCT_COLORS, RIM_SIZE_COLORS, 
  CAP_TYPES, LALO_STATUSES, TireIcon, SteeringWheelIcon 
} from "./constants";

// Payment status colors
export const PAYMENT_STATUS_COLORS = {
  unpaid: "bg-red-500/20 text-red-400 border-red-500",
  deposit: "bg-yellow-500/20 text-yellow-400 border-yellow-500",
  paid_in_full: "bg-green-500/20 text-green-400 border-green-500"
};

export const PAYMENT_STATUS_LABELS = {
  unpaid: "Unpaid",
  deposit: "Deposit",
  paid_in_full: "Paid"
};

// Production priority colors and labels
export const PRODUCTION_PRIORITY_COLORS = {
  waiting_deposit: "bg-red-500/20 text-red-400 border-red-500",
  ready_production: "bg-emerald-500/20 text-emerald-400 border-emerald-500",
  fully_paid: "bg-green-500/20 text-green-400 border-green-500"
};

export const PRODUCTION_PRIORITY_LABELS = {
  waiting_deposit: "Waiting Deposit",
  ready_production: "Ready to Cut",
  fully_paid: "Fully Paid"
};

// Order Card Component - Displays a single order in the department column
export const OrderCard = ({ 
  order, 
  dept, 
  DEPARTMENTS,
  PRODUCT_TYPES,
  isAdmin,
  hasSalesAccess,
  onOrderClick,
  onAdvance,
  onToggleCut,
  getTranslatedField,
  t,
  advancingOrder
}) => {
  const deptIndex = DEPARTMENTS.findIndex(d => d.value === dept.value);
  const nextDept = DEPARTMENTS[deptIndex + 1];
  const isCap = CAP_TYPES.includes(order.product_type);
  const isSteeringWheel = order.product_type === "steering_wheel";
  
  // Calculate days in current department
  const calculateDaysInDept = () => {
    const history = order.department_history || [];
    const currentDeptEntry = history.find(h => h.department === order.current_department && !h.completed_at);
    if (currentDeptEntry) {
      const startDate = new Date(currentDeptEntry.started_at);
      const now = new Date();
      const diffTime = Math.abs(now - startDate);
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    return 0;
  };
  
  const daysInDept = calculateDaysInDept();
  
  return (
    <div
      className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2.5 cursor-pointer group relative overflow-hidden"
      onClick={() => onOrderClick(order)}
      data-testid={`order-card-${order.id}`}
    >
      {/* Rush/Redo/Hold Indicators */}
      {order.is_rush && (
        <div className="absolute top-0 right-0 w-0 h-0 border-t-[24px] border-t-orange-500 border-l-[24px] border-l-transparent" />
      )}
      {order.is_redo && (
        <div className="absolute top-0 left-0 w-0 h-0 border-t-[24px] border-t-purple-500 border-r-[24px] border-r-transparent" />
      )}
      
      <div className="flex flex-col gap-1.5">
        {/* Order Number & Customer */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-bold text-white">
            #{order.order_number}
          </span>
          <Badge className={`text-[9px] h-4 px-1 ${PRODUCT_COLORS[order.product_type] || "text-zinc-400"} bg-transparent border`}>
            {PRODUCT_TYPES[order.product_type] || order.product_type}
          </Badge>
        </div>
        
        <div className="text-sm font-bold text-white truncate">
          {getTranslatedField(order, 'customer_name')}
        </div>
        
        {/* Phone */}
        {order.phone && (
          <div className="flex items-center gap-1 text-green-400 text-xs">
            <Phone className="w-3 h-3" />
            <span>{order.phone}</span>
          </div>
        )}
        
        {/* Badges Row 1 */}
        <div className="flex flex-wrap gap-1 mt-1">
          {/* Days Badge */}
          <Badge className="bg-zinc-800 text-zinc-300 text-[9px] h-4 px-1.5 font-bold border border-zinc-700">
            <Clock className="w-2.5 h-2.5 mr-0.5" />
            {daysInDept}d
          </Badge>
          
          {/* Rim Size */}
          {order.rim_size && (
            <Badge className={`text-[9px] h-4 px-1 border ${RIM_SIZE_COLORS[order.rim_size] || "bg-zinc-800 text-zinc-400"}`}>
              {order.rim_size}&quot;
            </Badge>
          )}
          
          {/* Tires Indicator */}
          {order.has_tires && (
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500 text-[9px] h-4 px-1">
              <TireIcon className="w-2.5 h-2.5" />
            </Badge>
          )}
          
          {/* Steering Wheel Indicator */}
          {order.has_steering_wheel && (
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500 text-[9px] h-4 px-1">
              <SteeringWheelIcon className="w-2.5 h-2.5" />
            </Badge>
          )}
        </div>
        
        {/* Badges Row 2 - Status Indicators */}
        <div className="flex flex-wrap gap-1">
          {/* Rush */}
          {order.is_rush && (
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500 text-[9px] h-4 px-1">
              <Zap className="w-2.5 h-2.5 mr-0.5" />
              RUSH
            </Badge>
          )}
          
          {/* Redo */}
          {order.is_redo && (
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500 text-[9px] h-4 px-1">
              <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
              REDO
            </Badge>
          )}
          
          {/* On Hold */}
          {order.is_on_hold && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500 text-[9px] h-4 px-1">
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              HOLD
            </Badge>
          )}
          
          {/* CUT Status */}
          {(isSteeringWheel || isCap) && order.cut_status === "cut" && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500 text-[9px] h-4 px-1">
              <Scissors className="w-2.5 h-2.5 mr-0.5" />
              CUT
            </Badge>
          )}
          
          {/* Production Priority - Show when payment total is set */}
          {order.payment_total > 0 && order.production_priority && (
            <Badge className={`text-[9px] h-4 px-1 border ${PRODUCTION_PRIORITY_COLORS[order.production_priority] || PRODUCTION_PRIORITY_COLORS.waiting_deposit}`}>
              <DollarSign className="w-2.5 h-2.5 mr-0.5" />
              {order.percentage_paid ? `${Math.round(order.percentage_paid)}%` : "0%"}
            </Badge>
          )}
        </div>
        
        {/* Advance Button */}
        {nextDept && !order.is_on_hold && (isAdmin || hasSalesAccess) && (
          <Button
            size="sm"
            className={`w-full mt-2 h-6 text-[10px] font-bold ${DEPT_BG_COLORS[nextDept.value]} text-white`}
            onClick={(e) => {
              e.stopPropagation();
              onAdvance(order.id, nextDept.value);
            }}
            disabled={advancingOrder === order.id}
            data-testid={`advance-btn-${order.id}`}
          >
            {advancingOrder === order.id ? "..." : (
              <>
                <ChevronRight className="w-3 h-3 mr-0.5" />
                {nextDept.label}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

// Stat Card Component - Shows count for a category
export const StatCard = ({ 
  title, 
  count, 
  icon: Icon, 
  colorClass = "text-red-500",
  bgClass = "bg-red-500/10",
  onClick 
}) => (
  <div 
    className={`${bgClass} border border-zinc-800 rounded-lg p-3 cursor-pointer hover:border-zinc-700 transition-colors`}
    onClick={onClick}
    data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`w-4 h-4 ${colorClass}`} />}
        <span className="text-xs text-zinc-400 uppercase tracking-wider">{title}</span>
      </div>
      <span className={`text-xl font-bold ${colorClass}`}>{count}</span>
    </div>
  </div>
);

// Department Header Component
export const DepartmentHeader = ({ 
  dept, 
  count, 
  productCounts,
  PRODUCT_TYPES,
  onClick,
  onTableClick 
}) => (
  <div 
    className="flex items-center justify-between mb-2 cursor-pointer"
    onClick={onClick}
    data-testid={`dept-header-${dept.value}`}
  >
    <div className="flex items-center gap-2">
      <h3 className={`font-oswald text-sm uppercase tracking-wider ${DEPT_COLORS[dept.value]}`}>
        {dept.label}
      </h3>
      <Badge className="bg-red-500 text-white text-[10px] h-5 px-1.5 font-bold">
        {count}
      </Badge>
    </div>
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-zinc-500 hover:text-white"
      onClick={(e) => {
        e.stopPropagation();
        onTableClick();
      }}
      data-testid={`dept-table-btn-${dept.value}`}
    >
      <ChevronRight className="w-4 h-4" />
    </Button>
  </div>
);

export default { OrderCard, StatCard, DepartmentHeader };
