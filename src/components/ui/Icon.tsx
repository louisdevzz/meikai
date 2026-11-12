import { HugeiconsIcon } from "@hugeicons/react";

interface IconProps {
  icon: any;
  size?: number;
  className?: string;
  color?: string;
}

export default function Icon({ icon, size = 18, className, color }: IconProps) {
  return <HugeiconsIcon icon={icon} size={size} className={className} color={color} />;
}
