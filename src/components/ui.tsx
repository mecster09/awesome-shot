import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "../lib/utils";

const buttonVariants = cva("ui-button", {
  variants: {
    variant: { default: "ui-button-primary", secondary: "ui-button-secondary", destructive: "ui-button-destructive", ghost: "ui-button-ghost" },
    size: { default: "", icon: "ui-button-icon" }
  },
  defaultVariants: { variant: "default", size: "default" }
});

export function Button({ className, variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} type="button" {...props} />;
}

export function Card({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={cn("ui-card", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentPropsWithoutRef<"input">) {
  return <input className={cn("ui-input", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentPropsWithoutRef<"select">) {
  return <select className={cn("ui-select", className)} {...props}>{children}</select>;
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("ui-tabs-list", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("ui-tabs-trigger", className)} {...props} />;
}
export function TabsContent({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("ui-tabs-content", className)} {...props} />;
}

function Overlay() { return <DialogPrimitive.Overlay className="ui-overlay" />; }
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ children, className, role = "dialog", ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { role?: "dialog" | "alertdialog" }) {
  return <DialogPrimitive.Portal><Overlay /><DialogPrimitive.Content className={cn("ui-dialog-content", className)} role={role} {...props}>{children}</DialogPrimitive.Content></DialogPrimitive.Portal>;
}

export function Drawer({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogContent aria-label={title} className="ui-drawer"><div className="ui-dialog-heading"><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Close asChild><Button aria-label="Close drawer" variant="ghost" size="icon"><X aria-hidden="true" /></Button></DialogPrimitive.Close></div>{children}</DialogContent></DialogPrimitive.Root>;
}

export function AlertDialog({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogContent aria-label={title} role="alertdialog"><DialogPrimitive.Title>{title}</DialogPrimitive.Title>{children}</DialogContent></DialogPrimitive.Root>;
}
