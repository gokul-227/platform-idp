"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@aec-craft/ui/components/primitives/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Sections in sidebar order. Adding one is an entry here plus a route folder.
 *
 * A section's `children` are routes nested under it that deserve their own
 * entry rather than a control on the parent page: they answer a different
 * question, not a narrower version of the same one. They show only while that
 * section is open, so the sidebar stays the length of the estate rather than
 * the length of every page in it.
 */
const SECTIONS: {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
}[] = [
  { href: "/identities", label: "Identities" },
  { href: "/applications", label: "Applications" },
  { href: "/tenancy", label: "Tenancy" },
  {
    href: "/audit",
    label: "Audit logs",
    children: [{ href: "/audit/analytics", label: "Analytics" }],
  },
];

export function ConsoleNav(): ReactNode {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {SECTIONS.map((section) => {
            const inSection = pathname.startsWith(section.href);
            const activeChild = section.children?.find((child) =>
              pathname.startsWith(child.href)
            );
            return (
              <SidebarMenuItem key={section.href}>
                <SidebarMenuButton
                  className="text-[0.9375rem]"
                  // The parent stands for its own page, so a child being open
                  // moves the highlight rather than lighting both.
                  isActive={inSection && !activeChild}
                  render={<Link href={section.href} />}
                >
                  <span>{section.label}</span>
                </SidebarMenuButton>
                {inSection && section.children ? (
                  <SidebarMenuSub>
                    {section.children.map((child) => (
                      <SidebarMenuSubItem key={child.href}>
                        <SidebarMenuSubButton
                          isActive={child.href === activeChild?.href}
                          render={<Link href={child.href} />}
                        >
                          <span>{child.label}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
