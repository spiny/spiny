import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface IconProps {
  name: IconName;
  size?: number;
  color: string;
}

/** Thin wrapper over Ionicons so the rest of the app uses a stable icon type. */
export function Icon({ name, size = 22, color }: IconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}
