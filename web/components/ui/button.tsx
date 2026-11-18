import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-[#1D4ED8]",
        outline:
          "border-border bg-card text-foreground hover:bg-accent hover:border-[#B9C8D9]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[#E2E8F0]",
        ghost:
          "text-foreground hover:bg-accent hover:text-foreground",
        destructive:
          "bg-[#FFF1F2] border-[#FECDD3] text-[#BE123C] hover:bg-[#FFE4E6]",
        "destructive-solid":
          "bg-destructive text-destructive-foreground hover:bg-[#BE123C]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-xs",
        xs: "h-7 px-2 text-xs",
        lg: "h-10 px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
