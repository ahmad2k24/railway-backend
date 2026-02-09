import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";

const NotificationContext = createContext(null);

export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/notifications?limit=50`);
      setNotifications(res.data.notifications || []);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  }, []);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/notifications/unread-count`);
      const newCount = res.data.count || 0;
      
      // Toast notifications disabled - users can check the bell icon for notifications
      // Previously showed toast when new notifications arrived, causing visual noise
      
      setUnreadCount(newCount);
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  }, []);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await axios.put(`${API}/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      await axios.put(`${API}/notifications/mark-all-read`);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Failed to mark all as read:", error);
      toast.error("Failed to mark all as read");
    }
  }, []);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      await axios.delete(`${API}/notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      // Update unread count if the deleted notification was unread
      const wasUnread = notifications.find(n => n.id === notificationId && !n.is_read);
      if (wasUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  }, [notifications]);

  // Toggle notification panel
  const togglePanel = useCallback(() => {
    setIsOpen(prev => !prev);
    if (!isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Close panel
  const closePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Poll for new notifications every 30 seconds
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Initial fetch
    fetchUnreadCount();

    // Set up polling
    const interval = setInterval(fetchUnreadCount, 30000);

    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Refetch when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        isOpen,
        fetchNotifications,
        fetchUnreadCount,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        togglePanel,
        closePanel,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
