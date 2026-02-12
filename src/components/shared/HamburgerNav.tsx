"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const navItems = [
  { path: "/dashboard", label: "Market Dashboard" },
  { path: "/portfolio", label: "Portfolio Summary" },
  { path: "/account", label: "Account" },
];

export function HamburgerNav() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleNavigation = (path: string) => {
    setIsOpen(false);
    router.push(path);
  };

  return (
    <>
      <style>{`
        .hn-container {
          position: fixed;
          top: 16px;
          left: 16px;
          z-index: 1000;
        }
        .hn-button {
          display: flex;
          flex-direction: column;
          justify-content: space-around;
          width: 32px;
          height: 32px;
          padding: 6px;
          background: transparent;
          border: 1px solid #333333;
          border-radius: 6px;
          cursor: pointer;
          transition: border-color 0.2s, background-color 0.2s;
        }
        .hn-button:hover {
          border-color: #ffffff;
          background-color: #1a1a1a;
        }
        .hn-line {
          width: 100%;
          height: 2px;
          background-color: #ffffff;
          border-radius: 1px;
          transition: transform 0.3s ease, opacity 0.3s ease;
        }
        .hn-line.open:nth-child(1) {
          transform: translateY(6px) rotate(45deg);
        }
        .hn-line.open:nth-child(2) {
          opacity: 0;
        }
        .hn-line.open:nth-child(3) {
          transform: translateY(-6px) rotate(-45deg);
        }
        .hn-menu {
          position: absolute;
          top: 40px;
          left: 0;
          min-width: 200px;
          background-color: #0a0a0a;
          border: 1px solid #333333;
          border-radius: 8px;
          padding: 8px 0;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
          animation: hnSlideIn 0.2s ease;
        }
        @keyframes hnSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hn-item {
          display: block;
          width: 100%;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 500;
          color: #cccccc;
          background: transparent;
          border: none;
          text-align: left;
          cursor: pointer;
          transition: background-color 0.2s, color 0.2s;
          position: relative;
        }
        .hn-item:hover {
          background-color: #1a1a1a;
          color: #ffffff;
        }
        .hn-item.active {
          color: #ffffff;
          background-color: #222222;
        }
        .hn-item.active::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background-color: #ffffff;
          border-radius: 0 2px 2px 0;
        }
      `}</style>
      <div className="hn-container" ref={menuRef}>
        <button
          className="hn-button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Navigation menu"
          aria-expanded={isOpen}
        >
          <div className={`hn-line ${isOpen ? "open" : ""}`} />
          <div className={`hn-line ${isOpen ? "open" : ""}`} />
          <div className={`hn-line ${isOpen ? "open" : ""}`} />
        </button>

        {isOpen && (
          <nav className="hn-menu">
            {navItems.map((item) => (
              <button
                key={item.path}
                className={`hn-item ${pathname === item.path ? "active" : ""}`}
                onClick={() => handleNavigation(item.path)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
