import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const actionButtonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        gradient: "text-white font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.025]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
      gradientType: {
        primary: "bg-gradient-to-r from-[#1B4332] to-[#2D6A4F]",
        coral: "bg-gradient-to-r from-[#E76F51] to-[#F4A261]",
        green: "bg-gradient-to-r from-[#2D6A4F] to-[#40916C]",
        amber: "bg-gradient-to-r from-[#F4A261] to-[#E9C46A]",
        dark: "bg-gradient-to-r from-[#1B4332] to-[#081C15]",
        success: "bg-gradient-to-r from-[#52B788] to-[#40916C]",
        danger: "bg-gradient-to-r from-[#E76F51] to-[#D62828]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      gradientType: "primary",
    },
  }
)

export interface ActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof actionButtonVariants> {
  asChild?: boolean
  gradient?: boolean
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ className, variant, size, gradientType, asChild = false, gradient = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    
    // Apply gradient styling if gradient prop is true
    const finalVariant = gradient ? "gradient" : variant
    const finalClassName = cn(
      actionButtonVariants({ variant: finalVariant, size, className }),
      gradient && gradientType && actionButtonVariants({ gradientType }),
    )
    
    return (
      <Comp
        className={finalClassName}
        ref={ref}
        {...props}
      />
    )
  }
)
ActionButton.displayName = "ActionButton"

export { ActionButton, actionButtonVariants }