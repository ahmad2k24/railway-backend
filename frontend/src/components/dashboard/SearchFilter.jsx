// Dashboard Search and Filter Component
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Search, X, Circle, Package, ChevronRight, CheckCircle2, 
  ArrowRightLeft, Scissors, Layers, Plane
} from "lucide-react";
import { DEPT_BG_COLORS, CAP_TYPES } from "./constants";

export const SearchFilter = ({
  searchQuery,
  searchResults,
  productFilter,
  queueCounts,
  isAdmin,
  isAdminRestricted,
  userDepartments,
  DEPARTMENTS,
  PRODUCT_TYPES,
  DEPT_MAP,
  onSearch,
  onClearSearch,
  onProductFilterChange,
  onOpenOrderDetail,
  onAdvanceOrder,
  onMoveOrder,
  onToggleCutStatus,
  onNavigate,
  onOpenSizeReport,
  t
}) => {
  const isAnyAdmin = isAdmin || isAdminRestricted;

  return (
    <>
      {/* Search Bar */}
      <div className="relative mb-4 sm:mb-6" data-testid="search-filter">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              type="text"
              placeholder={t('dashboard.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 focus:border-red-500 font-mono text-sm"
              data-testid="search-input"
            />
          </div>
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSearch}
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
              const canAdvanceOrder = isAdmin || (userDepartments?.includes(order.current_department));
              const hasMultipleDepts = userDepartments && userDepartments.length > 1;
              const movableDepts = hasMultipleDepts 
                ? DEPARTMENTS.filter(d => userDepartments.includes(d.value) && d.value !== order.current_department)
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
                    onClick={() => { onOpenOrderDetail(order.id); onClearSearch(); }}
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
                    {/* Done/Advance button */}
                    {canAdvanceOrder && (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdvanceOrder(order.id);
                        }}
                        className={`h-7 px-3 text-white font-oswald uppercase tracking-wider text-[10px] font-bold ${
                          isLastDept 
                            ? "bg-green-600 hover:bg-green-500" 
                            : DEPT_BG_COLORS[order.current_department] || "bg-red-500 hover:bg-red-400"
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
                              onClick={() => onMoveOrder(order.id, d.value)}
                            >
                              {d.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    
                    {/* Mark as Cut button - for steering wheels and caps */}
                    {(order.product_type === "steering_wheel" || CAP_TYPES.includes(order.product_type)) && (
                      <Button
                        size="sm"
                        variant={order.cut_status === "cut" ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCutStatus(order.id, order.cut_status);
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
                    
                    {/* Actions dropdown for admin */}
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
                              onClick={() => onMoveOrder(order.id, d.value)}
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

      {/* Product Type Filter Tabs and Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 sm:mb-6" data-testid="filter-tabs">
        <Tabs value={productFilter} onValueChange={onProductFilterChange} className="w-full sm:flex-1 overflow-x-auto">
          <TabsList className="bg-zinc-800/50 p-1 flex flex-nowrap w-max sm:w-auto sm:flex-wrap h-auto">
            <TabsTrigger
              value="all"
              className="font-oswald uppercase tracking-wider text-[10px] sm:text-xs data-[state=active]:bg-red-500 data-[state=active]:text-white px-2 sm:px-3"
              data-testid="filter-all-btn"
            >
              {t('common.all')}
            </TabsTrigger>
            <TabsTrigger
              value="rim"
              className="font-oswald uppercase tracking-wider text-[10px] sm:text-xs data-[state=active]:bg-cyan-500 data-[state=active]:text-black px-2 sm:px-3"
              data-testid="filter-rims-btn"
            >
              <Circle className="w-3 h-3 sm:mr-1" />
              <span className="hidden sm:inline">{t('dashboard.rims')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="steering_wheel"
              className="font-oswald uppercase tracking-wider text-[10px] sm:text-xs data-[state=active]:bg-violet-500 data-[state=active]:text-black px-2 sm:px-3"
              data-testid="filter-steering-btn"
            >
              <Package className="w-3 h-3 sm:mr-1" />
              <span className="hidden sm:inline">{t('dashboard.steeringWheels')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="caps"
              className="font-oswald uppercase tracking-wider text-[10px] sm:text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black px-2 sm:px-3"
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
            onClick={onOpenSizeReport}
            className="border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-black font-oswald uppercase tracking-wider text-[10px] sm:text-xs h-7 sm:h-8"
            data-testid="size-report-btn"
          >
            <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('dashboard.sizeReport')}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate("/machine-queue")}
            className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-black font-oswald uppercase tracking-wider text-[10px] sm:text-xs h-7 sm:h-8"
            data-testid="machine-queue-btn"
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('dashboard.machineQueue')}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate("/lalo-queue")}
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
      </div>
    </>
  );
};

export default SearchFilter;
