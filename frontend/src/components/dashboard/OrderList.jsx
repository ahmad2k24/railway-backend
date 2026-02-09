// Dashboard Order List Component - Department Columns with Orders
import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
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
import { 
  ChevronRight, ChevronUp, ChevronDown, Download, 
  CheckCircle2, Plus, Eye, Paperclip, Trash2,
  Phone, MessageSquare, Zap, AlertTriangle, RotateCcw,
  ArrowRightLeft, Scissors, Circle, Plane, User, Wrench, DollarSign
} from "lucide-react";
import { 
  DEPT_COLORS, DEPT_BG_COLORS, PRODUCT_COLORS, RIM_SIZE_COLORS, 
  CAP_TYPES, LALO_STATUSES, TireIcon, SteeringWheelIcon 
} from "./constants";

// Responsive Order Card Component - Mobile Optimized
const ResponsiveOrderCard = ({
  order,
  department,
  nextDept,
  isLastDept,
  canAdvance,
  isAdmin,
  isAdminRestricted,
  hasMultipleDepartments,
  movableDepartments,
  bulkEditMode,
  isSelected,
  DEPARTMENTS,
  PRODUCT_TYPES,
  DEPT_MAP,
  onAdvance,
  onMove,
  onReorder,
  onUploadAttachment,
  onDeleteOrder,
  onOpenDetail,
  onToggleCutStatus,
  onToggleTires,
  onToggleSteeringWheel,
  onSendToLalo,
  onToggleSelection,
  onOpenAttachmentPreview,
  getTranslatedField,
  getAttachmentUrl,
  isNewOrder,
  salespeople,
  t
}) => {
  const productInfo = PRODUCT_TYPES[order.product_type] || { label: order.product_type, color: "text-zinc-400 border-zinc-400" };
  const isCapOrder = CAP_TYPES.includes(order.product_type);
  const isSteeringWheel = order.product_type === "steering_wheel";
  const showCutStatus = isCapOrder || isSteeringWheel;
  const isRim = order.product_type === "rim";
  const orderIsNew = isNewOrder && isNewOrder(order);
  
  // Get the timestamp when order arrived at current department
  const currentDeptHistory = order.department_history?.find(
    h => h.department === order.current_department && !h.completed_at
  );
  const arrivedAt = currentDeptHistory?.started_at 
    ? new Date(currentDeptHistory.started_at).toLocaleString()
    : null;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadAttachment(order.id, file);
    }
  };

  // Build card classes - RUSH orders get special highlighting
  const cardClasses = [
    "order-card p-2 sm:p-4 md:p-5 rounded-sm",
    isSelected && "ring-2 ring-amber-500",
    order.has_tires && "ring-2 ring-cyan-400",
    order.has_steering_wheel && "ring-2 ring-purple-400",
    order.is_rush && "ring-2 ring-red-500 rush-glow"
  ].filter(Boolean).join(" ");

  return (
    <div className={cardClasses} data-testid={`order-card-${order.id}`}>
      {/* RUSH banner at top if is rush - HIGH CONTRAST white background */}
      {order.is_rush && (
        <div className="bg-white border-2 border-black rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 mb-2 sm:mb-3 flex items-center justify-center gap-1 sm:gap-2 shadow-lg">
          <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
          <span className="font-mono text-sm sm:text-base text-red-600 uppercase font-black tracking-wider">{t('rush.title')}!</span>
          <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
        </div>
      )}
      
      {/* Tires banner */}
      {order.has_tires && (
        <div className="bg-cyan-500 border border-cyan-400 rounded px-2 sm:px-3 py-1 sm:py-1.5 mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2">
          <TireIcon className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
          <span className="font-mono text-[10px] sm:text-xs text-white uppercase font-bold">{t('orders.tiresNeeded')}</span>
        </div>
      )}
      
      {/* Steering Wheel banner */}
      {order.has_steering_wheel && (
        <div className="bg-purple-500 border border-purple-400 rounded px-2 sm:px-3 py-1 sm:py-1.5 mb-2 sm:mb-3 flex items-center gap-1 sm:gap-2">
          <SteeringWheelIcon className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
          <span className="font-mono text-[10px] sm:text-xs text-white uppercase font-bold">{t('orders.steeringWheelNeeded')}</span>
        </div>
      )}
      
      {/* CUT STATUS BANNER - Large prominent display for caps & steering wheels */}
      {showCutStatus && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onToggleCutStatus(order.id, order.cut_status);
          }}
          className={`cursor-pointer rounded-lg px-3 py-2 mb-2 sm:mb-3 flex items-center justify-center gap-2 transition-colors hover:opacity-90 ${
            order.cut_status === "cut" 
              ? "bg-green-500 border-2 border-green-400" 
              : "bg-white border-2 border-black"
          }`}
        >
          {order.cut_status === "cut" ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-white" />
              <span className="font-mono text-sm sm:text-base text-white uppercase font-bold tracking-wider">
                {t('cutStatus.cut')}
              </span>
            </>
          ) : (
            <>
              <Circle className="w-5 h-5 text-black" />
              <span className="font-mono text-sm sm:text-base text-black uppercase font-bold tracking-wider">
                {t('cutStatus.waiting')}
              </span>
            </>
          )}
        </div>
      )}
      
      {/* Bulk edit checkbox */}
      {bulkEditMode && (
        <div className="flex items-center mb-2 sm:mb-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(order.id)}
            className="border-white data-[state=checked]:bg-white data-[state=checked]:text-red-500 mr-2 sm:mr-3"
          />
          <span className="text-[9px] sm:text-[10px] text-white font-mono uppercase">
            {isSelected ? t('bulk.selected') : t('bulk.clickToSelect')}
          </span>
        </div>
      )}
      
      {/* Main content - clickable */}
      <div 
        className="cursor-pointer" 
        onClick={() => bulkEditMode ? onToggleSelection(order.id) : onOpenDetail(order.id)}
        data-testid={`open-order-${order.id}`}
      >
        <div className="flex items-start justify-between mb-2 sm:mb-3">
          <div className="flex-1 min-w-0 pr-2 sm:pr-3">
            {/* Order number and product type badge */}
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap mb-1 sm:mb-1.5">
              <div className="bg-black px-3 py-1 rounded-xl shadow-lg">
                <p className="font-mono text-lg sm:text-xl md:text-2xl font-black text-white leading-tight tracking-wide" data-testid={`order-number-${order.id}`}>
                  {order.order_number}
                </p>
              </div>
              {/* NEW badge */}
              {orderIsNew && (
                <Badge className="bg-white text-red-500 border-none text-[8px] sm:text-[9px] px-1.5 py-0.5 font-bold uppercase">
                  {t('notifications.new')}
                </Badge>
              )}
              <Badge
                className={`text-white text-[9px] sm:text-[10px] md:text-xs px-1.5 sm:px-2 py-0.5 flex items-center gap-0.5 sm:gap-1 font-bold ${
                  order.product_type === "rim" ? "bg-cyan-500 border-cyan-400" :
                  order.product_type === "steering_wheel" ? "bg-violet-500 border-violet-400" :
                  order.product_type === "standard_caps" ? "bg-amber-500 border-amber-400" :
                  order.product_type === "floater_caps" ? "bg-emerald-500 border-emerald-400" :
                  order.product_type === "xxl_caps" ? "bg-pink-500 border-pink-400" :
                  order.product_type === "dually_floating_caps" ? "bg-indigo-500 border-indigo-400" :
                  order.product_type === "offroad_floating_caps" ? "bg-lime-500 border-lime-400" :
                  order.product_type === "race_car_caps" ? "bg-white border-black text-black" :
                  order.product_type === "custom_caps" ? "bg-fuchsia-500 border-fuchsia-400" :
                  "bg-gray-500 border-gray-400"
                }`}
              >
                {order.product_type === "steering_wheel" && <SteeringWheelIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                {order.product_type === "rim" && <TireIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                <span className="hidden sm:inline">{productInfo.label}</span>
                <span className="sm:hidden">{productInfo.label.substring(0, 3)}</span>
              </Badge>
              {order.quantity > 1 && (
                <Badge className="bg-purple-500 text-white border-purple-400 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 font-bold">
                  x{order.quantity}
                </Badge>
              )}
              {/* Rim size with color coding */}
              {order.rim_size && (
                <Badge className="bg-blue-600 text-white border-blue-500 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 font-bold">
                  {order.rim_size_rear && order.rim_size_rear !== order.rim_size 
                    ? `${order.rim_size}"/${order.rim_size_rear}"`
                    : `${order.rim_size}"`
                  }
                </Badge>
              )}
            </div>
            
            {/* Secondary badges row */}
            {(order.has_tires || order.has_steering_wheel || order.is_rush || order.on_hold || (order.lalo_status && order.lalo_status !== "not_sent") || order.sold_by || (order.payment_total > 0 && order.production_priority)) && (
              <div className="flex items-center gap-1 flex-wrap mb-1.5">
                {/* Payment/Production Priority Badge */}
                {order.payment_total > 0 && order.production_priority && (
                  <Badge className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 flex items-center gap-1 font-bold ${
                    order.production_priority === "fully_paid" ? "bg-green-500 text-white border-green-400" :
                    order.production_priority === "ready_production" ? "bg-emerald-500 text-white border-emerald-400" :
                    "bg-white/20 text-white border-white/40"
                  }`}>
                    <DollarSign className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    {order.percentage_paid ? `${Math.round(order.percentage_paid)}%` : "0%"}
                  </Badge>
                )}
                {order.has_tires && (
                  <Badge className="bg-cyan-500 text-white border-cyan-400 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 flex items-center gap-1 font-bold">
                    <TireIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span className="hidden sm:inline">{t('orders.tiresNeeded')}</span>
                    <span className="sm:hidden">TIRES</span>
                  </Badge>
                )}
                {order.has_steering_wheel && (
                  <Badge className="bg-purple-500 text-white border-purple-400 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 flex items-center gap-1 font-bold">
                    <SteeringWheelIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span className="hidden sm:inline">{t('orders.steeringWheelNeeded')}</span>
                    <span className="sm:hidden">SW</span>
                  </Badge>
                )}
                {order.is_rush && (
                  <Badge className="bg-white text-red-600 border-2 border-black text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 flex items-center gap-1 font-black shadow-sm">
                    <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    {t('rush.title')}
                  </Badge>
                )}
                {order.on_hold && (
                  <Badge className="bg-yellow-500 text-black border-yellow-400 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 flex items-center gap-1 font-bold">
                    <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span className="hidden sm:inline">{t('hold.onHold')}</span>
                    <span className="sm:hidden">HOLD</span>
                  </Badge>
                )}
                {order.lalo_status && order.lalo_status !== "not_sent" && (
                  <Badge className="bg-amber-500 text-black border-amber-400 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 flex items-center gap-1">
                    <Plane className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span className="hidden sm:inline">{LALO_STATUSES[order.lalo_status]?.label || order.lalo_status}</span>
                    <span className="sm:hidden">LALO</span>
                  </Badge>
                )}
                {order.sold_by && salespeople?.length > 0 && (() => {
                  const salesperson = salespeople.find(sp => sp.id === order.sold_by);
                  if (salesperson) {
                    return (
                      <Badge className="bg-emerald-500 text-white border-emerald-400 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 flex items-center gap-1" data-testid={`salesperson-badge-${order.id}`}>
                        <User className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        <span className="hidden sm:inline">{salesperson.name}</span>
                        <span className="sm:hidden">{salesperson.name.split(' ')[0]}</span>
                      </Badge>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
            
            <p className="font-mono text-sm sm:text-base md:text-lg text-white leading-snug font-black" data-testid={`order-customer-${order.id}`}>
              {getTranslatedField(order, 'customer_name')}
            </p>
            {order.phone && (
              <p className="font-mono text-xs sm:text-sm text-black font-bold mt-1 flex items-center gap-1.5">
                <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                {order.phone}
              </p>
            )}
          </div>
        </div>
        
        <p className="font-mono text-sm md:text-base text-white font-bold mb-3 leading-relaxed">
          {getTranslatedField(order, 'wheel_specs')}
        </p>
        
        {/* Admin Notes */}
        {order.notes && (
          <div className="bg-yellow-400 rounded-lg px-3 py-2 mb-3 border-2 border-yellow-500">
            <p className="font-mono text-[10px] text-black uppercase tracking-wider mb-1 font-bold">{t('orders.adminNotes')}</p>
            <p className="font-mono text-xs text-black font-semibold line-clamp-2">{getTranslatedField(order, 'notes')}</p>
          </div>
        )}
        
        {/* Notes indicator */}
        {order.order_notes && order.order_notes.length > 0 && (
          <div className="bg-yellow-400 rounded-lg px-3 py-2 mb-3 flex items-center gap-2 border-2 border-yellow-500">
            <MessageSquare className="w-5 h-5 text-black" />
            <span className="font-mono text-sm text-black font-black">{order.order_notes.length} {t('common.notes').toLowerCase()}</span>
          </div>
        )}
      </div>

      {/* Attachment Section */}
      <div className="mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {order.attachments && order.attachments.length > 0 ? (
            <>
              {order.attachments.slice(0, 2).map((att, index) => (
                <div key={att.id || index} className="flex items-center gap-1.5 bg-green-500 border border-green-400 px-2.5 py-1.5 rounded text-xs">
                  <Paperclip className="w-3.5 h-3.5 text-white" />
                  <span className="text-white font-bold truncate max-w-[100px]" title={att.name}>
                    {att.name}
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onOpenAttachmentPreview(att.url, att.name, att.content_type); }}
                    className="flex items-center gap-0.5 bg-white hover:bg-white/80 text-green-600 px-2 py-1 rounded text-[10px] font-bold"
                    title="Preview"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {order.attachments.length > 2 && (
                <Badge className="bg-green-500 text-white border-green-400 text-[9px] font-bold">
                  +{order.attachments.length - 2} more
                </Badge>
              )}
            </>
          ) : order.attachment_url ? (
            <div className="flex items-center gap-1 bg-green-500 border border-green-400 px-2 py-1 rounded text-[10px]">
              <Paperclip className="w-3 h-3 text-white" />
              <span className="text-white font-bold truncate max-w-[50px]" title={order.attachment_name}>
                {order.attachment_name}
              </span>
              <button 
                onClick={(e) => { e.stopPropagation(); onOpenAttachmentPreview(order.attachment_url, order.attachment_name); }}
                className="flex items-center gap-0.5 bg-white hover:bg-white/80 text-green-600 px-1.5 py-0.5 rounded text-[9px] font-bold"
              >
                <Eye className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : null}
          
          <label className="flex items-center gap-1 bg-green-500/80 hover:bg-green-500 px-2 py-1 rounded text-[10px] text-white font-bold cursor-pointer transition-colors border border-green-400 border-dashed"
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="w-3 h-3" />
            <span>{(order.attachments?.length > 0 || order.attachment_url) ? t('common.add') : t('orders.addFile')}</span>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileSelect}
              className="hidden"
              data-testid={`upload-attachment-${order.id}`}
            />
          </label>
        </div>
      </div>
      
      {/* Footer with dates and action buttons - Two-tone dark section */}
      <div className="bg-black/90 -mx-2 sm:-mx-4 md:-mx-5 -mb-2 sm:-mb-4 md:-mb-5 px-2 sm:px-4 md:px-5 py-3 mt-3 rounded-xl">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            {(() => {
              const orderDate = new Date(order.order_date);
              const today = new Date();
              const diffTime = Math.abs(today - orderDate);
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
              const dateColor = diffDays >= 45 ? "text-red-500" : "text-green-400";
              return (
                <>
                  <p className="font-mono text-sm sm:text-base text-white font-black">
                    Order Date: <span className={dateColor}>{new Date(order.order_date).toLocaleDateString()}</span>
                  </p>
                  <div className={`px-3 py-1.5 rounded text-sm font-black font-mono ${
                    diffDays >= 45 ? "bg-red-500 text-white" : "bg-green-600 text-white"
                  }`}>
                    {diffDays === 0 ? t('common.today').toUpperCase() : diffDays === 1 ? `1 ${t('common.days').toUpperCase().slice(0, -1)}` : `${diffDays} ${t('common.days').toUpperCase()}`}
                  </div>
                </>
              );
            })()}
          </div>
          
          {arrivedAt && (
            <p className="font-mono text-sm sm:text-base text-white font-black">
              {t('orders.arrived')}: {arrivedAt}
            </p>
          )}
          
          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 mt-1">
            <div className="flex items-center gap-2">
              {canAdvance && (
                <Button
                  size="sm"
                  onClick={() => onAdvance(order.id)}
                  className={`h-7 px-3 font-oswald uppercase tracking-wider text-[10px] font-bold text-white ${
                    isLastDept 
                      ? 'bg-green-600 hover:bg-green-500' 
                      : order.current_department === 'machine_waiting'
                        ? 'bg-orange-500 hover:bg-orange-400'
                        : (DEPT_BG_COLORS[nextDept?.value] || 'bg-violet-500 hover:bg-violet-400')
                  }`}
                  data-testid={`advance-order-${order.id}`}
                  title={nextDept ? `Move to ${nextDept.label}` : 'Complete order'}
                >
                  {isLastDept ? (
                    <><CheckCircle2 className="w-3 h-3 mr-1" /> {t('common.complete')}</>
                  ) : order.current_department === 'machine_waiting' ? (
                    <><Wrench className="w-3 h-3 mr-1" /> Push to Machine</>
                  ) : (
                    <><ChevronRight className="w-3 h-3 mr-1" /> {nextDept?.label || t('common.done')}</>
                  )}
                </Button>
              )}
              
              {/* Move button for multi-department staff */}
              {!isAdmin && !isAdminRestricted && hasMultipleDepartments && movableDepartments.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 bg-gray-600 border-gray-500 text-white hover:bg-gray-500 text-[10px] font-bold"
                      data-testid={`move-order-${order.id}`}
                    >
                      <ArrowRightLeft className="w-3 h-3 mr-1" />
                      {t('orders.moveOrder').split(' ')[0]}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-800 w-40">
                    <DropdownMenuItem className="text-xs text-zinc-300 font-mono" disabled>
                      {t('orders.moveTo')}:
                    </DropdownMenuItem>
                    {movableDepartments.map((d) => (
                      <DropdownMenuItem 
                        key={d.value} 
                        className="text-xs cursor-pointer hover:bg-zinc-800"
                        onClick={() => onMove(order.id, d.value)}
                      >
                        {d.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              
              {/* Admin actions dropdown */}
              {(isAdmin || isAdminRestricted) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 bg-gray-600 border-gray-500 text-white hover:bg-gray-500 text-[10px] font-bold"
                      data-testid={`actions-order-${order.id}`}
                    >
                      {t('common.actions')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-800 w-48">
                    {isRim && (
                      <>
                        <DropdownMenuItem 
                          className={`text-xs cursor-pointer hover:bg-zinc-800 ${order.has_tires ? 'text-cyan-400' : 'text-zinc-300'}`}
                          onClick={() => onToggleTires(order.id)}
                        >
                          <TireIcon className="w-3 h-3 mr-2" />
                          {order.has_tires ? t('orders.hasTires') : t('orders.hasTires')}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className={`text-xs cursor-pointer hover:bg-zinc-800 ${order.has_steering_wheel ? 'text-purple-400' : 'text-zinc-300'}`}
                          onClick={() => onToggleSteeringWheel && onToggleSteeringWheel(order.id)}
                        >
                          <SteeringWheelIcon className="w-3 h-3 mr-2" />
                          {order.has_steering_wheel ? t('orders.hasSteeringWheel') : t('orders.hasSteeringWheel')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-zinc-700" />
                      </>
                    )}
                    {(!order.lalo_status || order.lalo_status === "not_sent") ? (
                      <DropdownMenuItem 
                        className="text-xs cursor-pointer hover:bg-zinc-800 text-amber-400"
                        onClick={() => onSendToLalo(order.id, "shipped_to_lalo")}
                      >
                        <Plane className="w-3 h-3 mr-2" />
                        Send to Lalo
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem 
                        className="text-xs cursor-pointer hover:bg-zinc-800 text-zinc-400"
                        onClick={() => onSendToLalo(order.id, "not_sent")}
                      >
                        <Plane className="w-3 h-3 mr-2" />
                        Remove from Lalo
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    <DropdownMenuItem className="text-xs text-zinc-300 font-mono" disabled>
                      Move to Department:
                    </DropdownMenuItem>
                    {DEPARTMENTS.map((d) => (
                      <DropdownMenuItem 
                        key={d.value} 
                        className="text-xs cursor-pointer hover:bg-zinc-800"
                        onClick={() => onMove(order.id, d.value)}
                      >
                        {d.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem 
                          className="text-xs text-red-500 cursor-pointer hover:bg-red-500/10"
                          onSelect={(e) => e.preventDefault()}
                          data-testid={`delete-order-${order.id}`}
                        >
                          <Trash2 className="w-3 h-3 mr-2" />
                          Delete Order
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-oswald uppercase tracking-widest text-white">
                            Delete Order?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="font-mono text-zinc-400">
                            Are you sure you want to permanently delete order <span className="text-red-500">{order.order_number}</span>? 
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDeleteOrder(order.id, order.order_number)}
                            className="bg-red-500 hover:bg-red-600 text-white"
                          >
                            Delete Permanently
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Department Column Component
const DepartmentColumn = ({ 
  department, 
  orders, 
  onAdvance, 
  onMove, 
  onReorder, 
  onUploadAttachment, 
  onDeleteAttachment, 
  onDeleteOrder, 
  onOpenDetail, 
  onToggleCutStatus, 
  onToggleTires, 
  onToggleSteeringWheel, 
  onSendToLalo, 
  isAdmin, 
  isAdminRestricted, 
  userDepartments, 
  deptCount, 
  onExportPDF, 
  onOpenDeptTable, 
  bulkEditMode, 
  selectedOrders, 
  onToggleOrderSelection, 
  onSelectAllInDept, 
  DEPARTMENTS, 
  PRODUCT_TYPES, 
  DEPT_MAP, 
  t, 
  getTranslatedField, 
  getAttachmentUrl, 
  onOpenAttachmentPreview, 
  isNewOrder, 
  salespeople 
}) => {
  const deptIndex = DEPARTMENTS.findIndex(d => d.value === department.value);
  const nextDept = DEPARTMENTS[deptIndex + 1];
  const isLastDept = department.value === "shipped" || !nextDept;
  const canAdvanceInThisDept = isAdmin || isAdminRestricted || userDepartments?.includes(department.value);
  const hasMultipleDepartments = userDepartments && userDepartments.length > 1;
  const movableDepartments = hasMultipleDepartments 
    ? DEPARTMENTS.filter(d => userDepartments.includes(d.value) && d.value !== department.value)
    : [];

  return (
    <div 
      className="department-column min-h-[400px] md:min-h-[600px] relative"
      data-testid={`dept-column-${department.value}`}
    >
      {/* Department Header */}
      <div className="mb-2 sm:mb-3 px-2 sm:px-4 pt-3 sm:pt-4 sticky top-0 z-10">
        <div className="flex items-center justify-between bg-white border-2 border-red-500 rounded-lg px-3 py-2">
          <div 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => onOpenDeptTable(department.value, department.label, orders)}
          >
            <h3 className={`font-oswald text-xs sm:text-sm uppercase tracking-wider font-bold ${DEPT_COLORS[department.value]}`}>
              {department.label}
            </h3>
            <Badge className="bg-red-500 text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 font-bold">
              {orders.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {/* Bulk select toggle for this department */}
            {bulkEditMode && orders.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectAllInDept(orders)}
                className="h-6 sm:h-7 px-1.5 sm:px-2 text-amber-500 hover:bg-amber-500/10 text-[9px] sm:text-[10px]"
              >
                {orders.every(o => selectedOrders.includes(o.id)) ? "Deselect All" : "Select All"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onExportPDF(department.value, department.label, orders)}
              className="h-6 sm:h-7 w-6 sm:w-7 p-0 text-zinc-400 hover:text-red-500"
              title={t('common.exportPDF')}
            >
              <Download className="w-3 h-3 sm:w-4 sm:h-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Orders List */}
      <ScrollArea className="h-[350px] sm:h-[450px] md:h-[550px] px-2 sm:px-4">
        <div className="space-y-2 sm:space-y-3 pb-4">
          {orders.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 font-mono text-xs sm:text-sm">
              {t('dashboard.noOrders')}
            </div>
          ) : (
            orders.map((order) => (
              <ResponsiveOrderCard
                key={order.id}
                order={order}
                department={department}
                nextDept={nextDept}
                isLastDept={isLastDept}
                canAdvance={canAdvanceInThisDept}
                isAdmin={isAdmin}
                isAdminRestricted={isAdminRestricted}
                hasMultipleDepartments={hasMultipleDepartments}
                movableDepartments={movableDepartments}
                bulkEditMode={bulkEditMode}
                isSelected={selectedOrders.includes(order.id)}
                DEPARTMENTS={DEPARTMENTS}
                PRODUCT_TYPES={PRODUCT_TYPES}
                DEPT_MAP={DEPT_MAP}
                onAdvance={onAdvance}
                onMove={onMove}
                onReorder={onReorder}
                onUploadAttachment={onUploadAttachment}
                onDeleteOrder={onDeleteOrder}
                onOpenDetail={onOpenDetail}
                onToggleCutStatus={onToggleCutStatus}
                onToggleTires={onToggleTires}
                onToggleSteeringWheel={onToggleSteeringWheel}
                onSendToLalo={onSendToLalo}
                onToggleSelection={onToggleOrderSelection}
                onOpenAttachmentPreview={onOpenAttachmentPreview}
                getTranslatedField={getTranslatedField}
                getAttachmentUrl={getAttachmentUrl}
                isNewOrder={isNewOrder}
                salespeople={salespeople}
                t={t}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

// Main Order List Component - Grid of Department Columns
export const OrderList = ({
  orders,
  stats,
  loading,
  isAdmin,
  isAdminRestricted,
  userDepartments,
  bulkEditMode,
  selectedOrders,
  DEPARTMENTS,
  PRODUCT_TYPES,
  DEPT_MAP,
  salespeople,
  onAdvance,
  onMove,
  onReorder,
  onUploadAttachment,
  onDeleteAttachment,
  onDeleteOrder,
  onOpenDetail,
  onToggleCutStatus,
  onToggleTires,
  onToggleSteeringWheel,
  onSendToLalo,
  onToggleOrderSelection,
  onSelectAllInDept,
  onExportPDF,
  onOpenDeptTable,
  onOpenAttachmentPreview,
  getTranslatedField,
  getAttachmentUrl,
  isNewOrder,
  t
}) => {
  const isAnyAdmin = isAdmin || isAdminRestricted;
  
  // Get orders for a specific department
  const getOrdersByDepartment = useCallback((dept) => {
    return orders
      .filter(o => {
        if (o.current_department !== dept) return false;
        
        // For FINISHING and later departments, show ALL orders including CUT
        const laterDepartments = ["finishing", "powder_coat", "assemble", "showroom", "shipped"];
        if (laterDepartments.includes(dept)) {
          return true;
        }
        
        // For earlier departments, EXCLUDE CUT orders
        return o.cut_status !== "cut";
      })
      .sort((a, b) => {
        const numA = parseInt(a.order_number) || 0;
        const numB = parseInt(b.order_number) || 0;
        if (numA && numB) return numA - numB;
        return (a.order_number || '').localeCompare(b.order_number || '');
      });
  }, [orders]);
  
  // Get departments to show based on user role
  const getDepartmentsToShow = useCallback(() => {
    if (isAnyAdmin) return DEPARTMENTS;
    const userDepts = userDepartments?.length > 0 ? userDepartments : [];
    return userDepts
      .map(deptValue => DEPARTMENTS.find(d => d.value === deptValue))
      .filter(Boolean);
  }, [isAnyAdmin, userDepartments, DEPARTMENTS]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-spinner">
        <div className="text-yellow-500 font-oswald uppercase tracking-widest animate-pulse">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  const departmentsToShow = getDepartmentsToShow();

  return (
    <div 
      className={`grid gap-4 ${
        isAnyAdmin 
          ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' 
          : (userDepartments?.length > 1 
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
              : 'grid-cols-1 max-w-2xl mx-auto')
      }`}
      data-testid="order-list"
    >
      {departmentsToShow.map((dept) => (
        <DepartmentColumn
          key={dept.value}
          department={dept}
          orders={getOrdersByDepartment(dept.value)}
          onAdvance={onAdvance}
          onMove={onMove}
          onReorder={onReorder}
          onUploadAttachment={onUploadAttachment}
          onDeleteAttachment={onDeleteAttachment}
          onDeleteOrder={onDeleteOrder}
          onOpenDetail={onOpenDetail}
          onToggleCutStatus={onToggleCutStatus}
          onToggleTires={onToggleTires}
          onToggleSteeringWheel={onToggleSteeringWheel}
          onSendToLalo={onSendToLalo}
          isAdmin={isAdmin}
          isAdminRestricted={isAdminRestricted}
          userDepartments={userDepartments}
          deptCount={stats.departments?.[dept.value] || 0}
          onExportPDF={onExportPDF}
          onOpenDeptTable={onOpenDeptTable}
          bulkEditMode={bulkEditMode}
          selectedOrders={selectedOrders}
          onToggleOrderSelection={onToggleOrderSelection}
          onSelectAllInDept={onSelectAllInDept}
          DEPARTMENTS={DEPARTMENTS}
          PRODUCT_TYPES={PRODUCT_TYPES}
          DEPT_MAP={DEPT_MAP}
          t={t}
          getTranslatedField={getTranslatedField}
          getAttachmentUrl={getAttachmentUrl}
          onOpenAttachmentPreview={onOpenAttachmentPreview}
          isNewOrder={isNewOrder}
          salespeople={salespeople}
        />
      ))}
    </div>
  );
};

export default OrderList;
