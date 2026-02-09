import { useNotifications } from "@/contexts/NotificationContext";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  MessageSquare,
  FileText,
  X,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const NotificationIcon = ({ type }) => {
  switch (type) {
    case "mention":
      return <MessageSquare className="w-4 h-4 text-blue-400" />;
    case "order_update":
      return <FileText className="w-4 h-4 text-green-400" />;
    case "admin_note":
      return <Bell className="w-4 h-4 text-red-500" />;
    default:
      return <Bell className="w-4 h-4 text-yellow-400" />;
  }
};

const NotificationItem = ({ notification, onMarkRead, onDelete, onNavigate }) => {
  const timeAgo = notification.created_at
    ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
    : "";

  return (
    <div
      className={`p-3 border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors cursor-pointer ${
        !notification.is_read ? "bg-blue-500/10 border-l-2 border-l-blue-500" : ""
      }`}
      onClick={() => {
        if (!notification.is_read) {
          onMarkRead(notification.id);
        }
        if (notification.order_id) {
          onNavigate(notification.order_id);
        }
      }}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <NotificationIcon type={notification.type} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-semibold text-white truncate">
              {notification.title}
            </span>
            {!notification.is_read && (
              <Badge className="bg-blue-500 text-white text-[9px] px-1.5 py-0">
                NEW
              </Badge>
            )}
          </div>
          <p className="font-mono text-xs text-zinc-400 line-clamp-2 mb-1">
            {notification.message}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
            <span>•</span>
            <span className="text-amber-400">{notification.sender_name}</span>
            {notification.order_number && (
              <>
                <span>•</span>
                <span className="text-red-400">#{notification.order_number}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {!notification.is_read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:text-green-400"
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead(notification.id);
              }}
              title="Mark as read"
            >
              <Check className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(notification.id);
            }}
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default function NotificationPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isOpen,
    closePanel,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const handleNavigateToOrder = (orderId) => {
    closePanel();
    // Navigate to dashboard with the order selected
    navigate(`/?order=${orderId}`);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closePanel()}>
      <SheetContent
        side="right"
        className="w-[380px] sm:w-[420px] bg-zinc-900 border-l border-zinc-800 p-0"
        data-testid="notification-panel"
      >
        <SheetHeader className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/95 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-oswald uppercase tracking-widest text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-yellow-500" />
              {t('notifications.title', 'Notifications')}
              {unreadCount > 0 && (
                <Badge className="bg-red-500 text-white text-xs ml-2">
                  {unreadCount}
                </Badge>
              )}
            </SheetTitle>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-zinc-400 hover:text-white"
                  onClick={markAllAsRead}
                  data-testid="mark-all-read-btn"
                >
                  <CheckCheck className="w-4 h-4 mr-1" />
                  {t('notifications.markAllRead', 'Mark all read')}
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-64px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Bell className="w-12 h-12 text-zinc-700 mb-4" />
              <p className="font-mono text-sm text-zinc-500">
                {t('notifications.empty', 'No notifications yet')}
              </p>
              <p className="font-mono text-xs text-zinc-600 mt-2">
                {t('notifications.emptyHint', 'Use @username in order notes to tag team members')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={markAsRead}
                  onDelete={deleteNotification}
                  onNavigate={handleNavigateToOrder}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
