// Dashboard Constants - Extracted from DashboardPage.jsx

// Custom Tire Icon - looks like a car tire
export const TireIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
  </svg>
);

// Custom Steering Wheel Icon - looks like a car steering wheel
export const SteeringWheelIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="9" x2="12" y2="2" />
    <line x1="9.5" y1="14" x2="4" y2="18" />
    <line x1="14.5" y1="14" x2="20" y2="18" />
  </svg>
);

// Department and product colors (labels will be translated dynamically)
export const DEPT_COLORS = {
  received: "text-blue-500 border-blue-500",
  design: "text-violet-500 border-violet-500",
  program: "text-cyan-500 border-cyan-500",
  machine_waiting: "text-yellow-500 border-yellow-500",
  machine: "text-orange-500 border-orange-500",
  finishing: "text-teal-500 border-teal-500",
  powder_coat: "text-pink-500 border-pink-500",
  assemble: "text-green-500 border-green-500",
  showroom: "text-amber-500 border-amber-500",
  shipped: "text-blue-400 border-blue-400",
};

// Background colors for advance buttons - each department has its own color
export const DEPT_BG_COLORS = {
  received: "bg-blue-500 hover:bg-blue-400",
  design: "bg-violet-500 hover:bg-violet-400",
  program: "bg-cyan-500 hover:bg-cyan-400",
  machine_waiting: "bg-yellow-500 hover:bg-yellow-400 text-black",
  machine: "bg-orange-500 hover:bg-orange-400",
  finishing: "bg-teal-500 hover:bg-teal-400",
  powder_coat: "bg-pink-500 hover:bg-pink-400",
  assemble: "bg-green-500 hover:bg-green-400",
  showroom: "bg-amber-500 hover:bg-amber-400 text-black",
  shipped: "bg-blue-400 hover:bg-blue-300",
  completed: "bg-green-600 hover:bg-green-500",
};

export const PRODUCT_COLORS = {
  rim: "text-cyan-500 border-cyan-500",
  steering_wheel: "text-violet-500 border-violet-500",
  standard_caps: "text-amber-500 border-amber-500",
  floater_caps: "text-emerald-500 border-emerald-500",
  xxl_caps: "text-rose-500 border-rose-500",
  dually_floating_caps: "text-blue-500 border-blue-500",
  offroad_floating_caps: "text-orange-500 border-orange-500",
  custom_caps: "text-purple-500 border-purple-500",
  race_car_caps: "text-red-600 border-red-600",
};

export const CAP_TYPES = ["standard_caps", "floater_caps", "xxl_caps", "dually_floating_caps", "offroad_floating_caps", "custom_caps", "race_car_caps"];

// Rim size colors - different color for each size
export const RIM_SIZE_COLORS = {
  "19": "bg-pink-500/20 text-pink-400 border-pink-500",
  "20": "bg-blue-500/20 text-blue-400 border-blue-500",
  "21": "bg-teal-500/20 text-teal-400 border-teal-500",
  "22": "bg-green-500/20 text-green-400 border-green-500",
  "24": "bg-yellow-500/20 text-yellow-400 border-yellow-500",
  "26": "bg-orange-500/20 text-orange-400 border-orange-500",
  "28": "bg-red-500/20 text-red-400 border-red-500",
  "30": "bg-purple-500/20 text-purple-400 border-purple-500",
  "32": "bg-indigo-500/20 text-indigo-400 border-indigo-500",
  "34": "bg-cyan-500/20 text-cyan-400 border-cyan-500",
};

export const LALO_STATUSES = {
  not_sent: { label: "Not Sent", color: "text-zinc-500" },
  shipped_to_lalo: { label: "Shipped to Lalo", color: "text-blue-400" },
  at_lalo: { label: "At Lalo", color: "text-amber-400" },
  returned: { label: "Returned", color: "text-green-400" },
  waiting_shipping: { label: "Waiting Shipping", color: "text-orange-400" },
};

export const RIM_SIZES = ["19", "20", "21", "22", "24", "26", "28", "30", "32", "34"];

// Default export for easy importing
export default {
  TireIcon,
  SteeringWheelIcon,
  DEPT_COLORS,
  DEPT_BG_COLORS,
  PRODUCT_COLORS,
  CAP_TYPES,
  RIM_SIZE_COLORS,
  LALO_STATUSES,
  RIM_SIZES
};
