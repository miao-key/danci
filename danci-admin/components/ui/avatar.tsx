import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const avatarVariants = cva(
  "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none",
  {
    variants: {
      size: {
        default: "size-8",
        sm: "size-6",
        md: "size-8",
        lg: "size-12",
        xl: "size-16",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Avatar({
  className,
  size,
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof avatarVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(avatarVariants({ size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "avatar",
      size,
    },
  })
}

function AvatarImage({
  className,
  render,
  ...props
}: useRender.ComponentProps<"img">) {
  return useRender({
    defaultTagName: "img",
    props: mergeProps<"img">(
      {
        className: cn("aspect-square size-full object-cover", className),
      },
      props
    ),
    render,
    state: {
      slot: "avatar-image",
    },
  })
}

function AvatarFallback({
  className,
  render,
  ...props
}: useRender.ComponentProps<"span">) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(
          "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-xs font-medium",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "avatar-fallback",
    },
  })
}

function AvatarBadge({
  className,
  render,
  ...props
}: useRender.ComponentProps<"span">) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(
          "bg-background text-foreground absolute right-0 bottom-0 inline-flex size-1/2 items-center justify-center rounded-full ring-2 ring-background",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "avatar-badge",
    },
  })
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarBadge,
  avatarVariants,
}
