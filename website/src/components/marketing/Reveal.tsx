"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveals children once as they scroll into view.
 *
 * Implemented with IntersectionObserver + Tailwind transition utilities rather
 * than an animation library: it costs nothing at runtime and, critically,
 * `prefers-reduced-motion` is already honoured globally in `globals.css`.
 */
export default function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // @ts-expect-error — the ref type follows the polymorphic `as` element.
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform] duration-700 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-7 opacity-0"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
