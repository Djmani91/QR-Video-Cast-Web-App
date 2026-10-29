import type { ReactNode } from 'react';

type Palette = {
  background: string;
  card: string;
  border: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
};

type Props = {
  children: ReactNode;
  colors: Palette;
};

export function NativeVideoAdPreview({ children }: Props) {
  return <>{children}</>;
}
