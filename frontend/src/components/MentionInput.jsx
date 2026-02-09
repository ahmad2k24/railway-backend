import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";

export default function MentionInput({
  value,
  onChange,
  placeholder = "Type @ to mention a user...",
  className = "",
  rows = 3,
  disabled = false,
  onSubmit,
  ...props
}) {
  const [users, setUsers] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Fetch users for autocomplete
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axios.get(`${API}/users/list`);
        setUsers(res.data.users || []);
      } catch (error) {
        console.error("Failed to fetch users:", error);
      }
    };
    fetchUsers();
  }, []);

  // Filter users based on query
  const filteredUsers = users.filter((user) => {
    const searchTerm = mentionQuery.toLowerCase();
    return (
      user.name?.toLowerCase().includes(searchTerm) ||
      user.username?.toLowerCase().includes(searchTerm)
    );
  }).slice(0, 5); // Limit to 5 suggestions

  // Handle text change
  const handleChange = (e) => {
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(text);

    // Check if we're in a mention context
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Check if there's a space after @ (would mean the mention is complete)
      if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
        setMentionStartIndex(lastAtIndex);
        setMentionQuery(textAfterAt);
        setShowSuggestions(true);
        setSelectedIndex(0);
        return;
      }
    }

    setShowSuggestions(false);
    setMentionQuery("");
    setMentionStartIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (showSuggestions && filteredUsers.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => 
            prev < filteredUsers.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => 
            prev > 0 ? prev - 1 : filteredUsers.length - 1
          );
          break;
        case "Enter":
          if (showSuggestions) {
            e.preventDefault();
            selectUser(filteredUsers[selectedIndex]);
          }
          break;
        case "Escape":
          setShowSuggestions(false);
          break;
        case "Tab":
          if (showSuggestions) {
            e.preventDefault();
            selectUser(filteredUsers[selectedIndex]);
          }
          break;
        default:
          break;
      }
    } else if (e.key === "Enter" && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  // Select a user from suggestions
  const selectUser = (user) => {
    if (!user || mentionStartIndex === -1) return;

    const username = user.username || user.name.replace(/\s+/g, "_").toLowerCase();
    const beforeMention = value.slice(0, mentionStartIndex);
    const afterMention = value.slice(mentionStartIndex + mentionQuery.length + 1);
    const newValue = `${beforeMention}@${username} ${afterMention}`;

    onChange(newValue);
    setShowSuggestions(false);
    setMentionQuery("");
    setMentionStartIndex(-1);

    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = beforeMention.length + username.length + 2;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target) &&
        !textareaRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`font-mono ${className}`}
        rows={rows}
        disabled={disabled}
        data-testid="mention-input"
        {...props}
      />

      {/* Mention suggestions dropdown */}
      {showSuggestions && filteredUsers.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg overflow-hidden"
          data-testid="mention-suggestions"
        >
          {filteredUsers.map((user, index) => (
            <div
              key={user.id}
              className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                index === selectedIndex
                  ? "bg-amber-500/20 text-amber-400"
                  : "hover:bg-zinc-800 text-white"
              }`}
              onClick={() => selectUser(user)}
              data-testid={`mention-user-${user.id}`}
            >
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                <User className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-semibold truncate">
                  {user.name}
                </div>
                <div className="font-mono text-xs text-zinc-500">
                  @{user.username || user.name.replace(/\s+/g, "_").toLowerCase()}
                </div>
              </div>
              <Badge
                variant="outline"
                className="text-[9px] border-zinc-700 text-zinc-500"
              >
                {user.role === "admin" ? "Admin" : user.department}
              </Badge>
            </div>
          ))}
          <div className="px-3 py-2 bg-zinc-950 border-t border-zinc-800">
            <p className="font-mono text-[10px] text-zinc-600">
              Press <kbd className="px-1 bg-zinc-800 rounded">↑</kbd>{" "}
              <kbd className="px-1 bg-zinc-800 rounded">↓</kbd> to navigate,{" "}
              <kbd className="px-1 bg-zinc-800 rounded">Enter</kbd> or{" "}
              <kbd className="px-1 bg-zinc-800 rounded">Tab</kbd> to select
            </p>
          </div>
        </div>
      )}

      {/* Helper text */}
      <p className="mt-1 font-mono text-[10px] text-zinc-600">
        💡 Type <span className="text-amber-500">@username</span> to mention and notify a team member
      </p>
    </div>
  );
}
