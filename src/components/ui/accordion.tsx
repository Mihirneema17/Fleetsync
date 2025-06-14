
"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { Plus, Minus } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion" // Added AnimatePresence

import { cn } from "@/lib/utils"

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border-b", className)}
    {...props}
  />
))
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const isOpen = props['data-state'] === 'open';

  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline",
          className
        )}
        {...props}
      >
        {children}
        <div className="relative h-4 w-4 shrink-0" aria-hidden="true">
          <AnimatePresence initial={false} mode="sync"> {/* mode="sync" or no mode might be better than "wait" for icon swaps */}
            {isOpen ? (
              <motion.div
                key="minus-icon" // Unique key for AnimatePresence
                initial={{ opacity: 0, scale: 0.7, rotate: -45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.7, rotate: 45 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Minus className="h-4 w-4" />
              </motion.div>
            ) : (
              <motion.div
                key="plus-icon" // Unique key for AnimatePresence
                initial={{ opacity: 0, scale: 0.7, rotate: 45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.7, rotate: -45 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Plus className="h-4 w-4" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
})
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4 pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
))

AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
