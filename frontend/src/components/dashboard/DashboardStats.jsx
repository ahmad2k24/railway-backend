// Dashboard Stats Component - Order Status Overview Cards
import { Card, CardContent } from "@/components/ui/card";

export const DashboardStats = ({ 
  stats, 
  orders,
  onOpenStatsModal,
  t 
}) => {
  // Calculate total caps count
  const totalCaps = (stats.products?.standard_caps || 0) + 
    (stats.products?.floater_caps || 0) + 
    (stats.products?.xxl_caps || 0) + 
    (stats.products?.dually_floating_caps || 0) + 
    (stats.products?.offroad_floating_caps || 0) +
    (stats.products?.race_car_caps || 0);
  
  // Calculate cut orders count
  const cutOrdersCount = orders.filter(o => o.cut_status === "cut").length;

  const statCards = [
    { 
      key: "active",
      label: t('dashboard.active'), 
      count: stats.total_active, 
      color: "text-red-500",
      filter: { type: "active", value: null }
    },
    { 
      key: "rims",
      label: t('dashboard.rims'), 
      count: stats.products?.rim || 0, 
      color: "text-cyan-300",
      filter: { type: "product", value: "rim" }
    },
    { 
      key: "steering",
      label: t('dashboard.steeringWheels'), 
      count: stats.products?.steering_wheel || 0, 
      color: "text-fuchsia-400",
      filter: { type: "product", value: "steering_wheel" }
    },
    { 
      key: "caps",
      label: t('dashboard.caps'), 
      count: totalCaps, 
      color: "text-amber-300",
      filter: { type: "product", value: "caps" }
    },
    { 
      key: "custom",
      label: t('dashboard.custom'), 
      count: stats.products?.custom_caps || 0, 
      color: "text-pink-400",
      filter: { type: "product", value: "custom_caps" },
      hideOnMobile: true
    },
    { 
      key: "machine_waiting",
      label: "M. WAITING", 
      count: stats.departments?.machine_waiting || 0, 
      color: "text-yellow-300",
      filter: { type: "department", value: "machine_waiting" }
    },
    { 
      key: "machine",
      label: t('dashboard.machine'), 
      count: stats.departments?.machine || 0, 
      color: "text-orange-500",
      filter: { type: "department", value: "machine" }
    },
    { 
      key: "cut",
      label: "CUT ORDERS", 
      count: cutOrdersCount, 
      color: "text-lime-400",
      filter: { type: "cut_orders", value: null }
    },
    { 
      key: "completed",
      label: t('common.done'), 
      count: stats.total_completed, 
      color: "text-teal-400",
      filter: { type: "completed", value: null },
      hideOnMobile: true
    }
  ];

  return (
    <div className="mb-4 sm:mb-6" data-section="order-status-overview" data-testid="dashboard-stats">
      <h2 className="font-oswald text-sm sm:text-base md:text-lg uppercase tracking-[0.3em] text-white font-bold mb-3 sm:mb-4 border-b border-zinc-700 pb-2">
        ORDER STATUS OVERVIEW
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-2 sm:gap-3 md:gap-4">
        {statCards.map((card) => (
          <Card 
            key={card.key}
            className={`bg-white border-2 border-red-500 cursor-pointer rounded-lg ${card.hideOnMobile ? 'hidden sm:block' : ''}`}
            onClick={() => onOpenStatsModal(
              card.label.includes('WAITING') ? "Machine Waiting Orders" : 
              card.label.includes('CUT') ? "Cut Orders" :
              `${card.label} Orders`, 
              card.filter.type, 
              card.filter.value
            )}
            data-testid={`stat-card-${card.key}`}
          >
            <CardContent className="p-2 sm:p-3 md:p-4">
              <div className="bg-red-500 rounded px-1.5 py-0.5 mb-1 sm:mb-2 inline-block">
                <p className="font-oswald text-[9px] sm:text-[10px] md:text-xs uppercase tracking-wider text-white font-bold truncate">
                  {card.label}
                </p>
              </div>
              <p className={`font-oswald text-xl sm:text-2xl md:text-3xl ${card.color} font-bold`} data-testid={`${card.key}-count`}>
                {card.count}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default DashboardStats;
